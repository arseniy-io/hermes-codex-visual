from pathlib import Path
import ast
import asyncio
import importlib.util
import json
import os
import sys
import threading
import time
from types import SimpleNamespace, MethodType

import pytest

ROOT = Path(os.environ.get('HCV_MODEL_SPEED_PROJECT') or Path(__file__).resolve().parent.parent)
CORE = Path(os.environ['HCV_STAGED_CORE'])
INSTALLED = Path(os.environ['HCV_INSTALLED_HERMES'])
if str(INSTALLED) not in sys.path:
    sys.path.insert(0, str(INSTALLED))


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def candidate(monkeypatch):
    helper = load('agent.hcv_model_speed', ROOT / 'source/hermes-model-speed/hcv_model_speed.py')
    fast = load('hcv_desktop_fast', CORE / 'agent/fast_mode.py')
    runtime = load('hcv_desktop_runtime', CORE / 'agent/codex_runtime.py')
    config = load('hcv_desktop_config', CORE / 'gateway/session_config.py')
    tui = load('hcv_desktop_tui', CORE / 'gateway/session_tui_config.py')
    local = load('hcv_desktop_local', CORE / 'gateway/session_local.py')
    mutations = load('hcv_desktop_mutations', CORE / 'gateway/session_mutations.py')
    import agent.fast_mode, gateway.session_config, gateway.session_tui_config, gateway.session_local, gateway.session_mutations
    monkeypatch.setattr(agent.fast_mode, 'effective_request_overrides', fast.effective_request_overrides)
    monkeypatch.setattr(agent.fast_mode, 'CODEX_TIER_WORDS', fast.CODEX_TIER_WORDS)
    monkeypatch.setattr(gateway.session_config, 'model_options', config.model_options)
    monkeypatch.setattr(gateway.session_tui_config, 'service_tier_options', tui.service_tier_options)
    monkeypatch.setattr(gateway.session_local, '_reasoning_fields', local._reasoning_fields)
    monkeypatch.setattr(gateway.session_local, 'effort_fields', local.effort_fields)
    monkeypatch.setattr(gateway.session_local, 'local_session_info', local.local_session_info)
    monkeypatch.setattr(gateway.session_mutations, '_project_result', mutations._project_result)
    yield SimpleNamespace(helper=helper, fast=fast, runtime=runtime)
    sys.modules.pop('agent.hcv_model_speed', None)


class FakeAppServer:
    catalogs = {
        'gpt-6.2-sol': ['priority', 'ultrafast'],
        'gpt-b': ['priority'],
        'gpt-c': ['ultrafast'],
        'gpt-d': ['priority', 'ultrafast'],
        'gpt-e': ['priority', 'ultrafast'],
    }
    requests = []
    instances = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.closed = False
        self.instances.append(self)

    def initialize(self, **kwargs):
        self.requests.append(('initialize', kwargs))

    def request(self, method, params, timeout):
        self.requests.append((method, params))
        assert method == 'model/list', 'a catalog read must never start an inference turn'
        return {'data': [{'id': model, 'model': model, 'serviceTiers': [{'id': tier} for tier in tiers]}
                         for model, tiers in self.catalogs.items()]}

    def close(self, timeout=3.0):
        self.closed = True


@pytest.mark.asyncio
@pytest.mark.parametrize('change', ['none', 'epoch', 'profile', 'retiring', 'session', 'route',
                                    'generation', 'model', 'provider', 'runtime', 'speed', 'timeout'])
async def test_model_speed_reconciliation_ignores_stale_checks(candidate, monkeypatch, change):
    import gateway.session_policy as policies
    import hermes_state_local as local
    mutations = sys.modules['hcv_desktop_mutations']
    state = {'model': 'gpt-b', 'provider': 'openai-codex', 'runtime': 'codex_app_server',
             'tier': 'ultrafast', 'generation': 7}
    identity = ('gpt-b', 'openai-codex', 'test-base', 'codex_app_server', 'test-codex')
    started, release = threading.Event(), threading.Event()
    def check(*args):
        started.set()
        assert release.wait(3)
        if change == 'timeout':
            raise TimeoutError('offline catalog')
        return 'ultrafast', identity
    class Policy:
        def effective(self, *args, **kwargs):
            return {'model': {'provider': state['provider'], 'base_url': 'test-base',
                              'openai_runtime': state['runtime'], 'codex_bin': 'test-codex'}}, state['model']
        def current_service_tier(self, *args):
            return state['tier']
    policy = Policy()
    monkeypatch.setattr(mutations, '_app_server_tier_check', check)
    monkeypatch.setattr(policies, 'policy_for_source', lambda *args: policy)
    monkeypatch.setattr(policies, 'restore_policy', lambda *args: policy)
    monkeypatch.setattr(local, 'local_receipt', lambda *args: {'policy': {}})
    writes = []
    runner = SimpleNamespace(_set_session_service_tier_override=lambda *args: writes.append(args))
    live = SimpleNamespace(route='route-a', source=object())
    db = SimpleNamespace(get_session=lambda *args: {'runtime_generation': state['generation']})
    authority = SimpleNamespace(epoch=1, profile_id='profile-a', retiring=False,
                                sessions={'session-a': live}, runner=runner, db=db)
    ref = SimpleNamespace(session_id='session-a', profile_id='profile-a')
    task = asyncio.create_task(mutations._reconcile_app_server_tier(authority, ref, live, {'execution_generation': 7}))
    assert await asyncio.to_thread(started.wait, 2)
    if change == 'epoch': authority.epoch += 1
    if change == 'profile': authority.profile_id = 'profile-b'
    if change == 'retiring': authority.retiring = True
    if change == 'session': authority.sessions['session-a'] = object()
    if change == 'route': live.route = 'route-b'
    if change == 'generation': state['generation'] += 1
    if change == 'model': state['model'] = 'gpt-c'
    if change == 'provider': state['provider'] = 'another-account'
    if change == 'runtime': state['runtime'] = 'auto'
    if change == 'speed': state['tier'] = 'priority'
    release.set()
    await asyncio.wait_for(task, 3)
    assert writes == ([('route-a', None)] if change == 'none' else [])


@pytest.mark.asyncio
@pytest.mark.parametrize('catalog', ['supported', 'unsupported', 'missing-model', 'offline'])
@pytest.mark.parametrize('route', ['appserver', 'responses'])
async def test_model_speed_reconciliation_requires_positive_catalog_evidence(candidate, monkeypatch, catalog, route):
    import gateway.session_policy as policies
    import hermes_state_local as local
    mutations = sys.modules['hcv_desktop_mutations']
    class Policy:
        follows_profile = False
        def __init__(self, model): self.model = model
        def effective(self, *args, **kwargs):
            return {'model': {'provider': 'openai-codex', 'openai_runtime': 'codex_app_server' if route == 'appserver' else 'auto'}}, self.model
        def current_service_tier(self, *args): return 'ultrafast'
    old, target = Policy('gpt-6.2-sol'), Policy('gpt-b')
    monkeypatch.setattr(policies, 'policy_for_source', lambda *args: old)
    monkeypatch.setattr(policies, 'restore_policy', lambda *args: target)
    monkeypatch.setattr(local, 'local_receipt', lambda *args: {'policy': {}})
    def model_list(**kwargs):
        if catalog == 'offline': raise TimeoutError('offline catalog')
        if catalog == 'missing-model': return {}
        return {'gpt-b': {'fast': True, 'ultrafast': catalog == 'supported'}}
    monkeypatch.setattr(candidate.helper, 'app_server_catalog', model_list)
    monkeypatch.setattr(candidate.helper, 'responses_route_credential', lambda *args: ('fake', 'fake'))
    monkeypatch.setattr(candidate.helper, 'responses_cached_catalog', lambda credential: model_list())
    writes = []
    runner = SimpleNamespace(_set_session_service_tier_override=lambda *args: writes.append(args))
    live = SimpleNamespace(route='route-a', source=object())
    db = SimpleNamespace(get_session=lambda *args: {'runtime_generation': 7})
    authority = SimpleNamespace(epoch=1, profile_id='profile-a', retiring=False, agent=lambda ref: None,
                                sessions={'session-a': live}, runner=runner, db=db)
    ref = SimpleNamespace(session_id='session-a', profile_id='profile-a')
    await mutations._reconcile_app_server_tier(authority, ref, live, {'execution_generation': 7})
    assert writes == ([('route-a', None)] if catalog == 'unsupported' else [])


def test_responses_catalog_wait_is_bounded_and_reuses_the_account_worker(candidate, monkeypatch):
    from agent import codex_service_tiers as tiers, model_metadata
    base = 'https://chatgpt.com/backend-api/codex'
    credential = ('fake-a', base)
    key = model_metadata._codex_oauth_token_fingerprint(*credential)
    records = {}
    monkeypatch.setattr(tiers, '_catalogs', records)
    started, release, finished = threading.Event(), threading.Event(), threading.Event()
    calls = []
    def slow(token, origin):
        calls.append((token, origin))
        started.set()
        assert release.wait(3)
        records[key] = ({'gpt-a': frozenset({'priority', 'ultrafast'})}, time.time(), {})
        finished.set()
        return records[key]
    monkeypatch.setattr(tiers, '_fresh_catalog', slow)
    try:
        before = time.monotonic()
        assert candidate.helper.responses_catalog(credential, wait=0.02) == {}
        assert time.monotonic() - before < 0.5
        assert started.is_set()
        assert candidate.helper.responses_catalog(credential, wait=0.02) == {}
        assert calls == [credential], 'reopening must share the same pending lookup'
        release.set()
        assert finished.wait(2)
        assert candidate.helper.responses_catalog(credential, wait=0.2) == {
            'gpt-a': {'fast': True, 'ultrafast': True}}
        assert calls == [credential]
    finally:
        release.set()


def test_responses_credential_fails_closed_for_uncertain_owners(candidate, monkeypatch):
    import hermes_cli.auth as auth
    import hermes_cli.auth_codex as auth_codex
    import hermes_cli.auth_constants as constants
    import gateway.session_policy as policy_module
    base = 'https://chatgpt.com/backend-api/codex'
    a, b = 'fake-a', 'fake-b'
    monkeypatch.setattr(constants, '_decode_jwt_claims', lambda token: {'sub': token} if token in (a, b) else None)
    monkeypatch.setattr(auth, 'read_credential_pool', lambda provider: [{'access_token': a, 'base_url': base}])
    monkeypatch.setattr(auth_codex, 'resolve_codex_runtime_credentials', lambda **kwargs: {'api_key': a, 'base_url': base})
    monkeypatch.setattr(policy_module, 'route_launch_key', lambda *args: None)
    cfg = {'model': {'provider': 'openai-codex', 'api_mode': 'codex_responses', 'base_url': base}}
    policy = SimpleNamespace(follows_profile=False, config_secret_ref=None)
    f = candidate.helper.responses_route_credential
    assert f(None, None, policy, None, cfg) == (a, base)
    agent = SimpleNamespace(provider='openai-codex', api_mode='codex_responses', api_key=b, base_url=base)
    assert f(None, None, policy, agent, cfg) == (b, base)
    policy.follows_profile = True
    assert f(None, None, policy, agent, cfg) == (a, base)
    policy.follows_profile = False
    policy.config_secret_ref = 'private'
    assert f(None, None, policy, None, cfg) is None
    monkeypatch.setattr(policy_module, 'route_launch_key', lambda *args: b)
    assert f(None, None, policy, None, cfg) == (b, base)
    policy.config_secret_ref = None
    monkeypatch.setattr(policy_module, 'route_launch_key', lambda *args: None)
    for field in ('api_key', 'api', 'api_key_from', 'key_env', 'api_key_env'):
        assert f(None, None, policy, None, {'model': {**cfg['model'], field: 'private'}}) is None
    assert f(None, None, policy, None, {**cfg, 'providers': {'openai-codex': {'api_key': 'private'}}}) is None
    monkeypatch.setattr(auth, 'read_credential_pool', lambda provider: [
        {'access_token': a, 'base_url': base}, {'access_token': b, 'base_url': base}])
    assert f(None, None, policy, None, cfg) is None
    assert f(None, None, policy, None, {'model': {**cfg['model'], 'base_url': 'https://other.example'}}) is None
    assert f(None, None, policy, agent, {'model': {**cfg['model'], 'api_mode': 'chat_completions'}}) is None


def test_responses_credential_accepts_only_scoped_unrelated_frozen_secrets(candidate, tmp_path, monkeypatch):
    import gateway.session_policy as policies
    import gateway.session_policy_credentials as credentials
    import hermes_cli.auth as auth
    import hermes_cli.auth_codex as auth_codex
    import hermes_cli.auth_constants as constants

    base = 'https://chatgpt.com/backend-api/codex'
    config = {'model': {'provider': 'openai-codex', 'api_mode': 'codex_responses', 'base_url': base},
              'stt': {'api_key': None}, 'mcp_servers': {'test': {'env': {'TOKEN': None}}}}
    authority = SimpleNamespace(db=SimpleNamespace(db_path=str(tmp_path / 'state.db')), profile_id='p1')
    policy = SimpleNamespace(follows_profile=False, config_json=json.dumps(config), config_secret_ref=None)
    monkeypatch.setattr(policies, 'route_launch_key', lambda *args: None)
    monkeypatch.setattr(constants, '_decode_jwt_claims', lambda token: {'sub': token} if token == 'a' else None)
    monkeypatch.setattr(auth, 'read_credential_pool', lambda provider: [{'access_token': 'a', 'base_url': base}])
    monkeypatch.setattr(auth_codex, 'resolve_codex_runtime_credentials', lambda **kwargs: {'api_key': 'a', 'base_url': base})
    paths = [['stt', 'api_key'], ['mcp_servers', 'test', 'env', 'TOKEN']]
    def reference(selected, **changes):
        data = {'home': str(tmp_path.resolve()), 'profile': 'p1', 'session': 'test',
                'entries': [[path, 'fingerprint'] for path in selected],
                'bound': [[path, credentials._binding(config, path)] for path in selected]}
        data.update(changes)
        return credentials.PREFIX + json.dumps(data)
    f = candidate.helper.responses_route_credential
    policy.config_secret_ref = reference(paths)
    assert f(authority, None, policy, None, config) == ('a', base)
    for other in ([['model', 'api_key']], [['providers', 'openai-codex', 'api_key']],
                  [[None, 'OPENAI_API_KEY']], [['unknown', 'key']]):
        policy.config_secret_ref = reference(paths + other)
        assert f(authority, None, policy, None, config) is None
    for invalid in (reference(paths, home=str(tmp_path / 'different')),
                    reference(paths, profile='other'), reference(paths, bound=[]),
                    credentials.PREFIX + '{bad', 'unknown-private-ref'):
        policy.config_secret_ref = invalid
        assert f(authority, None, policy, None, config) is None
    policy.config_secret_ref = reference(paths)
    assert f(authority, None, policy, None, {'model': {**config['model'], 'api_key_from': paths[0]}}) is None
    monkeypatch.setattr(auth, 'read_credential_pool', lambda provider: [
        {'access_token': 'a', 'base_url': base}, {'access_token': 'different', 'base_url': base}])
    assert f(authority, None, policy, None, config) is None


def test_model_change_ignores_stale_live_response_agent_and_rotating_pool(candidate, monkeypatch):
    import gateway.session_policy as policies
    import hermes_state_local as local
    from agent import model_metadata
    mutations = sys.modules['hcv_desktop_mutations']
    class Policy:
        follows_profile = False
        def __init__(self, model): self.model = model
        def effective(self, *args, **kwargs):
            return {'model': {'provider': 'openai-codex', 'api_mode': 'codex_responses'}}, self.model
        def current_service_tier(self, *args): return 'ultrafast'
    old, target = Policy('gpt-a'), Policy('gpt-b')
    monkeypatch.setattr(policies, 'policy_for_source', lambda *args: old)
    monkeypatch.setattr(policies, 'restore_policy', lambda *args: target)
    monkeypatch.setattr(local, 'local_receipt', lambda *args: {'policy': {}})
    live_agent = object()
    live = SimpleNamespace(route='route', source=object())
    authority = SimpleNamespace(runner=object(), agent=lambda ref: live_agent, db=object())
    ref = SimpleNamespace(session_id='one')
    current = {'token': 'account-b'}
    def route(authority, ref, policy, agent, cfg):
        assert agent is None, 'a previous agent does not prove the next model pool member'
        return (current['token'], 'https://chatgpt.com/backend-api/codex')
    monkeypatch.setattr(candidate.helper, 'responses_route_credential', route)
    monkeypatch.setattr(model_metadata, '_codex_oauth_token_fingerprint', lambda token, base: token)
    monkeypatch.setattr(candidate.helper, 'responses_cached_catalog', lambda credential: {'gpt-b': {'fast': True, 'ultrafast': False}})
    checked = mutations._app_server_tier_check(authority, ref, live)
    assert checked and checked[1][-1] == 'account-b'
    def rotating(credential):
        current['token'] = 'account-c'
        return {'gpt-b': {'fast': True, 'ultrafast': False}}
    monkeypatch.setattr(candidate.helper, 'responses_cached_catalog', rotating)
    assert mutations._app_server_tier_check(authority, ref, live) is None


@pytest.mark.asyncio
async def test_responses_menu_uses_session_account_and_fails_closed_for_ambiguous_draft(candidate, tmp_path, monkeypatch):
    from tests.gateway.test_session_create_tier_cwd import _owner
    from gateway.run import GatewayRunner
    import agent.codex_service_tiers as tiers
    import agent.model_metadata as metadata
    import hermes_cli.auth as auth
    import hermes_cli.auth_constants as auth_constants
    import hermes_cli.auth_codex as auth_codex
    import hermes_cli.inventory as inventory

    base = 'https://chatgpt.com/backend-api/codex'
    account_a, account_b = 'fake-account-a', 'fake-account-b'
    monkeypatch.setattr(auth_constants, '_decode_jwt_claims', lambda token: {'sub': token} if token in (account_a, account_b) else None)
    records = {
        metadata._codex_oauth_token_fingerprint(account_b, base): ({'gpt-6.2-sol': frozenset({'ultrafast'}), 'gpt-b': frozenset({'priority'})}, time.time(), {}),
    }
    monkeypatch.setattr(tiers, '_catalogs', records)
    requests = []
    def fake_refresh(token, origin):
        requests.append((token, origin))
        assert token == account_a and origin == base
        records[metadata._codex_oauth_token_fingerprint(token, origin)] = (
            {'gpt-6.2-sol': frozenset({'priority'}), 'gpt-c': frozenset({'priority'}), 'gpt-b': frozenset()}, time.time(), {})
        return records[metadata._codex_oauth_token_fingerprint(token, origin)]
    monkeypatch.setattr(tiers, '_fresh_catalog', fake_refresh)
    monkeypatch.setattr(auth, 'read_credential_pool', lambda provider: [{'access_token': account_b, 'base_url': base}])
    monkeypatch.setattr(auth_codex, 'resolve_codex_runtime_credentials', lambda **kwargs: {'api_key': account_b, 'base_url': base})
    class Context:
        current_provider = 'openai-codex'
        def with_overrides(self, **kwargs): return self
    monkeypatch.setattr(inventory, 'load_picker_context', lambda: Context())
    # The native inventory incorrectly carries B's tier; the projection must
    # use the actual A session instead and preserve unrelated metadata.
    monkeypatch.setattr(inventory, 'build_model_options_payload', lambda *args, **kwargs: {
        'providers': [{'slug': 'openai-codex', 'name': 'Codex', 'models': ['gpt-6.2-sol'],
                       'capabilities': {'gpt-6.2-sol': {'reasoning': True, 'fast': False,
                                                        'ultrafast': True, 'daybreak': True}}}],
        'provider': 'openai-codex', 'model': 'gpt-6.2-sol'})
    cfg = {'model': {'provider': 'openai-codex', 'default': 'gpt-6.2-sol', 'api_mode': 'codex_responses', 'base_url': base},
           'agent': {'service_tier': 'normal'}}
    store, runner, authority, owner = _owner(tmp_path / 'response-profile', monkeypatch, cfg)
    for name in ('_sessions_map', '_session_state', '_peek_session_state', '_set_session_service_tier_override'):
        setattr(runner, name, MethodType(getattr(GatewayRunner, name), runner))
    try:
        created = await owner.dispatch({'id': 'responses-new', 'method': 'session.create', 'params': {
            'request_id': 'responses-new', 'source': 'gui', 'cwd': str(tmp_path), 'toolsets': [],
            'model': 'gpt-6.2-sol', 'provider': 'openai-codex', 'service_tier': 'normal'}})
        assert 'result' in created, created
        sid = created['result']['session_id']
        agent = SimpleNamespace(model='gpt-6.2-sol', provider='openai-codex', api_mode='codex_responses',
                                base_url=base, api_key=account_a, reasoning_config={})
        runner._cached_agent_for = lambda route: agent
        async def options():
            result = await owner.dispatch({'id': 'catalog-responses', 'method': 'model.options', 'params': {'session_id': sid}})
            return result['result']['providers'][0]['capabilities']['gpt-6.2-sol']
        assert await options() == {'reasoning': True, 'fast': True, 'ultrafast': False, 'daybreak': True}
        assert requests == [(account_a, base)], 'cold session must warm its own account, not profile B'
        assert await options() == {'reasoning': True, 'fast': True, 'ultrafast': False, 'daybreak': True}
        refreshed = await owner.dispatch({'id': 'refresh-responses', 'method': 'model.options', 'params': {'session_id': sid, 'refresh': True}})
        assert refreshed['result']['providers'][0]['capabilities']['gpt-6.2-sol']['fast'] is True
        assert requests == [(account_a, base)], 'fresh cache must be reused on reopen and refresh'
        choices = await owner.dispatch({'id': 'response-choices', 'method': 'config.get', 'params': {
            'session_id': sid, 'key': 'service_tier'}})
        assert choices['result']['options'] == ['normal', 'fast', 'auto', 'cold']
        rejected = await owner.dispatch({'id': 'response-ultra', 'method': 'config.set', 'params': {
            'session_id': sid, 'key': 'fast', 'value': 'ultrafast'}})
        assert 'error' in rejected
        selected = await owner.dispatch({'id': 'response-fast', 'method': 'config.set', 'params': {
            'session_id': sid, 'key': 'fast', 'value': 'fast'}})
        assert selected['result']['value'] == 'fast'

        # The next model turn resolves A from the new route's unique pool.
        # A stale live agent alone is insufficient: pools may rotate on model change.
        monkeypatch.setattr(auth, 'read_credential_pool', lambda provider: [{'access_token': account_a, 'base_url': base}])
        monkeypatch.setattr(auth_codex, 'resolve_codex_runtime_credentials', lambda **kwargs: {'api_key': account_a, 'base_url': base})
        # Switch with A's speed selected: C supports it, B does not. Account B's
        # catalog says the opposite for B, and must not influence this session.
        import hermes_cli.model_switch as model_switch
        import gateway.session_mutation_model as mutation_model
        runner._resolve_session_agent_runtime = lambda **kwargs: ('gpt-6.2-sol', {
            'provider': 'openai-codex', 'base_url': base, 'api_key': account_a, 'api_mode': 'codex_responses'})
        monkeypatch.setattr(model_switch, 'switch_model', lambda **kw: model_switch.ModelSwitchResult(
            success=True, new_model=kw['raw_input'], target_provider='openai-codex', base_url=base, api_key=account_a))
        async def no_external_price_lookup(*args, **kwargs): return None
        monkeypatch.setattr(mutation_model, '_selection_guard_refusal', no_external_price_lookup)
        from gateway.session_policy import policy_for_source
        live = authority.sessions[sid]
        for request_id, model, expected in [('resp-c', 'gpt-c', 'priority'), ('resp-b', 'gpt-b', None)]:
            row = authority.db.get_session(sid)
            switched = await owner.dispatch({'id': request_id, 'method': 'session.mutate', 'params': {
                'session_id': sid, 'request_id': request_id, 'operation': 'model', 'payload': {'model': model},
                'expected_revision': row['runtime_revision'], 'expected_generation': row['runtime_generation']}})
            assert 'result' in switched, switched
            assert policy_for_source(runner, live.source).current_service_tier(runner, live.route) == expected

        # A draft with one provable account B can use B's cached catalog.
        runner._cached_agent_for = lambda route: None
        monkeypatch.setattr(auth, 'read_credential_pool', lambda provider: [{'access_token': account_b, 'base_url': base}])
        monkeypatch.setattr(auth_codex, 'resolve_codex_runtime_credentials', lambda **kwargs: {'api_key': account_b, 'base_url': base})
        assert (await options())['ultrafast'] is True
        assert (await options())['fast'] is False
        monkeypatch.setattr(auth, 'read_credential_pool', lambda provider: [
            {'access_token': account_a, 'base_url': base}, {'access_token': account_b, 'base_url': base}])
        ambiguous = await options()
        assert ambiguous['fast'] is False and ambiguous['ultrafast'] is False
        # Unknown, expired and malformed catalogs also never advertise tiers.
        assert candidate.helper.responses_cached_catalog(None) == {}
        monkeypatch.setitem(records, metadata._codex_oauth_token_fingerprint(account_b, base),
                            ({'gpt-6.2-sol': frozenset({'ultrafast'})}, time.time() - tiers._TTL - 1, {}))
        assert candidate.helper.responses_cached_catalog((account_b, base)) == {}
    finally:
        await owner.close()
        store.close_all_db_handles()


def test_responses_tui_uses_the_same_account_and_rejects_ambiguous_drafts(candidate, monkeypatch):
    import agent.codex_service_tiers as tiers
    import agent.model_metadata as metadata
    import hermes_cli.auth as auth
    import hermes_cli.auth_constants as auth_constants
    import hermes_cli.auth_codex as auth_codex
    import hermes_cli.config as config
    base = 'https://chatgpt.com/backend-api/codex'
    a, b = 'fake-account-a', 'fake-account-b'
    monkeypatch.setattr(auth_constants, '_decode_jwt_claims', lambda token: {'sub': token} if token in (a, b) else None)
    monkeypatch.setattr(tiers, '_catalogs', {
        metadata._codex_oauth_token_fingerprint(a, base): ({'gpt-6.2-sol': frozenset({'priority'})}, time.time(), {}),
        metadata._codex_oauth_token_fingerprint(b, base): ({'gpt-6.2-sol': frozenset({'ultrafast'})}, time.time(), {}),
    })
    monkeypatch.setattr(auth, 'read_credential_pool', lambda provider: [{'access_token': b, 'base_url': base}])
    monkeypatch.setattr(auth_codex, 'resolve_codex_runtime_credentials', lambda **kwargs: {'api_key': b, 'base_url': base})
    monkeypatch.setattr(config, 'load_config', lambda: {'model': {'provider': 'openai-codex', 'api_mode': 'codex_responses', 'base_url': base}})
    source = (CORE / 'tui_gateway/methods_config_set.py').read_text(encoding='utf8')
    function = next(item for item in ast.parse(source).body if isinstance(item, ast.FunctionDef) and item.name == '_set_fast')
    namespace = {'_word': lambda value: str(value or '').lower(), '_load_service_tier': lambda: None,
                 '_FAST_WORDS': {'fast': 'fast', 'normal': 'normal', 'ultrafast': 'ultrafast'},
                 '_resolve_model': lambda: 'gpt-6.2-sol', '_err': lambda rid, code, msg: {'error': msg},
                 '_kv': lambda rid, key, value: {'value': value}, '_persist_live_session_runtime': lambda session: None,
                 '_emit_session_info': lambda *args: None, '_write_config_key': lambda *args: None}
    exec(compile(ast.fix_missing_locations(ast.Module(body=[function], type_ignores=[])), '<real-tui-fast>', 'exec'), namespace)
    setter = namespace['_set_fast']
    agent = SimpleNamespace(model='gpt-6.2-sol', provider='openai-codex', api_mode='codex_responses',
                            base_url=base, api_key=a, service_tier=None, request_overrides={})
    session = {'agent': agent}
    assert setter(1, {}, 'fast', 'fast', session)['value'] == 'fast'
    assert 'error' in setter(1, {}, 'fast', 'ultrafast', session)
    draft = {'model_override': {'model': 'gpt-6.2-sol', 'provider': 'openai-codex'}}
    assert setter(1, {}, 'fast', 'ultrafast', draft)['value'] == 'ultrafast'
    assert 'error' in setter(1, {}, 'fast', 'fast', draft)
    for change in ({'base_url': 'https://other.example'}, {'api_mode': 'chat_completions'},
                   {'api_key': a}, {'api_key_from': ['private']}):
        private = {'model_override': {**draft['model_override'], **change}}
        assert 'error' in setter(1, {}, 'fast', 'ultrafast', private)
    monkeypatch.setattr(auth, 'read_credential_pool', lambda provider: [
        {'access_token': a, 'base_url': base}, {'access_token': b, 'base_url': base}])
    assert 'error' in setter(1, {}, 'fast', 'ultrafast', draft)


def test_catalog_timeout_closes_only_the_owned_client(candidate, monkeypatch):
    import agent.transports.codex_app_server as transport
    monkeypatch.setattr(transport, 'CodexAppServerClient', FakeAppServer)
    seen = []
    def timeout(self, method, params, timeout):
        seen.append(timeout)
        raise TimeoutError('catalog timed out')
    monkeypatch.setattr(FakeAppServer, 'request', timeout)
    before = len(FakeAppServer.instances)
    with pytest.raises(TimeoutError):
        candidate.helper.app_server_catalog(config={'model': {'codex_bin': 'fake'}})
    owned = FakeAppServer.instances[before]
    assert owned.closed
    borrowed = FakeAppServer()
    session = SimpleNamespace(_client=borrowed)
    with pytest.raises(TimeoutError):
        candidate.helper.app_server_catalog(session=session)
    assert not borrowed.closed
    assert all(0 < value <= 3 for value in seen)
    missing = {'providers': [{'slug': 'openai-codex', 'models': ['gpt-e']}]}
    candidate.helper.project_app_server_catalog(missing, 'openai-codex', {'gpt-e': {'fast': True, 'ultrafast': True}})
    assert 'capabilities' not in missing['providers'][0]


def test_real_client_serializes_concurrent_messages():
    from concurrent.futures import ThreadPoolExecutor
    import json
    transport = load('hcv_concurrent_codex_transport', CORE / 'agent/transports/codex_app_server.py')
    client = object.__new__(transport.CodexAppServerClient)
    client._send_lock = threading.Lock()
    client._request_id_lock = threading.Lock()
    client._pending_lock = threading.Lock()
    client._pending = {}
    client._next_id = 1
    client._closed = False

    class Stream:
        def __init__(self):
            self.writes, self.current, self.max_parallel = [], 0, 0
        def write(self, data):
            self.current += 1
            self.max_parallel = max(self.max_parallel, self.current)
            time.sleep(.001)
            self.writes.append(data)
            self.current -= 1
        def flush(self):
            pass
    stream = Stream()
    client._proc = SimpleNamespace(stdin=stream)
    with ThreadPoolExecutor(max_workers=12) as workers:
        list(workers.map(lambda n: client._send({'method': 'model/list', 'id': n}), range(60)))
    assert stream.max_parallel == 1
    assert {json.loads(row)['id'] for row in stream.writes} == set(range(60))

    def deliver(request):
        with client._pending_lock:
            queue = client._pending.pop(request['id'])
        queue.put({'result': {'id': request['id']}})
    client._send = deliver
    with ThreadPoolExecutor(max_workers=12) as workers:
        replies = list(workers.map(lambda n: client.request('model/list', {'n': n}, timeout=1), range(100)))
    assert {reply['id'] for reply in replies} == set(range(1, 101))
    assert client._pending == {}


@pytest.mark.asyncio
async def test_other_provider_session_info_with_and_without_agent(candidate, tmp_path, monkeypatch):
    from tests.gateway.test_session_create_tier_cwd import _owner
    from gateway.run import GatewayRunner
    from gateway.session_contract import SessionRef
    import hermes_cli.models as models
    import gateway.session_local as actual_local

    baseline = load('hcv_baseline_local', INSTALLED / 'gateway/session_local.py')
    monkeypatch.setattr(models, 'resolve_fast_mode_overrides', lambda *args, **kwargs: {'speed': 'fast'})
    config = {'model': {'provider': 'anthropic', 'default': 'claude-test'},
              'agent': {'service_tier': 'normal', 'reasoning_effort': 'high'}}
    store, runner, authority, owner = _owner(tmp_path / 'other-profile', monkeypatch, config)
    for name in ('_sessions_map', '_session_state', '_peek_session_state', '_set_session_service_tier_override'):
        setattr(runner, name, MethodType(getattr(GatewayRunner, name), runner))
    try:
        created = await owner.dispatch({'id': 'other', 'method': 'session.create', 'params': {
            'request_id': 'other', 'source': 'gui', 'cwd': str(tmp_path), 'toolsets': [],
            'model': 'claude-test', 'provider': 'anthropic', 'service_tier': 'normal'}})
        assert 'result' in created, created
        sid = created['result']['session_id']
        ref = SessionRef(authority.profile_id, sid)
        keys = ('reasoning_effort', 'reasoning_effort_wire', 'service_tier', 'fast')
        lazy_before = baseline.local_session_info(authority, ref)
        lazy_after = actual_local.local_session_info(authority, ref)
        assert {k: lazy_after[k] for k in keys} == {k: lazy_before[k] for k in keys}
        assert lazy_after['lazy'] is True

        agent = SimpleNamespace(model='claude-test', provider='anthropic', api_mode='anthropic_messages',
                                base_url='https://api.anthropic.com', reasoning_config={'enabled': True, 'effort': 'high'},
                                service_tier=None)
        monkeypatch.setattr(runner, '_cached_agent_for', lambda route: agent)
        live_before = baseline.local_session_info(authority, ref)
        live_after = actual_local.local_session_info(authority, ref)
        assert {k: live_after[k] for k in keys} == {k: live_before[k] for k in keys}
        assert live_after['lazy'] is False
        selected = await owner.dispatch({'id': 'other-fast', 'method': 'config.set', 'params': {
            'session_id': sid, 'key': 'service_tier', 'value': 'fast'}})
        assert 'result' in selected, selected
        changed = actual_local.local_session_info(authority, ref)
        assert changed['service_tier'] == 'priority' and changed['fast'] is True
        assert (changed['reasoning_effort'], changed['reasoning_effort_wire']) == (
            live_before['reasoning_effort'], live_before['reasoning_effort_wire'])
    finally:
        await owner.close()
        store.close_all_db_handles()


@pytest.mark.asyncio
async def test_actual_desktop_owner_model_tier_and_app_server_route(candidate, tmp_path, monkeypatch):
    from tests.gateway.test_session_create_tier_cwd import _owner
    from gateway.run import GatewayRunner
    from gateway.run_turn_prepare import GatewayTurnPrepareMixin
    from gateway.session_policy import policy_for_source
    from gateway.session_contract import SessionRef
    from agent.transports.codex_app_server_session import CodexAppServerSession
    import agent.transports.codex_app_server as transport
    import agent.codex_service_tiers as tiers
    import agent.models_dev as models_dev
    import hermes_cli.inventory as inventory
    import hermes_cli.models as models
    import run_agent

    FakeAppServer.requests.clear()
    FakeAppServer.instances.clear()
    # Account A advertises no tiers; account B advertises them through model/list.
    monkeypatch.setattr(tiers, 'codex_account_offers_tier', lambda *args, **kwargs: False)
    monkeypatch.setattr(tiers, 'ultrafast_offered', lambda *args, **kwargs: False)
    monkeypatch.setattr(tiers, 'daybreak_offered', lambda *args, **kwargs: False)
    monkeypatch.setattr(models, 'resolve_fast_mode_overrides', lambda *args, **kwargs: None)
    monkeypatch.setattr(models_dev, 'get_model_capabilities', lambda slug, model, **kwargs:
                        SimpleNamespace(supports_reasoning=False) if model == 'gpt-d' else None)
    monkeypatch.setattr(inventory, '_reasoning_catalog_reader', lambda slug: None)
    monkeypatch.setattr(transport, 'CodexAppServerClient', FakeAppServer)
    class Context:
        current_provider = 'openai-codex'
        def with_overrides(self, **kwargs):
            return self
    monkeypatch.setattr(inventory, 'load_picker_context', lambda: Context())
    def actual_inventory(*args, **kwargs):
        rows = [{'slug': 'openai-codex', 'name': 'Codex',
                 'models': ['gpt-6.2-sol', 'gpt-b', 'gpt-c', 'gpt-d', 'gpt-e']},
                {'slug': 'other', 'name': 'Other', 'models': ['gpt-6.2-sol']}]
        inventory._apply_capabilities(rows, metadata_config={'model': {'openai_runtime': 'codex_app_server'}})
        # Exercise a malformed or absent per-model record without inventing reasoning.
        rows[0]['capabilities'].pop('gpt-e')
        return {'providers': rows, 'provider': 'openai-codex', 'model': 'gpt-6.2-sol'}
    monkeypatch.setattr(inventory, 'build_model_options_payload', actual_inventory)
    home = tmp_path / 'profile'
    cfg = {'model': {'provider': 'openai-codex', 'default': 'gpt-6.2-sol',
                     'openai_runtime': 'codex_app_server', 'api_key': 'fake-account-A'},
           'agent': {'service_tier': 'normal'}}
    store, runner, authority, owner = _owner(home, monkeypatch, cfg)
    for name in ('_sessions_map', '_session_state', '_peek_session_state', '_set_session_service_tier_override'):
        setattr(runner, name, MethodType(getattr(GatewayRunner, name), runner))
    try:
        created = await owner.dispatch({'id': 'new', 'method': 'session.create', 'params': {
            'request_id': 'new', 'source': 'gui', 'cwd': str(tmp_path), 'toolsets': [],
            'model': 'gpt-6.2-sol', 'provider': 'openai-codex', 'service_tier': 'normal'}})
        assert 'result' in created, created
        sid = created['result']['session_id']
        ref = SessionRef(authority.profile_id, sid)
        live = authority.sessions[sid]
        policy = policy_for_source(runner, live.source)
        assert policy.current_service_tier(runner, live.route) is None

        listing = await owner.dispatch({'id': 'catalog', 'method': 'model.options', 'params': {'session_id': sid}})
        assert 'result' in listing, listing
        rows = listing['result']['providers']
        caps = rows[0]['capabilities']
        assert (caps['gpt-6.2-sol']['fast'], caps['gpt-6.2-sol']['ultrafast']) == (True, True)
        assert (caps['gpt-b']['fast'], caps['gpt-b']['ultrafast']) == (True, False)
        assert (caps['gpt-c']['fast'], caps['gpt-c']['ultrafast']) == (False, True)
        assert caps['gpt-d']['reasoning'] is False and caps['gpt-d']['ultrafast'] is True
        assert 'gpt-e' not in caps
        assert rows[1]['capabilities']['gpt-6.2-sol']['fast'] is False
        choices = await owner.dispatch({'id': 'choices', 'method': 'config.get', 'params': {
            'session_id': sid, 'key': 'service_tier'}})
        assert choices['result']['options'] == ['normal', 'fast', 'auto', 'cold', 'ultrafast']

        session = CodexAppServerSession(cwd=str(tmp_path))
        session._thread_id = 'fake-thread'
        session._client = FakeAppServer()
        agent = object.__new__(run_agent.AIAgent)
        agent.api_mode = 'codex_app_server'
        agent.provider = 'openai-codex'
        agent.base_url = 'https://chatgpt.com/backend-api/codex'
        agent.api_key = 'fake-account-A'
        agent.model = 'gpt-6.2-sol'
        agent._codex_session = session
        route_input = {'provider': 'openai-codex', 'base_url': agent.base_url,
                       'api_key': agent.api_key, 'api_mode': 'codex_app_server'}

        # An existing session reads its own live process, without closing it.
        previous_instances = len(FakeAppServer.instances)
        monkeypatch.setattr(runner, '_cached_agent_for', lambda route: agent)
        live_listing = await owner.dispatch({'id': 'live-catalog', 'method': 'model.options', 'params': {'session_id': sid}})
        assert live_listing['result']['providers'][0]['capabilities']['gpt-6.2-sol']['ultrafast'] is True
        assert len(FakeAppServer.instances) == previous_instances
        assert not session._client.closed
        monkeypatch.setattr(runner, '_cached_agent_for', lambda route: None)

        for selection, expected in [('fast', 'fast'), ('ultrafast', 'ultrafast'), ('normal', None)]:
            selected = await owner.dispatch({'id': 'pick-' + selection, 'method': 'config.set', 'params': {
                'session_id': sid, 'key': 'service_tier', 'value': selection}})
            assert 'result' in selected, selected
            tier = policy.current_service_tier(runner, live.route)
            route = GatewayTurnPrepareMixin._resolve_turn_agent_config(runner, '', 'gpt-6.2-sol', route_input, tier=tier)
            assert not route['request_overrides'], 'different Hermes account does not advertise this tier'
            agent.service_tier = tier
            agent.request_overrides = route['request_overrides']
            wire = candidate.runtime._codex_turn_service_tier(agent)
            assert wire == expected
            if wire:
                candidate.helper.require_app_server_tier(session, agent.model, wire)

        # A slow/unavailable catalog never blocks another owner request on the event loop.
        from gateway.session_local import local_session_info
        await owner.dispatch({'id': 'ultra-before-timeout', 'method': 'config.set', 'params': {
            'session_id': sid, 'key': 'service_tier', 'value': 'ultrafast'}})
        info = local_session_info(authority, ref)
        assert info['service_tier'] == 'ultrafast' and info['fast'] is True
        start, release = threading.Event(), threading.Event()
        original_request = FakeAppServer.request
        def delayed(self, method, params, timeout):
            assert 0 < timeout <= 3
            start.set()
            release.wait(timeout=timeout)
            raise TimeoutError('test catalog timeout')
        monkeypatch.setattr(FakeAppServer, 'request', delayed)
        pending = asyncio.create_task(owner.dispatch({'id': 'slow-catalog', 'method': 'model.options', 'params': {'session_id': sid}}))
        assert await asyncio.to_thread(start.wait, 2)
        normal = await asyncio.wait_for(owner.dispatch({'id': 'normal-during-catalog', 'method': 'config.set', 'params': {
            'session_id': sid, 'key': 'service_tier', 'value': 'normal'}}), timeout=1)
        assert normal['result']['value'] == 'normal'
        release.set()
        unavailable = await asyncio.wait_for(pending, timeout=2)
        assert unavailable['result']['providers'][0]['capabilities']['gpt-6.2-sol']['fast'] is False
        assert unavailable['result']['providers'][0]['capabilities']['gpt-6.2-sol']['ultrafast'] is False
        assert FakeAppServer.instances[-1].closed
        monkeypatch.setattr(FakeAppServer, 'request', original_request)

        agent.model = 'gpt-b'
        agent.service_tier = 'ultrafast'
        agent.request_overrides = {}
        assert candidate.runtime._codex_turn_service_tier(agent) == 'ultrafast'
        with pytest.raises(RuntimeError, match='не подтверждена'):
            candidate.helper.require_app_server_tier(session, agent.model, 'ultrafast')

        # Desktop changes the model with a revision-fenced real session.mutate.
        import hermes_cli.model_switch as model_switch
        import gateway.session_mutation_model as mutation_model
        runner._resolve_session_agent_runtime = lambda **kwargs: ('gpt-6.2-sol', {
            'provider': 'openai-codex', 'base_url': agent.base_url,
            'api_key': 'fake-account-A', 'api_mode': 'codex_app_server'})
        monkeypatch.setattr(model_switch, 'switch_model', lambda **kw: model_switch.ModelSwitchResult(
            success=True, new_model=kw['raw_input'], target_provider='openai-codex',
            base_url=agent.base_url, api_key='fake-account-A'))
        async def no_external_price_lookup(*args, **kwargs):
            return None
        monkeypatch.setattr(mutation_model, '_selection_guard_refusal', no_external_price_lookup)
        other = await owner.dispatch({'id': 'isolated', 'method': 'session.create', 'params': {
            'request_id': 'isolated', 'source': 'gui', 'cwd': str(tmp_path), 'toolsets': [],
            'model': 'gpt-6.2-sol', 'provider': 'openai-codex', 'service_tier': 'ultrafast'}})
        assert 'result' in other, other
        other_live = authority.sessions[other['result']['session_id']]
        await owner.dispatch({'id': 'ultra-before-supported-model', 'method': 'config.set', 'params': {
            'session_id': sid, 'key': 'service_tier', 'value': 'ultrafast'}})
        for request_id, model in [('model-c', 'gpt-c'), ('model-a-again', 'gpt-6.2-sol')]:
            row = authority.db.get_session(sid)
            response = await owner.dispatch({'id': request_id, 'method': 'session.mutate', 'params': {
                'session_id': sid, 'request_id': request_id, 'operation': 'model', 'payload': {'model': model},
                'expected_revision': row['runtime_revision'], 'expected_generation': row['runtime_generation']}})
            assert 'result' in response, response
            assert policy_for_source(runner, live.source).current_service_tier(runner, live.route) == 'ultrafast'
        # The pending submission cannot overtake an unsupported-tier check.
        await owner.dispatch({'id': 'ultra-before-model', 'method': 'config.set', 'params': {
            'session_id': sid, 'key': 'service_tier', 'value': 'ultrafast'}})
        started, release = threading.Event(), threading.Event()
        def slow_supported_catalog(self, method, params, timeout):
            started.set()
            assert release.wait(timeout=timeout)
            return original_request(self, method, params, timeout)
        monkeypatch.setattr(FakeAppServer, 'request', slow_supported_catalog)
        monkeypatch.setattr(authority, '_schedule', lambda *args, **kwargs: None)
        row = authority.db.get_session(sid)
        change_task = asyncio.create_task(owner.dispatch({'id': 'model-b', 'method': 'session.mutate', 'params': {
            'session_id': sid, 'request_id': 'model-b', 'operation': 'model', 'payload': {'model': 'gpt-b'},
            'expected_revision': row['runtime_revision'], 'expected_generation': row['runtime_generation']}}))
        assert await asyncio.to_thread(started.wait, 3), 'model commit did not start catalog lookup'
        submit_task = asyncio.create_task(owner.dispatch({'id': 'next-prompt', 'method': 'prompt.submit', 'params': {
            'session_id': sid, 'input_id': 'next-prompt', 'text': 'local test only'}}))
        await asyncio.sleep(.05)
        assert not submit_task.done(), 'prompt overtook the model speed check'
        release.set()
        changed = await asyncio.wait_for(change_task, 5)
        submitted = await asyncio.wait_for(submit_task, 5)
        assert 'result' in submitted, submitted
        monkeypatch.setattr(FakeAppServer, 'request', original_request)
        assert 'result' in changed, changed
        updated = policy_for_source(runner, live.source)
        assert updated.model == 'gpt-b'
        assert updated.current_service_tier(runner, live.route) is None
        assert policy_for_source(runner, other_live.source).current_service_tier(runner, other_live.route) == 'ultrafast'
        after_switch = await owner.dispatch({'id': 'choices-b', 'method': 'config.get', 'params': {
            'session_id': sid, 'key': 'service_tier'}})
        assert after_switch['result']['options'] == ['normal', 'fast', 'auto', 'cold']

        # A new empty chat carries its explicit selection on session.create.
        for speed, expected_tier in [('normal', None), ('fast', 'priority'), ('ultrafast', 'ultrafast')]:
            created = await owner.dispatch({'id': 'new-' + speed, 'method': 'session.create', 'params': {
                'request_id': 'new-' + speed, 'source': 'gui', 'cwd': str(tmp_path), 'toolsets': [],
                'model': 'gpt-6.2-sol', 'provider': 'openai-codex', 'service_tier': speed}})
            assert 'result' in created, created
            fresh = authority.sessions[created['result']['session_id']]
            fresh_policy = policy_for_source(runner, fresh.source)
            assert fresh_policy.current_service_tier(runner, fresh.route) == expected_tier
        assert all(method in {'initialize', 'model/list'} for method, _ in FakeAppServer.requests)
    finally:
        await owner.close()
        store.close_all_db_handles()

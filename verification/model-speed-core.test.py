import ast
import importlib.util
from pathlib import Path
import sys
import types
import unittest
import tempfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent


class DynamicTierTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='hcv-model-speed-core-test-')
        cls.core = Path(cls.temp.name) / 'candidate'
        spec = importlib.util.spec_from_file_location('hcv_test_model_speed_stage', ROOT / 'scripts/stage-hermes-model-speed.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.stage.write_candidate(cls.core)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def setUp(self):
        spec = importlib.util.spec_from_file_location('agent.hcv_model_speed', ROOT / 'source/hermes-model-speed/hcv_model_speed.py')
        self.helper = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.helper)
        agent = types.ModuleType('agent'); agent.__path__ = []
        agent.hcv_model_speed = self.helper
        headers = types.ModuleType('agent.codex_headers')
        headers.is_official_codex_base_url = lambda url: url == 'https://chatgpt.com/backend-api/codex'
        headers.CODEX_AUX_BASE_URL = 'https://chatgpt.com/backend-api/codex'
        agent.codex_headers = headers
        tiers = types.ModuleType('agent.codex_service_tiers')
        tiers.codex_account_offers_tier = lambda model, tier, base_url=None: {
            ('gpt-future', 'priority'): True,
            ('gpt-future', 'ultrafast'): True,
            ('gpt-one', 'priority'): True,
            ('gpt-one', 'ultrafast'): False,
            ('gpt-unknown', 'priority'): None,
        }.get((model, tier))
        agent.codex_service_tiers = tiers
        cli = types.ModuleType('hermes_cli'); cli.__path__ = []
        models = types.ModuleType('hermes_cli.models')
        models.normalize_provider = lambda name: name
        cli.models = models
        self.modules = patch.dict(sys.modules, {
            'agent': agent, 'agent.hcv_model_speed': self.helper, 'agent.codex_headers': headers,
            'agent.codex_service_tiers': tiers, 'hermes_cli': cli, 'hermes_cli.models': models,
        })
        self.modules.start()
        self.addCleanup(self.modules.stop)

    def test_only_codex_subscription_uses_its_explicit_catalog(self):
        self.assertTrue(self.helper.is_codex_route('openai-codex', None))
        self.assertFalse(self.helper.is_codex_route('openai', None))
        self.assertFalse(self.helper.is_codex_route('openai-codex', 'https://elsewhere.example'))
        self.assertEqual(self.helper.catalog_override('gpt-future', 'openai-codex', None, None), {'service_tier': 'priority'})
        self.assertEqual(self.helper.catalog_override('gpt-future', 'openai-codex', None, 'ultrafast'), {'service_tier': 'ultrafast'})
        self.assertIsNone(self.helper.catalog_override('gpt-one', 'openai-codex', None, 'ultrafast'))
        self.assertIsNone(self.helper.catalog_override('gpt-unknown', 'openai-codex', None, None))

    def test_candidate_uses_catalog_for_codex_and_retains_other_routes(self):
        source = (self.core / 'hermes_cli/models.py').read_text(encoding='utf8')
        tree = ast.parse(source)
        function = next(x for x in tree.body if isinstance(x, ast.FunctionDef) and x.name == 'resolve_fast_mode_overrides')
        function.returns = None
        for arg in [*function.args.args, *function.args.kwonlyargs]:
            arg.annotation = None
        namespace = {'model_supports_fast_mode': lambda model: model == 'claude-allowed',
                     '_fast_mode_route_supported': lambda *args: True,
                     '_is_anthropic_fast_model': lambda model: model == 'claude-allowed',
                     'model_supports_ultrafast': lambda model: False}
        exec(compile(ast.fix_missing_locations(ast.Module(body=[function], type_ignores=[])), '<candidate>', 'exec'), namespace)
        resolve = namespace['resolve_fast_mode_overrides']
        self.assertEqual(resolve('gpt-future', provider='openai-codex', tier='ultrafast'), {'service_tier': 'ultrafast'})
        self.assertIsNone(resolve('gpt-one', provider='openai-codex', tier='ultrafast'))
        self.assertIsNone(resolve('gpt-unknown', provider='openai-codex'))
        self.assertEqual(resolve('claude-allowed', provider='anthropic'), {'speed': 'fast'})
        self.assertIsNone(resolve('gpt-future', provider='openai'))

    def test_app_server_uses_its_own_catalog_and_does_not_guess(self):
        class Session:
            def __init__(self, pages):
                self.pages = pages
                self.started = 0
                self._client = self
                self.requests = []
            def ensure_started(self):
                self.started += 1
            def request(self, method, params, timeout):
                self.requests.append((method, dict(params)))
                if isinstance(self.pages, Exception):
                    raise self.pages
                return self.pages.get(params.get('cursor'), {'data': []})
        both = {'model': 'gpt-a', 'id': 'gpt-a', 'serviceTiers': [{'id':'priority'}, {'id':'ultrafast'}]}
        only_fast = {'model': 'gpt-b', 'id': 'gpt-b', 'serviceTiers': [{'id':'priority'}]}
        first = Session({None:{'data':[only_fast], 'nextCursor':'next'}, 'next':{'data':[both]}})
        self.helper.require_app_server_tier(first, 'gpt-a', 'fast')
        self.helper.require_app_server_tier(first, 'gpt-a', 'ultrafast', model_provider='another')
        self.assertEqual(first.requests[-1][1]['modelProvider'], 'another')
        self.assertEqual(first.requests[-1][1]['cursor'], 'next')
        with self.assertRaisesRegex(RuntimeError, 'не подтверждена'):
            self.helper.require_app_server_tier(first, 'gpt-b', 'ultrafast')
        # Different profile/session gets its own client catalog, never the first's.
        other = Session({None:{'data':[only_fast]}})
        with self.assertRaisesRegex(RuntimeError, 'не подтверждена'):
            self.helper.require_app_server_tier(other, 'gpt-a', 'ultrafast')
        with self.assertRaisesRegex(RuntimeError, 'не подтверждена'):
            self.helper.require_app_server_tier(Session(TimeoutError()), 'gpt-a', 'ultrafast')
        with self.assertRaisesRegex(RuntimeError, 'не подтверждена'):
            self.helper.require_app_server_tier(Session({None:{'data':[{'model':'gpt-a', 'additionalSpeedTiers':['ultrafast']}]}}), 'gpt-a', 'ultrafast')

    def test_app_server_mapping_and_guard_precede_real_turn(self):
        source = (self.core / 'agent/fast_mode.py').read_text(encoding='utf8')
        tree = ast.parse(source)
        mapping = next(n for n in tree.body if isinstance(n, ast.AnnAssign) and isinstance(n.target, ast.Name) and n.target.id == 'CODEX_TIER_WORDS')
        self.assertEqual(ast.literal_eval(mapping.value), {'priority':'fast', 'ultrafast':'ultrafast'})
        source = (self.core / 'agent/codex_runtime.py').read_text(encoding='utf8')
        start = source.index('def run_codex_app_server_turn(')
        scope = source[start:source.index('def ', start + 4)]
        self.assertLess(scope.index('require_app_server_tier('), scope.index('agent._codex_session.run_turn('))

    def test_responses_request_uses_current_account_catalog(self):
        import logging, os
        root = Path(os.environ['LOCALAPPDATA']) / 'hermes/hermes-agent'
        catalog = {'A': {'ultrafast', 'priority'}, 'B': {'priority'}, 'C': set()}
        tiers = sys.modules['agent.codex_service_tiers']
        tiers.apply_daybreak = lambda agent, overrides: None
        headers = sys.modules['agent.codex_headers']
        headers.is_official_codex_base_url = lambda value: True
        path = self.core / 'agent/codex_service_tiers.py'
        function = next(n for n in ast.parse(path.read_text(encoding='utf8')).body if isinstance(n, ast.FunctionDef) and n.name == 'negotiate_request_tier')
        function.returns = None
        for arg in [*function.args.args, *function.args.kwonlyargs]: arg.annotation = None
        namespace = {'_tiers_for_model': lambda token, base, model: catalog[token], 'logger':logging.getLogger('hcv-test')}
        exec(compile(ast.fix_missing_locations(ast.Module(body=[function], type_ignores=[])), '<real-negotiation>', 'exec'), namespace)
        tiers.negotiate_request_tier = namespace['negotiate_request_tier']
        tiers._tiers_for_model = lambda token, base, model: catalog[token]
        auth = types.ModuleType('hermes_cli.auth_constants'); auth._decode_jwt_claims = lambda token: token != 'bad'
        metadata = types.ModuleType('agent.model_metadata'); metadata._bare_codex_slug = lambda model: model
        sys.modules['hermes_cli.auth_constants'] = auth; sys.modules['agent.model_metadata'] = metadata
        self.addCleanup(sys.modules.pop, 'hermes_cli.auth_constants', None)
        self.addCleanup(sys.modules.pop, 'agent.model_metadata', None)
        path = self.core / 'agent/fast_mode.py'
        function = next(n for n in ast.parse(path.read_text(encoding='utf8')).body if isinstance(n, ast.FunctionDef) and n.name == 'effective_request_overrides')
        function.returns = None
        for arg in [*function.args.args, *function.args.kwonlyargs]: arg.annotation = None
        namespace = {'BOUNDED_MODES':set(), 'STATIC_TIERS':{'priority', 'ultrafast'}, 'time':None}
        exec(compile(ast.fix_missing_locations(ast.Module(body=[function], type_ignores=[])), '<real-fast-mode>', 'exec'), namespace)
        request = namespace['effective_request_overrides']
        agent = types.SimpleNamespace(api_mode='codex_responses', provider='openai-codex', base_url='https://chatgpt.com/backend-api/codex', model='gpt-a', service_tier='ultrafast', request_overrides={'service_tier':'ultrafast'})
        agent.api_key = 'A'
        self.assertEqual(request(agent).get('service_tier'), 'ultrafast')
        for account in ('B', 'C', 'bad'):
            agent.api_key = account
            with self.assertRaisesRegex(RuntimeError, 'не подтверждена'):
                request(agent)
        agent.api_key = 'B'; agent.service_tier = 'priority'; agent.request_overrides = {'service_tier':'priority'}
        self.assertEqual(request(agent).get('service_tier'), 'priority')
        agent.request_overrides = {}
        self.assertEqual(request(agent).get('service_tier'), 'priority')
        agent.service_tier = None
        self.assertEqual(request(agent).get('service_tier'), None)
        agent.api_key = 'A'; agent.service_tier = 'ultrafast'; agent.request_overrides = {'service_tier':'ultrafast'}
        self.assertEqual(request(agent).get('service_tier'), 'ultrafast')
        self.assertEqual(agent.request_overrides, {'service_tier':'ultrafast'})
        # An app-server operation may be invoked with a stale api_mode field.
        # Its own catalog must remain authoritative, not account B's Responses catalog.
        agent.api_key = 'B'
        with self.assertRaisesRegex(RuntimeError, 'не подтверждена'):
            request(agent)
        self.assertEqual(request(agent, _hcv_codex_app_server=True).get('service_tier'), 'ultrafast')

    def test_gateway_selection_reaches_request_overrides(self):
        config = types.ModuleType('hermes_cli.config')
        config.load_config = lambda: {}
        sys.modules['hermes_cli.config'] = config
        self.addCleanup(sys.modules.pop, 'hermes_cli.config', None)
        tiers = sys.modules['agent.codex_service_tiers']
        tiers.ultrafast_offered = lambda model, **kwargs: tiers.codex_account_offers_tier(model, 'ultrafast') is True
        fast_mode = types.ModuleType('agent.fast_mode')
        fast_mode.STATIC_TIERS = {'priority', 'ultrafast'}
        fast_mode.service_tier_word = lambda tier: {None: 'normal', '': 'normal', 'priority': 'fast'}.get(tier, tier)
        sys.modules['agent.fast_mode'] = fast_mode
        self.addCleanup(sys.modules.pop, 'agent.fast_mode', None)
        sys.modules['hermes_cli.models'].resolve_fast_mode_overrides = lambda model, provider=None, base_url=None, tier=None: (
            self.helper.catalog_override(model, provider, base_url, tier) if self.helper.is_codex_route(provider, base_url) else None)
        source = (self.core / 'tui_gateway/methods_config_set.py').read_text(encoding='utf8')
        function = next(x for x in ast.parse(source).body if isinstance(x, ast.FunctionDef) and x.name == '_set_fast')
        namespace = {'_word': lambda value: str(value or '').lower(), '_load_service_tier': lambda: None,
                     '_FAST_WORDS': {'fast': 'fast', 'normal': 'normal', 'ultrafast': 'ultrafast'},
                     '_resolve_model': lambda: None, '_err': lambda rid, code, msg: {'error': msg},
                     '_kv': lambda rid, key, value: {'value': value}, '_persist_live_session_runtime': lambda session: None,
                     '_emit_session_info': lambda *args: None, '_write_config_key': lambda *args: None}
        exec(compile(ast.fix_missing_locations(ast.Module(body=[function], type_ignores=[])), '<gateway>', 'exec'), namespace)
        setter = namespace['_set_fast']
        # These tests exercise the TUI setter's state propagation; route
        # ownership and credential proof have separate desktop tests.
        for name, value in {
            'responses_route_credential': lambda *args: ('fake-account', 'fake-base'),
            'responses_catalog': lambda credential: {
                'gpt-future': {'fast': True, 'ultrafast': True},
                'gpt-one': {'fast': True, 'ultrafast': False}},
            'app_server_model_capabilities': lambda catalog, model: catalog.get(model, {'fast': False, 'ultrafast': False}),
        }.items():
            mocked = patch.object(self.helper, name, value)
            mocked.start()
            self.addCleanup(mocked.stop)
        agent = types.SimpleNamespace(model='gpt-future', provider='openai-codex', base_url=None,
                                      api_key=None, service_tier=None, request_overrides={})
        session = {'agent': agent}
        self.assertEqual(setter(1, {'session_id': 'test'}, 'fast', 'fast', session)['value'], 'fast')
        self.assertEqual(agent.request_overrides, {'service_tier': 'priority'})
        self.assertEqual(setter(1, {'session_id': 'test'}, 'fast', 'ultrafast', session)['value'], 'ultrafast')
        self.assertEqual(agent.request_overrides, {'service_tier': 'ultrafast'})
        self.assertEqual(session['create_service_tier_override'], 'ultrafast')
        self.assertEqual(setter(1, {'session_id': 'test'}, 'fast', 'normal', session)['value'], 'normal')
        self.assertEqual(agent.request_overrides, {})
        self.assertEqual(session['create_service_tier_override'], '')
        agent.model = 'gpt-one'
        self.assertIn('not available', setter(1, {}, 'fast', 'ultrafast', session)['error'])
        self.assertEqual(agent.request_overrides, {})
        unbuilt = {'model_override': {'model': 'gpt-future', 'provider': 'openai-codex'}}
        self.assertEqual(setter(1, {}, 'fast', 'ultrafast', unbuilt)['value'], 'ultrafast')
        self.assertEqual(unbuilt['create_service_tier_override'], 'ultrafast')

        # Legacy TUI must honor the app-server account even if Hermes's is different.
        agent.model = 'gpt-other-account'
        agent.api_mode = 'codex_responses'
        agent._codex_session = object()
        agent.request_overrides = {}
        agent.service_tier = None
        with patch.object(self.helper, 'uses_codex_app_server', return_value=True), \
             patch.object(self.helper, 'app_server_catalog', return_value={'from': 'codex-account'}), \
             patch.object(self.helper, 'app_server_model_capabilities', return_value={'fast': True, 'ultrafast': True}):
            self.assertEqual(setter(1, {}, 'fast', 'ultrafast', session)['value'], 'ultrafast')
            self.assertEqual(agent.request_overrides, {'service_tier': 'ultrafast'})
            self.assertEqual(setter(1, {}, 'fast', 'fast', session)['value'], 'fast')
            self.assertEqual(agent.request_overrides, {'service_tier': 'priority'})
            self.assertEqual(setter(1, {}, 'fast', 'normal', session)['value'], 'normal')
        with patch.object(self.helper, 'uses_codex_app_server', return_value=True), \
             patch.object(self.helper, 'app_server_catalog', return_value={}), \
             patch.object(self.helper, 'app_server_model_capabilities', return_value={'fast': True, 'ultrafast': False}):
            self.assertIn('not available', setter(1, {}, 'fast', 'ultrafast', session)['error'])


if __name__ == '__main__':
    unittest.main()

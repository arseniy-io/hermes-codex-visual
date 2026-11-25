"""Resolve Codex subscription speed tiers from the account's live catalog."""
from __future__ import annotations


def is_codex_route(provider, base_url):
    from agent.codex_headers import is_official_codex_base_url
    from hermes_cli.models import normalize_provider

    if provider and normalize_provider(provider) != 'openai-codex':
        return False
    if base_url and not is_official_codex_base_url(base_url):
        return False
    return bool(provider or base_url)


def catalog_override(model, provider, base_url, tier):
    """Use explicit live eligibility; unknown never manufactures a speed tier."""
    from agent.codex_service_tiers import codex_account_offers_tier

    speed = 'ultrafast' if tier == 'ultrafast' else 'priority'
    try:
        offered = codex_account_offers_tier(model, speed, base_url=base_url)
    except Exception:
        offered = None
    if offered is not True:
        return None
    return {'service_tier': speed}


def require_app_server_tier(session, model, tier, *, model_provider=None):
    """Check the running app-server's own current model catalog before paid-tier selection.

    Codex filters unadvertised tiers from the HTTP request without error. The
    separate Hermes account's catalog is insufficient: this process may use
    another Codex login. Read the active client's model/list on each turn.
    """
    if tier not in {'fast', 'ultrafast'} or not isinstance(model, str) or not model:
        raise RuntimeError('Невозможно проверить выбранную скорость модели Codex')
    accepted = {'priority', 'fast'} if tier == 'fast' else {'ultrafast'}
    try:
        session.ensure_started()
        client = session._client
        cursor = None
        seen = set()
        for _ in range(20):
            params = {'includeHidden': True, 'limit': 100}
            if model_provider:
                params['modelProvider'] = model_provider
            if cursor:
                params['cursor'] = cursor
            page = client.request('model/list', params, timeout=10)
            if not isinstance(page, dict) or not isinstance(page.get('data'), list):
                raise ValueError('invalid model/list response')
            for row in page['data']:
                if not isinstance(row, dict) or model not in (row.get('model'), row.get('id')):
                    continue
                tiers = row.get('serviceTiers')
                if isinstance(tiers, list) and any(
                        isinstance(item, dict) and item.get('id') in accepted for item in tiers):
                    return
                raise ValueError('tier not advertised for model')
            cursor = page.get('nextCursor')
            if not cursor or not isinstance(cursor, str) or cursor in seen:
                break
            seen.add(cursor)
    except Exception as error:
        raise RuntimeError('Выбранная скорость недоступна или не подтверждена в каталоге Codex. Выберите стандартную скорость или обновите вход в Codex.') from error
    raise RuntimeError('Выбранная скорость недоступна или не подтверждена в каталоге Codex. Выберите стандартную скорость или обновите вход в Codex.')


def require_codex_responses_tier(agent, overrides):
    """A selected paid speed must be confirmed for this request's credential.

    The native negotiation silently downgrades; that would leave the picker
    falsely displaying a faster tier after account or model changes.
    """
    requested = overrides.get('service_tier')
    if requested not in {'priority', 'ultrafast'} or getattr(agent, 'api_mode', None) != 'codex_responses' or getattr(agent, 'provider', None) != 'openai-codex':
        return
    from agent.codex_headers import CODEX_AUX_BASE_URL, is_official_codex_base_url
    base = str(getattr(agent, 'base_url', '') or '').strip() or CODEX_AUX_BASE_URL
    if not is_official_codex_base_url(base):
        return
    token = getattr(agent, 'api_key', None)
    try:
        from hermes_cli.auth_constants import _decode_jwt_claims
        from agent.model_metadata import _bare_codex_slug
        from agent.codex_service_tiers import _tiers_for_model
        if not isinstance(token, str) or not token or not _decode_jwt_claims(token):
            raise ValueError('request credential has no Codex account claims')
        model = _bare_codex_slug(str(overrides.get('model', getattr(agent, 'model', '')) or ''))
        advertised = _tiers_for_model(token, base, model)
        if advertised is not None and requested in advertised:
            return
    except Exception as error:
        raise RuntimeError('Выбранная скорость недоступна или не подтверждена для аккаунта и модели. Выберите стандартную скорость или обновите вход в Codex.') from error
    raise RuntimeError('Выбранная скорость недоступна или не подтверждена для аккаунта и модели. Выберите стандартную скорость или обновите вход в Codex.')


def uses_codex_app_server(agent, config, provider):
    """Whether the owning route is Codex's own app-server, not a proxy."""
    if str(provider or '').strip().lower() not in {'openai', 'openai-codex'}:
        return False
    if getattr(agent, '_codex_session', None) is not None:
        return True
    if agent is not None:
        return getattr(agent, 'api_mode', None) == 'codex_app_server'
    model_cfg = config.get('model') if isinstance(config, dict) else None
    return (isinstance(model_cfg, dict)
            and str(model_cfg.get('openai_runtime') or '').strip().lower() == 'codex_app_server')


def app_server_catalog(*, session=None, config=None, model_provider=None):
    """Read the active app-server catalog, or a matching short-lived client, without inference."""
    import time
    from agent.transports.codex_app_server import CodexAppServerClient
    from hermes_cli.codex_runtime_switch import get_configured_codex_binary
    deadline = time.monotonic() + 3.0
    client = getattr(session, '_client', None) if session is not None else None
    owned = client is None
    if owned:
        factory = getattr(session, '_client_factory', None) or CodexAppServerClient
        codex_bin = getattr(session, '_codex_bin', None) or get_configured_codex_binary(config or {})
        codex_home = getattr(session, '_codex_home', None)
        client = factory(codex_bin=codex_bin, codex_home=codex_home)
    try:
        if owned:
            from agent.transports.codex_app_server_session import _get_hermes_version
            client.initialize(client_name='hermes', client_title='Hermes Agent',
                              client_version=_get_hermes_version(), timeout=max(0.01, deadline - time.monotonic()))
        cursor, seen, catalog = None, set(), {}
        for _ in range(20):
            params = {'includeHidden': True, 'limit': 100}
            if model_provider:
                params['modelProvider'] = model_provider
            if cursor:
                params['cursor'] = cursor
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError('model/list deadline expired')
            page = client.request('model/list', params, timeout=remaining)
            if not isinstance(page, dict) or not isinstance(page.get('data'), list):
                raise ValueError('invalid model/list response')
            for row in page['data']:
                if not isinstance(row, dict):
                    continue
                tiers = row.get('serviceTiers')
                ids = {item.get('id') for item in tiers
                       if isinstance(item, dict) and isinstance(item.get('id'), str)} if isinstance(tiers, list) else set()
                capability = {'fast': bool(ids & {'priority', 'fast'}), 'ultrafast': 'ultrafast' in ids}
                for model in (row.get('model'), row.get('id')):
                    if isinstance(model, str) and model:
                        catalog[model] = capability
            cursor = page.get('nextCursor')
            if not cursor:
                return catalog
            if not isinstance(cursor, str) or cursor in seen:
                raise ValueError('invalid model/list cursor')
            seen.add(cursor)
        raise ValueError('model/list pagination exceeded safety limit')
    finally:
        if owned:
            client.close(timeout=0.5)


def app_server_model_capabilities(catalog, model):
    """Match Hermes's picker aliases to the same wire slug used by its app-server route."""
    from agent.model_metadata import strip_codex_context_variant_suffix
    from hermes_cli.model_normalize import normalize_model_for_provider
    clean = strip_codex_context_variant_suffix(str(model or ''))
    wire = normalize_model_for_provider(clean, 'openai-codex') if clean else ''
    return catalog.get(wire) or catalog.get(clean) or {'fast': False, 'ultrafast': False}


def _frozen_secrets_are_unrelated(authority, policy):
    """Recognize only scoped, frozen STT/MCP secrets, without reading their values.

    Any unknown reference or a secret belonging to the model, a provider, or
    the process environment may select another account and must remain opaque.
    """
    import json
    from pathlib import Path
    from gateway.session_policy_credentials import PREFIX, _check_scope

    reference = getattr(policy, 'config_secret_ref', None)
    if not isinstance(reference, str) or not reference.startswith(PREFIX):
        return False
    try:
        source = json.loads(reference[len(PREFIX):])
        entries, bound = source['entries'], source['bound']
        if not isinstance(entries, list) or not entries or not isinstance(bound, list):
            return False
        def paths(records):
            result = []
            for record in records:
                if not isinstance(record, list) or len(record) != 2:
                    return None
                path, digest = record
                if (not isinstance(path, list) or len(path) < 2 or
                        path[0] not in ('stt', 'mcp_servers') or
                        any(not isinstance(part, (str, int)) or isinstance(part, bool) for part in path) or
                        not isinstance(digest, str) or not digest):
                    return None
                result.append(tuple(path))
            return result if len(result) == len(set(result)) else None
        entry_paths, bound_paths = paths(entries), paths(bound)
        if entry_paths is None or bound_paths is None or set(entry_paths) != set(bound_paths):
            return False
        home = Path(authority.db.db_path).resolve().parent
        _check_scope(authority, source, policy, home, ())
        return True
    except Exception:
        return False


def responses_route_credential(authority, ref, policy, agent, config):
    """Return a provable Responses credential, or None without guessing a pool member.

    Profile inspection uses read-only APIs; no credential values are logged or returned to UI.
    """
    from agent.codex_headers import CODEX_AUX_BASE_URL, is_official_codex_base_url
    from hermes_cli.auth_constants import _decode_jwt_claims
    block = config.get('model') if isinstance(config, dict) else None
    block = block if isinstance(block, dict) else {}
    if block.get('provider') != 'openai-codex' or block.get('openai_runtime') == 'codex_app_server':
        return None
    if block.get('api_mode') not in (None, '', 'codex_responses'):
        return None
    if agent is not None and not getattr(policy, 'follows_profile', False):
        if getattr(agent, 'provider', None) != 'openai-codex' or getattr(agent, 'api_mode', None) != 'codex_responses':
            return None
        token = getattr(agent, 'api_key', None)
        base = str(getattr(agent, 'base_url', '') or CODEX_AUX_BASE_URL).strip().rstrip('/')
        return (token, base) if isinstance(token, str) and _decode_jwt_claims(token) and is_official_codex_base_url(base) else None
    base = str(block.get('base_url') or CODEX_AUX_BASE_URL).strip().rstrip('/')
    if not is_official_codex_base_url(base):
        return None
    if policy is not None:
        from gateway.session_policy import route_launch_key
        explicit = route_launch_key(authority, policy, config)
        if explicit:
            return (explicit, base) if isinstance(explicit, str) and _decode_jwt_claims(explicit) else None
        if getattr(policy, 'config_secret_ref', None) and not _frozen_secrets_are_unrelated(authority, policy):
            return None  # an unknown or route-owned frozen secret may select another key
    # A profile-owned key, dynamic key reference or named provider can change
    # the resolver ladder. Unless bound above, decline to guess its account.
    if any(block.get(k) for k in ('api_key', 'api', 'api_key_from', 'key_env', 'api_key_env')):
        return None
    if (config.get('providers') or {}).get('openai-codex'):
        return None
    from hermes_cli.auth import read_credential_pool
    from hermes_cli.auth_codex import resolve_codex_runtime_credentials
    rows = read_credential_pool('openai-codex')
    if not isinstance(rows, list):
        return None
    candidates = []
    for row in rows:
        if not isinstance(row, dict):
            return None
        token = row.get('access_token')
        row_base = str(row.get('base_url') or base).strip().rstrip('/')
        if not isinstance(token, str) or not _decode_jwt_claims(token) or row_base != base:
            return None
        candidates.append(token)
    stored = resolve_codex_runtime_credentials(read_only=True)
    stored_token = stored.get('api_key') if isinstance(stored, dict) else None
    stored_base = str((stored or {}).get('base_url') or base).strip().rstrip('/')
    if not isinstance(stored_token, str) or not _decode_jwt_claims(stored_token) or stored_base != base:
        return None
    candidates.append(stored_token)
    return (stored_token, base) if all(token == stored_token for token in candidates) else None


import threading

_responses_refresh_lock = threading.Lock()
_responses_refreshes = {}


def _responses_fresh_catalog(credential):
    """Return this credential's fresh entitlement record, or None if cold."""
    import time
    if credential is None:
        return None
    from agent import codex_service_tiers as tiers, model_metadata
    token, base = credential
    key = model_metadata._codex_oauth_token_fingerprint(token, base)
    cached = tiers._catalogs.get(key)
    if cached is None or time.time() - cached[1] >= tiers._TTL:
        return None
    return {model: {'fast': 'priority' in values, 'ultrafast': 'ultrafast' in values}
            for model, values in cached[0].items()}


def responses_cached_catalog(credential):
    """Never fetch in the model-change critical section."""
    return _responses_fresh_catalog(credential) or {}


def responses_catalog(credential, *, wait=1.5):
    """Warm this route's own catalog; bound the caller even if the service stalls.

    An inflight lookup is shared for that credential fingerprint, with a hard
    cap on workers. A timed-out caller can reopen the menu after it completes.
    """
    from agent import codex_service_tiers as tiers, model_metadata
    if credential is None:
        return {}
    ready = _responses_fresh_catalog(credential)
    if ready is not None:
        return ready
    lock = _responses_refresh_lock
    key = model_metadata._codex_oauth_token_fingerprint(*credential)
    with lock:
        event = _responses_refreshes.get(key)
        if event is None:
            if len(_responses_refreshes) >= 8:
                return {}
            event = threading.Event()
            _responses_refreshes[key] = event
            def refresh():
                try:
                    tiers._fresh_catalog(*credential)
                except Exception:
                    pass  # failed lookup remains unknown, never a tier grant
                finally:
                    with lock:
                        _responses_refreshes.pop(key, None)
                        event.set()
            threading.Thread(target=refresh, name='hcv-codex-speed-catalog', daemon=True).start()
    event.wait(max(0.0, min(float(wait), 1.5)))
    return responses_cached_catalog(credential)


def project_app_server_catalog(payload, selected_provider, catalog, *, app_server=True):
    """Overlay only the selected Codex route; preserve other providers and model metadata."""
    for row in payload.get('providers', []):
        if not isinstance(row, dict) or selected_provider not in (row.get('slug'), *(row.get('aliases') or [])):
            continue
        caps = row.get('capabilities')
        if not isinstance(caps, dict):
            continue
        for model in row.get('models') or []:
            if not isinstance(model, str):
                continue
            current = caps.get(model)
            # Only augment an existing, valid capabilities record. Inventing a
            # reasoning default could enable a control Hermes did not offer.
            if not isinstance(current, dict) or not isinstance(current.get('reasoning'), bool):
                continue
            availability = app_server_model_capabilities(catalog, model)
            current['fast'] = availability['fast']
            current['ultrafast'] = availability['ultrafast']
            if app_server:
                current.pop('daybreak', None)
    return payload

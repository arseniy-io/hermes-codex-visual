import asyncio
from datetime import datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import sqlite3
import sys
import time
from urllib.parse import urlsplit
from zipfile import ZipFile


PLUGIN = 'hermes-codex-visual'
AGENT_FILES = (
    'plugin.yaml', '__init__.py', 'assistant.py', 'activity.py', 'turn_changes.py',
    'timeline.py', 'agent_receipts.py', 'dashboard/manifest.json', 'dashboard/plugin_api.py',
)


def verify(condition, message):
    if not condition:
        raise RuntimeError(message)


def stage(run, package):
    home = run / 'hermes-home'
    archive_sha256 = None
    if package.is_file():
        with package.open('rb') as source:
            archive_sha256 = sha256(source.read()).hexdigest()
            source.seek(0)
            with ZipFile(source) as archive:
                names = archive.namelist()
                members = [f'{PLUGIN}/{name}' for name in ('plugin.js', *AGENT_FILES)]
                verify(all(names.count(name) == 1 for name in members), 'Archive is missing a unique package member')
                contents = {name.split('/', 1)[1]: archive.read(name) for name in members}
    else:
        root = package / PLUGIN if (package / PLUGIN).is_dir() else package
        contents = {name: (root / name).read_bytes() for name in ('plugin.js', *AGENT_FILES)}
    digests = {}
    for name, data in contents.items():
        group = 'desktop-plugins' if name == 'plugin.js' else 'plugins'
        target = home / group / PLUGIN / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        digests[name] = sha256(target.read_bytes()).hexdigest()
        verify(digests[name] == sha256(data).hexdigest(), f'Staged bytes changed: {name}')
    return {'archive_sha256': archive_sha256, 'staged_file_sha256': digests}


def gateway_process(run):
    import psutil
    from gateway.status import get_process_start_time

    home = run / 'hermes-home'
    record = json.loads((home / 'gateway.pid').read_text(encoding='utf-8'))
    verify(record['kind'] == 'hermes-gateway' and Path(record['hermes_home']).resolve() == home,
           'Gateway PID record belongs to another home')
    pid, start = record['pid'], record['start_time']
    verify(type(pid) is int and pid > 0 and type(start) is int and start > 0,
           'Invalid gateway process identity')
    process = psutil.Process(pid)
    verify(get_process_start_time(pid) == start, 'Gateway PID was reused')
    env = process.environ()
    verify(Path(env.get('HERMES_HOME', '')).resolve() == home and
           Path(env.get('HERMES_GATEWAY_LOCK_DIR', '')).resolve() == run / 'gateway-locks' and
           env.get('HCV_ACTIVATION_RUN') == str(run) and
           'gateway' in process.cmdline() and 'run' in process.cmdline(),
           'Gateway process does not belong to this run')
    return process, start


async def list_plugins(run):
    from hermes_cli.gateway_client import connect_gateway
    from hermes_cli.gateway_runtime import discover_gateway_endpoint

    home = run / 'hermes-home'
    discovery = discover_gateway_endpoint(home)
    verify(discovery.state == 'ready' and discovery.endpoint is not None,
           f'Isolated gateway is {discovery.state}: {discovery.reason_code}')
    endpoint = discovery.endpoint
    origin = urlsplit(endpoint.api_origin)
    verify(origin.scheme == 'http' and origin.hostname == '127.0.0.1' and origin.port and
           not (origin.username or origin.password or origin.path or origin.query or origin.fragment),
           'Gateway origin is not a bare IPv4 loopback endpoint')
    verify(Path(endpoint.profile_id).resolve() == home and
           Path(endpoint.control_home or endpoint.profile_id).resolve() == home and
           endpoint.runtime_protocol == 1 and bool(endpoint.instance_id), 'Unexpected gateway identity')
    process, start = gateway_process(run)
    async with connect_gateway(endpoint=endpoint) as client:
        result = await client.rpc('plugins.list', _timeout=6)
    core = Path(os.environ['HERMES_DESKTOP_HERMES_ROOT']).resolve(strict=True)
    worker_source = core / 'agent/managed_worker.py'
    worker_sha256 = None
    if worker_source.is_file():
        from agent import managed_worker

        worker = Path(managed_worker.__file__).resolve(strict=True)
        verify(worker == worker_source, 'The managed worker came from a different runtime')
        worker_sha256 = sha256(worker.read_bytes()).hexdigest()
    return {'state': discovery.state, 'instance_id': endpoint.instance_id, 'api_origin': endpoint.api_origin,
            'profile_id': endpoint.profile_id, 'pid': process.pid, 'start_time': start,
            'plugins_list': result, 'managed_worker_sha256': worker_sha256}


def stop(run):
    import psutil
    from gateway.status import get_process_start_time, write_planned_stop_marker

    home = run / 'hermes-home'
    pid_path = home / 'gateway.pid'
    state_path = home / 'gateway_state.json'
    if not pid_path.exists():
        state = json.loads(state_path.read_text(encoding='utf-8')) if state_path.exists() else {}
        return {'status': 'already_stopped' if state.get('gateway_state') == 'stopped' else 'no_pid_record',
                'gateway_state': state.get('gateway_state')}
    process, start = gateway_process(run)
    verify(get_process_start_time(process.pid) == start and write_planned_stop_marker(process.pid),
           'Could not request a planned stop for the exact gateway PID')
    before = time.monotonic()
    try:
        exit_code = process.wait(timeout=16)
    except psutil.TimeoutExpired as exc:
        raise RuntimeError(f'Gateway PID {process.pid} did not exit after its planned stop') from exc
    state = json.loads(state_path.read_text(encoding='utf-8'))
    verify(not pid_path.exists() and state.get('gateway_state') == 'stopped' and exit_code in (0, None),
           'Gateway did not record a graceful stop')
    with sqlite3.connect((home / 'state.db').as_uri() + '?mode=ro&immutable=1', uri=True) as database:
        messages = database.execute('SELECT COUNT(*) FROM messages').fetchone()[0]
    verify(messages == 0 and state.get('active_agents') == 0, 'The isolated run created agent work')
    return {'status': 'planned_stop', 'pid': process.pid, 'gateway_state': state['gateway_state'],
            'exit_code': exit_code, 'active_agents': state['active_agents'], 'messages': messages,
            'stopped_at': datetime.now(timezone.utc).isoformat(), 'wait_seconds': round(time.monotonic() - before, 3)}


if __name__ == '__main__':
    mode, run_argument, *args = sys.argv[1:]
    run = Path(run_argument).resolve(strict=True)
    scope = Path(os.environ['HCV_RELEASE_PROBE_ROOT']).resolve(strict=True)
    verify(run.parent == scope and run.name.startswith('hermes-e2e-codex-visual-'),
           'Run must be a private child of the probe directory')
    verify(os.environ.get('HCV_ACTIVATION_RUN') == str(run) and
           Path(os.environ['HERMES_HOME']).resolve() == run / 'hermes-home', 'Invalid isolated environment')
    if mode == 'stage':
        result = stage(run, Path(args[0]).resolve(strict=True))
    elif mode == 'plugins.list':
        result = asyncio.run(list_plugins(run))
    elif mode == 'stop':
        result = stop(run)
    else:
        raise ValueError('Unknown probe action')
    print(json.dumps(result, ensure_ascii=True))

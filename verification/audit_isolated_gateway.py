"""Read-only audit of the gateway belonging to one temporary visual profile."""
import json
import math
import os
from pathlib import Path
import sys
import tempfile
import time

import psutil


class GatewayNotReady(ValueError):
    """Only expected startup absences are retryable; identity failures are not."""


def key(path):
    return os.path.normcase(os.path.realpath(path))


def audit(home, expected_python, expected_base, expected_repository, *, process_factory=psutil.Process,
          temp_root=None, require_mcp=True):
    home = Path(home).resolve()
    temporary = Path(temp_root or tempfile.gettempdir()).resolve()
    if (home.name != 'hermes-home' or home.parent.parent != temporary
            or not home.parent.name.startswith('hermes-e2e-codex-visual-')):
        raise ValueError('not an isolated visual-test home')
    try:
        record = json.loads((home/'gateway.pid').read_text(encoding='utf8'))
    except FileNotFoundError as error:
        raise GatewayNotReady('gateway PID record is not present yet') from error
    if (not isinstance(record, dict) or record.get('kind') != 'hermes-gateway'
            or key(record.get('hermes_home', '')) != key(home)
            or type(record.get('pid')) is not int or record['pid'] <= 0
            or type(record.get('start_time')) is not int or record['start_time'] <= 0
            or not isinstance(record.get('argv'), list) or not record['argv']
            or not isinstance(record['argv'][0], str)
            or key(record['argv'][0]) != key(Path(expected_repository)/'hermes_cli/main.py')):
        raise ValueError('gateway record is invalid')
    process = process_factory(record['pid'])
    if not process.is_running() or round(process.create_time() * 100) != record['start_time']:
        raise ValueError('gateway PID was replaced')
    env, args = process.environ(), process.cmdline()
    if (key(env.get('HERMES_HOME', '')) != key(home)
            or env.get('HERMES_DESKTOP_ISOLATED_BACKEND') != '1'
            or key(env.get('HERMES_GATEWAY_LOCK_DIR', '')) != key(home.parent/'gateway-locks')
            or key(env.get('XDG_STATE_HOME', '')) != key(home.parent/'xdg-state')
            or not args or key(args[0]) != key(expected_python)
            or key(process.exe()) != key(expected_base)
            or 'gateway' not in args or 'run' not in args):
        raise ValueError('gateway is not the expected isolated private Python')
    # This is a new temporary profile's own log. Named registration plus the
    # fixture HTTP exchanges establish initial setup, not continuous liveness.
    if require_mcp:
        try:
            text = (home/'logs/agent.log').read_text(encoding='utf8')
        except FileNotFoundError as error:
            raise GatewayNotReady('test profile MCP log is not present yet') from error
        for name in ('Тестовый поиск', 'Тестовые документы'):
            if f"MCP server '{name}' (HTTP): registered " not in text:
                raise GatewayNotReady('a named test MCP server did not register yet')
    # psutil may cache create_time() on a Process object. Reacquire by PID and
    # check both the original identity and the fresh observation before PASS.
    current = process_factory(record['pid'])
    if (not process.is_running() or not current.is_running()
            or round(current.create_time() * 100) != record['start_time']):
        raise ValueError('gateway PID changed during audit')
    return {'pid':record['pid'], 'start_time':record['start_time'],
            'isolated_home':True, 'expected_command_python':True, 'expected_base_exe':True,
            'hermes_entry_path_verified':True, 'named_mcp_initial_registration':True if require_mcp else None,
            'private_gateway_rendezvous':True,
            'loaded_module_paths_verified':False,
            'continuous_mcp_connection_verified':False}


def wait_for_audit(home, expected_python, expected_base, expected_repository, *, require_mcp=True,
                   process_factory=psutil.Process, temp_root=None, timeout=30.0, interval=0.2,
                   monotonic=time.monotonic, sleep=time.sleep):
    """Wait only for missing startup evidence; never retry an identity failure."""
    if not math.isfinite(timeout) or not math.isfinite(interval) or timeout <= 0 or interval <= 0:
        raise ValueError('invalid gateway readiness wait')
    deadline = monotonic() + timeout
    last_absence = None
    while True:
        if last_absence is not None and monotonic() >= deadline:
            raise TimeoutError('Timed out waiting for isolated gateway readiness: ' + str(last_absence)) from last_absence
        try:
            result = audit(home, expected_python, expected_base, expected_repository,
                           process_factory=process_factory, temp_root=temp_root, require_mcp=require_mcp)
            if monotonic() > deadline:
                raise TimeoutError('Timed out while checking isolated gateway identity')
            return result
        except GatewayNotReady as error:
            last_absence = error
            remaining = deadline - monotonic()
            if remaining <= 0:
                raise TimeoutError('Timed out waiting for isolated gateway readiness: ' + str(error)) from error
            sleep(min(interval, remaining))


def main():
    try:
        if len(sys.argv) != 6 or sys.argv[5] not in ('process-only', 'require-mcp'):
            raise ValueError('expected isolated home, Python paths, Hermes source and audit mode')
        print(json.dumps(wait_for_audit(*sys.argv[1:5], require_mcp=sys.argv[5] == 'require-mcp'), sort_keys=True))
        return 0
    except (OSError, ValueError, TypeError, KeyError, IndexError, psutil.Error) as error:
        print('Isolated gateway audit refused: ' + str(error), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())

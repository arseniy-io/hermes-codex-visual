"""Stop only the gateway belonging to a finished isolated visual test."""

import json
import os
from pathlib import Path
import sys
import tempfile

import psutil


def key(value):
    return os.path.normcase(os.path.realpath(value))


def main():
    home = Path(sys.argv[1]).resolve()
    root = home.parent
    if (home.name != 'hermes-home' or root.parent != Path(tempfile.gettempdir()).resolve()
            or not root.name.startswith('hermes-e2e-codex-visual-')):
        raise ValueError('not a visual-test profile')

    record_path = home / 'gateway.pid'
    if not record_path.is_file():
        print('No isolated gateway recorded')
        return
    record = json.loads(record_path.read_text(encoding='utf-8'))
    if record.get('kind') != 'hermes-gateway' or key(record.get('hermes_home', '')) != key(home):
        raise ValueError('gateway record does not match the test profile')

    try:
        process = psutil.Process(int(record['pid']))
        env = process.environ()
        args = process.cmdline()
    except psutil.NoSuchProcess:
        print('Isolated gateway already stopped')
        return
    if (key(env.get('HERMES_HOME', '')) != key(home)
            or env.get('HERMES_DESKTOP_ISOLATED_BACKEND') != '1'
            or 'gateway' not in args or 'run' not in args):
        raise ValueError('running process is not this isolated gateway')
    started = record.get('start_time')
    if os.name == 'nt' and isinstance(started, int) and abs(started / 100 - process.create_time()) > 1:
        raise ValueError('gateway process has been replaced')

    for other in psutil.process_iter(['name']):
        try:
            if ((other.info['name'] or '').lower() in ('electron.exe', 'hermes.exe')
                    and key(other.environ().get('HERMES_HOME', '')) == key(home)):
                raise RuntimeError('isolated desktop is still running')
        except psutil.NoSuchProcess:
            continue
        except psutil.AccessDenied as error:
            raise RuntimeError('cannot verify whether a desktop is still running') from error

    process.terminate()
    process.wait(timeout=6)
    print('Stopped finished isolated gateway')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, TypeError, AttributeError, KeyError, IndexError, psutil.Error, RuntimeError) as error:
        print(f'Isolated gateway cleanup skipped: {error}', file=sys.stderr)
        sys.exit(1)

"""Install the separately tested, version-pinned local Hermes queue repair."""

from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import importlib.util
import json
import os
import sys
import uuid


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('hcv_delegation_stage', ROOT / 'scripts/stage-hermes-delegation-fix.py')
stage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage)


def digest(content):
    return sha256(content).hexdigest()


def replace_file(path, data):
    temp = path.with_name(path.name + '.hcv-' + uuid.uuid4().hex + '.tmp')
    try:
        with temp.open('xb') as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temp, path)
    finally:
        if temp.exists():
            temp.unlink()


def create_file(path, data):
    """Publish a new file without ever overwriting a concurrent creator."""
    temp = path.with_name(path.name + '.hcv-' + uuid.uuid4().hex + '.tmp')
    try:
        with temp.open('xb') as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.link(temp, path)
    finally:
        if temp.exists():
            temp.unlink()


def main():
    if sys.argv[1:] != ['--install']:
        raise SystemExit('Use --install only after the staged repair passes isolated tests.')
    core = stage.CORE.resolve(strict=True)
    expected_core = (Path(os.environ['LOCALAPPDATA']) / 'hermes' / 'hermes-agent').resolve(strict=True)
    if core != expected_core:
        raise RuntimeError('Unexpected Hermes installation path.')
    gateway = core / 'gateway'
    if gateway.resolve(strict=True).parent != core:
        raise RuntimeError('Unexpected Hermes gateway directory.')
    authority, helper = gateway / 'session_authority.py', gateway / 'hcv_delegation_retry.py'
    if authority.is_symlink() or not authority.is_file() or helper.exists() or helper.is_symlink():
        raise RuntimeError('Unexpected or already modified Hermes queue files.')
    original = authority.read_bytes()
    if digest(original) != stage.EXPECTED:
        raise RuntimeError('Hermes changed since staging; nothing was installed.')
    patched = stage.candidate(original.decode('utf-8')).encode('utf-8')
    companion = (ROOT / 'source/hermes-delegation/retry.py').read_bytes()
    if (patched != (stage.STAGE / authority.name).read_bytes()
            or companion != (stage.STAGE / helper.name).read_bytes()):
        raise RuntimeError('The staged candidate differs from the files that were tested.')

    backup = ROOT / '.local' / ('delegation-core-rollback-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
                                + '-' + uuid.uuid4().hex[:8])
    backup.mkdir(parents=True, exist_ok=False)
    (backup / authority.name).write_bytes(original)
    (backup / 'manifest.json').write_text(json.dumps({
        'original_sha256': digest(original), 'patched_sha256': digest(patched),
        'helper_sha256': digest(companion), 'target': str(authority),
    }, indent=2), encoding='utf-8')
    written = []
    try:
        if digest(authority.read_bytes()) != stage.EXPECTED or helper.exists() or helper.is_symlink():
            raise RuntimeError('Hermes changed during installation.')
        create_file(helper, companion)
        written.append(helper)
        if digest(authority.read_bytes()) != stage.EXPECTED:
            raise RuntimeError('Hermes changed during installation.')
        replace_file(authority, patched)
        written.append(authority)
        if digest(authority.read_bytes()) != digest(patched) or digest(helper.read_bytes()) != digest(companion):
            raise RuntimeError('Installed files did not verify.')
    except Exception:
        for path in reversed(written):
            if path == authority and path.is_file() and digest(path.read_bytes()) == digest(patched):
                replace_file(path, original)
            elif path == helper and path.is_file() and digest(path.read_bytes()) == digest(companion):
                path.unlink()
        raise
    print('Backup:', backup)
    print('Installed authority:', digest(patched))
    print('Installed companion:', digest(companion))
    print('Restart the idle gateway without interrupting active work, then verify its startup.')


if __name__ == '__main__':
    main()

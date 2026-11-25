"""Prepare a new, separate visual-test venv; never alter existing environments.

The generated pin is only a candidate for human review. No project pointer
is changed and no previous venv or cache is removed. Incomplete runs have no
manifest and are refused by test_runtime_guard.
"""
from __future__ import annotations

import hashlib
import importlib.util
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import uuid

HERE = Path(__file__).absolute().parent
spec = importlib.util.spec_from_file_location('hcv_test_runtime_guard', HERE / 'test_runtime_guard.py')
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

OWNER = guard.OWNER
PYTHON_SHIM_SHA = 'a44065bb33f8184f832ab1fc37a91d5e7ac1cbf32b0f73a4de173730cabe2e26'
BOOTSTRAP_SHA = 'fd31f27bc85a6b9c974670838b6eefafb32991be4a9f840f96a4f5524df3b3c3'
PTH_SHA = 'd902584a2a0a5216ce12c712d1378fe07541d32c383d0cc5abcd68412144fe4d'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def fresh(path, data):
    with path.open('xb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode('utf8')


def establish_store(local):
    local = guard.plain(local)
    base = local / 'hermes-codex-visual-test'
    try:
        base.mkdir()
        fresh(base / 'owner.json', json_bytes(OWNER))
    except FileExistsError:
        base = guard.plain(base)
        recorded = guard.strict_json(guard.read_bytes(base / 'owner.json', limit=4096))
        if not isinstance(recorded, dict) or type(recorded.get('schema')) is not int or recorded != OWNER:
            raise guard.RuntimeErrorSafe('pre-existing test runtime store is not owned')
    base = guard.plain(base)
    store = base / 'runtimes'
    try:
        store.mkdir()
    except FileExistsError:
        pass
    store = guard.plain(store)
    if not store.is_dir() or store.parent != base:
        raise guard.RuntimeErrorSafe('unexpected runtime store')
    return store


def reviewed_plan(output):
    entries = re.findall(r'(?m)^ \+ ([a-z0-9-]+)==([^\s]+)', output)
    packages = dict(entries)
    raw = json.dumps(packages, sort_keys=True, separators=(',', ':')).encode()
    if len(entries) != 113 or len(packages) != 113 or sha(raw) != guard.PACKAGES_SHA:
        raise guard.RuntimeErrorSafe('uv dry-run plan is not the reviewed 113-package plan')
    return packages


def clean_env(local, runtime):
    # Only explicit Windows and private locations; inherited UV_*, PYTHON*,
    # HOME and network overrides cannot redirect the install into user state.
    systemroot = os.environ.get('SystemRoot')
    if not systemroot or not Path(systemroot).is_absolute():
        raise guard.RuntimeErrorSafe('SystemRoot unavailable')
    return {'SystemRoot':systemroot, 'WINDIR':systemroot,
            'SystemDrive':os.environ.get('SystemDrive','C:'),
            'COMSPEC':str(Path(systemroot)/'System32/cmd.exe'),
            'PATH':str(Path(systemroot)/'System32'),
            'PATHEXT':os.environ.get('PATHEXT','.COM;.EXE;.BAT;.CMD'),
            'TEMP':str(runtime/'tmp'), 'TMP':str(runtime/'tmp'),
            'USERPROFILE':str(runtime/'home'), 'HOME':str(runtime/'home'),
            'APPDATA':str(runtime/'appdata'), 'LOCALAPPDATA':str(runtime/'localappdata'),
            'UV_PROJECT_ENVIRONMENT':str(runtime/'venv'), 'UV_CACHE_DIR':str(runtime/'cache'),
            'UV_PYTHON_DOWNLOADS':'never', 'PYTHONDONTWRITEBYTECODE':'1'}


def execute(local, *, run=subprocess.run, runtime_id=None):
    """Create exactly one fresh runtime; injected runner is for synthetic tests."""
    local = guard.plain(local)
    installed = guard.plain(local / 'hermes')
    source = guard.plain(installed / 'hermes-agent')
    uv = guard.plain(installed / 'tools/uv-0.13.5-win32-x64/uv.exe')
    base = guard.plain(installed / 'tools/python-3.14.9+20261021-win32-x64/python.exe')
    expected = {'pyproject.toml':guard.PROJECT_SHA, 'uv.lock':guard.LOCK_SHA}
    inputs = {name:guard.read_bytes(source/name) for name in expected}
    if any(sha(inputs[name]) != expected[name] for name in expected):
        raise guard.RuntimeErrorSafe('Hermes project/lock changed; review before preparing')
    if guard.file_hash(uv) != guard.UV_SHA or guard.file_hash(base) != guard.BASE_SHA:
        raise guard.RuntimeErrorSafe('uv or base Python changed; review before preparing')
    store = establish_store(local)
    runtime_id = runtime_id or uuid.uuid4().hex
    if not isinstance(runtime_id, str) or not guard.ID.fullmatch(runtime_id):
        raise guard.RuntimeErrorSafe('invalid runtime ID')
    runtime = store / runtime_id
    runtime.mkdir()  # O_EXCL semantics: never overwrite a prior runtime.
    guard.plain(runtime)
    runtime_identity = runtime.lstat()
    fresh(runtime/'preparation.json', json_bytes({'schema':1, 'runtime_id':runtime_id,
          'runtime_device':runtime_identity.st_dev, 'runtime_inode':runtime_identity.st_ino,
          'state':'preparing', 'lock_sha256':guard.LOCK_SHA, 'project_sha256':guard.PROJECT_SHA}))
    for name in ('project', 'cache', 'tmp', 'home', 'appdata', 'localappdata'):
        (runtime/name).mkdir()
    for name, data in inputs.items():
        fresh(runtime/'project'/name, data)
    env = clean_env(local, runtime)
    args = [str(uv), 'sync', '--project', str(runtime/'project'), '--frozen', '--no-install-project',
            '--no-build', '--no-python-downloads', '--no-config', '--link-mode', 'copy', '--no-progress',
            '--extra', 'all', '--extra', 'telegram', '--python', str(base),
            '--default-index', 'https://pypi.org/simple']
    options = {'cwd':runtime, 'env':env, 'capture_output':True, 'text':True, 'encoding':'utf-8',
               'errors':'replace', 'timeout':600,
               'creationflags':getattr(subprocess, 'CREATE_NO_WINDOW', 0)}
    dry = run(args + ['--dry-run', '--offline'], **options)
    fresh(runtime/'dry-run.log', ((dry.stdout or '') + (dry.stderr or '')).encode('utf8'))
    if dry.returncode:
        raise guard.RuntimeErrorSafe('private environment dry-run failed')
    plan = reviewed_plan((dry.stdout or '') + (dry.stderr or ''))
    result = run(args, **options)
    fresh(runtime/'sync.log', ((result.stdout or '') + (result.stderr or '')).encode('utf8'))
    if result.returncode:
        raise guard.RuntimeErrorSafe('private environment installation failed')
    return finish(runtime, runtime_id, runtime_identity, source, uv, base, expected, plan, run, options)


def validate_startup(runtime, base, bootstrap_sha):
    """Refuse all importable startup hooks and a shadowed pywin32 bootstrap.

    Call only after the entire tree passed tree_digest's link/reparse scan.
    Windows file names are compared case-insensitively, including extensions,
    package directories and tagged extension/bytecode files.
    """
    venv = guard.plain(runtime/'venv')
    site = guard.plain(venv/'Lib/site-packages')
    pths = sorted(p.name for p in site.iterdir() if p.name.lower().endswith('.pth'))
    if pths != ['pywin32.pth'] or guard.file_hash(site/'pywin32.pth') != PTH_SHA:
        raise guard.RuntimeErrorSafe('unexpected Python startup hook in private environment')
    folders = [site, site/'win32', site/'win32/lib', site/'Pythonwin']
    allowed_bootstrap = site/'win32/lib/pywin32_bootstrap.py'
    expected_namespace = site/'pywin32_system32'
    names = ('sitecustomize', 'usercustomize', 'pywin32_bootstrap', 'pywin32_system32')
    for folder in folders:
        folder = guard.plain(folder)
        if not folder.is_dir():
            raise guard.RuntimeErrorSafe('startup import directory is not a directory')
        for entry in folder.iterdir():
            lower = entry.name.lower()
            for name in names:
                if lower != name and not lower.startswith(name + '.'):
                    continue
                if name == 'pywin32_bootstrap' and entry == allowed_bootstrap:
                    continue
                if name == 'pywin32_system32' and entry == expected_namespace and entry.is_dir():
                    for child in entry.iterdir():
                        if child.name.lower() == '__init__' or child.name.lower().startswith('__init__.'):
                            raise guard.RuntimeErrorSafe('Python startup namespace contains executable init')
                    continue
                raise guard.RuntimeErrorSafe('unexpected Python startup hook or bootstrap shadow')
            # PEP 3147 caches normally need a source file, but refuse them
            # too, so no hook bytecode is accepted via implementation drift.
            if lower == '__pycache__' and entry.is_dir():
                for cached in entry.iterdir():
                    if any(cached.name.lower().startswith(name + '.') for name in names):
                        raise guard.RuntimeErrorSafe('unexpected Python startup bytecode')
    if guard.file_hash(allowed_bootstrap) != bootstrap_sha:
        raise guard.RuntimeErrorSafe('Python startup bootstrap changed')
    if not expected_namespace.is_dir():
        raise guard.RuntimeErrorSafe('Python startup namespace is missing')
    if guard.file_hash(venv/'Scripts/python.exe') != PYTHON_SHIM_SHA:
        raise guard.RuntimeErrorSafe('private Python launcher changed')
    cfg = guard.read_bytes(venv/'pyvenv.cfg', limit=65536)
    if (os.path.normcase(os.path.normpath(guard.config_value(cfg, 'home'))) != os.path.normcase(str(base.parent))
            or guard.config_value(cfg, 'include-system-site-packages').lower() != 'false'):
        raise guard.RuntimeErrorSafe('private Python base configuration changed')
    if guard.file_hash(base) != guard.BASE_SHA:
        raise guard.RuntimeErrorSafe('base Python changed before probe')
    return venv/'Scripts/python.exe'


def finish(runtime, runtime_id, runtime_identity, source, uv, base, expected, plan, run, options,
           bootstrap_sha=None, expected_tree_sha=None, prepublish_check=None):
    """Check the prepared bytes before publishing a manifest and candidate pin."""
    venv = guard.plain(runtime/'venv')
    # This first full walk refuses any link, junction, hardlink or unstable
    # identity before the private interpreter is allowed to execute.
    before_tree = guard.tree_digest(venv)
    if expected_tree_sha is not None and before_tree['sha256'] != expected_tree_sha:
        raise guard.RuntimeErrorSafe('private runtime differs from independently compared tree')
    python = validate_startup(runtime, base, BOOTSTRAP_SHA if bootstrap_sha is None else bootstrap_sha)
    probe = r'''import importlib, importlib.metadata as md, importlib.util, inspect, json, re, sys
module=importlib.import_module('mcp.client.streamable_http')
versions={re.sub(r'[-_.]+','-',d.metadata['Name']).lower():d.version for d in md.distributions()}
spec=importlib.util.find_spec('hermes_cli')
print(json.dumps({'versions':versions,'mcp_path':module.__file__,
 'mcp_version':md.version('mcp'),'mcp_types':md.version('mcp-types'),
 'mcp_signature':str(inspect.signature(module.streamable_http_client)),
 'hermes_cli':None if spec is None else spec.origin,'prefix':sys.prefix},sort_keys=True))'''
    checked = run([str(python), '-I', '-B', '-c', probe], **options)
    fresh(runtime/'probe.log', ((checked.stdout or '') + (checked.stderr or '')).encode('utf8'))
    if checked.returncode:
        raise guard.RuntimeErrorSafe('private environment probe failed')
    try:
        value = json.loads(checked.stdout.strip().splitlines()[-1])
        actual = value['versions']
        mcp = guard.plain(value['mcp_path'])
        venv = guard.plain(runtime/'venv')
        if (actual != plan or value['mcp_version'] != '2.3.0' or value['mcp_types'] != '2.3.0'
                or 'max_sse_event_size' not in value['mcp_signature'] or value['hermes_cli'] is not None
                or not mcp.is_relative_to(venv) or Path(value['prefix']) != venv):
            raise ValueError('private environment probe mismatch')
    except (ValueError, KeyError, TypeError, IndexError) as exc:
        raise guard.RuntimeErrorSafe('private environment probe output invalid') from exc
    if (any(sha(guard.read_bytes(source/name)) != expected[name] for name in expected)
            or guard.file_hash(uv) != guard.UV_SHA or guard.file_hash(base) != guard.BASE_SHA):
        raise guard.RuntimeErrorSafe('external inputs changed during preparation')
    tree = guard.tree_digest(runtime/'venv')
    if tree != before_tree:
        raise guard.RuntimeErrorSafe('private runtime changed during probe')
    venv_identity = (runtime/'venv').lstat()
    current_runtime = guard.plain(runtime).lstat()
    if (current_runtime.st_dev, current_runtime.st_ino) != (runtime_identity.st_dev, runtime_identity.st_ino):
        raise guard.RuntimeErrorSafe('runtime directory changed during preparation')
    manifest = {'schema':1, 'runtime_id':runtime_id, 'tree_sha256':tree['sha256'], 'tree':tree,
                'lock_sha256':guard.LOCK_SHA, 'project_sha256':guard.PROJECT_SHA,
                'uv_sha256':guard.UV_SHA, 'base_python_sha256':guard.BASE_SHA,
                'packages_sha256':guard.PACKAGES_SHA, 'runtime_device':runtime_identity.st_dev,
                'runtime_inode':runtime_identity.st_ino, 'venv_device':venv_identity.st_dev,
                'venv_inode':venv_identity.st_ino}
    manifest_data = json_bytes(manifest)
    if prepublish_check is not None:
        prepublish_check()
    # Last publication step for runtime; an interruption before it is refused.
    fresh(runtime/'manifest.json', manifest_data)
    pin = {'schema':1, 'runtime_id':runtime_id, 'manifest_sha256':sha(manifest_data),
           'tree_sha256':tree['sha256']}
    fresh(runtime/'pin-candidate.json', json_bytes(pin))
    return {'pin':pin, 'pin_candidate':str(runtime/'pin-candidate.json'),
            'runtime':str(runtime), 'external_runtime_verified':False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime-id', help='Optional new 32-digit lowercase hex ID, never a path')
    args = parser.parse_args()
    local = os.environ.get('LOCALAPPDATA')
    if not local or not Path(local).is_absolute():
        print('LOCALAPPDATA is unavailable', file=sys.stderr)
        return 2
    try:
        print(json.dumps(execute(Path(local), runtime_id=args.runtime_id), ensure_ascii=False, sort_keys=True))
    except (OSError, ValueError, subprocess.SubprocessError, guard.RuntimeErrorSafe) as exc:
        print('Private test runtime preparation failed: ' + str(exc), file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())

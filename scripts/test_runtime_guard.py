"""Validate the explicitly pinned private visual-test Python without executing it.

The pin is a reviewed project input, not an arbitrary path from the shell.
This is not an OS sandbox: a same-user process can still race sequential reads.
Hermes sources, Electron and most of the base Python remain external.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import threading

REPARSE = 0x400
ID = re.compile(r'[0-9a-f]{32}\Z')
SHA = re.compile(r'[0-9a-f]{64}\Z')
LOCK_SHA = 'd0ae8bfd20db7a8ca0e75418df718315c58088b120366227cc62ee8fe25d4274'
PROJECT_SHA = 'ee825ad304ad685625c8878cd34b7923ec64579cdc08e646b84b76ba3d4c1cfc'
UV_SHA = 'f45d1cb9d9140ca6d3f4005fdfc0ebeccf849fd04d1dc85804155cb923f1597b'
BASE_SHA = 'ee82dfc67da9339850a0e89b618f1b04437837ed3e39ca36c7e7d33a3a7900b7'
PACKAGES_SHA = '2ab7191e94d1df1795bacd86b0a4f7ea6e42766cd1b9088d0f27162368c9b45d'
OWNER = {'schema': 1, 'purpose': 'hermes-codex-visual-private-test-runtimes'}
_HASH_BUFFER = threading.local()


class RuntimeErrorSafe(RuntimeError):
    pass


def identity(st):
    return (st.st_dev, st.st_ino, stat.S_IFMT(st.st_mode), st.st_size, st.st_mtime_ns)


def plain(path):
    path = Path(os.path.abspath(path))
    for part in (path, *path.parents):
        st = part.lstat()
        if stat.S_ISLNK(st.st_mode) or getattr(st, 'st_file_attributes', 0) & REPARSE:
            raise RuntimeErrorSafe('link or junction refused: ' + str(part))
    return path


def file_hash(path, *, limit=None):
    path = plain(path)
    before = path.lstat()
    if (not stat.S_ISREG(before.st_mode) or not before.st_dev or not before.st_ino
            or before.st_nlink != 1 or (limit is not None and before.st_size > limit)):
        raise RuntimeErrorSafe('unexpected file identity: ' + str(path))
    digest = hashlib.sha256()
    flags = os.O_RDONLY | getattr(os, 'O_BINARY', 0) | getattr(os, 'O_NOINHERIT', 0)
    flags |= getattr(os, 'O_NOFOLLOW', 0)
    fd = os.open(path, flags)
    with os.fdopen(fd, 'rb') as stream:
        if identity(before) != identity(os.fstat(stream.fileno())):
            raise RuntimeErrorSafe('file changed before reading: ' + str(path))
        buffer = getattr(_HASH_BUFFER, 'value', None)
        if buffer is None:
            buffer = bytearray(1024 * 1024)
            _HASH_BUFFER.value = buffer
        view = memoryview(buffer)
        while size := stream.readinto(buffer):
            digest.update(view[:size])
        if identity(before) != identity(os.fstat(stream.fileno())):
            raise RuntimeErrorSafe('file changed while reading: ' + str(path))
    if identity(before) != identity(path.lstat()):
        raise RuntimeErrorSafe('file changed after reading: ' + str(path))
    return digest.hexdigest()


def read_bytes(path, *, limit=2_000_000):
    path = plain(path)
    before = path.lstat()
    if (not stat.S_ISREG(before.st_mode) or not before.st_dev or not before.st_ino
            or before.st_nlink != 1 or before.st_size > limit):
        raise RuntimeErrorSafe('unexpected file identity: ' + str(path))
    flags = os.O_RDONLY | getattr(os, 'O_BINARY', 0) | getattr(os, 'O_NOINHERIT', 0)
    flags |= getattr(os, 'O_NOFOLLOW', 0)
    fd = os.open(path, flags)
    with os.fdopen(fd, 'rb') as stream:
        if identity(before) != identity(os.fstat(stream.fileno())):
            raise RuntimeErrorSafe('file changed before reading: ' + str(path))
        data = stream.read(limit + 1)
        if identity(before) != identity(os.fstat(stream.fileno())):
            raise RuntimeErrorSafe('file changed while reading: ' + str(path))
    if identity(before) != identity(path.lstat()) or len(data) != before.st_size or len(data) > limit:
        raise RuntimeErrorSafe('file changed after reading: ' + str(path))
    return data


def strict_json(data):
    def pairs(items):
        out = {}
        for key, value in items:
            if key in out:
                raise RuntimeErrorSafe('duplicate JSON key')
            out[key] = value
        return out
    try:
        return json.loads(data.decode('utf-8-sig'), object_pairs_hook=pairs)
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise RuntimeErrorSafe('invalid JSON') from exc


def tree_digest(root, *, workers=8):
    """Hash every file and directory name, rejecting reparse/hardlinks.

    The last directory scan catches ordinary additions/removals during the
    file reads. It cannot rule out malicious ABA modifications between reads.
    """
    root = plain(root)
    if not root.is_dir():
        raise RuntimeErrorSafe('venv is not a directory')
    before_root = identity(root.lstat())
    records, pending, directories = [], [], []
    for folder, names, filenames in os.walk(root, topdown=True, followlinks=False):
        directory = Path(folder)
        dstat = directory.lstat()
        if not stat.S_ISDIR(dstat.st_mode) or getattr(dstat, 'st_file_attributes', 0) & REPARSE:
            raise RuntimeErrorSafe('unexpected directory')
        directories.append((directory, identity(dstat), tuple(sorted(names + filenames))))
        for name in names:
            path = directory / name
            st = path.lstat()
            if not stat.S_ISDIR(st.st_mode) or getattr(st, 'st_file_attributes', 0) & REPARSE:
                raise RuntimeErrorSafe('unexpected directory entry')
            records.append((path.relative_to(root).as_posix() + '/', 'directory'))
        pending.extend(directory / name for name in filenames)

    def entry(path):
        digest = file_hash(path)
        st = path.lstat()
        return (path.relative_to(root).as_posix(), st.st_size, digest)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        records.extend(pool.map(entry, pending))
    for directory, prior, names in directories:
        if identity(directory.lstat()) != prior or tuple(sorted(os.listdir(directory))) != names:
            raise RuntimeErrorSafe('directory changed during scan')
    if identity(root.lstat()) != before_root:
        raise RuntimeErrorSafe('venv identity changed')
    encoded = json.dumps(sorted(records), separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    return {'sha256': hashlib.sha256(encoded).hexdigest(), 'files': len(pending),
            'directories': len(directories) - 1, 'bytes': sum(x[1] for x in records if len(x) == 3)}


def config_value(data, name):
    values = []
    for line in data.decode('utf-8').splitlines():
        if '=' in line:
            key, value = line.split('=', 1)
            if key.strip().lower() == name:
                values.append(value.strip())
    if len(values) != 1:
        raise RuntimeErrorSafe('unexpected pyvenv.cfg: ' + name)
    return values[0]


def verify_runtime(project, store_root, base_python, *, expected_base_sha=BASE_SHA, source_root=None):
    project, store_root, base_python = plain(project), plain(store_root), plain(base_python)
    owner_data = read_bytes(store_root.parent / 'owner.json', limit=4096)
    owner = strict_json(owner_data)
    if not isinstance(owner, dict) or type(owner.get('schema')) is not int or owner != OWNER:
        raise RuntimeErrorSafe('private runtime store owner is unknown')
    # A later Hermes update can change its dependency contract.  Do not let an
    # old but intact private venv silently stand in for that new contract.
    source_root = plain(source_root or (base_python.parent.parent.parent / 'hermes-agent'))
    source_project = read_bytes(source_root / 'pyproject.toml')
    source_lock = read_bytes(source_root / 'uv.lock')
    if (hashlib.sha256(source_project).hexdigest() != PROJECT_SHA
            or hashlib.sha256(source_lock).hexdigest() != LOCK_SHA):
        raise RuntimeErrorSafe('Hermes dependency inputs changed; review the runtime')
    pin_data = read_bytes(project / 'verification/test-runtime-pin.json', limit=65536)
    pin = strict_json(pin_data)
    if (not isinstance(pin, dict) or set(pin) != {'schema', 'runtime_id', 'manifest_sha256', 'tree_sha256'}
            or type(pin['schema']) is not int or pin['schema'] != 1
            or not isinstance(pin['runtime_id'], str) or not ID.fullmatch(pin['runtime_id'])
            or not all(isinstance(pin[k], str) and SHA.fullmatch(pin[k]) for k in ('manifest_sha256', 'tree_sha256'))):
        raise RuntimeErrorSafe('invalid private runtime pin')
    runtime = plain(store_root / pin['runtime_id'])
    if runtime.parent != store_root or not runtime.is_dir():
        raise RuntimeErrorSafe('private runtime is outside its store')
    manifest_data = read_bytes(runtime / 'manifest.json', limit=65536)
    if hashlib.sha256(manifest_data).hexdigest() != pin['manifest_sha256']:
        raise RuntimeErrorSafe('private runtime manifest changed')
    manifest = strict_json(manifest_data)
    if (not isinstance(manifest, dict)
            or set(manifest) != {'schema', 'runtime_id', 'tree_sha256', 'lock_sha256', 'project_sha256',
                                 'uv_sha256', 'base_python_sha256', 'packages_sha256', 'tree',
                                 'runtime_device', 'runtime_inode', 'venv_device', 'venv_inode'}
            or type(manifest.get('schema')) is not int or manifest.get('schema') != 1
            or manifest.get('runtime_id') != pin['runtime_id']
            or manifest.get('tree_sha256') != pin['tree_sha256']
            or manifest.get('lock_sha256') != LOCK_SHA
            or manifest.get('project_sha256') != PROJECT_SHA
            or manifest.get('uv_sha256') != UV_SHA
            or manifest.get('base_python_sha256') != expected_base_sha
            or manifest.get('packages_sha256') != PACKAGES_SHA
            or any(type(manifest.get(k)) is not int or manifest[k] <= 0 for k in
                   ('runtime_device', 'runtime_inode', 'venv_device', 'venv_inode'))
            or not isinstance(manifest.get('tree'), dict)
            or set(manifest['tree']) != {'sha256', 'files', 'directories', 'bytes'}
            or manifest['tree']['sha256'] != pin['tree_sha256']
            or any(type(manifest['tree'].get(k)) is not int or manifest['tree'][k] < 0 for k in
                   ('files', 'directories', 'bytes'))):
        raise RuntimeErrorSafe('private runtime manifest is inconsistent')
    runtime_identity = runtime.lstat()
    if (manifest.get('runtime_device'), manifest.get('runtime_inode')) != (runtime_identity.st_dev, runtime_identity.st_ino):
        raise RuntimeErrorSafe('private runtime directory was replaced')
    if file_hash(base_python) != expected_base_sha:
        raise RuntimeErrorSafe('base Python changed')
    venv = plain(runtime / 'venv')
    venv_identity = venv.lstat()
    if (manifest.get('venv_device'), manifest.get('venv_inode')) != (venv_identity.st_dev, venv_identity.st_ino):
        raise RuntimeErrorSafe('private venv directory was replaced')
    executable = plain(venv / 'Scripts/python.exe')
    cfg = read_bytes(venv / 'pyvenv.cfg', limit=65536)
    if os.path.normcase(os.path.normpath(config_value(cfg, 'home'))) != os.path.normcase(str(base_python.parent)):
        raise RuntimeErrorSafe('private runtime refers to another base Python')
    if config_value(cfg, 'include-system-site-packages').lower() != 'false':
        raise RuntimeErrorSafe('private runtime inherits system packages')
    actual = tree_digest(venv)
    if actual['sha256'] != pin['tree_sha256'] or actual != manifest.get('tree'):
        raise RuntimeErrorSafe('private runtime tree changed')
    after_runtime, after_venv = runtime.lstat(), venv.lstat()
    if ((after_runtime.st_dev, after_runtime.st_ino) != (runtime_identity.st_dev, runtime_identity.st_ino)
            or (after_venv.st_dev, after_venv.st_ino) != (venv_identity.st_dev, venv_identity.st_ino)):
        raise RuntimeErrorSafe('private runtime directory changed while reading')
    if (read_bytes(store_root.parent / 'owner.json', limit=4096) != owner_data
            or read_bytes(project / 'verification/test-runtime-pin.json', limit=65536) != pin_data
            or read_bytes(runtime / 'manifest.json', limit=65536) != manifest_data
            or read_bytes(source_root / 'pyproject.toml') != source_project
            or read_bytes(source_root / 'uv.lock') != source_lock
            or file_hash(base_python) != expected_base_sha):
        raise RuntimeErrorSafe('private runtime inputs changed while reading')
    return {'runtime_id': pin['runtime_id'], 'manifest_sha256': pin['manifest_sha256'],
            'tree_sha256': pin['tree_sha256'], 'python': str(executable),
            'base_python': str(base_python), 'external_runtime_verified': False}


def local_paths():
    local = os.environ.get('LOCALAPPDATA')
    if not local or not Path(local).is_absolute():
        raise RuntimeErrorSafe('LOCALAPPDATA unavailable')
    return (Path(local) / 'hermes-codex-visual-test' / 'runtimes',
            Path(local) / 'hermes' / 'tools' / 'python-3.14.9+20261021-win32-x64' / 'python.exe')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        store, base = local_paths()
        result = verify_runtime(args.project, store, base)
        print(json.dumps(result, sort_keys=True, ensure_ascii=False))
    except (OSError, ValueError, TypeError, RuntimeErrorSafe) as exc:
        print('Private test runtime refused: ' + str(exc), file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())

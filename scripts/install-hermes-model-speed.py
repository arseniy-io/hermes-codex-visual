"""Install a verified model-speed companion with checked NTFS backups."""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import ctypes
from ctypes import wintypes
from hashlib import sha256
import importlib.util
import json
import os
import stat
import struct
import uuid

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('hcv_stage_model_speed', ROOT / 'scripts/stage-hermes-model-speed.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
stage = module.stage


def metadata(path):
    """Inspect NTFS data streams, owner, group, DACL and attributes; not SACL."""
    if os.name != 'nt':
        raise RuntimeError('Full backup verification requires Windows')
    class StreamData(ctypes.Structure):
        _fields_ = [('size', ctypes.c_longlong), ('name', ctypes.c_wchar * 296)]
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    first = kernel.FindFirstStreamW
    first.argtypes = [wintypes.LPCWSTR, ctypes.c_int, ctypes.POINTER(StreamData), wintypes.DWORD]
    first.restype = wintypes.HANDLE
    next_stream = kernel.FindNextStreamW
    next_stream.argtypes = [wintypes.HANDLE, ctypes.POINTER(StreamData)]
    next_stream.restype = wintypes.BOOL
    close = kernel.FindClose
    close.argtypes = [wintypes.HANDLE]
    close.restype = wintypes.BOOL
    item = StreamData()
    handle = first(str(path), 0, ctypes.byref(item), 0)
    if handle == ctypes.c_void_p(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    streams = {}
    try:
        while True:
            name = item.name
            if not name.startswith(':') or not name.endswith(':$DATA') or name in streams:
                raise RuntimeError('Unexpected NTFS data stream')
            h, length = sha256(), 0
            with open(str(path) + name, 'rb') as source:
                while True:
                    chunk = source.read(1024 * 1024)
                    if not chunk:
                        break
                    h.update(chunk)
                    length += len(chunk)
            if length != item.size:
                raise RuntimeError('NTFS data stream changed while reading')
            streams[name] = {'size': length, 'sha256': h.hexdigest()}
            if not next_stream(handle, ctypes.byref(item)):
                if ctypes.get_last_error() not in (18, 38):
                    raise ctypes.WinError(ctypes.get_last_error())
                break
    finally:
        close(handle)
    if '::$DATA' not in streams:
        raise RuntimeError('Missing default NTFS data stream')
    security = ctypes.WinDLL('advapi32', use_last_error=True).GetFileSecurityW
    security.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD,
                         ctypes.POINTER(wintypes.DWORD)]
    security.restype = wintypes.BOOL
    needed = wintypes.DWORD()
    security(str(path), 0x1 | 0x2 | 0x4, None, 0, ctypes.byref(needed))
    if not needed.value:
        raise ctypes.WinError(ctypes.get_last_error())
    buffer = ctypes.create_string_buffer(needed.value)
    if not security(str(path), 0x1 | 0x2 | 0x4, buffer, needed.value, ctypes.byref(needed)):
        raise ctypes.WinError(ctypes.get_last_error())
    return {'streams': dict(sorted(streams.items())),
            'owner_group_dacl_sha256': sha256(buffer.raw[:needed.value]).hexdigest(),
            'file_attributes': getattr(path.stat(), 'st_file_attributes', 0)}


def snapshot(path):
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or not before.st_ino or path.is_symlink():
        raise RuntimeError('Not an ordinary NTFS file: ' + str(path))
    raw = path.read_bytes()
    info = metadata(path)
    after = path.lstat()
    signature = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns)
    if signature(before) != signature(after) or info['streams']['::$DATA'] != {
            'size': len(raw), 'sha256': stage.digest(raw)}:
        raise RuntimeError('File changed while recording its metadata: ' + str(path))
    return {'device': before.st_dev, 'inode': before.st_ino, 'size': before.st_size,
            'mtime_ns': before.st_mtime_ns, 'metadata': info}


def journal(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x', encoding='utf8', newline='\n') as output:
        json.dump(data, output, ensure_ascii=False, indent=2)
        output.write('\n')
        output.flush()
        os.fsync(output.fileno())


def replace_file(path, temporary, backup):
    replace = ctypes.WinDLL('kernel32', use_last_error=True).ReplaceFileW
    replace.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.LPCWSTR,
                        wintypes.DWORD, wintypes.LPVOID, wintypes.LPVOID]
    replace.restype = wintypes.BOOL
    # Never ignore merge/ACL errors. The backup name must not exist.
    if not replace(str(path), str(temporary), str(backup), 0, None, None):
        raise ctypes.WinError(ctypes.get_last_error())


def publish(path, data, *, new=False, on_publish=None, native_backup=None, pending=None):
    temporary = path.with_name(path.name + '.hcv-' + uuid.uuid4().hex + '.tmp') if pending is None else Path(pending)
    if temporary.parent != path.parent or temporary == path or temporary.exists():
        raise RuntimeError('Pending replacement must be a new file beside its target')
    uncertain = False
    try:
        with temporary.open('xb') as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        if set(metadata(temporary)['streams']) != {'::$DATA'}:
            raise RuntimeError('Replacement file has unexpected extra streams')
        if new:
            os.link(temporary, path)
        else:
            if native_backup is None or native_backup.exists():
                raise RuntimeError('A new same-volume native backup path is required')
            native_backup.parent.mkdir(parents=True, exist_ok=True)
            try:
                replace_file(path, temporary, native_backup)
            except BaseException as error:
                uncertain = True
                if not isinstance(error, Exception):
                    if hasattr(error, 'add_note'):
                        error.add_note('Pending file retained at ' + str(temporary))
                    raise
                raise OSError('ReplaceFileW failed; pending file retained at ' + str(temporary) +
                              ': ' + str(error)) from error
        if on_publish is not None:
            on_publish()
    finally:
        try:
            if not uncertain and temporary.exists():
                temporary.unlink()
        except OSError as error:
            raise OSError('Temporary file cleanup failed (' + str(temporary) + '): ' + str(error)) from error


def ancillary(info):
    """The default stream is the intended content change; all others must survive."""
    return {'streams': {k: v for k, v in info['streams'].items() if k != '::$DATA'},
            'owner_group_dacl_sha256': info['owner_group_dacl_sha256'],
            'file_attributes': info['file_attributes']}


def restore_security(path, saved):
    """Restore the verified old owner, group and DACL after Windows replaces a file."""
    security = ctypes.WinDLL('advapi32', use_last_error=True)
    get = security.GetFileSecurityW
    get.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD,
                    ctypes.POINTER(wintypes.DWORD)]
    get.restype = wintypes.BOOL
    needed = wintypes.DWORD()
    get(str(saved), 0x1 | 0x2 | 0x4, None, 0, ctypes.byref(needed))
    if not needed.value:
        raise ctypes.WinError(ctypes.get_last_error())
    descriptor = ctypes.create_string_buffer(needed.value)
    if not get(str(saved), 0x1 | 0x2 | 0x4, descriptor, needed.value, ctypes.byref(needed)):
        raise ctypes.WinError(ctypes.get_last_error())
    put = security.SetFileSecurityW
    put.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.c_void_p]
    put.restype = wintypes.BOOL
    if not put(str(path), 0x1 | 0x2 | 0x4, descriptor):
        raise ctypes.WinError(ctypes.get_last_error())


def security_identity(path):
    """Compare owner, group, control and ordered ACEs, ignoring only inheritance bookkeeping."""
    security = ctypes.WinDLL('advapi32', use_last_error=True)
    get = security.GetFileSecurityW
    get.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD,
                    ctypes.POINTER(wintypes.DWORD)]
    get.restype = wintypes.BOOL
    needed = wintypes.DWORD()
    get(str(path), 0x1 | 0x2 | 0x4, None, 0, ctypes.byref(needed))
    if not needed.value:
        raise ctypes.WinError(ctypes.get_last_error())
    descriptor = ctypes.create_string_buffer(needed.value)
    if not get(str(path), 0x1 | 0x2 | 0x4, descriptor, needed.value, ctypes.byref(needed)):
        raise ctypes.WinError(ctypes.get_last_error())
    sid_length = security.GetLengthSid
    sid_length.argtypes = [ctypes.c_void_p]
    sid_length.restype = wintypes.DWORD
    identities = []
    for getter in (security.GetSecurityDescriptorOwner, security.GetSecurityDescriptorGroup):
        getter.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(wintypes.BOOL)]
        getter.restype = wintypes.BOOL
        pointer, defaulted = ctypes.c_void_p(), wintypes.BOOL()
        if not getter(descriptor, ctypes.byref(pointer), ctypes.byref(defaulted)) or not pointer.value:
            raise RuntimeError('Security descriptor has no owner or group')
        identities.append((ctypes.string_at(pointer, sid_length(pointer)), bool(defaulted.value)))
    dacl = security.GetSecurityDescriptorDacl
    dacl.argtypes = [ctypes.c_void_p, ctypes.POINTER(wintypes.BOOL), ctypes.POINTER(ctypes.c_void_p),
                     ctypes.POINTER(wintypes.BOOL)]
    dacl.restype = wintypes.BOOL
    present, defaulted, pointer = wintypes.BOOL(), wintypes.BOOL(), ctypes.c_void_p()
    if not dacl(descriptor, ctypes.byref(present), ctypes.byref(pointer), ctypes.byref(defaulted)):
        raise ctypes.WinError(ctypes.get_last_error())
    acl = None
    if pointer.value:
        header = ctypes.string_at(pointer, 8)
        _, _, length, count, _ = struct.unpack('<BBHHH', header)
        if length < 8:
            raise RuntimeError('Invalid Windows ACL')
        acl = bytearray(ctypes.string_at(pointer, length))
        offset = 8
        for _ in range(count):
            if offset + 4 > length:
                raise RuntimeError('Invalid Windows ACE')
            size = int.from_bytes(acl[offset + 2:offset + 4], 'little')
            if size < 4 or offset + size > length:
                raise RuntimeError('Invalid Windows ACE size')
            acl[offset + 1] &= ~0x10  # INHERITED_ACE, not an access right
            offset += size
        acl = bytes(acl)
    control = security.GetSecurityDescriptorControl
    control.argtypes = [ctypes.c_void_p, ctypes.POINTER(wintypes.WORD), ctypes.POINTER(wintypes.DWORD)]
    control.restype = wintypes.BOOL
    flags, revision = wintypes.WORD(), wintypes.DWORD()
    if not control(descriptor, ctypes.byref(flags), ctypes.byref(revision)):
        raise ctypes.WinError(ctypes.get_last_error())
    return identities, bool(present.value), bool(defaulted.value), acl, flags.value & ~0x0400, revision.value


def restore_old(target, saved, before):
    # A link to the original inode retains its data, streams and permissions.
    if snapshot(saved) != before:
        raise RuntimeError('Full original backup changed; left target untouched')
    temporary = target.with_name(target.name + '.hcv-restore-' + uuid.uuid4().hex + '.tmp')
    try:
        os.link(saved, temporary)
        if snapshot(temporary) != before:
            raise RuntimeError('Restore link differs from full original backup')
        os.replace(temporary, target)
    except Exception as error:
        raise RuntimeError('Restore was interrupted; inspect retained link ' + str(temporary) +
                           ': ' + str(error)) from error
    if snapshot(target) != before:
        raise RuntimeError('Restored original metadata or bytes do not match')


def install(core, candidate, backup_root):
    if os.name != 'nt':
        raise RuntimeError('NTFS-preserving install requires Windows')
    core, candidate = core.resolve(strict=True), candidate.resolve(strict=True)
    originals, output = stage.candidates(core)
    for name, data in output.items():
        if stage.checked_path(candidate, name).read_bytes() != data:
            raise RuntimeError('Staged source differs from the verified candidate: ' + name)
    changed = [name for name, data in output.items() if originals.get(name) != data]
    if not changed:
        return None, output
    backup = backup_root / ('model-speed-core-rollback-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8])
    backup.mkdir(parents=True, exist_ok=False)
    before, written, published = {}, [], {}
    attempt = None
    try:
        for name in changed:
            target = stage.checked_path(core, name, exists=name in originals)
            if name not in originals:
                if target.exists():
                    raise RuntimeError('A new helper appeared before backup: ' + name)
                before[name] = None
            else:
                if target.stat().st_nlink != 1 or target.read_bytes() != originals[name]:
                    raise RuntimeError('Existing file changed or has other hard links: ' + name)
                before[name] = snapshot(target)
        journal(backup / 'journal/000-plan.json', {'files': {name: {
            'before': before[name], 'candidate_sha256': stage.digest(output[name]),
            'target': str(core / stage.safe_relative(name))} for name in changed},
            'metadata_scope': 'NTFS data streams, owner, group, DACL, attributes; SACL and special metadata not verified'})
        for index, name in enumerate(changed):
            if before[name] is None:
                continue
            target = stage.checked_path(core, name)
            if snapshot(target) != before[name] or target.stat().st_nlink != 1:
                raise RuntimeError('Existing file changed before backup: ' + name)
            saved = backup / 'previous-full' / stage.safe_relative(name)
            saved.parent.mkdir(parents=True, exist_ok=True)
            os.link(target, saved)
            if (snapshot(saved) != before[name] or snapshot(target) != before[name]
                    or saved.stat().st_nlink != 2 or target.stat().st_nlink != 2):
                raise RuntimeError('Full backup did not verify: ' + name)
            journal(backup / ('journal/backup-%03d.json' % index), {'name': name, 'backup': str(saved)})
        journal(backup / 'journal/010-prepared.json', {'status': 'prepared_only'})
        for index, name in enumerate(sorted(changed, key=lambda name: name in originals)):
            target = stage.checked_path(core, name, exists=name in originals)
            saved = backup / 'previous-full' / stage.safe_relative(name)
            if before[name] is None:
                if target.exists():
                    raise RuntimeError('A new helper appeared during installation: ' + name)
            elif (snapshot(target) != before[name] or snapshot(saved) != before[name]
                    or target.stat().st_nlink != 2 or saved.stat().st_nlink != 2):
                raise RuntimeError('Hermes or its full backup changed during installation: ' + name)
            attempt = name
            native = backup / 'native-previous' / stage.safe_relative(name)
            pending = target.with_name(target.name + '.hcv-' + uuid.uuid4().hex + '.tmp')
            journal(backup / ('journal/write-%03d-before.json' % index),
                    {'name': name, 'pending': str(pending),
                     'native_backup': str(native) if before[name] is not None else None})
            def recorded():
                # Register immediately: later verification or cleanup can fail.
                written.append(name)
                published[name] = snapshot(target)
                if target.read_bytes() != output[name]:
                    raise RuntimeError('Published candidate differs: ' + name)
                if before[name] is not None:
                    # ReplaceFileW can preserve equivalent inherited access but
                    # change the security descriptor's control flags. Restore
                    # the exact descriptor from the already verified backup.
                    before_meta, now_meta = before[name]['metadata'], published[name]['metadata']
                    if (before_meta['owner_group_dacl_sha256'] != now_meta['owner_group_dacl_sha256'] and
                            ancillary({**before_meta, 'owner_group_dacl_sha256': now_meta['owner_group_dacl_sha256']}) == ancillary(now_meta)):
                        if snapshot(saved) != before[name] or snapshot(target) != published[name]:
                            raise RuntimeError('File changed before restoring its security: ' + name)
                        if security_identity(target) != security_identity(saved):
                            raise RuntimeError('Published metadata differs from original: ' + name)
                        previous = published[name]
                        try:
                            restore_security(target, saved)
                        finally:
                            current = snapshot(target)
                            if (current['device'], current['inode'], current['size'], current['mtime_ns'],
                                    current['metadata']['streams']['::$DATA']) == (
                                    previous['device'], previous['inode'], previous['size'], previous['mtime_ns'],
                                    previous['metadata']['streams']['::$DATA']):
                                published[name] = current
                    if ancillary(published[name]['metadata']) != ancillary(before[name]['metadata']):
                        raise RuntimeError('Published metadata differs from original: ' + name)
                    if snapshot(saved) != before[name] or snapshot(native) != before[name]:
                        raise RuntimeError('Native or full backup differs: ' + name)
            publish(target, output[name], new=before[name] is None, on_publish=recorded,
                    native_backup=native if before[name] is not None else None, pending=pending)
            journal(backup / ('journal/write-%03d-after.json' % index), {'name': name, 'published': published[name]})
            attempt = None
        for name, data in output.items():
            if stage.checked_path(core, name).read_bytes() != data:
                raise RuntimeError('Installed content did not verify: ' + name)
            if name in published and snapshot(core / stage.safe_relative(name)) != published[name]:
                raise RuntimeError('Installed file changed after publication: ' + name)
        journal(backup / 'journal/999-complete.json', {'status': 'installed', 'files': len(changed)})
    except Exception as install_error:
        failures = []
        # A failed Win32 call can have moved a target despite returning an error.
        # Never infer its state. Report and preserve all names for inspection.
        if attempt is not None and attempt not in written:
            try:
                target = stage.checked_path(core, attempt, exists=False)
                if before[attempt] is None:
                    unchanged = not target.exists()
                else:
                    unchanged = target.exists() and snapshot(target) == before[attempt]
                if not unchanged:
                    failures.append((attempt, 'publication outcome is uncertain; left untouched'))
            except Exception as state_error:
                failures.append((attempt, 'cannot inspect publication outcome: ' + str(state_error)))
        for name in reversed(written):
            try:
                target = stage.checked_path(core, name, exists=False)
                if name not in published or not target.exists() or snapshot(target) != published[name]:
                    raise RuntimeError('Published file changed or its identity is unknown; left untouched')
                if before[name] is None:
                    target.unlink()
                    if target.exists():
                        raise RuntimeError('Removed helper reappeared; left untouched')
                else:
                    restore_old(target, backup / 'previous-full' / stage.safe_relative(name), before[name])
            except Exception as rollback_error:
                failures.append((name, str(rollback_error) or type(rollback_error).__name__))
        try:
            journal(backup / 'journal/998-failed.json', {'error': str(install_error), 'rollback_failures': failures})
        except Exception as journal_error:
            failures.append(('journal', str(journal_error)))
        if failures:
            details = '\n'.join('  ' + name + ': ' + reason for name, reason in failures)
            raise RuntimeError('Installation failed: ' + str(install_error) +
                '\nRollback incomplete or uncertain; full backup retained at ' + str(backup) + ':\n' + details) from install_error
        if hasattr(install_error, 'add_note'):
            install_error.add_note('Restored verified changes; full backup retained at ' + str(backup))
        raise
    return backup, output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--install', action='store_true', required=True)
    parser.add_argument('--candidate', type=Path, default=stage.OUT)
    args = parser.parse_args()
    core = stage.CORE.resolve(strict=True)
    if core != (Path(os.environ['LOCALAPPDATA']) / 'hermes/hermes-agent').resolve(strict=True):
        raise RuntimeError('Unexpected Hermes installation path')
    backup, output = install(core, args.candidate, ROOT / '.local')
    print('Backup:', backup if backup is not None else 'already installed')
    print('Installed and verified:', len(output), 'Hermes files')
    print('Restart the idle gateway safely before using the new catalog behavior.')


if __name__ == '__main__':
    main()

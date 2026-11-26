"""Crash recovery for a batch of exact file replacements.

Use one private, local journal directory per installation scope. Callers must
serialize external registry decisions with installation, and is_committed must
return an authoritative bool (or raise on uncertainty). A failed commit must
never complete later, after is_committed has reported False.

The maintenance adapter opts in with proven=True and provides:
* validate_targets(intent_id, tuple_of_paths): authorize the exact paths, their
  sibling scratch files and their filesystem/metadata. Raise if unsupported.
* enter(intent_id): acquire/rejoin an exclusive, durable open/work barrier for
  the whole scope and quiesce any interrupted probe. Also exclude other writers
  to the target files and their namespace. Failure must not clear the barrier.
* verify_base(intent_id, expected): verify the previously active versions and
  environment from evidence secured on entry, before changing any files.
* probe(intent_id, 'old' or 'new', expected): run under the barrier, check active
  versions/environment before and after loading, and return JSON evidence with
  matching intent_id and version. An old probe must reverse trial changes to
  runtime data. A probe never opens the barrier.
* leave(intent_id): release the barrier idempotently, with no new probe or
  version activation. It may be retried after work has already resumed.

Expected maps contain Path keys and SHA-256 strings or None for absence.
The engine compares default-stream bytes, preserves supported permissions on
replacement, and refuses reparse points, hardlinks and unsupported attributes.
On Windows it requires a default-only data stream, normal/archive attributes,
and matching owner/group/DACL for replacements and restores. The adapter must
exclude targets requiring EAs, SACL/labels, timestamps or any other metadata
outside those checks, and must protect directory inheritance/namespace.
"""

import hashlib
import json
import os
import re
import sqlite3
import stat
from contextlib import contextmanager
from pathlib import Path, PureWindowsPath
from uuid import uuid4


class InstallError(RuntimeError):
    def __init__(self, message, *, status="blocked"):
        super().__init__(message)
        self.status = status


_METHODS = ("validate_targets", "enter", "verify_base", "probe", "leave")
_PHASES = {"starting", "writing", "probed", "closing_old", "closing_new",
           "rolled_back", "committed"}
_TERMINAL = {"rolled_back", "committed"}
_SHA256 = re.compile(r"[0-9a-f]{64}")


def _adapter(maintenance):
    if getattr(maintenance, "proven", False) is not True or any(
        not callable(getattr(maintenance, method, None)) for method in _METHODS
    ):
        raise InstallError("A proven durable maintenance adapter is required")


def _digest(data):
    return None if data is None else hashlib.sha256(data).hexdigest()


def _hash(value):
    return value is None or isinstance(value, str) and _SHA256.fullmatch(value)


def _id(value):
    if not isinstance(value, str) or not value.strip() or "\0" in value:
        raise InstallError("Invalid release intent ID")
    return value


def _plain(path, *, directory=False, missing=False):
    if not isinstance(path, Path) or not path.is_absolute() or ".." in path.parts:
        raise InstallError(f"An absolute lexical path is required: {path}")
    if os.name == "nt":
        if not re.fullmatch(r"[A-Za-z]:", path.drive):
            raise InstallError(f"A normal local drive path is required: {path}")
        for part in path.parts[1:]:
            if (PureWindowsPath(part).is_reserved() or part.endswith((" ", "."))
                    or re.search(r'[<>:"|?*\x00-\x1f]|~[0-9]+(?:\.|$)', part)):
                raise InstallError(f"Windows path alias or stream path refused: {path}")
    for part in reversed(path.parents):
        info = part.lstat()
        _entry(part, info, directory=True)
    try:
        info = path.lstat()
    except FileNotFoundError:
        if not missing:
            raise
        canonical = path.parent.resolve(strict=True) / path.name
        info = None
    else:
        _entry(path, info, directory=directory)
        canonical = path.resolve(strict=True)
    if canonical != path:
        raise InstallError(f"Path alias refused: {path}")
    return info


def _entry(path, info, *, directory):
    if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
        raise InstallError(f"Symbolic link or reparse point refused: {path}", status="foreign")
    if directory:
        if not stat.S_ISDIR(info.st_mode):
            raise InstallError(f"Expected a directory: {path}", status="foreign")
    elif not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or not info.st_ino:
        raise InstallError(f"Expected an independent regular file: {path}", status="foreign")


def _plan(journal_dir, records):
    if not isinstance(journal_dir, Path) or not isinstance(records, list):
        raise InstallError("Invalid release paths")
    targets = []
    for record in records:
        path = Path(record["target"])
        if not path.is_absolute() or ".." in path.parts:
            raise InstallError(f"An absolute lexical target is required: {path}")
        if not _hash(record["before"]) or not _hash(record["after"]):
            raise InstallError(f"Invalid SHA-256 for {path}")
        for other in (journal_dir, *targets):
            if path.is_relative_to(other) or other.is_relative_to(path):
                raise InstallError(f"Colliding release paths: {path} and {other}")
        targets.append(path)
    return tuple(targets)


def _normalize(changes):
    if not isinstance(changes, list):
        raise InstallError("Release changes must be a list")
    plan = []
    for change in changes:
        if (not isinstance(change, dict) or set(change) != {"target", "before", "after"}
                or not isinstance(change["target"], Path)
                or change["after"] is not None and not isinstance(change["after"], bytes)):
            raise InstallError("Invalid release change")
        path = change["target"]
        plan.append(({"target": str(path), "before": change["before"],
                      "after": _digest(change["after"])}, change["after"]))
    plan.sort(key=lambda pair: os.path.normcase(pair[0]["target"]))
    return [record for record, _ in plan], [data for _, data in plan]


def _signature(info):
    return (info.st_dev, info.st_ino, info.st_nlink, info.st_mode,
            info.st_size, info.st_mtime_ns)


def _read_target(path):
    info = _plain(path, missing=True)
    if info is None:
        return None, None
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    flags |= getattr(os, "O_NONBLOCK", 0)
    with os.fdopen(os.open(path, flags), "rb") as stream:
        if _signature(os.fstat(stream.fileno())) != _signature(info):
            raise InstallError(f"Target changed before reading: {path}", status="foreign")
        data = stream.read()
        after = os.fstat(stream.fileno())
    metadata = _metadata(path, info)
    last = _plain(path)
    if (_signature(info) != _signature(after) or _signature(info) != _signature(last)
            or info.st_ctime_ns != last.st_ctime_ns or len(data) != info.st_size):
        raise InstallError(f"Target changed during reading: {path}", status="foreign")
    return data, metadata


def _metadata(path, info):
    if os.name == "nt":
        return _windows_metadata(path, info)
    if hasattr(os, "listxattr") and os.listxattr(path, follow_symlinks=False):
        raise InstallError(f"Extended attributes are unsupported: {path}")
    return {"mode": stat.S_IMODE(info.st_mode), "uid": info.st_uid, "gid": info.st_gid}


_WINDOWS_SECURITY_PARTS = 0x1 | 0x2 | 0x4  # Owner, group and DACL.


def _windows_metadata(path, info):
    import ctypes
    from ctypes import wintypes

    class StreamData(ctypes.Structure):
        _fields_ = [("size", ctypes.c_longlong), ("name", ctypes.c_wchar * 296)]

    if info.st_file_attributes & ~(stat.FILE_ATTRIBUTE_ARCHIVE | stat.FILE_ATTRIBUTE_NORMAL):
        raise InstallError(f"Special Windows file attributes are unsupported: {path}")
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    first, next_stream, close = kernel.FindFirstStreamW, kernel.FindNextStreamW, kernel.FindClose
    first.argtypes = [wintypes.LPCWSTR, ctypes.c_int, ctypes.POINTER(StreamData), wintypes.DWORD]
    first.restype = wintypes.HANDLE
    next_stream.argtypes = [wintypes.HANDLE, ctypes.POINTER(StreamData)]
    next_stream.restype = wintypes.BOOL
    close.argtypes = [wintypes.HANDLE]
    close.restype = wintypes.BOOL
    stream = StreamData()
    handle = first(str(path), 0, ctypes.byref(stream), 0)
    if handle == ctypes.c_void_p(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        if stream.name != "::$DATA" or next_stream(handle, ctypes.byref(stream)):
            raise InstallError(f"Alternate Windows data streams are unsupported: {path}")
        if ctypes.get_last_error() != 38:  # ERROR_HANDLE_EOF
            raise ctypes.WinError(ctypes.get_last_error())
    finally:
        close(handle)
    return {"owner_group_dacl": _digest(_windows_descriptor(path))}


def _windows_descriptor(path):
    import ctypes
    from ctypes import wintypes

    security = ctypes.WinDLL("advapi32", use_last_error=True).GetFileSecurityW
    security.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD,
                         ctypes.POINTER(wintypes.DWORD)]
    security.restype = wintypes.BOOL
    needed = wintypes.DWORD()
    security(str(path), _WINDOWS_SECURITY_PARTS, None, 0, ctypes.byref(needed))
    if not needed.value:
        raise ctypes.WinError(ctypes.get_last_error())
    descriptor = ctypes.create_string_buffer(needed.value)
    if not security(str(path), _WINDOWS_SECURITY_PARTS, descriptor, needed.value, ctypes.byref(needed)):
        raise ctypes.WinError(ctypes.get_last_error())
    return descriptor.raw[:needed.value]


def _copy_windows_permissions(source, target):
    import ctypes
    from ctypes import wintypes

    _plain(source)
    descriptor = _windows_descriptor(source)
    control = int.from_bytes(descriptor[2:4], "little")
    # To keep SE_DACL_AUTO_INHERITED, Windows also needs
    # SE_DACL_AUTO_INHERIT_REQ in the descriptor passed to SetFileSecurityW.
    if control & 0x0400:
        descriptor = descriptor[:2] + (control | 0x0100).to_bytes(2, "little") + descriptor[4:]
    security = ctypes.WinDLL("advapi32", use_last_error=True).SetFileSecurityW
    security.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.c_void_p]
    security.restype = wintypes.BOOL
    if not security(str(target), _WINDOWS_SECURITY_PARTS, descriptor):
        raise ctypes.WinError(ctypes.get_last_error())


def _sync_directory(path):
    if os.name != "nt":
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


def _move(source, target, *, replace):
    if os.name == "nt":
        import ctypes
        from ctypes import wintypes

        move = ctypes.WinDLL("kernel32", use_last_error=True).MoveFileExW
        move.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD]
        move.restype = wintypes.BOOL
        flags = 0x8 | int(replace)  # MOVEFILE_WRITE_THROUGH | MOVEFILE_REPLACE_EXISTING
        if not move(str(source), str(target), flags):
            raise ctypes.WinError(ctypes.get_last_error())
    else:
        os.replace(source, target)
        _sync_directory(target.parent)


@contextmanager
def _guard(path):
    _plain(path, missing=True)
    flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    with os.fdopen(os.open(path, flags, 0o600), "r+b") as handle:
        if _signature(os.fstat(handle.fileno())) != _signature(_plain(path)):
            raise InstallError("Journal guard changed while opening", status="foreign")
        try:
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            raise InstallError("Install journal is busy", status="busy") from error
        yield
    # Closing the persistent lock file releases the OS lock, including on crash.


@contextmanager
def _journal(folder, *, create):
    if not _plain(folder, directory=True, missing=True):
        if not create:
            yield None
            return
        folder.mkdir(mode=0o700, exist_ok=True)
        _plain(folder, directory=True)
        _sync_directory(folder.parent)
    path = folder / "install.sqlite3"
    if not create and not _plain(path, missing=True):
        yield None
        return
    with _guard(folder / "install.lock"):
        _plain(path, missing=create)
        for suffix in ("-journal", "-wal", "-shm"):
            _plain(path.with_name(path.name + suffix), missing=True)
        db = sqlite3.connect(path)
        try:
            if db.execute("PRAGMA journal_mode=DELETE").fetchone()[0] != "delete":
                raise InstallError("Cannot enable the rollback journal", status="unknown")
            db.execute("PRAGMA synchronous=EXTRA")
            with db:
                db.execute("CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, body TEXT)")
                db.execute("CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY, old BLOB,"
                           " new BLOB, metadata TEXT)")
            yield db
        finally:
            db.close()


def _load(db, folder):
    row = db.execute("SELECT body FROM state WHERE id = 1").fetchone()
    if row is None:
        return None
    try:
        state = json.loads(row[0])
        if state["schema"] != 1 or state["phase"] not in _PHASES:
            raise ValueError("Unknown schema or phase")
        _id(state["intent_id"])
        _plan(folder, state["changes"])
        if state["phase"] in {"probed", "closing_new", "committed"}:
            _receipt(state, "new", state["receipt"])
        if state["phase"] in {"closing_old", "rolled_back"}:
            _receipt(state, "old", state["receipt"])
    except (InstallError, KeyError, TypeError, ValueError) as error:
        raise InstallError("Unreadable release journal", status="unknown") from error
    return state


def _save(db, state):
    db.execute("INSERT OR REPLACE INTO state VALUES (1, ?)",
               (json.dumps(state, ensure_ascii=True, allow_nan=False),))


def _known_registry(is_committed, intent_id):
    try:
        committed = is_committed(intent_id)
    except Exception as error:
        raise InstallError(f"Registry outcome is unknown: {intent_id}", status="unknown") from error
    if type(committed) is not bool:
        raise InstallError(f"Registry outcome is unknown: {intent_id}", status="unknown")
    return committed


def _call(maintenance, method, *args):
    try:
        return getattr(maintenance, method)(*args)
    except InstallError:
        raise
    except Exception as error:
        raise InstallError(f"Maintenance {method} failed: {error}") from error


def _targets(state):
    return tuple(Path(record["target"]) for record in state["changes"])


def _expected(state, version):
    key = "before" if version == "old" else "after"
    return {Path(record["target"]): record[key] for record in state["changes"]}


def _receipt(state, version, receipt):
    if (not isinstance(receipt, dict) or receipt.get("intent_id") != state["intent_id"]
            or receipt.get("version") != version or not receipt.get("evidence")):
        raise InstallError(f"Missing structured {version} probe evidence")
    try:
        return json.loads(json.dumps(receipt, allow_nan=False))
    except (TypeError, ValueError) as error:
        raise InstallError(f"Invalid structured {version} probe evidence") from error


def _live(path, record, metadata=None, *, version=None):
    data, actual_metadata = _read_target(path)
    actual = _digest(data)
    allowed = {record["before"], record["after"]} if version is None else {record[version]}
    if actual not in allowed or actual is not None and metadata is not None and actual_metadata != metadata:
        raise InstallError(f"Unexpected bytes, absence or permissions at {path}", status="foreign")
    return data, actual_metadata


def _backups(db, state):
    rows = db.execute("SELECT id, old, new, metadata FROM files ORDER BY id").fetchall()
    if len(rows) != len(state["changes"]):
        raise InstallError("Incomplete release backups", status="unknown")
    result = []
    for index, (record, (row_id, old, new, metadata)) in enumerate(zip(state["changes"], rows)):
        if (row_id != index or any(data is not None and not isinstance(data, bytes) for data in (old, new))
                or _digest(old) != record["before"] or _digest(new) != record["after"]):
            raise InstallError("Release backup checksum mismatch", status="unknown")
        try:
            metadata = json.loads(metadata)
            if old is not None or new is not None:
                if os.name == "nt":
                    valid = isinstance(metadata.get("owner_group_dacl"), str) and _hash(metadata["owner_group_dacl"])
                else:
                    valid = all(type(metadata[key]) is int for key in ("mode", "uid", "gid"))
                if not valid:
                    raise ValueError("Invalid metadata")
        except (AttributeError, KeyError, TypeError, ValueError) as error:
            raise InstallError("Unreadable release backup metadata", status="unknown") from error
        result.append((old, new, metadata))
    return result


def _check_set(state, backups=None, *, version=None):
    result = []
    for index, (path, record) in enumerate(zip(_targets(state), state["changes"])):
        metadata = None if backups is None else backups[index][2]
        result.append(_live(path, record, metadata, version=version))
    return result


@contextmanager
def _stage(path, data, metadata, *, copy_windows_permissions=False):
    # A random sibling keeps the rename on the target filesystem. On a hard
    # process stop before rename an unused .tmp may be left for later inspection.
    pending = path.with_name(f".hcv-release-{uuid4().hex}.tmp")
    _plain(pending, missing=True)
    try:
        stream = pending.open("xb")
    except FileExistsError as error:
        raise InstallError(f"Release scratch path already exists: {pending}", status="foreign") from error
    owned = None
    try:
        with stream:
            info = os.fstat(stream.fileno())
            owned = (info.st_dev, info.st_ino)
            stream.write(data)
            if os.name != "nt" and metadata is not None:
                os.fchmod(stream.fileno(), metadata["mode"])
            stream.flush()
            os.fsync(stream.fileno())
        staged, staged_metadata = _read_target(pending)
        if os.name == "nt" and copy_windows_permissions and staged_metadata != metadata:
            _copy_windows_permissions(path, pending)
            staged, staged_metadata = _read_target(pending)
        if staged != data or metadata is not None and staged_metadata != metadata:
            raise InstallError(f"Cannot reproduce target bytes or permissions at {path}")
        yield pending, staged_metadata
    finally:
        leftover = _plain(pending, missing=True)
        if leftover is not None and (leftover.st_dev, leftover.st_ino) == owned:
            pending.unlink()


def _replace(path, record, data, metadata, expected):
    if data is None:
        # Rename first so a Windows deletion also has a write-through namespace
        # step. Remove only the file we just moved.
        pending = path.with_name(f".hcv-release-{uuid4().hex}.tmp")
        if _plain(pending, missing=True) is not None:
            raise InstallError(f"Release scratch path already exists: {pending}", status="foreign")
        _live(path, record, metadata, version=expected)
        info = _plain(path)
        _move(path, pending, replace=False)
        if _signature(_plain(pending)) != _signature(info):
            raise InstallError(f"Release scratch file changed: {pending}", status="foreign")
        pending.unlink()
        _sync_directory(path.parent)
        return
    replace_existing = record["before"] is not None and record["after"] is not None
    with _stage(path, data, metadata, copy_windows_permissions=replace_existing) as (pending, _):
        current, _ = _live(path, record, metadata, version=expected)
        _move(pending, path, replace=current is not None)


def _switch(state, backups, version):
    live = _check_set(state, backups, version="before" if version == "new" else None)
    desired = "after" if version == "new" else "before"
    expected = "before" if version == "new" else "after"
    for path, record, (old, new, metadata), (current, _) in zip(
        _targets(state), state["changes"], backups, live
    ):
        if _digest(current) != record[desired]:
            _replace(path, record, new if version == "new" else old, metadata, expected)
    _check_set(state, backups, version=desired)


def _probe(state, maintenance, backups, version):
    expected = "after" if version == "new" else "before"
    _check_set(state, backups, version=expected)
    receipt = _call(maintenance, "probe", state["intent_id"], version, _expected(state, version))
    _check_set(state, backups, version=expected)
    return _receipt(state, version, receipt)


def _outcome(state):
    return {"status": state["phase"], "intent_id": state["intent_id"], "receipt": state["receipt"]}


def _close(db, state, maintenance, version):
    with db:
        state["phase"] = "closing_new" if version == "new" else "closing_old"
        _save(db, state)
    _call(maintenance, "leave", state["intent_id"])
    with db:
        state["phase"] = "committed" if version == "new" else "rolled_back"
        _save(db, state)
        db.execute("DELETE FROM files")
    return _outcome(state)


def _recover(db, state, maintenance, committed):
    intent_id, phase = state["intent_id"], state["phase"]
    if phase in _TERMINAL or phase in {"closing_old", "closing_new"}:
        expected = phase in {"closing_new", "committed"}
        if committed != expected:
            raise InstallError("Registry and release journal disagree", status="unknown")
        if phase in _TERMINAL:
            return _outcome(state)
        return _close(db, state, maintenance, "new" if committed else "old")
    _call(maintenance, "validate_targets", intent_id, _targets(state))
    if committed:
        if phase != "probed":
            raise InstallError("Committed intent has no recorded new probe", status="unknown")
        _check_set(state, _backups(db, state), version="after")
        return _close(db, state, maintenance, "new")
    _call(maintenance, "enter", intent_id)
    if phase == "starting":
        backups = None
    else:
        backups = _backups(db, state)
        _switch(state, backups, "old")
    state["receipt"] = _probe(state, maintenance, backups, "old")
    return _close(db, state, maintenance, "old")


def _attempt(db, state, payloads, maintenance, commit, is_committed):
    intent_id = state["intent_id"]
    _call(maintenance, "validate_targets", intent_id, _targets(state))
    with db:
        db.execute("DELETE FROM files")
        _save(db, state)
    _call(maintenance, "enter", intent_id)
    originals = _check_set(state, version="before")
    _call(maintenance, "verify_base", intent_id, _expected(state, "old"))
    snapshots = []
    for path, record, (old, metadata), new in zip(_targets(state), state["changes"], originals, payloads):
        if record["before"] != record["after"]:
            # Prove restorability even for deletions before changing any target.
            # For a creation also remember the exact permissions of its new file.
            # A deletion still has to be restorable without its original
            # file to copy permissions from.
            replace_existing = old is not None and new is not None
            with _stage(path, b"", metadata, copy_windows_permissions=replace_existing) as (_, verified_metadata):
                metadata = verified_metadata
        snapshots.append((old, new, json.dumps(metadata)))
    with db:
        db.executemany("INSERT INTO files VALUES (?, ?, ?, ?)", (
            (index, old, new, metadata)
            for index, (old, new, metadata) in enumerate(snapshots)
        ))
        state["phase"] = "writing"
        _save(db, state)
    backups = _backups(db, state)
    failure = None
    try:
        _switch(state, backups, "new")
        state["receipt"] = _probe(state, maintenance, backups, "new")
    except (InstallError, OSError) as error:
        failure = error
    if failure is None:
        with db:
            state["phase"] = "probed"
            _save(db, state)
        try:
            commit(_receipt(state, "new", state["receipt"]))
        except Exception as error:
            failure = error
    if isinstance(failure, InstallError) and failure.status in {"foreign", "unknown"} and state["phase"] == "writing":
        raise failure
    committed = _known_registry(is_committed, intent_id)
    outcome = _recover(db, state, maintenance, committed)
    if outcome["status"] == "rolled_back":
        reason = str(failure) if failure is not None else "registry did not confirm commit"
        raise InstallError(f"Previous release restored and loaded: {reason}", status="rolled_back") from failure
    return outcome


def apply_release(journal_dir: Path, intent_id: str, changes: list[dict], maintenance,
                  commit, is_committed) -> dict:
    """Apply a frozen plan or resume its intent after a process interruption."""
    _adapter(maintenance)
    _id(intent_id)
    records, payloads = _normalize(changes)
    _plan(journal_dir, records)
    try:
        with _journal(journal_dir, create=True) as db:
            state = _load(db, journal_dir)
            if state is not None and state["phase"] not in _TERMINAL and state["intent_id"] != intent_id:
                raise InstallError(f"Recover pending intent first: {state['intent_id']}")
            if state is not None and state["intent_id"] == intent_id and state["changes"] != records:
                raise InstallError("Different file plan for the same release intent")
            committed = _known_registry(is_committed, intent_id)
            if state is not None and state["intent_id"] == intent_id:
                outcome = _recover(db, state, maintenance, committed)
                if outcome["status"] == "committed":
                    return outcome
            elif committed:
                return {"status": "committed", "intent_id": intent_id, "receipt": None}
            state = {"schema": 1, "intent_id": intent_id, "phase": "starting",
                     "changes": records, "receipt": None}
            return _attempt(db, state, payloads, maintenance, commit, is_committed)
    except (OSError, sqlite3.Error) as error:
        raise InstallError(f"Release state unavailable: {error}", status="unknown") from error


def recover_release(journal_dir: Path, maintenance, is_committed, *, request=None) -> dict:
    """Resolve an interrupted intent using the durable journal and registry."""
    try:
        with _journal(journal_dir, create=False) as db:
            state = None if db is None else _load(db, journal_dir)
            if state is None:
                return {"status": "idle", "intent_id": None, "receipt": None}
            if request is not None and state["intent_id"] != request:
                status = "idle" if state["phase"] in _TERMINAL else "other_request_active"
                return {"status": status, "intent_id": None, "receipt": None}
            committed = _known_registry(is_committed, state["intent_id"])
            if state["phase"] in _TERMINAL:
                return _recover(db, state, maintenance, committed)
            _adapter(maintenance)
            return {**_recover(db, state, maintenance, committed), "recovered": True}
    except (OSError, sqlite3.Error) as error:
        raise InstallError(f"Release state unavailable: {error}", status="unknown") from error

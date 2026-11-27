"""Verified local edits for saved cards and the current native response."""
from __future__ import annotations

import difflib
import hashlib
import json
import os
import stat
from io import StringIO
from pathlib import Path

_MAX_BYTES = 1024 * 1024
_MAX_DIFF_WORK = 4_000_000
_MAX_TURN_FILES = 128
_MAX_TURN_BYTES = 4 * 1024 * 1024
_MAX_WIRE_BYTES = 512 * 1024


class CapturedResult(str):
    pass


def _read(path):
    target = Path(path)
    for ancestor in (target, *target.parents):
        if ancestor.is_symlink() or getattr(ancestor, "is_junction", lambda: False)():
            raise ValueError("Redirected snapshot path")
    try:
        info = target.lstat()
    except FileNotFoundError:
        return None
    if not stat.S_ISREG(info.st_mode) or info.st_size > _MAX_BYTES:
        raise ValueError("Nonregular or oversized snapshot")
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NONBLOCK", 0) | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(str(target), flags)
    try:
        opened = os.fstat(fd)
        if not stat.S_ISREG(opened.st_mode) or (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
            raise ValueError("Snapshot changed before open")
        data = bytearray()
        while len(data) <= _MAX_BYTES:
            part = os.read(fd, min(65536, _MAX_BYTES + 1 - len(data)))
            if not part:
                break
            data.extend(part)
        closed = os.fstat(fd)
        if len(data) > _MAX_BYTES or (opened.st_size, opened.st_mtime_ns) != (closed.st_size, closed.st_mtime_ns):
            raise ValueError("Snapshot changed during read")
        return bytes(data)
    finally:
        os.close(fd)


def capture_before(path, task_id, file_ops):
    try:
        from tools.file_tools import _file_ops_uses_host_paths
        from tools.file_tools_paths import _authoritative_workspace_root
        if not path or not _file_ops_uses_host_paths(file_ops) or not Path(path).is_absolute():
            return None
        old = _read(path)
        cwd = _authoritative_workspace_root(task_id)
        return {"path": str(path), "before": old,
                "cwd": str(cwd) if cwd and Path(cwd).is_absolute() else None}
    except Exception:
        return None


def _file_path(path):
    if not isinstance(path, str) or not Path(path).is_absolute() or any(c in path for c in "\r\n\t\0"):
        raise ValueError("Unproven file path")
    return os.path.normpath(path)


def _hash(data):
    return hashlib.sha256(data).hexdigest() if data is not None else ""


def _body(path, before, after):
    old_lines = StringIO((before or b"").decode("utf-8")).readlines()
    new_lines = StringIO((after or b"").decode("utf-8")).readlines()
    if len(old_lines) * len(new_lines) > _MAX_DIFF_WORK:
        raise ValueError("Diff work limit exceeded")
    lines = difflib.unified_diff(old_lines, new_lines,
                                fromfile="/dev/null" if before is None else "a/" + path,
                                tofile="/dev/null" if after is None else "b/" + path)
    return "".join(line if line.endswith("\n") else line + "\n\\ No newline at end of file\n" for line in lines)


def capture_write(before, result):
    """The saved per-operation diff and verified bytes for the live turn."""
    try:
        if before is None:
            return None, None
        path, old = _file_path(before["path"]), before["before"]
        after = _read(path)
        if old == after:
            return None, ()
        expected = getattr(result, "_content_sha256", None)
        if (after is None or getattr(result, "error", None)
                or getattr(result, "verified", None) is not True or not expected or _hash(after) != expected):
            return None, None
        display = path.replace("\\", "/")
        edits = ((path, old, after),)
        try:
            diff = _body(display, old, after)
        except (UnicodeError, ValueError):
            return None, edits
        return {"version": 1, "cwd": before["cwd"], "cwdBackend": "local", "diff": diff,
                "files": [{"path": display, "operation": "add" if old is None else "update",
                           "beforeSha256": _hash(old) or None, "afterSha256": expected}]}, edits
    except (OSError, ValueError):
        return None, None


def capture_after(before, result):
    return capture_write(before, result)[0]


def capture_patch_before(paths, file_ops):
    try:
        from tools.file_tools import _file_ops_uses_host_paths
        if not _file_ops_uses_host_paths(file_ops):
            return None
        unique = {_file_path(path) for path in paths}
        if len(unique) > _MAX_TURN_FILES:
            return None
        before = {}
        size = 0
        for path in sorted(unique):
            data = _read(path)
            size += len(data or b"")
            if size > _MAX_TURN_BYTES:
                return None
            before[path] = data
        return before
    except (OSError, ValueError):
        return None


def capture_patch(before, result):
    """Validate the actual writes, including successful parts of a partial patch."""
    if before is None:
        return None
    try:
        expected = {path: _hash(data) for path, data in before.items()}
        for path, read_hash, wrote_hash in result._writes:
            path = _file_path(path)
            if path not in expected or expected[path] != read_hash or not wrote_hash:
                return None
            expected[path] = wrote_hash
        for path in result.files_deleted:
            path = _file_path(path)
            if not expected.get(path):
                return None
            expected[path] = ""
        edits = []
        size = 0
        for path, old in before.items():
            after = _read(path)
            if _hash(after) != expected[path]:
                return None
            if old != after:
                size += len(old or b"") + len(after or b"")
                if size > _MAX_TURN_BYTES:
                    return None
                edits.append((path, old, after))
        return tuple(edits)
    except (OSError, ValueError):
        return None


def decorate_result(value, snapshot=None, edits=None):
    if not snapshot and edits is None:
        return value
    result = CapturedResult(value)
    result._hcv_file_changes = snapshot
    result._hcv_native_edits = edits
    return result


def attach(message, result):
    snapshot = getattr(result, "_hcv_file_changes", None)
    if not isinstance(snapshot, dict):
        return
    metadata = message.get("display_metadata")
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except ValueError:
            metadata = {}
    if not isinstance(metadata, dict):
        metadata = {}
    message["display_metadata"] = {**metadata, "hcv_file_changes": snapshot}


class _TurnEdits:
    def __init__(self, identity):
        self.identity = identity
        self.files = {}
        self.sections = {}
        self.revision = 0
        self.last = ""
        self.incomplete = False

    def add(self, edits):
        if self.incomplete:
            return ""
        if edits is None:
            return self.clear()
        files = self.files.copy()
        sections = self.sections.copy()
        try:
            for path, before, after in edits:
                original, previous = files.get(path, (before, before))
                if before != previous:
                    return self.clear()
                files[path] = (original, after)
                sections.pop(path, None)
                if original == after:
                    continue
                if b"\0" in (original or b"") or b"\0" in (after or b""):
                    return self.clear()
                name = path.replace("\\", "/")
                body = _body(name, original, after)
                if not body:
                    mode = "new" if original is None else "deleted"
                    body = f"{mode} file mode 100644\n"
                sections[path] = f"diff --git a/{name} b/{name}\n" + body
            if (len(files) > _MAX_TURN_FILES
                    or sum(len(old or b"") + len(new or b"") for old, new in files.values()) > _MAX_TURN_BYTES):
                return self.clear()
            diff = "".join(sections[path] for path in sorted(sections))
            if not _bounded_wire_diff(diff):
                return self.clear()
        except (UnicodeError, ValueError):
            return self.clear()
        self.files, self.sections = files, sections
        return diff

    def clear(self):
        self.incomplete = True
        self.files.clear()
        self.sections.clear()
        return ""


def _identity(value):
    return isinstance(value, str) and 0 < len(value) <= 512


def _bounded_wire_diff(diff):
    return (isinstance(diff, str) and len(diff) <= _MAX_WIRE_BYTES and "\0" not in diff
            and len(json.dumps(diff, ensure_ascii=True)) <= _MAX_WIRE_BYTES)


def valid_turn_diff(value):
    return (isinstance(value, dict) and set(value) == {
                "version", "source", "agentSessionId", "hermesTurnId", "revision", "diff"}
            and value["version"] == 2 and value["source"] == "hermes_native"
            and _identity(value["agentSessionId"]) and _identity(value["hermesTurnId"])
            and type(value["revision"]) is int and 0 < value["revision"] < 2**53
            and _bounded_wire_diff(value["diff"]))


def report_turn_diff(agent, name, result):
    # The executor calls this only after the owning tool result is durable.
    callback = getattr(agent, "tool_progress_callback", None)
    if name not in ("patch", "write_file") or not callable(callback):
        return
    session_id = getattr(agent, "session_id", None)
    turn_id = getattr(agent, "_current_turn_id", None)
    if not _identity(session_id) or not _identity(turn_id) or getattr(agent, "api_mode", None) == "codex_app_server":
        return
    identity = (session_id, turn_id)
    state = getattr(agent, "_hcv_native_turn_edits", None)
    if state is None or state.identity != identity:
        agent._hcv_native_turn_edits = state = _TurnEdits(identity)
    diff = state.add(getattr(result, "_hcv_native_edits", None))
    if diff != state.last:
        state.last = diff
        state.revision += 1
        callback("hcv.turn_diff", None, None, None, hcv_diff={
            "version": 2, "source": "hermes_native", "agentSessionId": session_id,
            "hermesTurnId": turn_id, "revision": state.revision, "diff": diff,
        })

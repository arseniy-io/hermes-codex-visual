"""Display-only before/after capture for native local write_file under its lock.

The JSON string sent to the model is byte-for-byte unchanged. The object carries
the private snapshot across the worker result boundary; only tool_executor moves
that attribute to the native display_metadata sidecar before persistence.
"""
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


def capture_after(before, result):
    try:
        if before is None or getattr(result, "error", None) or getattr(result, "verified", None) is not True:
            return None
        after = _read(before["path"])
        expected = getattr(result, "_content_sha256", None)
        if after is None or not expected or hashlib.sha256(after).hexdigest() != expected:
            return None
        old = before["before"]
        if old == after:
            return None
        old_lines = StringIO((old or b"").decode("utf-8")).readlines()
        new_lines = StringIO(after.decode("utf-8")).readlines()
        if len(old_lines) * len(new_lines) > _MAX_DIFF_WORK:
            return None
        path = before["path"].replace("\\", "/")
        lines = list(difflib.unified_diff(old_lines, new_lines,
                         fromfile="/dev/null" if old is None else "a/" + path,
                         tofile="b/" + path))
        # difflib leaves an unterminated content line unterminated. Git's exact
        # patch format needs the explicit marker, including for UTF-8/BOM/CRLF.
        diff = "".join(line if line.endswith("\n") else line + "\n\\ No newline at end of file\n" for line in lines)
        return {"version": 1, "cwd": before["cwd"], "cwdBackend": "local", "diff": diff,
                "files": [{"path": path, "operation": "add" if old is None else "update",
                           "beforeSha256": hashlib.sha256(old).hexdigest() if old is not None else None,
                           "afterSha256": expected}]}
    except Exception:
        return None


def decorate_result(value, snapshot):
    if not snapshot:
        return value
    result = CapturedResult(value)
    result._hcv_file_changes = snapshot
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

"""Prepare a protected edit for review without writing any user files.

The caller must run the existing path guards before invoking this module and
must recheck ``snapshots_match`` under Hermes' file locks after approval.
"""

from __future__ import annotations

import difflib
import hashlib
from dataclasses import dataclass

from contextlib import ExitStack

from agent.redact import redact_sensitive_text, sanitize_command_for_display
from tools.file_operations_common import ReadResult, WriteResult, _detect_line_ending, _normalize_line_endings
from tools.fuzzy_match import fuzzy_find_and_replace
from tools.patch_parser import _overlay_key, apply_v4a_operations, parse_v4a_patch

MAX_REVIEW_CHARS = 1_000_000
MAX_FILES = 100


class ReviewUnavailable(Exception):
    """The exact proposed operation cannot be safely reviewed."""


@dataclass(frozen=True)
class Snapshot:
    path: str
    exists: bool
    content: str
    digest: str


def _snapshot(source, path: str) -> Snapshot:
    result = source.read_file_raw(path)
    if result.error:
        if result.not_found:
            return Snapshot(path, False, "", "")
        raise ReviewUnavailable("Could not read one of the files for review.")
    if result.truncated or result.is_binary or not isinstance(result.content, str):
        raise ReviewUnavailable("One of the files cannot be shown in full.")
    # The backend supplies the hash of the exact disk bytes, including a BOM.
    if not result._content_sha256:
        raise ReviewUnavailable("The file backend cannot confirm the original file contents.")
    if len(result.content) > MAX_REVIEW_CHARS:
        raise ReviewUnavailable("One of the files is too large to review in full.")
    return Snapshot(path, True, result.content, result._content_sha256)


class MemoryFiles:
    """The same V4A parser operates on an isolated in-memory file system."""

    def __init__(self, source):
        self.source = source
        self.env = getattr(source, "env", None)
        self.cwd = getattr(source, "cwd", None)
        self.originals = {}
        self.current = {}

    def _expand_path(self, path):
        expand = getattr(self.source, "_expand_path", None)
        return expand(path) if callable(expand) else path

    def _key(self, path):
        return _overlay_key(path, self.source)

    def _load(self, path):
        key = self._key(path)
        if key not in self.originals:
            if len(self.originals) >= MAX_FILES:
                raise ReviewUnavailable("Too many files to review at once.")
            snapshot = _snapshot(self.source, path)
            self.originals[key] = snapshot
            self.current[key] = snapshot.content if snapshot.exists else None
        return key

    def read_file_raw(self, path):
        key = self._load(path)
        content = self.current[key]
        if content is None:
            return ReadResult(error="File not found", not_found=True)
        return ReadResult(content=content, _content_sha256=self.originals[key].digest)

    def write_file(self, path, content, pre_content=None):
        key = self._load(path)
        previous = self.current[key]
        if previous is not None and _detect_line_ending(previous) == "\r\n":
            content = _normalize_line_endings(content, "\r\n")
        self.current[key] = content
        return WriteResult(_content_sha256=hashlib.sha256(content.encode("utf-8", "surrogateescape")).hexdigest())

    def delete_file(self, path):
        self.current[self._load(path)] = None
        return WriteResult()

    def move_file(self, src, dst):
        source, target = self._load(src), self._load(dst)
        self.current[target], self.current[source] = self.current[source], None
        return WriteResult()


def _safe(text: str) -> str:
    return redact_sensitive_text(text, force=True, redact_url_credentials=True)


def _diff(path: str, before: str | None, after: str | None) -> str:
    old = [] if before is None else before.splitlines(keepends=True)
    new = [] if after is None else after.splitlines(keepends=True)
    lines = difflib.unified_diff(old, new,
        fromfile="/dev/null" if before is None else "a/" + path,
        tofile="/dev/null" if after is None else "b/" + path)
    # Without this marker difflib joins a removed and added final line together.
    return "".join(line if line.endswith("\n") else line + "\n\\ No newline at end of file\n"
                   for line in lines).replace("\r\n", "\n")


def make_review(source, *, mode, path=None, content=None, old_string=None,
                new_string=None, replace_all=False, patch=None, reason=None):
    """Return (safe public review, private originals); never mutate ``source``."""
    if not isinstance(reason, str) or not reason.strip():
        raise ReviewUnavailable("Provide approval_reason explaining why these changes are needed, then retry.")
    reason = reason.strip()
    files = MemoryFiles(source)
    if mode == "write":
        if not isinstance(path, str) or not isinstance(content, str):
            raise ReviewUnavailable("The proposed file write is incomplete.")
        files.write_file(path, content)
    elif mode == "replace":
        if not isinstance(path, str) or not isinstance(old_string, str) or not isinstance(new_string, str):
            raise ReviewUnavailable("The proposed replacement is incomplete.")
        existing = files.read_file_raw(path)
        if existing.error:
            raise ReviewUnavailable("The file for replacement cannot be read.")
        new, count, _strategy, error = fuzzy_find_and_replace(existing.content, old_string, new_string, replace_all)
        if error or not count:
            raise ReviewUnavailable("The replacement could not be matched exactly enough for review.")
        ending = _detect_line_ending(existing.content)
        if ending:
            new = _normalize_line_endings(new, ending)
        files.write_file(path, new)
    elif mode == "patch":
        if not isinstance(patch, str):
            raise ReviewUnavailable("The proposed patch is incomplete.")
        operations, error = parse_v4a_patch(patch)
        if error or not operations:
            raise ReviewUnavailable("The proposed patch cannot be parsed.")
        result = apply_v4a_operations(operations, files)
        if not result.success:
            raise ReviewUnavailable("The proposed patch cannot be applied to the current files.")
    else:
        raise ReviewUnavailable("This kind of file operation cannot be reviewed.")

    changes = []
    total = len(reason)
    for key, original in files.originals.items():
        before = original.content if original.exists else None
        after = files.current[key]
        diff = _diff(original.path, before, after)
        total += len(original.path) + len(diff)
        changes.append({"path": original.path, "diff": diff,
                        "operation": "create" if before is None else "delete" if after is None else "edit"})
    if not changes or total > MAX_REVIEW_CHARS:
        raise ReviewUnavailable("The full change is too large to show; split it into smaller edits.")
    # Never send raw secrets through gateway events. Refuse instead of silently
    # presenting a redacted excerpt as the full change.
    values = [reason] + [s for item in changes for s in (item["path"], item["diff"])]
    if any(_safe(value) != value for value in values):
        raise ReviewUnavailable("The change contains sensitive data and cannot be shown in a complete approval card.")
    for item in changes:
        item["path"] = sanitize_command_for_display(item["path"])
        item["diff"] = sanitize_command_for_display(item["diff"])
    return {"version": 1, "reason": sanitize_command_for_display(reason, prose=True),
            "files": changes, "complete": True}, list(files.originals.values())


def snapshots_match(source, snapshots) -> bool:
    """False on any changed file, missing file, unreadable file or backend error."""
    try:
        return all((current := _snapshot(source, old.path)).exists == old.exists and
                   current.digest == old.digest for old in snapshots)
    except Exception:
        return False


def prepare_protected_review(task_id, paths, entry_paths, state, **change):
    """Called only after the host's sensitive-path checks and only for a prompt."""
    from tools import file_tools as ft
    source = ft._get_file_ops(task_id)
    if not ft._file_ops_uses_host_paths(source):
        raise ReviewUnavailable("This file backend cannot safely prepare a complete preview.")
    resolved = {p: ft._resolve_or_none(p, task_id) for p in paths}
    entries = {p: ft._resolve_or_none(p, task_id, entry=True) for p in entry_paths}
    if any(not p for p in (*resolved.values(), *entries.values())):
        raise ReviewUnavailable("The paths could not be resolved for review.")
    # Moving or deleting a symlink acts on the link, whereas a text read follows
    # it. Refuse that case instead of showing a misleading delete or move.
    from pathlib import Path
    if any(Path(path).is_symlink() for path in entries.values()):
        raise ReviewUnavailable("A moved or deleted file is a symbolic link and needs separate review.")
    lock_paths = sorted(set((*resolved.values(), *entries.values())))
    with ExitStack() as locks:
        for path in lock_paths:
            locks.enter_context(ft.file_state.lock_path(path))
        if change.get("mode") == "patch":
            change["patch"] = ft._rewrite_v4a_patch_paths_for_host(
                change.get("patch") or "", resolved, entries, source, task_id)
        elif change.get("path"):
            change["path"] = resolved.get(change["path"]) or change["path"]
        review, originals = make_review(source, **change)
    state.update(resolved=resolved, entries=entries, originals=originals)
    return review


def protected_review_still_matches(state, source, resolved, entries) -> bool:
    if not state:
        # Non-Desktop / CLI calls retain the existing protected-file gate.
        return True
    from pathlib import Path
    return (state.get("resolved") == resolved and state.get("entries") == entries and
            not any(Path(path).is_symlink() for path in entries.values()) and
            snapshots_match(source, state.get("originals", [])))

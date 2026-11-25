"""Saved turn patches and the same reversible patch action as Codex TurnDiffContent.

Mounted by the profile-scoped dashboard router. UI supplies identities, never
patches, paths or a working directory. History reads do not inspect current Git
changes. Applying only touches paths present in the selected saved patches.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import subprocess
from itertools import product
from contextlib import closing
from io import StringIO
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

router = APIRouter()
_LIMIT = 8 * 1024 * 1024
_TOOLS = {"write_file", "patch", "apply_patch", "edit_file"}
_HUNK = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


def _object(value):
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, ValueError):
            return {}
    return value if isinstance(value, dict) else {}


def _home():
    from hermes_constants import get_hermes_home
    return Path(get_hermes_home()).resolve()


def _scope():
    return hashlib.sha256(os.path.normcase(str(_home())).encode()).hexdigest()


def _digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                    separators=(",", ":")).encode()).hexdigest()


def _cwd(row, session):
    meta = _object(row.get("display_metadata"))
    timeline = _object(meta.get("hcv_timeline"))
    return _local_cwd(timeline)


def _local_cwd(metadata):
    cwd = metadata.get("cwd")
    if (type(metadata.get("version")) is not int or metadata.get("version") != 1
            or metadata.get("cwdBackend") != "local" or not isinstance(cwd, str)
            or "\x00" in cwd or not Path(cwd).is_absolute()):
        return None
    # Preserve the recorded lexical path until the ancestor/link guard runs.
    # Resolving first would silently retarget a captured cwd after a junction change.
    return str(Path(cwd))


def _plain_path(header, prefix):
    path = header.split("\t", 1)[0]
    # Git C-quoted paths need a dedicated decoder. Do not guess their spelling.
    if path.startswith('"') or "\x00" in path:
        raise ValueError("Quoted or invalid patch path")
    if path == "/dev/null":
        return path
    return path[len(prefix):] if path.startswith(prefix) else path


def patch_files(text):
    """Parse full unified-file sections, with a hunk-count guard around headers.

    A removed line beginning '--- ' inside a hunk remains file content. Sum
    returned patch hunks as Codex eu/em, preserving first-touched file order.
    """
    if not isinstance(text, str) or not text.strip() or len(text.encode()) > _LIMIT:
        return []
    files, current, old_left, new_left = [], None, 0, 0
    for line in StringIO(text):
        raw = line.rstrip("\r\n")
        hunk = _HUNK.match(raw)
        if hunk and current and current.get("new"):
            old_left, new_left = int(hunk[2] or 1), int(hunk[4] or 1)
            current["hunks"] += 1
            current["body"].append(line)
        elif old_left or new_left:
            if current is None:
                raise ValueError("Hunk without file")
            current["body"].append(line)
            if raw.startswith("+") and new_left:
                current["added"] += 1
                new_left -= 1
            elif raw.startswith("-") and old_left:
                current["removed"] += 1
                old_left -= 1
            elif raw.startswith(" ") and old_left and new_left:
                old_left -= 1
                new_left -= 1
            elif not raw.startswith("\\ No newline at end of file"):
                raise ValueError("Malformed patch hunk")
        elif raw.startswith("--- "):
            current = {"old": _plain_path(raw[4:], "a/"), "new": None,
                       "added": 0, "removed": 0, "hunks": 0, "body": []}
            files.append(current)
        elif raw.startswith("+++ ") and current and current["new"] is None:
            current["new"] = _plain_path(raw[4:], "b/")
        elif current and raw.startswith("\\ No newline at end of file"):
            current["body"].append(line)
    if old_left or new_left or any(not f["new"] or not f["hunks"] for f in files):
        raise ValueError("Incomplete patch")
    return files


def _git(cwd, *args, input=None, read_only=False):
    env = dict(os.environ)
    for key in list(env):
        if key in {"GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR",
                   "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES"} or key.startswith("GIT_CONFIG"):
            env.pop(key, None)
    if read_only:
        env.update(GIT_OPTIONAL_LOCKS="0", GIT_NO_LAZY_FETCH="1", GIT_TERMINAL_PROMPT="0",
                   GIT_LITERAL_PATHSPECS="0", GIT_GLOB_PATHSPECS="0", GIT_NOGLOB_PATHSPECS="0",
                   GIT_ICASE_PATHSPECS="0")
        args = ("-c", "core.fsmonitor=false", *args)
    # No shell, no client-controlled executable, no hooks or external diff.
    config = ["-c", "core.hooksPath="]
    if not read_only:
        config += ["-c", "core.autocrlf=false"]
    result = subprocess.run(["git", *config, "-C", str(cwd), *args],
                            input=input.encode("utf-8") if input is not None else None,
                            capture_output=True, timeout=20, env=env)
    # TextIOWrapper on Windows rewrites LF to CRLF on stdin. Patch content must
    # preserve actual LF/CRLF/no-newline bytes, so exchange binary pipe data.
    result.stdout = result.stdout.decode("utf-8", errors="replace")
    result.stderr = result.stderr.decode("utf-8", errors="replace")
    return result


def _path_under(path, root):
    target = Path(path)
    # Lexical '..' and links are refused instead of normalized into permission.
    if ".." in target.parts:
        raise ValueError("Parent path in saved patch")
    target = target if target.is_absolute() else root / target
    try:
        rel = target.relative_to(root)
    except ValueError:
        raise ValueError("Saved patch leaves owning repository") from None
    if not rel.parts or rel.parts[0].lower() == ".git":
        raise ValueError("Invalid patch target")
    cursor = root
    for part in rel.parts:
        cursor /= part
        if cursor.is_symlink() or getattr(cursor, "is_junction", lambda: False)():
            raise ValueError("Link in saved patch target")
    return rel.as_posix()


def _unredirected_directory(value):
    path = Path(value)
    if not path.is_absolute() or ".." in path.parts:
        raise ValueError("Relative or traversing saved cwd")
    for entry in (path, *path.parents):
        if entry.is_symlink() or getattr(entry, "is_junction", lambda: False)():
            raise ValueError("Redirected saved cwd")
    return path


def normalized_batch(text, cwd):
    files = patch_files(text)
    if not files:
        return None
    # A saved absolute spelling alone does not prove the host namespace. An
    # SSH/container tool can return the same spelling as a host file. Legacy
    # patches without an occurrence-time local cwd remain read-only history.
    if not cwd:
        return {"files": files, "cwd": None, "patch": None}
    _unredirected_directory(cwd)
    probe = _git(cwd, "rev-parse", "--show-toplevel")
    if probe.returncode:
        return {"files": files, "cwd": None, "patch": None}
    root = Path(probe.stdout.strip()).resolve()
    origin = Path(cwd).resolve()
    output = []
    for f in files:
        old = f["old"] if f["old"] == "/dev/null" else _path_under(
            Path(f["old"]) if Path(f["old"]).is_absolute() else origin / f["old"], root)
        new = f["new"] if f["new"] == "/dev/null" else _path_under(
            Path(f["new"]) if Path(f["new"]).is_absolute() else origin / f["new"], root)
        target = new if new != "/dev/null" else old
        f["path"] = target
        # Pure unified patches do not express a rename faithfully. Keep their
        # saved history visible, but do not offer a different mutation.
        if old != "/dev/null" and new != "/dev/null" and old != new:
            return {"files": files, "cwd": str(root), "patch": None}
        output.extend([f"diff --git a/{target} b/{target}\n",
                       f"--- {'/dev/null' if old == '/dev/null' else 'a/' + old}\n",
                       f"+++ {'/dev/null' if new == '/dev/null' else 'b/' + new}\n", *f["body"]])
    return {"files": files, "cwd": str(root), "patch": "".join(output)}


def _is_human(row):
    from agent.compaction_display import project_compaction_message_for_display
    from agent.context_compressor import user_originated_turn_view
    projected = project_compaction_message_for_display(row)
    return projected is not None and user_originated_turn_view(projected) is not None


def collect_turns(rows, session):
    turns, current, pending, seen_results = [], None, {}, set()
    for row in rows:
        role = row.get("role")
        if role == "user" and _is_human(row):
            current = {"id": str(row.get("message_uid") or row.get("id") or ""),
                       "userRowId": row.get("row_id") or row.get("id"),
                       "userMessageUid": row.get("message_uid"), "batches": []}
            if not current["id"]:
                current = None
            else:
                turns.append(current)
            pending = {}
        elif current and role == "assistant":
            for call in row.get("tool_calls") or []:
                fn = call.get("function") or call
                pending.setdefault(call.get("id"), []).append({"name": fn.get("name"),
                    "args": _object(fn.get("arguments")), "cwd": _cwd(row, session)})
        elif current and role == "tool":
            uid = row.get("_tool_call_uid") or row.get("tool_call_uid") or row.get("message_uid") or row.get("id")
            if uid is not None and uid in seen_results:
                continue
            if uid is not None:
                seen_results.add(uid)
            queue = pending.get(row.get("tool_call_id")) or []
            call = queue.pop(0) if queue else {}
            name = call.get("name") or row.get("name") or row.get("tool_name")
            if name not in _TOOLS:
                continue
            result = _object(row.get("content"))
            if result.get("success") is False or result.get("error") or row.get("is_error"):
                continue
            captured = _object(_object(row.get("display_metadata")).get("hcv_file_changes"))
            patch = captured.get("diff") or result.get("diff") or result.get("inline_diff")
            if not isinstance(patch, str) or not patch:
                continue
            try:
                captured_cwd = _local_cwd(captured)
                # Only this actual tool occurrence proves its file namespace.
                # An assistant's earlier cwd can precede a backend switch.
                batch = normalized_batch(patch, captured_cwd or _cwd(row, session))
            except (ValueError, OSError, subprocess.SubprocessError):
                # Keep a valid saved diff visible when its original Git
                # root cannot be proved. That patch must not be applied.
                try:
                    batch = normalized_batch(patch, None)
                except ValueError:
                    continue
            if batch:
                batch["sourceRowId"] = row.get("message_uid") or row.get("id")
                batch["savedPatch"] = patch
                current["batches"].append(batch)
    return [turn for turn in turns if turn["batches"]]


def _read_turns(session_id, parent_id):
    from hermes_state import SessionDB
    if any(not isinstance(value, str) or not value or len(value) > 300 for value in (session_id, parent_id)):
        raise HTTPException(422, "Invalid session")
    with SessionDB(_home() / "state.db", read_only=True) as db:
        canonical = db.resolve_resume_session_id(session_id)
        session = db.get_session(canonical) if canonical else None
        if not session:
            raise HTTPException(404, "Session unavailable")
        if db.get_session(parent_id) is None:
            raise HTTPException(404, "Parent session unavailable")
        parents = set(db._resume_lineage_ids(parent_id))
        current, visited = session, set()
        while current and current.get("id") not in parents and len(visited) < 64:
            sid = current.get("id")
            if sid in visited:
                break
            visited.add(sid)
            parent = current.get("parent_session_id") or _object(current.get("model_config")).get("_delegate_from")
            current = db.get_session(parent) if parent else None
        if not current or current.get("id") not in parents:
            raise HTTPException(404, "Session ancestry unavailable")
        rows, offset, size = [], 0, 0
        while offset < 10000:
            page = db.get_messages(canonical, include_compacted=True, include_ancestors=True, latest=False, limit=200, offset=offset)
            size += sum(len(str(r.get("content", ""))) for r in page)
            if size > _LIMIT * 4:
                raise HTTPException(413, "Saved history exceeds patch-read limit")
            rows.extend(page)
            offset += len(page)
            if len(page) < 200:
                break
        else:
            raise HTTPException(413, "Saved history exceeds patch-read limit")
        turns = collect_turns(rows, session)
        owners = (db._resume_lineage_ids(canonical),
                  db._resume_lineage_ids(db.resolve_resume_session_id(parent_id)))
        for turn in turns:
            turn["owners"] = owners
        return turns


def _owners(turn, session_id, parent_id):
    return turn.get("owners", ([session_id], [parent_id]))


def _snapshot_identity(turn, session_id, parent_id):
    return {"scope": _scope(), "sessionId": session_id, "parentId": parent_id,
            "turnId": turn["id"], "patches": [{k: b[k] for k in ("sourceRowId", "cwd", "patch", "savedPatch")}
                                             for b in turn["batches"]]}


def _snapshot_ids(turn, session_id, parent_id, canonical_id):
    sessions, parents = _owners(turn, session_id, parent_id)
    # Main chat requests used the same id in both fields. The agent pane
    # stored the child and its ancestor separately; either could rotate.
    pairs = ((sid, sid) for sid in sessions) if sessions == parents else product(sessions, parents)
    identity = _snapshot_identity(turn, session_id, parent_id)
    aliases = {canonical_id}
    for sid, pid in pairs:
        if (sid, pid) != (sessions[0], parents[0]):
            aliases.add(_digest({**identity, "sessionId": sid, "parentId": pid}))
    return list(aliases)


def _public(turn, session_id, parent_id):
    grouped, diffs = {}, []
    for batch in turn["batches"]:
        diffs.append(batch["patch"] or batch["savedPatch"])
        for f in batch["files"]:
            path = f.get("path") or (f["new"] if f["new"] != "/dev/null" else f["old"])
            record = grouped.setdefault(path, {"path": path, "added": 0, "removed": 0})
            record["added"] += f["added"]
            record["removed"] += f["removed"]
            # A selected file opens its saved sections, including repeated edits.
            old = "/dev/null" if f["old"] == "/dev/null" else "a/" + path
            new = "/dev/null" if f["new"] == "/dev/null" else "b/" + path
            record["unifiedDiff"] = record.get("unifiedDiff", "") + f"--- {old}\n+++ {new}\n" + "".join(f["body"])
    sessions, parents = _owners(turn, session_id, parent_id)
    identity = _snapshot_identity(turn, sessions[0], parents[0])
    return {"turnId": turn["id"], "userRowId": turn.get("userRowId"), "userMessageUid": turn.get("userMessageUid"),
            "snapshotId": _digest(identity), "scope": identity["scope"],
            "files": list(grouped.values()), "unifiedDiff": "".join(diffs),
            "canApply": all(b["cwd"] and b["patch"] for b in turn["batches"])}


def _state_file():
    return _home() / "plugin-state" / "hermes-codex-visual" / "turn-changes.sqlite3"


def _stored_states(db, snapshot_ids):
    rows = []
    for start in range(0, len(snapshot_ids), 200):
        ids = snapshot_ids[start:start + 200]
        marks = ",".join("?" for _ in ids)
        rows.extend(db.execute(
            f"SELECT id,revision,next_action,status FROM patch_state WHERE id IN ({marks})", ids))
        if len(rows) > 1:
            break
    return rows


def _state(turn, session_id, parent_id, snapshot_id):
    path = _state_file()
    default = {"revision": 0, "nextAction": "undo", "status": "ready"}
    if not path.is_file():
        return default
    with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as db:
        if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='patch_state'").fetchone():
            return default
        states = _stored_states(db, _snapshot_ids(turn, session_id, parent_id, snapshot_id))
    if len(states) > 1:
        # Older builds could accept the same action under independent aliases.
        # Never guess which of the saved actions matches the working tree.
        return {**default, "status": "partial"}
    return dict(zip(("revision", "nextAction", "status"), states[0][1:])) if states else default


@router.get("/turn-changes")
def turn_changes(session_id: str, parent_session_id: str):
    turns = []
    for turn in _read_turns(session_id, parent_session_id):
        value = _public(turn, session_id, parent_session_id)
        value.update(_state(turn, session_id, parent_session_id, value["snapshotId"]))
        turns.append(value)
    return {"scope": _scope(), "sessionId": session_id, "parentId": parent_session_id, "turns": turns}


@router.post("/turn-changes/apply")
def apply_turn_changes(body: dict):
    if body.get("scope") != _scope():
        raise HTTPException(409, "Profile changed")
    session_id, parent_id = body.get("sessionId"), body.get("parentId")
    selected = None
    for turn in _read_turns(session_id, parent_id):
        value = _public(turn, session_id, parent_id)
        if value["snapshotId"] == body.get("snapshotId"):
            selected = (turn, value)
            break
    if selected is None:
        raise HTTPException(409, "Saved patch changed")
    turn, value = selected
    if not value["canApply"]:
        raise HTTPException(409, "Saved owning cwd or patch unavailable")
    action = body.get("action")
    if action not in {"undo", "reapply"} or type(body.get("revision")) is not int:
        raise HTTPException(422, "Invalid patch action")
    snapshot_ids = _snapshot_ids(turn, session_id, parent_id, value["snapshotId"])
    state_path = _state_file()
    state_path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(state_path, timeout=25, isolation_level=None)) as db:
        db.execute("CREATE TABLE IF NOT EXISTS patch_state (id TEXT PRIMARY KEY,revision INTEGER NOT NULL,"
                   "next_action TEXT NOT NULL,status TEXT NOT NULL,result TEXT)")
        db.execute("BEGIN IMMEDIATE")
        states = _stored_states(db, snapshot_ids)
        if len(states) > 1:
            db.execute("ROLLBACK")
            raise HTTPException(409, "Conflicting saved patch states")
        stored_id, revision, next_action, status = states[0] if states else (None, 0, "undo", "ready")
        if body["revision"] != revision or action != next_action or status != "ready":
            db.execute("ROLLBACK")
            raise HTTPException(409, "Patch action already submitted or state changed")
        if stored_id is None:
            db.execute("INSERT INTO patch_state VALUES (?,0,'undo','ready',NULL)", (value["snapshotId"],))
        elif stored_id != value["snapshotId"]:
            db.execute("UPDATE patch_state SET id=? WHERE id=?", (value["snapshotId"], stored_id))
        # Persist an in-flight fence BEFORE touching files. A crash or unknown
        # network outcome must not permit an automatic duplicate application.
        db.execute("UPDATE patch_state SET status='inflight',revision=revision+1 WHERE id=?", (value["snapshotId"],))
        db.execute("COMMIT")
        batches = list(reversed(turn["batches"])) if action == "undo" else turn["batches"]
        applied = []
        failure = None
        for batch in batches:
            try:
                # Revalidate links immediately before every real mutation.
                _unredirected_directory(batch["cwd"])
                for f in batch["files"]:
                    _path_under(Path(batch["cwd"]) / f["path"], Path(batch["cwd"]))
                args = ["apply", "--whitespace=nowarn", "-p1"]
                if action == "undo":
                    args.append("--reverse")
                check = _git(batch["cwd"], *args, "--check", input=batch["patch"])
                if check.returncode:
                    failure = "conflict"
                    break
                result = _git(batch["cwd"], *args, input=batch["patch"])
                if result.returncode:
                    failure = "conflict"
                    break
                applied.extend(f["path"] for f in batch["files"])
            except (ValueError, OSError, subprocess.SubprocessError):
                failure = "unavailable"
                break
        outcome = {"status": "success" if failure is None else "partial" if applied else "failed",
                   "appliedPaths": list(dict.fromkeys(applied)), "errorCode": failure,
                   "revision": revision + 1,
                   "nextAction": ("reapply" if action == "undo" else "undo") if failure is None else action}
        # A failed --check changed nothing and may be retried after an explicit
        # refresh. Partial application stays fenced; no double reversal.
        persisted = "partial" if applied and failure else "ready"
        db.execute("UPDATE patch_state SET status=?,next_action=?,result=? WHERE id=?",
                   (persisted, outcome["nextAction"], json.dumps(outcome), value["snapshotId"]))
        return outcome


# The workspace summary compares the working tree with the common ancestor
# of HEAD and the default branch. A turn's saved patches have a separate scope.
_WORKSPACE_DIFF = ("diff", "--no-color", "--no-ext-diff", "--no-textconv", "--find-renames")
_MAX_WORKSPACE_FILES = 4000
_MAX_UNTRACKED_BYTES = 64 * 1024 * 1024
_HASH = re.compile(r"(?:[0-9a-f]{40}|[0-9a-f]{64})")


def _workspace_git(cwd, *args, input=None, allowed=(0,)):
    result = _git(cwd, *args, input=input, read_only=True)
    if result.returncode not in allowed:
        raise HTTPException(409, "Could not read the Git working tree")
    if "\ufffd" in result.stdout:
        raise HTTPException(409, "Git output contains an unsupported filename encoding")
    return result.stdout


def _workspace_root(path, request):
    from hermes_cli.web_server_files import _fs_path, _hosted_fs_read_guard

    cwd = _fs_path(path, decode_fallback=False)
    _hosted_fs_read_guard(cwd, request)
    root = _workspace_git(cwd, "rev-parse", "--show-toplevel", allowed=(0, 128)).rstrip("\r\n")
    if not root:
        return None
    root = Path(root)
    _hosted_fs_read_guard(root, request)
    return root


def _workspace_base(root, head):
    if not head:
        # This also supplies the correct empty tree for SHA-256 repositories.
        return _workspace_git(root, "hash-object", "-t", "tree", "--stdin", input="").strip()
    refs = dict(line.split("\t", 1) for line in _workspace_git(
        root, "for-each-ref", "--format=%(refname)%09%(symref)",
        "refs/remotes/", "refs/heads/").splitlines())
    remotes = {ref.split("/")[2] for ref in refs if ref.startswith("refs/remotes/")}
    order = sorted(remotes, key=lambda name: (name != "origin", name))
    candidates = []
    for remote in order:
        prefix = f"refs/remotes/{remote}/"
        candidates.extend((refs.get(prefix + "HEAD"), prefix + "main", prefix + "master"))
    candidates.extend(("refs/heads/main", "refs/heads/master"))
    for ref in dict.fromkeys(candidates):
        if ref in refs:
            base = _workspace_git(root, "merge-base", head, ref, allowed=(0, 1)).strip()
            if base:
                return base
    # A repository can be usable before a default branch or remote exists.
    return head


def _workspace_numstat(raw):
    records = iter(raw.split("\x00"))
    for entry in records:
        if not entry:
            continue
        additions, deletions, path = entry.split("\t", 2)
        previous = None
        if not path:
            previous, path = next(records), next(records)
        yield {"path": path, "previousPath": previous, "added": int(additions) if additions != "-" else 0,
               "removed": int(deletions) if deletions != "-" else 0}


def _new_file_bytes(root, relative, remaining):
    # Read a symlink's link text as Git does. Never follow it, a junction,
    # a nested repository or a non-regular file while counting lines.
    path = root / relative
    if any(getattr(entry, "is_junction", lambda: False)() or entry.is_symlink()
           for entry in path.parents if entry != root and root in entry.parents):
        return None
    if getattr(path, "is_junction", lambda: False)():
        return None
    if path.is_symlink():
        return os.fsencode(os.readlink(path))
    if not path.is_file() or path.stat().st_size > remaining:
        return None
    with path.open("rb") as stream:
        data = stream.read(remaining + 1)
    return data if len(data) <= remaining else None


@router.get("/workspace-changes")
def workspace_changes(path: str, request: Request, files: bool = False):
    root = _workspace_root(path, request)
    if root is None:
        return {"workspace": None}
    head = _workspace_git(root, "rev-parse", "--verify", "--quiet", "HEAD", allowed=(0, 1)).strip()
    branch = _workspace_git(root, "symbolic-ref", "--quiet", "--short", "HEAD", allowed=(0, 1)).strip()
    base = _workspace_base(root, head)
    changes = list(_workspace_numstat(_workspace_git(root, *_WORKSPACE_DIFF, "--numstat", "-z", base, "--")))
    tracked = {row["path"] for row in changes}
    # Without --directory, Git returns standalone directories only for
    # embedded repositories. They belong to their own checkout, including
    # Hermes worktrees under .worktrees, and are not new files in this one.
    new_paths = _workspace_git(root, "ls-files", "--others", "--exclude-standard", "-z", "--").split("\x00")
    untracked = [name for name in new_paths if name and not name.endswith("/") and name not in tracked]
    remaining = _MAX_UNTRACKED_BYTES
    incomplete = len(untracked) > _MAX_WORKSPACE_FILES
    for name in untracked[:_MAX_WORKSPACE_FILES]:
        try:
            data = _new_file_bytes(root, name, remaining)
        except OSError:
            data = None
        if data is None:
            incomplete = True
            continue
        remaining -= len(data)
        added = 0 if b"\x00" in data[:8000] else data.count(b"\n") + int(bool(data) and not data.endswith(b"\n"))
        changes.append({"path": name, "untracked": True, "added": added, "removed": 0})
    review = {"path": str(root), "branch": branch, "base": base, "detached": not branch,
              "added": sum(row["added"] for row in changes), "removed": sum(row["removed"] for row in changes),
              "changed": len(tracked) + len(untracked), "incomplete": incomplete}
    if files:
        review["files"] = sorted(changes, key=lambda row: row["path"])[:_MAX_WORKSPACE_FILES]
        review["filesOmitted"] = len(review["files"]) < review["changed"]
    return {"workspace": review}


@router.get("/workspace-changes/diff")
def workspace_change_diff(path: str, base: str, file: str, request: Request,
                          previous: str | None = None, untracked: bool = False):
    from hermes_cli.web_server_files import _hosted_fs_read_guard

    root = _workspace_root(path, request)
    if root is None or not _HASH.fullmatch(base):
        raise HTTPException(409, "Git comparison unavailable")
    paths = [file] if not previous else [previous, file]
    for name in paths:
        target = Path(name)
        if not target.parts or target.anchor or ".." in target.parts or chr(0) in name or (root / target).is_dir():
            raise HTTPException(422, "Invalid Git path")
        _hosted_fs_read_guard(root / target, request)
    if untracked:
        listed = _workspace_git(root, "ls-files", "--others", "--exclude-standard", "-z", "--", ":(literal)" + file)
        if file + "\x00" != listed or (root / file).is_dir():
            raise HTTPException(409, "Untracked file changed")
        diff = _workspace_git(root, "diff", "--no-index", "--no-ext-diff", "--no-textconv", "--",
                              os.devnull, "./" + file, allowed=(0, 1))
    else:
        diff = _workspace_git(root, *_WORKSPACE_DIFF, base, "--", *(":(literal)" + name for name in paths))
    return {"diff": diff[:_LIMIT]}

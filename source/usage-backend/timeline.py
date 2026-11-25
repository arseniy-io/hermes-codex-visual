"""Bounded, read-only timeline metadata for the authenticated Hermes profile.

The native REST transcript remains the content authority. This endpoint only
joins stable row addresses to producer timestamps and canonical visibility
booleans. It never returns message bodies, prompts, reasoning or tool arguments.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
import re
import sqlite3

from fastapi import APIRouter, HTTPException

router = APIRouter()
MAX_LIMIT = 500
MAX_OFFSET = 50_000
DEFAULT_LIMIT = 400
_CHECKPOINT = re.compile(r"(\d{1,5})\.(\d{1,19})\.([a-f0-9]{64})", re.ASCII)
# Set once by the owning dashboard module after loading its canonical identity
# helper. The callable receives only this request's same-profile read-only DB.
receipt_projector = None


def _home():
    from hermes_constants import get_hermes_home
    return Path(get_hermes_home()).resolve()


def _same_home(home):
    if _home() != home:
        raise HTTPException(409, "Профиль изменился. Обновите чат")


def _scope(home):
    return hashlib.sha256(os.path.normcase(str(home)).encode("utf-8")).hexdigest()


def _finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _string(value, maximum=1024):
    return value if isinstance(value, str) and len(value) <= maximum else None


def _object(value):
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, ValueError):
            return {}
    return value if isinstance(value, dict) else {}


def _timeline_metadata(row):
    metadata = _object(row.get("display_metadata"))
    notice = {"interrupted": True} if metadata.get("interrupted") is True else {}
    value = _object(metadata.get("hcv_timeline"))
    turn_id = _string(value.get("turnId"))
    if type(value.get("version")) is not int or value.get("version") != 1 or not turn_id or not _finite(value.get("turnStartedAtMs")):
        return notice
    result = {"version": 1, "turnId": turn_id, "turnStartedAtMs": value["turnStartedAtMs"]}
    for key in ("assistantStartedAtMs", "finalAssistantStartedAtMs", "completedAtMs"):
        if _finite(value.get(key)):
            result[key] = value[key]
    if isinstance(value.get("opensExchange"), bool):
        result["opensExchange"] = value["opensExchange"]
    if value.get("phase") in ("input", "work", "tool", "final"):
        result["phase"] = value["phase"]
    # These two fields identify a saved local file occurrence, never the
    # process's current cwd or arbitrary extra values from a metadata object.
    if value.get("cwdBackend") == "local" and (cwd := _string(value.get("cwd"), 8192)):
        result.update(cwd=cwd, cwdBackend="local")
    return {**notice, "hcv_timeline": result}


def _has_text(value):
    if isinstance(value, str):
        return bool(value.strip())
    return isinstance(value, list) and any(
        isinstance(part, dict) and part.get("type") in ("text", "output_text") and
        isinstance(part.get("text"), str) and bool(part["text"].strip()) for part in value)


def _display_rows(rows, home):
    # This is the same projection used by /api/sessions/{id}/messages. It
    # respects the owning profile's commentary setting, native compaction,
    # withheld prompts and typed/legacy hidden scaffold rows. Images stay
    # typed here; their payloads never enter our response.
    from hermes_cli.web_routers.sessions import _project_for_display
    return _project_for_display(rows, home=home, inline_images=True)


def _is_human_user(row):
    if (row.get("display_kind") == "hidden" or
            _object(row.get("display_metadata")).get("model_only") is True):
        return False
    from agent.compaction_display import project_compaction_message_for_display
    from agent.context_compressor import user_originated_turn_view
    view = project_compaction_message_for_display(row)
    return view is not None and user_originated_turn_view(view) is not None


def _row_id(row):
    return row.get("id", row.get("row_id", row.get("_row_id")))


def _row(row):
    role = _string(row.get("role"), 32)
    painted = row.get("display_kind") != "hidden" and not (
        _object(row.get("display_metadata")).get("model_only") is True)
    visible = bool(painted and role == "assistant" and (
        _has_text(row.get("display_content", row.get("content", row.get("text")))) or
        (isinstance(row.get("display_commentary"), list) and any(
            isinstance(value, str) and value.strip() for value in row["display_commentary"]))))
    row_id = _row_id(row)
    if not (isinstance(row_id, int) and not isinstance(row_id, bool)):
        row_id = _string(row_id, 512)
    row_kind = "compaction" if row.get("_compressed_summary") is True else _string(row.get("row_kind"), 32)
    return {"id": row_id, "message_uid": _string(row.get("message_uid"), 512),
        "role": role, "timestamp": row.get("timestamp") if _finite(row.get("timestamp")) else None,
        "display_kind": _string(row.get("display_kind"), 128), "row_kind": row_kind or "message",
        "display_metadata": _timeline_metadata(row),
        "hasVisibleAssistantText": visible, "isHumanUser": bool(_is_human_user(row))}


def _receipts(values):
    """Defence against an accidental future content field in the identity helper."""
    result = []
    for value in values if isinstance(values, list) else ():
        if not isinstance(value, dict) or not (delegation := _string(value.get("delegation_id"), 256)):
            continue
        row_id = value.get("row_id")
        if not isinstance(row_id, int) or isinstance(row_id, bool):
            continue
        agents = []
        for agent in value["agents"] if isinstance(value.get("agents"), list) else ():
            if not isinstance(agent, dict):
                continue
            selected = {key: item for key in ("subagent_id", "child_session_id", "task_name", "agent_path", "status")
                if (item := _string(agent.get(key))) is not None}
            index = agent.get("task_index")
            if isinstance(index, int) and not isinstance(index, bool) and index >= 0:
                selected["task_index"] = index
            if selected.get("subagent_id") and selected.get("child_session_id"):
                agents.append(selected)
        if agents:
            result.append({"row_id": row_id, "delegation_id": delegation, "agents": agents})
    return result


def _plain_history(db, canonical, through):
    # The native display order can fold copies or change after a rewind or
    # compression. Commentary and receipts can also change outside these rows.
    if db._resume_lineage_ids(canonical) != [canonical]:
        return None
    count, last, prefix, unsupported, revision = db._read_one(
        """SELECT COUNT(*), COALESCE(MAX(id), 0), COUNT(CASE WHEN id <= ? THEN 1 END),
                  COUNT(CASE WHEN active IS NOT 1 OR compacted IS NOT 0
                    OR display_order IS NOT id OR display_identity IS NULL
                    OR _compressed_summary IS NOT 0 OR role NOT IN ('user', 'assistant')
                    OR COALESCE(display_kind, '') != ''
                    OR COALESCE(codex_message_items, '') NOT IN ('', '[]')
                    OR COALESCE(absorbed_message_uids, '') NOT IN ('', '[]')
                    THEN 1 END),
                  (SELECT transcript_revision FROM sessions WHERE id = ?)
           FROM messages WHERE session_id = ?""", (through, canonical, canonical))
    return None if unsupported or revision is None else (count, last, prefix, revision)


def _checkpoint(home, file_id, canonical, count, last, revision):
    identity = [_scope(home), file_id, canonical, count, last, revision]
    digest = hashlib.sha256(json.dumps(identity, separators=(",", ":")).encode()).hexdigest()
    return f"{count}.{last}.{digest}"


def _page(db, home, session_id, offset, limit, receipt_projector, *, path=None, prior=None):
    # Exact existing ID only. Compression is resolved by the native seam.
    if db.get_session(session_id) is None:
        raise HTTPException(404, "Чат недоступен в этом профиле")
    canonical = db.resolve_resume_session_id(session_id)
    if not isinstance(canonical, str) or not canonical or db.get_session(canonical) is None:
        raise HTTPException(404, "Чат недоступен в этом профиле")

    def raw_page(offset):
        raw = db.get_messages(canonical, include_compacted=True, include_ancestors=True,
            latest=False, limit=limit + 1, offset=offset)
        if not isinstance(raw, list):
            raise HTTPException(503, "Не удалось прочитать границы ходов")
        return raw

    raw = None if prior else raw_page(offset)
    file_id = None
    state = None
    if path is not None and (prior or offset or len(raw) > limit):
        info = path.stat()
        if info.st_ino:
            file_id = (info.st_dev, info.st_ino)
            state = _plain_history(db, canonical, int(prior[2]) if prior else 0)
    append = False
    if prior:
        if state:
            count, _, prefix, revision = state
            append = (offset == int(prior[1]) == prefix and count <= 10000 and count - offset <= limit and
                      prior[0] == _checkpoint(home, file_id, canonical, prefix, int(prior[2]), revision))
        if not append:
            offset = 0

    if raw is None:
        raw = raw_page(offset)
    if append and len(raw) != state[0] - offset:
        # A row can be omitted by native display filters even on a single segment.
        append, offset, state = False, 0, None
        raw = raw_page(offset)
    has_more = len(raw) > limit
    page = raw[:limit]
    stored_failures = {_row_id(row) for row in page
        if isinstance(row, dict) and row.get("role") == "assistant" and row.get("display_kind") == "failed_turn"
        and type(_row_id(row)) is int and _row_id(row) > 0}
    projected = _display_rows(page, home)
    rows = [_row(row) for row in projected if isinstance(row, dict)]
    for row in rows:
        if row["id"] in stored_failures:
            row["isStoredFailedTurn"] = True
    receipts = _receipts(receipt_projector(db, canonical, page, home=home)) if callable(receipt_projector) else []
    _same_home(home)
    result = {"sessionId": canonical, "requestedSessionId": session_id, "scope": _scope(home),
        "rows": rows, "receipts": receipts, "complete": offset == 0 and not has_more,
        "hasMore": has_more, "pagination": {"order": "oldest", "offset": offset,
            "limit": limit, "returned": len(rows), "scanned": len(page),
            "nextOffset": offset + len(page) if has_more else None}}
    if state and state[0] <= 10000 and (has_more or state[0] == offset + len(page)):
        count, last, _, revision = state
        result["checkpoint"] = _checkpoint(home, file_id, canonical, count, last, revision)
        if append:
            result["appended"] = True
    return result


def read_turn_timeline(session_id, offset=0, limit=DEFAULT_LIMIT, *, receipt_projector=None,
                       incremental=False, checkpoint=None):
    if (not isinstance(session_id, str) or not session_id or len(session_id) > 512 or
            any(ord(char) < 32 for char in session_id)):
        raise HTTPException(422, "Некорректный номер чата")
    if (not isinstance(offset, int) or isinstance(offset, bool) or not 0 <= offset <= MAX_OFFSET or
            not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= MAX_LIMIT):
        raise HTTPException(422, "Некорректная страница истории")
    prior = _CHECKPOINT.fullmatch(checkpoint) if isinstance(checkpoint, str) else None
    if prior and int(prior[2]) > 2**63 - 1:
        prior = None
    if checkpoint is not None and not prior:
        offset = 0
    home = _home()
    path = home / "state.db"
    if not path.is_file():
        raise HTTPException(404, "Чат недоступен в этом профиле")
    from hermes_state import SessionDB
    try:
        with SessionDB(path, read_only=True) as db:
            _same_home(home)
            if incremental and callable(getattr(db, "transcript_read_snapshot", None)):
                try:
                    with db.transcript_read_snapshot() as consistent:
                        result = _page(db, home, session_id, offset, limit, receipt_projector, path=path, prior=prior)
                        if consistent():
                            return result
                except sqlite3.OperationalError:
                    # Older Hermes stores may not have the display index columns.
                    pass
            return _page(db, home, session_id, 0 if prior else offset, limit, receipt_projector)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Не удалось прочитать границы ходов") from None


@router.get("/turn-timeline")
def turn_timeline(session_id: str, offset: int = 0, limit: int = DEFAULT_LIMIT,
                  incremental: bool = False, checkpoint: str | None = None):
    return read_turn_timeline(session_id, offset, limit, receipt_projector=receipt_projector,
                              incremental=incremental, checkpoint=checkpoint)

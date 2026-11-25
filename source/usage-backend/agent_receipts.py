"""Canonical, metadata-only identities for stored delegation receipts.

The caller passes a page from the same read-only SessionDB as the displayed
transcript. Matching uses durable receipt row/delegation ids, never a goal.
"""
import json
import re
import sqlite3

_MARKER = re.compile(r"^\[ASYNC DELEGATION (?:BATCH )?COMPLETE [\u2014-] ([A-Za-z0-9_-]+)\]")
_STATUSES = {"completed": "completed", "ok": "completed", "success": "completed",
             "failed": "failed", "error": "failed", "interrupted": "interrupted",
             "cancelled": "interrupted", "canceled": "interrupted"}


def _object(value):
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except (ValueError, TypeError):
            pass
    return {}


def _text(value):
    return value.strip() if isinstance(value, str) else ""


def _dispatch_indexes(dispatch):
    ids, goals = dispatch.get("subagent_ids"), dispatch.get("goals")
    if not isinstance(ids, list) or not isinstance(goals, list):
        return {}
    ids = [_text(value) for value in ids]
    refused = {entry.get("task_index") for entry in dispatch.get("refused", []) if isinstance(entry, dict)}
    indexes = dispatch.get("task_indexes")
    if not isinstance(indexes, list):
        indexes = [index for index in range(len(goals)) if index not in refused]
    if (len(indexes) != len(ids) or len(set(ids)) != len(ids) or not all(ids)
            or not all(type(index) is int and index >= 0 for index in indexes)):
        return {}
    return dict(zip(indexes, ids))


def _dispatch(db, ancestors, delegation_id):
    placeholders = ",".join("?" for _ in ancestors)
    rows = db._read_all(
        "SELECT id,tool_call_id,tool_call_uid,content FROM messages WHERE session_id IN ("
        + placeholders + ") AND role='tool' AND tool_name='delegate_task' AND "
        "CASE WHEN json_valid(content) THEN json_extract(content,'$.delegation_id') END=? "
        "AND (active=1 OR compacted=1) ORDER BY id LIMIT 65", (*ancestors, delegation_id))
    if not rows or len(rows) > 64:
        return None
    groups = {}
    for raw in rows:
        row = dict(raw)
        key = row.get("tool_call_uid") or row.get("tool_call_id")
        if not key:
            return None
        value = _object(row.get("content"))
        prior = groups.get(key)
        if prior is not None and prior != value:
            return None
        groups[key] = value
    return next(iter(groups.values())) if len(groups) == 1 else None


def _receipt(db, session_id, ancestors, row, stored_child_session):
    row_id = row.get("id", row.get("row_id"))
    if type(row_id) is not int or row_id <= 0 or row.get("display_kind") != "async_delegation_complete":
        return None
    metadata = _object(row.get("display_metadata"))
    delegation_id = _text(metadata.get("delegation_id"))
    marker = _MARKER.match(row.get("content") or "")
    if marker and delegation_id and marker[1] != delegation_id:
        return None
    delegation_id = delegation_id or (marker[1] if marker else "")
    if not delegation_id:
        return None
    records = db._read_all(
        "SELECT parent_session_id,result_json FROM async_delegations WHERE delegation_id=?", (delegation_id,))
    if len(records) != 1 or records[0]["parent_session_id"] not in ancestors:
        return None
    dispatch = _dispatch(db, ancestors, delegation_id)
    if dispatch is None:
        return None
    indexed_ids = _dispatch_indexes(dispatch)
    results = _object(records[0]["result_json"]).get("results")
    if not indexed_ids or not isinstance(results, list):
        return None
    agents, seen = [], set()
    for result in results:
        if not isinstance(result, dict):
            return None
        index = result.get("task_index")
        subagent_id = indexed_ids.get(index)
        status = _STATUSES.get(result.get("status"))
        if not subagent_id or not status or index in seen:
            return None
        seen.add(index)
        child = stored_child_session(db, subagent_id, ancestors)
        child_row = db.get_session(child) if child else None
        config = _object(child_row.get("model_config")) if child_row else {}
        agent = {"subagent_id": subagent_id, "child_session_id": child,
                 "task_index": index, "status": status}
        for key, plural in (("task_name", "task_names"), ("agent_path", "agent_paths")):
            values = dispatch.get(plural)
            value = (_text(config.get("_" + key)) or _text(result.get(key))
                     or (_text(values[index]) if isinstance(values, list) and index < len(values) else ""))
            if value:
                agent[key] = value
        agents.append(agent)
    # Partial/mixed batches cannot turn an incomplete native notice into a
    # fabricated complete event. Keep the existing renderer in that case.
    if seen != set(indexed_ids):
        return None
    return {"row_id": row_id, "delegation_id": delegation_id, "agents": agents}


def project_receipts(db, session_id, raw_rows, *, home=None):
    """Metadata-only response.receipts for one owning transcript page."""
    from tools.delegate_tool_sessions import stored_child_session
    ancestors = tuple(db._resume_lineage_ids(session_id))
    if not ancestors or session_id not in ancestors:
        return []
    result = []
    for row in raw_rows:
        try:
            receipt = _receipt(db, session_id, ancestors, row, stored_child_session)
        except (sqlite3.Error, TypeError, ValueError, KeyError, AttributeError):
            receipt = None
        if receipt:
            result.append(receipt)
    return result

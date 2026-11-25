"""Proven compression edges for restoring delegated conversations.

Use the native preferred-chain query, not attribution ancestry. The narrow
inherited-marker case uses the native parent-bound non-continuation predicate:
compression.publish copies delegate identity onto subagent continuations.
"""
from __future__ import annotations

import json


def _row(conn, sid):
    value = conn.execute('SELECT * FROM sessions WHERE id=?', (sid,)).fetchone()
    return dict(value) if value is not None else None


def _config(row):
    from hermes_state_sessions import _parse_model_config
    return _parse_model_config(row.get('model_config'))


def _step(conn, sid, profile):
    from hermes_state_compression import _CHAIN_STEP_SQL
    candidate = conn.execute(_CHAIN_STEP_SQL, (sid,)).fetchone()
    if candidate is not None:
        row = _row(conn, candidate['id'])
        return row['id'] if row['profile_name'] == profile else None
    parent = _row(conn, sid)
    if parent is None or parent['source'] != 'subagent' or parent['profile_name'] != profile:
        return None
    # Native get_compression_chain has a historical presence-only marker gate;
    # the native publication/row classifier explicitly treats copied markers
    # naming an older owner as inheritance, not a new delegate fork.
    from hermes_state_common import _non_continuation_child_sql, _sql_session_last_active
    sql = ("SELECT child.* FROM sessions parent JOIN sessions child ON child.parent_session_id=parent.id "
           "WHERE parent.id=? AND parent.end_reason='compression' AND child.source='subagent' "
           "AND child.profile_name IS parent.profile_name " +
           _non_continuation_child_sql('child.', 'parent.id') +
           " ORDER BY CASE WHEN child.end_reason='compression' THEN 0 WHEN child.ended_at IS NULL THEN 1 ELSE 2 END," +
           _sql_session_last_active('child') + " DESC,child.started_at DESC,child.id DESC LIMIT 1")
    candidate = conn.execute(sql, (sid,)).fetchone()
    if candidate is None:
        return None
    child = dict(candidate)
    prior, current = _config(parent), _config(child)
    # A continuation keeps the delegation's real identity and all inherited
    # fork markers. A newly marked branch/reset/delegate never crosses here.
    keys = ('_delegate_from', '_branched_from', '_reset_from', '_subagent_id', '_task_name', '_agent_path')
    if any(prior.get(key) != current.get(key) for key in keys):
        return None
    return child['id']


def compression_ids(conn, sid):
    from hermes_state_compression import _CHAIN_CAP
    row = _row(conn, sid)
    if row is None:
        raise ValueError('Missing compression conversation')
    profile = row['profile_name']
    ids, seen = [sid], {sid}
    for _ in range(_CHAIN_CAP):
        parent = row.get('parent_session_id')
        if not parent or parent in seen or _step(conn, parent, profile) != row['id']:
            return list(reversed(ids))
        seen.add(parent)
        ids.append(parent)
        row = _row(conn, parent)
    raise ValueError('Compression chain exceeds native bound')


def resolve_child_owner(conn, child_id, parent_id):
    child, parent = _row(conn, child_id), _row(conn, parent_id)
    if child is None or parent is None or child['source'] != 'subagent' or child['profile_name'] != parent['profile_name']:
        raise ValueError('Stopped child does not belong to this profile')
    child_ids = compression_ids(conn, child_id)
    origin = _row(conn, child_ids[0])
    parent_ids = compression_ids(conn, parent_id)
    if origin['source'] != 'subagent' or origin.get('parent_session_id') not in parent_ids:
        raise ValueError('Stopped child no longer belongs to the original parent')
    return {'child_session_id': child_id, 'parent_session_id': parent_id,
            'origin_child_id': origin['id'], 'origin_parent_id': origin['parent_session_id'],
            'child_compression_ids': child_ids, 'parent_compression_ids': parent_ids,
            'profile_name': parent['profile_name']}


def store_compression_ids(store, sid):
    from agent.runtime_session_store import RuntimeSessionStore, call_off_event_loop
    if isinstance(store, RuntimeSessionStore):
        store._session(sid)
        return call_off_event_loop(store._apply, 'compression.resume_lineage', {})['ids']
    with store._read_ctx() as conn:
        return compression_ids(conn, sid)


def validate_resume_store(store, child_id, parent_id):
    from agent.runtime_session_store import RuntimeSessionStore
    if isinstance(store, RuntimeSessionStore):
        proof = getattr(store, '_hcv_resume_context', None)
        if not proof or proof.get('child_session_id') != child_id or proof.get('parent_session_id') != parent_id:
            raise ValueError('Missing owner-reserved compression receipt')
        return proof
    with store._read_ctx() as conn:
        return resolve_child_owner(conn, child_id, parent_id)

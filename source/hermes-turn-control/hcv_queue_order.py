"""The local owner's persisted order for manually reordered waiting messages.

Admission IDs, sequence numbers, fingerprints and payloads remain immutable.
Only the scheduler and the pending projection consult the effective slots.
"""
import json

_MAX = 32
_PREFIX = 'hcv.queue_order.v1:'
CLAIMED_SORT_KEY = 'hcv_queue_order'


def ranks(conn, session_id):
    row = conn.execute('SELECT value FROM state_meta WHERE key=?', (_PREFIX + session_id,)).fetchone()
    if row is None:
        return {}
    values = json.loads(row[0])
    if (not isinstance(values, dict) or len(values) > _MAX or
            any(type(seq) is not int or seq <= 0 for seq in values.values()) or
            len(set(values.values())) != len(values)):
        raise ValueError('Invalid stored queue order')
    return values


def effective(row, slots):
    return slots.get(row['admission_id'], row['seq']) if row['status'] == 'queued' else row['seq']


def pending_sort(row):
    return row.get(CLAIMED_SORT_KEY, row['seq']), row['seq']


def reorder(db, *, epoch, session_id, principal, expected, desired, eligible):
    from gateway.owner_identity import same_owner
    from hermes_state_runtime import RuntimeStoreError, _epoch, _row, _session

    if (not isinstance(expected, list) or not isinstance(desired, list) or
            not 2 <= len(expected) == len(desired) <= _MAX or
            any(not isinstance(item, str) or len(item) != 32 for item in (*expected, *desired)) or
            len(set(expected)) != len(expected) or set(expected) != set(desired)):
        raise RuntimeStoreError('invalid_params')

    def mutate(conn):
        _epoch(conn, epoch)
        _session(conn, session_id)
        rows = [value for row in conn.execute(
            "SELECT * FROM session_admissions WHERE target_session_id=? AND status='queued' ORDER BY seq",
            (session_id,)) if (value := _row(row)) is not None]
        slots = ranks(conn, session_id)
        visible = [row for row in rows if same_owner(row['principal_id'], principal) and eligible(row)]
        visible.sort(key=lambda row: effective(row, slots))
        current = [row['admission_id'] for row in visible]
        if current == desired:
            return current  # exact retry or no-op, with fresh ownership checks
        if current != expected:
            raise RuntimeStoreError('stale_queue_order')
        changed = dict(zip(desired, (effective(row, slots) for row in visible)))
        order = {row['admission_id']: value for row in rows
                 if (value := changed.get(row['admission_id'], effective(row, slots))) != row['seq']}
        if order:
            conn.execute('INSERT OR REPLACE INTO state_meta(key,value) VALUES(?,?)',
                         (_PREFIX + session_id, json.dumps(order, separators=(',', ':'))))
        else:
            conn.execute('DELETE FROM state_meta WHERE key=?', (_PREFIX + session_id,))
        return desired

    return db._execute_write(mutate)


async def move(connection, ref, params, eligible):
    from functools import partial
    from pathlib import Path
    from gateway.session_runtime_workers import tracked_write
    from hermes_state_runtime import RuntimeStoreError

    authority = connection.authority
    authority.authorize(connection.actor, ref, 'session:control')
    if not connection.native_owner or not Path(str(authority.profile_id)).is_absolute():
        raise RuntimeStoreError('permission_denied')
    sid = ref.session_id
    # Read the launch source before entering the DB writer; eligibility in that
    # transaction must not start a second DB read on a different connection.
    from gateway.session_queued_controls import _interactive
    if not _interactive(authority, sid):
        raise RuntimeStoreError('unsupported_control')
    async with authority.sessions[sid].mutation_lock:
        authority.authorize(connection.actor, ref, 'session:control')
        order = await tracked_write(authority, partial(reorder, authority.db, epoch=authority.epoch,
            session_id=sid, principal=connection.actor.subject, expected=params['expected'], desired=params['desired'],
            eligible=eligible))
    authority._publish_pending(ref)
    return {'order': order}

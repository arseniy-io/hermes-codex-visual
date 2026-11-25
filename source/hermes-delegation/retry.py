"""Keep a locally owned subagent result while its route is temporarily uncertain."""

import asyncio
import json
import logging


def retryable_local_delegation(authority, ref, live, row):
    """Only retry a completion still bound to this local conversation.

    The normal claim preflight remains responsible for proving the live route;
    this check never authorizes execution or moves an answer to another chat.
    """
    if row.get('status') != 'queued':
        return False
    descriptor = (row.get('payload') or {}).get('local_automation_v1')
    if not isinstance(descriptor, dict):
        return False
    identity = row.get('request_id')
    try:
        producer = json.loads(identity)
    except (TypeError, ValueError):
        return False
    if (not isinstance(producer, list) or len(producer) < 2 or producer[0] != 'async_delegation'
            or descriptor.get('identity') != identity or descriptor.get('owner') != ref.session_id
            or row.get('principal_id') != 'automation:' + str(descriptor.get('route') or '')
            or descriptor.get('route') != live.route):
        return False

    from gateway.session_completion_notes import _closed_by_user
    if _closed_by_user(authority, ref.session_id):
        return False

    from gateway.session_local_recovery import restorable_receipt
    from hermes_state_runtime import RuntimeStoreError
    try:
        receipt, entry = restorable_receipt(authority, ref.session_id)
    except (RuntimeStoreError, KeyError, TypeError, ValueError, AttributeError):
        # A temporarily unreadable receipt cannot authorize execution, but it
        # also cannot prove the saved result should be discarded.
        return True
    target = descriptor.get('target')
    return (receipt.get('route') == descriptor.get('route') and isinstance(target, str) and bool(target)
            and (entry.session_id == target or authority.db.get_compression_tip(target) == entry.session_id))


async def defer(authority, ref, live, admission_id, state):
    if state.get('admission_id') != admission_id:
        clear(ref, live, state)
        state.update(admission_id=admission_id, attempts=0)
    state['attempts'] += 1
    attempts = state['attempts']
    if attempts == 3 or attempts % 12 == 0:
        key = 'hcv.delegation.delivery.' + admission_id
        live.event_stream.publish(ref.session_id, {
            'key': key, 'level': 'warn', 'kind': 'sticky',
            'text': 'Ответ субагента сохранён. Hermes пока не может передать его в чат и повторяет попытку.',
            'detail': 'Остальные сообщения в этом чате ждут, пока маршрут ответа не восстановится.',
        }, event_type='notification.show', execution={})
        if not state.get('warned'):
            logging.getLogger(__name__).warning('Subagent result %s held for route recovery in session %s',
                                                admission_id, ref.session_id)
        state['warned'] = True
    await asyncio.sleep(min(0.25 * (2 ** min(attempts - 1, 5)), 5.0))


def clear(ref, live, state):
    if state.get('warned'):
        live.event_stream.publish(ref.session_id, {
            'key': 'hcv.delegation.delivery.' + state['admission_id'],
        }, event_type='notification.clear', execution={})
    state.clear()

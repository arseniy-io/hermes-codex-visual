"""Authenticated Desktop tree controls at the canonical session authority."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
import time
import uuid

from gateway.session_contract import Submission
from hermes_constants import hermes_home_key
from hermes_state_runtime import RuntimeStoreError, find_session_admission, list_session_admissions
from tui_gateway.hcv_stop_tree import Checkpoints, TreeControl

CONTINUE = ('Продолжи остановленную задачу с сохранённого состояния. Выполненные действия и результаты '
            'сохранены в истории. Помощники восстановлены в прежних чатах. Прерванные команды завершены; '
            'сначала проверь их фактический результат, не повторяй уже выполненные действия.')


def _state(authority):
    return authority.__dict__.setdefault('_hcv_tree_owner', {'locks': {}, 'stopping': set(), 'continue': {}})


def _owner(authority, sid):
    return {'profile_home': hermes_home_key(authority.profile_id), 'root_id': sid}


def _store(authority):
    return Checkpoints(Path(authority.profile_id) / 'cache/hcv-stop-checkpoints')


def _read(authority, sid):
    return _store(authority).read(_owner(authority, sid))


def _lock(authority, sid):
    return _state(authority)['locks'].setdefault(sid, asyncio.Lock())


def visible_pending(authority, ref, rows):
    """Project the viewer queue without changing the scheduler's admissions."""
    if not Path(str(authority.profile_id)).is_absolute():
        return rows
    visible = []
    for row in rows:
        payload = row['payload']
        native = payload.get('native_text_v1') or {}
        automation = 'local_automation_v1' in payload or 'automation' in native
        if automation and row['status'] == 'queued':
            continue
        if automation and row['status'] == 'unknown':
            # Preserve the recovery control if Hermes could not settle a lost
            # automation automatically. Keep its model-only payload private.
            row = {**row, 'payload': {'text': 'Фоновый результат Hermes'}}
        # A started receipt is used by CLI clients to recover the active turn.
        visible.append(row)
    return visible


def _busy(authority, ref):
    worker = getattr(authority, '_managed_workers', {}).get(ref.session_id)
    return bool((worker is not None and not worker.closed.is_set()) or
                authority._handle(ref).execution_state == 'running' or
                ref.session_id in getattr(authority, '_managed_spawning', {}))


def _public(authority, sid, checkpoint):
    value = checkpoint or {'state': 'none'}
    if value.get('invalidated_by_new_turn'):
        value = {'state': 'none'}
    result = {key: value[key] for key in ('state', 'checkpoint_id', 'remaining', 'children_resumed',
              'root_resume', 'resume_error', 'stopped_at') if key in value}
    result.update(root_runtime_id=sid, root_stored_id=sid, profile_home=hermes_home_key(authority.profile_id))
    return result


def human_revision(authority, sid):
    rows = list_session_admissions(authority.db, session_id=sid, pending_only=False)
    return max((row['seq'] for row in rows if
                'local_automation_v1' not in row['payload'] and
                not row['payload'].get('native_text_v1', {}).get('automation') and
                not row['request_id'].startswith('hcv-tree-continue-')), default=0)


def claim_paused(authority, ref):
    """Pause the FIFO before claim, including late child-completion admissions."""
    state = _state(authority)
    if ref.session_id in state['stopping']:
        return True
    checkpoint = _read(authority, ref.session_id)
    if not checkpoint or checkpoint.get('invalidated_by_new_turn'):
        return False
    if checkpoint['state'] not in {'stopped', 'stopping', 'timeout', 'resuming'}:
        return False
    permit = state['continue'].get(ref.session_id)
    if permit and permit['checkpoint_id'] == checkpoint['checkpoint_id']:
        pending = list_session_admissions(authority.db, session_id=ref.session_id)
        head = next((row for row in pending if row['status'] == 'queued'), None)
        return head is not None and head['request_id'] != permit['request_id']
    return True


def managed_bootstrap(authority, ref, row):
    """Only trusted owner admission state may carry continuation authority."""
    options = {'root_id': ref.session_id, 'human_revision': human_revision(authority, ref.session_id)}
    permit = _state(authority)['continue'].get(ref.session_id)
    if permit and permit['request_id'] == row['request_id']:
        options['checkpoint_id'] = permit['checkpoint_id']
        return options
    checkpoint = _read(authority, ref.session_id)
    options['allow_new_turn'] = bool(not checkpoint or checkpoint.get('invalidated_by_new_turn') or
                                     checkpoint['state'] == 'resumed')
    return options


@asynccontextmanager
async def user_submission_scope(connection, ref):
    """Only an actually committed new client input supersedes a paused task."""
    authority = connection.authority
    authority.authorize(connection.actor, ref, 'session:submit')
    async with _lock(authority, ref.session_id):
        checkpoint = _read(authority, ref.session_id)
        if checkpoint and not checkpoint.get('invalidated_by_new_turn') and checkpoint['state'] in {'stopping', 'timeout', 'resuming'}:
            raise RuntimeStoreError('tree_control_unconfirmed')
        previous_revision = human_revision(authority, ref.session_id)
        receipt = {}
        yield receipt
        accepted = receipt.get('value')
        if (checkpoint and checkpoint['state'] == 'stopped' and not checkpoint.get('invalidated_by_new_turn') and
                accepted is not None and accepted.sequence > previous_revision):
            # The paused FIFO could not claim this row. Publication follows the
            # successful admission, so a refused submit preserves Continue.
            await _cancel_old_notifications(connection, ref)
            current = _read(authority, ref.session_id)
            if current and current['checkpoint_id'] == checkpoint['checkpoint_id'] and current['state'] == 'stopped':
                current['invalidated_by_new_turn'] = True
                _store(authority).write(current)
            authority._schedule(ref)


async def tree_status(connection, ref, params):
    authority = connection.authority
    authority.authorize(connection.actor, ref, 'session:read')
    checkpoint = _read(authority, ref.session_id)
    expected = params.get('checkpoint_id')
    if expected and checkpoint and expected != checkpoint.get('checkpoint_id'):
        raise RuntimeStoreError('stale_tree_checkpoint')
    if (checkpoint and not checkpoint.get('invalidated_by_new_turn')
            and checkpoint['state'] in {'stopping', 'timeout'}
            and ref.session_id not in _state(authority)['stopping'] and not _busy(authority, ref)):
        # The stopped admission can settle after its first reply. Only its
        # original adapter knows whether the child and process tree settled.
        adapter = getattr(authority, '_hcv_inproc_trees', {}).get(ref.session_id)
        generation = checkpoint.get('stop_generation')
        if adapter is not None and generation is not None and adapter.generation() == generation:
            controller = TreeControl(_store(authority), adapter)
            checkpoint = await asyncio.to_thread(controller.status, adapter.owner, stop_generation=generation)
            if expected and expected != checkpoint.get('checkpoint_id'):
                raise RuntimeStoreError('stale_tree_checkpoint')
    result = _public(authority, ref.session_id, checkpoint)
    if result['state'] == 'stopped' and _busy(authority, ref):
        result.update(state='stopping', remaining=[{'kind': 'owner_settlement'}])
    return result


async def stop_tree(connection, ref, params):
    authority, sid = connection.authority, ref.session_id
    authority.authorize(connection.actor, ref, 'session:control')
    generation = params.get('execution_generation')
    async with _lock(authority, sid):
        authority.authorize(connection.actor, ref, 'session:control')
        checkpoint = _read(authority, sid)
        expected = params.get('checkpoint_id')
        if expected and (not checkpoint or checkpoint.get('checkpoint_id') != expected or
                         checkpoint.get('invalidated_by_new_turn')):
            raise RuntimeStoreError('stale_tree_checkpoint')
        handle = authority._handle(ref)
        if (expected and checkpoint and checkpoint['state'] == 'stopped' and not checkpoint.get('invalidated_by_new_turn') and
                not _busy(authority, ref) and handle.execution_generation == generation and
                checkpoint.get('stopped_tip', {}).get('human_sequence') == human_revision(authority, sid)):
            return _public(authority, sid, checkpoint)
        authority.check_approval_generation(sid, generation)
        worker = getattr(authority, '_managed_workers', {}).get(sid)
        timeout = min(60., max(0., float(params.get('timeout_ms', 15000)) / 1000))
        request_id = uuid.uuid4().hex
        frame = {'type': 'tree.stop', 'request_id': request_id, 'root_id': sid, 'timeout': timeout,
                 'human_revision': human_revision(authority, sid)}
        if expected:
            frame['checkpoint_id'] = expected
        _state(authority)['stopping'].add(sid)
        try:
            if worker is None:
                from tools.hcv_inproc_tree import stop_tree as inproc_stop
                ack = await inproc_stop(authority, ref, frame, generation, actor=connection.actor)
            else:
                ack = await worker.tree_request(frame, timeout=timeout + 35)
            if 'error' in ack:
                raise RuntimeStoreError('tree_control_unconfirmed', detail=ack['error'])
            result = ack['result']
            if result.get('root_runtime_id') != sid or result.get('root_stored_id') != sid:
                raise RuntimeStoreError('tree_owner_mismatch')
            deadline = time.monotonic() + 15
            while result['state'] == 'stopped' and _busy(authority, ref) and time.monotonic() < deadline:
                await asyncio.sleep(.025)
            if result['state'] == 'stopped' and _busy(authority, ref):
                result = {**result, 'state': 'timeout', 'remaining': [{'kind': 'owner_settlement'}]}
            return result
        finally:
            _state(authority)['stopping'].discard(sid)


async def _cancel_old_notifications(connection, ref):
    # An interrupted child's old notification is not new work to restart after
    # Continue. Its real result remains in the durable delegation/child history.
    for row in list_session_admissions(connection.authority.db, session_id=ref.session_id):
        if row['status'] == 'queued' and 'local_automation_v1' in row['payload']:
            from gateway.session_completion_notes import noted_completion
            if noted_completion(row):
                # Persist the real completion exactly once using the native
                # admission-keyed note writer, before withdrawing its wake.
                from functools import partial
                from gateway.session_runtime_workers import tracked_write
                descriptor = row['payload']['local_automation_v1']
                metadata = {'completion_note': sorted(set(descriptor.get('identities') or ()) | {descriptor['identity']})}
                metadata.update({key: descriptor[key] for key in ('display_text', 'notification_category') if key in descriptor})
                target = connection.authority.physical_target(ref)
                await tracked_write(connection.authority, partial(connection.authority.db.append_completion_note,
                    target, row['admission_id'], row['payload']['text'], descriptor.get('display_kind', 'internal_notification'), metadata))
            await connection.authority.cancel_queued(connection.actor, ref, row['admission_id'])


async def continue_tree(connection, ref, params):
    authority, sid = connection.authority, ref.session_id
    authority.authorize(connection.actor, ref, 'session:submit')
    authority.authorize(connection.actor, ref, 'session:control')
    checkpoint_id = params.get('checkpoint_id')
    if not isinstance(checkpoint_id, str) or not checkpoint_id:
        raise RuntimeStoreError('invalid_params')
    async with _lock(authority, sid):
        checkpoint = _read(authority, sid)
        if not checkpoint or checkpoint.get('checkpoint_id') != checkpoint_id or checkpoint.get('invalidated_by_new_turn'):
            raise RuntimeStoreError('stale_tree_checkpoint')
        if checkpoint['state'] == 'resumed':
            return _public(authority, sid, checkpoint)
        if checkpoint['state'] != 'stopped' or _busy(authority, ref):
            raise RuntimeStoreError('tree_control_unconfirmed')
        await _cancel_old_notifications(connection, ref)
        pending = list_session_admissions(authority.db, session_id=sid)
        head = next((row for row in pending if row['status'] == 'queued'), None)
        request_id = head['request_id'] if head is not None else 'hcv-tree-continue-' + checkpoint_id + '-' + str(checkpoint.get('resume_attempt', 0))
        _state(authority)['continue'][sid] = {'checkpoint_id': checkpoint_id, 'request_id': request_id}
        try:
            if head is None:
                receipt = await authority.submit(connection.actor, Submission(request_id, ref, {'text': CONTINUE}, 'queue'))
                admission_id = receipt.admission_id
            else:
                admission_id = head['admission_id']
                authority._schedule(ref)
            deadline = time.monotonic() + 65
            while time.monotonic() < deadline:
                value = _read(authority, sid)
                if value and value.get('checkpoint_id') == checkpoint_id and value['state'] == 'resumed':
                    result = _public(authority, sid, {**value, 'invalidated_by_new_turn': False})
                    return result
                if value and value.get('checkpoint_id') == checkpoint_id and value.get('resume_error'):
                    raise RuntimeStoreError('tree_control_unconfirmed', detail=value['resume_error'])
                from hermes_state_runtime import get_session_admission
                row = get_session_admission(authority.db, admission_id=admission_id)
                if row and row['status'] in {'unknown', 'terminal'}:
                    # A terminal turn without a confirmed resume never authorizes
                    # a retry. The native stable request ID prevents duplicates.
                    raise RuntimeStoreError('tree_control_unconfirmed')
                await asyncio.sleep(.025)
            raise RuntimeStoreError('tree_control_unconfirmed')
        finally:
            _state(authority)['continue'].pop(sid, None)

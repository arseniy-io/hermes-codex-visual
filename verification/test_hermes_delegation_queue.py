"""Exercise the installed Hermes queue in a disposable profile; no network or model calls."""

import asyncio
import os
import queue
import sys
import types

import pytest

# The disposable test profile borrows installed dependencies and must not run
# the launcher's package manager or touch the user's Hermes installation.
bootstrap = types.ModuleType('hermes_bootstrap')


def no_network(*args, **kwargs):
    raise AssertionError('This isolated test must not open network connections')


bootstrap._happy_eyeballs_create_connection = no_network
sys.modules.setdefault('hermes_bootstrap', bootstrap)

import gateway

if os.environ.get('HCV_CANDIDATE_GATEWAY_DIR'):
    gateway.__path__.insert(0, os.environ['HCV_CANDIDATE_GATEWAY_DIR'])

from tests.gateway.test_completion_admission import pending
from tests.gateway.test_session_end_delegations import _admissions, _local
from tests.gateway.test_unviewed_completion_notes import _target
from tools import async_delegation as delegation


@pytest.fixture(autouse=True)
def reset_delegations():
    delegation._reset_for_tests()
    yield
    delegation._reset_for_tests()


@pytest.mark.asyncio
async def test_child_completion_during_parent_continuation_is_processed_once(tmp_path, monkeypatch):
    runner, authority, ref, actor = await _local(tmp_path, monkeypatch)
    gate, entered = asyncio.Event(), asyncio.Event()
    seen = []

    async def handle(event):
        seen.append(event.text)
        if 'first-child' in event.text:
            entered.set()
            await gate.wait()
        return 'ok'

    runner._handle_message = handle
    authority.sessions[ref.session_id].subscribers['owner'] = actor
    route = authority.sessions[ref.session_id].route
    target = _target(runner, authority, ref)
    first = dict(pending(route, 'first-child'), parent_session_id=target)
    second = dict(pending(route, 'second-child'), parent_session_id=target)
    try:
        assert await runner._deliver_async_delegation_group([first]) is True
        drain = asyncio.create_task(authority._drain(ref))
        await asyncio.wait_for(entered.wait(), timeout=20)
        assert await runner._deliver_async_delegation_group([second]) is True
        assert [row['status'] for row in _admissions(authority, ref)] == ['started', 'queued']
        gate.set()
        await asyncio.wait_for(drain, timeout=20)
        assert len(seen) == 2 and 'second-child' in seen[1]
        assert [row['outcome'] for row in _admissions(authority, ref)] == ['completed', 'completed']
        assert await runner._deliver_async_delegation_group([second]) is None
        assert len(seen) == 2
    finally:
        gate.set()
        authority.db.close()


@pytest.mark.asyncio
async def test_transient_routing_conflict_does_not_discard_child_completion(tmp_path, monkeypatch):
    from gateway import session_automation
    from hermes_state_runtime import RuntimeStoreError

    runner, authority, ref, actor = await _local(tmp_path, monkeypatch)
    authority.sessions[ref.session_id].subscribers['owner'] = actor
    route = authority.sessions[ref.session_id].route
    target = _target(runner, authority, ref)
    event = dict(pending(route, 'transient-child'), parent_session_id=target)
    seen = []

    async def handle(message):
        seen.append(message.text)
        return 'ok'

    runner._handle_message = handle
    original = session_automation.check_local_automation
    checks = []

    def briefly_unavailable(*args, **kwargs):
        checks.append(None)
        if len(checks) <= 2:
            raise RuntimeStoreError('admission_conflict')
        return original(*args, **kwargs)

    try:
        assert await runner._deliver_async_delegation_group([event]) is True
        monkeypatch.setattr(session_automation, 'check_local_automation', briefly_unavailable)
        await asyncio.wait_for(authority._drain(ref), timeout=20)
        assert len(seen) == 1 and 'transient-child' in seen[0]
        assert [row['outcome'] for row in _admissions(authority, ref)] == ['completed']
    finally:
        authority.db.close()


@pytest.mark.asyncio
async def test_dispatched_worker_result_survives_a_temporary_route_conflict(tmp_path, monkeypatch):
    from gateway import session_automation
    from hermes_state_runtime import RuntimeStoreError
    from tools.process_registry import process_registry

    runner, authority, ref, actor = await _local(tmp_path, monkeypatch)
    live = authority.sessions[ref.session_id]
    live.subscribers['owner'] = actor
    completions, seen, checks = queue.Queue(), [], []
    monkeypatch.setattr(process_registry, 'completion_queue', completions)
    original = session_automation.check_local_automation

    async def handle(message):
        seen.append(message.text)
        return 'ok'

    def briefly_unavailable(*args, **kwargs):
        checks.append(None)
        if len(checks) <= 2:
            raise RuntimeStoreError('admission_conflict')
        return original(*args, **kwargs)

    runner._handle_message = handle
    try:
        handle_info = delegation.dispatch_async_delegation(
            goal='test child', context=None, toolsets=None, role='test', model=None,
            session_key=live.route, parent_session_id=_target(runner, authority, ref),
            origin_ui_session_id=ref.session_id,
            runner=lambda: {'status': 'completed', 'summary': 'worker-child-result'},
        )
        assert handle_info['status'] == 'dispatched'
        event = await asyncio.to_thread(completions.get, True, 20)
        assert event['delegation_id'] == handle_info['delegation_id']
        assert delegation.get_durable_delegation(event['delegation_id'])['state'] == 'completed'
        assert await runner._deliver_async_delegation_group([event]) is True
        monkeypatch.setattr(session_automation, 'check_local_automation', briefly_unavailable)
        await asyncio.wait_for(authority._drain(ref), timeout=20)
        assert len(seen) == 1 and 'worker-child-result' in seen[0]
        assert [row['outcome'] for row in _admissions(authority, ref)] == ['completed']
        assert await runner._deliver_async_delegation_group([event]) is None
    finally:
        authority.db.close()


@pytest.mark.asyncio
async def test_persistent_conflict_keeps_result_and_warns_until_route_recovers(tmp_path, monkeypatch):
    from gateway import session_automation
    from hermes_state_runtime import RuntimeStoreError
    from tests.waiting import async_wait_until

    runner, authority, ref, actor = await _local(tmp_path, monkeypatch)
    live = authority.sessions[ref.session_id]
    live.subscribers['owner'] = actor
    route, target = live.route, _target(runner, authority, ref)
    event = dict(pending(route, 'held-child'), parent_session_id=target)
    seen, frames = [], []

    async def handle(message):
        seen.append(message.text)
        return 'ok'

    def temporarily_conflicted(*args, **kwargs):
        raise RuntimeStoreError('admission_conflict')

    runner._handle_message = handle
    live.event_stream.observers.add(frames.append)
    original = session_automation.check_local_automation
    drain = None
    try:
        assert await runner._deliver_async_delegation_group([event]) is True
        monkeypatch.setattr(session_automation, 'check_local_automation', temporarily_conflicted)
        drain = asyncio.create_task(authority._drain(ref))
        await async_wait_until(lambda: any(f['params']['type'] == 'notification.show' for f in frames),
                               timeout=20, what='a warning for the held subagent result')
        assert [r['status'] for r in _admissions(authority, ref)] == ['queued']
        assert seen == []
        monkeypatch.setattr(session_automation, 'check_local_automation', original)
        await asyncio.wait_for(drain, timeout=20)
        assert len(seen) == 1 and 'held-child' in seen[0]
        assert [r['outcome'] for r in _admissions(authority, ref)] == ['completed']
        assert any(f['params']['type'] == 'notification.clear' for f in frames)
    finally:
        if drain and not drain.done():
            drain.cancel()
            await asyncio.gather(drain, return_exceptions=True)
        authority.db.close()


@pytest.mark.asyncio
async def test_explicit_cancellation_is_honoured_during_route_retry(tmp_path, monkeypatch):
    from gateway import session_automation
    from hermes_state_runtime import RuntimeStoreError, cancel_session_input
    from tests.waiting import async_wait_until

    runner, authority, ref, actor = await _local(tmp_path, monkeypatch)
    live = authority.sessions[ref.session_id]
    live.subscribers['owner'] = actor
    event = dict(pending(live.route, 'cancelled-child'), parent_session_id=_target(runner, authority, ref))
    seen, frames = [], []

    async def handle(message):
        seen.append(message.text)
        return 'ok'

    def temporarily_conflicted(*args, **kwargs):
        raise RuntimeStoreError('admission_conflict')

    runner._handle_message = handle
    live.event_stream.observers.add(frames.append)
    drain = None
    try:
        assert await runner._deliver_async_delegation_group([event]) is True
        monkeypatch.setattr(session_automation, 'check_local_automation', temporarily_conflicted)
        drain = asyncio.create_task(authority._drain(ref))
        await async_wait_until(lambda: any(f['params']['type'] == 'notification.show' for f in frames),
                               timeout=20, what='a warning before cancellation')
        admission = _admissions(authority, ref)[0]
        await asyncio.to_thread(cancel_session_input, authority.db, epoch=authority.epoch,
                                admission_id=admission['admission_id'])
        await asyncio.wait_for(drain, timeout=20)
        assert seen == []
        assert _admissions(authority, ref)[0]['outcome'] == 'cancelled'
        assert any(f['params']['type'] == 'notification.clear' for f in frames)
    finally:
        if drain and not drain.done():
            drain.cancel()
            await asyncio.gather(drain, return_exceptions=True)
        authority.db.close()


@pytest.mark.asyncio
async def test_real_route_mismatch_never_sends_result_to_other_conversation(tmp_path, monkeypatch):
    from tests.waiting import async_wait_until

    runner, authority, ref, actor = await _local(tmp_path, monkeypatch)
    live = authority.sessions[ref.session_id]
    live.subscribers['owner'] = actor
    route, target = live.route, _target(runner, authority, ref)
    event = dict(pending(route, 'isolated-child'), parent_session_id=target)
    frames, seen = [], []

    async def handle(message):
        seen.append((message.text, message.source.chat_id))
        return 'ok'

    runner._handle_message = handle
    live.event_stream.observers.add(frames.append)
    drain = None
    try:
        assert await runner._deliver_async_delegation_group([event]) is True
        authority.db.create_session('other-conversation', source='local')
        authority.db.append_message('other-conversation', 'user', 'OTHER CHAT')
        store = runner.session_store
        with store._lock:
            store._entries[route].session_id = 'other-conversation'
        drain = asyncio.create_task(authority._drain(ref))
        await async_wait_until(lambda: any(f['params']['type'] == 'notification.show' for f in frames),
                               timeout=20, what='the actual route mismatch warning')
        assert _admissions(authority, ref)[0]['status'] == 'queued'
        assert seen == []
        with store._lock:
            store._entries[route].session_id = target
        await asyncio.wait_for(drain, timeout=20)
        assert len(seen) == 1 and 'isolated-child' in seen[0][0] and seen[0][1] == ref.session_id
        assert [m['content'] for m in authority.db.get_messages('other-conversation')] == ['OTHER CHAT']
        assert _admissions(authority, ref)[0]['outcome'] == 'completed'
    finally:
        if drain and not drain.done():
            drain.cancel()
            await asyncio.gather(drain, return_exceptions=True)
        authority.db.close()


@pytest.mark.asyncio
async def test_gateway_runs_subagent_result_after_busy_parent(tmp_path, monkeypatch):
    from tests.gateway.test_local_producer_admission import _Gateway
    from tests.waiting import async_wait_until

    gateway = _Gateway(tmp_path, monkeypatch)
    await gateway.start()
    try:
        authority, sid = gateway.primary, gateway.launch.session_id
        viewer = await gateway.watch(authority, sid)
        gateway.gate = asyncio.Event()
        submitted = await viewer.dispatch({'id': 1, 'method': 'prompt.submit', 'params': {
            'session_id': sid, 'input_id': 'parent-input', 'text': 'parent is working'}})
        assert 'result' in submitted, submitted
        await async_wait_until(lambda: len(gateway.turns) == 1, timeout=30, what='the parent turn')
        route = authority.sessions[sid].route
        target = gateway.runner.session_store.lookup_by_session_key(route).session_id
        event = dict(pending(route, 'live-queue-child'), parent_session_id=target)
        assert await gateway.runner._deliver_async_delegation_group([event]) is True
        rows = gateway.rows(authority, sid)
        assert [r['status'] for r in rows] == ['started', 'queued']
        gateway.gate.set()
        await gateway.settled(authority, sid, 2)
        assert len(gateway.turns) == 2 and 'live-queue-child' in gateway.turns[1].text
        assert [r['outcome'] for r in gateway.rows(authority, sid)] == ['completed', 'completed']
    finally:
        if gateway.gate is not None:
            gateway.gate.set()
        await gateway.stop()


@pytest.mark.asyncio
async def test_a_deliberately_closed_session_is_not_resumed_by_the_retry(tmp_path, monkeypatch):
    from gateway import session_automation
    from hermes_state_runtime import RuntimeStoreError

    runner, authority, ref, actor = await _local(tmp_path, monkeypatch)
    live = authority.sessions[ref.session_id]
    live.subscribers['owner'] = actor
    route, target = live.route, _target(runner, authority, ref)
    event = dict(pending(route, 'closed-child'), parent_session_id=target)
    seen = []

    async def handle(message):
        seen.append(message.text)
        return 'ok'

    def conflicted(*args, **kwargs):
        raise RuntimeStoreError('admission_conflict')

    runner._handle_message = handle
    token = (authority.profile_id, ref.session_id)
    try:
        assert await runner._deliver_async_delegation_group([event]) is True
        delegation.refuse_for_session(token, session_key=route, parent_session_ids=(ref.session_id, target))
        monkeypatch.setattr(session_automation, 'check_local_automation', conflicted)
        await asyncio.wait_for(authority._drain(ref), timeout=20)
        assert seen == []
        assert _admissions(authority, ref)[0]['outcome'] == 'cancelled'
    finally:
        delegation.allow_for_session(token)
        authority.db.close()

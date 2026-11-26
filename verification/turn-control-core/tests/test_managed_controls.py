import asyncio
import io
from pathlib import Path
import sys
import threading
from types import SimpleNamespace

from agent.managed_worker import WorkerControls, encode_frame
from gateway.session_managed_worker import ManagedWorker
from tui_gateway.hcv_stop_tree import Checkpoints
from tools.hcv_managed_tree import init_controls, prepare_root, finish_root
from test_managed_resume import managed


class Root:
    def __init__(self, store):
        self.session_id = store.scope['session_id']
        self._session_db = store
        self._process_owner_task_ids = set()
        self._current_task_id = self.session_id
        self.interrupted = threading.Event()
    def hard_interrupt(self, *a, **kw):
        self.interrupted.set()
        return True
    def clear_interrupt(self, **kw):
        self.interrupted.clear()


def controls(root, replies):
    value = WorkerControls.__new__(WorkerControls)
    value.agent, value.route = root, 'fixture-route'
    value.channel = SimpleNamespace(send=lambda kind, **payload: replies.append({'type': kind, **payload}))
    value.stopped, value.finish = threading.Event(), threading.Event()
    value.clarifications, value.lock = {}, threading.Lock()
    init_controls(value)
    return value


def test_native_worker_controls_tree_stop_ack_and_private_continue_gate(tmp_path, monkeypatch):
    with managed(tmp_path, monkeypatch) as (db, store, connection, scope):
        root, replies = Root(store), []
        current = controls(root, replies)
        frame = {'home': str(tmp_path), 'scope': dict(store.scope), 'hcv_tree_v1': {'root_id': 'parent', 'allow_new_turn': True}}
        assert prepare_root(current, frame, store)
        stream = io.BytesIO(encode_frame({'type': 'tree.stop', 'request_id': 'stop-once', 'root_id': 'parent', 'timeout': 2}) +
                            encode_frame({'type': 'finish'}))
        monkeypatch.setattr(sys, 'stdin', SimpleNamespace(buffer=stream))
        # Actual WorkerControls.read accepts the new frame before ordinary controls.
        current.read()
        assert root.interrupted.wait(3)
        finish_root(current)
        ack = next(value for value in replies if value['type'] == 'tree.ack')
        assert ack['result']['state'] == 'stopped' and ack['result']['root_stored_id'] == 'parent'
        checkpoint_id = ack['result']['checkpoint_id']
        adapter = current.hcv_tree
        checkpoints = Checkpoints(Path(adapter.profile_home) / 'cache/hcv-stop-checkpoints')
        # A late automatic completion is held, with no model call or invalidation.
        automatic = controls(Root(store), [])
        assert prepare_root(automatic, dict(frame, hcv_tree_v1={'root_id': 'parent', 'allow_new_turn': False}), store) is False
        assert checkpoints.read(adapter.owner)['state'] == 'stopped'
        assert not checkpoints.read(adapter.owner).get('invalidated_by_new_turn')
        # Only the separately authorized native continuation admission restores.
        resumed = controls(Root(store), [])
        assert prepare_root(resumed, dict(frame, hcv_tree_v1={'root_id': 'parent', 'checkpoint_id': checkpoint_id}), store)
        value = checkpoints.read(adapter.owner)
        assert value['state'] == 'resumed' and value['root_resume']['native_admission'] is True
        resumed.hcv_tree.active = False


def test_late_managed_stop_is_confirmed_before_the_worker_retires(tmp_path, monkeypatch):
    from tools.hcv_managed_tree import begin_stop

    with managed(tmp_path, monkeypatch) as (_db, store, _connection, _scope):
        root, replies = Root(store), []
        current = controls(root, replies)
        frame = {'home': str(tmp_path), 'scope': dict(store.scope),
                 'hcv_tree_v1': {'root_id': 'parent', 'allow_new_turn': True}}
        assert prepare_root(current, frame, store)
        begin_stop(current, {'type': 'tree.stop', 'request_id': 'stop-late',
                             'root_id': 'parent', 'timeout': 0})
        assert root.interrupted.wait(3)
        worker_stop = current.hcv_tree_threads[0]
        worker_stop.join(3)
        assert not worker_stop.is_alive()
        reply = next(item['result'] for item in replies if item['type'] == 'tree.ack')
        assert reply['state'] == 'timeout' and any(item['kind'] == 'root' for item in reply['remaining'])
        adapter = current.hcv_tree
        checkpoints = Checkpoints(Path(adapter.profile_home) / 'cache/hcv-stop-checkpoints')
        assert checkpoints.read(adapter.owner)['state'] == 'timeout'

        finish_root(current)
        saved = checkpoints.read(adapter.owner)
        assert saved['state'] == 'stopped' and not saved['remaining']
        assert saved['checkpoint_id'] == reply['checkpoint_id']


def test_managed_owner_tree_ack_uses_existing_reader_and_does_not_latch_native_stop():
    worker = ManagedWorker.__new__(ManagedWorker)
    worker.tree_waiters, worker.tree_lock = {}, threading.Lock()
    sent = []
    worker.control = sent.append
    async def check():
        pending = asyncio.create_task(worker.tree_request({'type': 'tree.stop', 'request_id': 'x', 'root_id': 'parent'}, timeout=2))
        await asyncio.sleep(0)
        assert sent == [{'type': 'tree.stop', 'request_id': 'x', 'root_id': 'parent'}]
        worker.accept_tree_ack({'type': 'tree.ack', 'request_id': 'x', 'result': {'state': 'stopped'}})
        assert (await pending)['result']['state'] == 'stopped'
        assert not worker.tree_waiters
    asyncio.run(check())

import threading
from types import SimpleNamespace

from tui_gateway.hcv_stop_tree import (Checkpoints, NativeTreeAdapter, TreeControl,
    track_prepared_child, forget_prepared_child, StopControlError)


def test_stop_snapshot_and_fence_are_atomic_against_late_prepared_child(tmp_path):
    root = SimpleNamespace(session_id='root', _session_db=None)
    adapter = NativeTreeAdapter(SimpleNamespace(), 'runtime',
        {'agent':root, 'session_key':'root', 'profile_home':str(tmp_path), 'history_lock':threading.Lock()})
    entered, release, admitted, rejected = (threading.Event() for _ in range(4))
    child = SimpleNamespace(session_id='late-child', _subagent_id='sa-late')
    original_snapshot = adapter.snapshot
    def snapshot():
        value = original_snapshot()
        entered.set()
        assert release.wait(3)
        return value
    adapter.snapshot = snapshot
    adapter.signal = lambda cp: None
    adapter.root_running = lambda: False
    adapter.stop_processes = lambda cp: []
    adapter.tip = lambda: None
    state = {}
    def stop():
        state.update(TreeControl(Checkpoints(tmp_path/'checkpoints'), adapter).stop(adapter.owner, timeout=1))
    def spawn():
        try:
            track_prepared_child(child, root)
            admitted.set()
        except StopControlError:
            rejected.set()
    stopping = threading.Thread(target=stop)
    starting = threading.Thread(target=spawn)
    try:
        stopping.start()
        assert entered.wait(3)
        starting.start()
        assert not admitted.wait(.1) and not rejected.is_set(), 'Admission must wait for the atomic snapshot/fence boundary'
        release.set()
        stopping.join(3)
        starting.join(3)
        assert state['state'] == 'stopped' and state['nodes'] == []
        assert rejected.is_set() and not admitted.is_set()
        assert adapter._records() == []
        # The exact owner fence is lifted by authorized continuation. A copied
        # identifier from another profile was never held by this owner's fence.
        foreign = SimpleNamespace(session_id='root', _hcv_owner_profile_home=str(tmp_path/'other'), _hcv_tree_owner_root='root')
        foreign_child = SimpleNamespace(session_id='other-child', _subagent_id='sa-other')
        track_prepared_child(foreign_child, foreign)
        forget_prepared_child(foreign_child)
        adapter.unfence(state)
        track_prepared_child(child, root)
        assert any(record['agent'] is child for record in adapter._records())
    finally:
        release.set()
        stopping.join(3)
        if starting.ident:
            starting.join(3)
        forget_prepared_child(child)
        if state:
            adapter.unfence(state)

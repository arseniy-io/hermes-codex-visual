import threading
from pathlib import Path
from types import SimpleNamespace

def test_native_prepared_active_handoff_remains_in_snapshot(tmp_path):
    from tools import delegate_tool_registry as registry
    from tools.delegate_tool_child_run import _register_child
    from tui_gateway.hcv_stop_tree import NativeTreeAdapter, track_prepared_child, forget_prepared_child

    root = SimpleNamespace(session_id='root', _session_db=SimpleNamespace(db_path=tmp_path / 'state.db'))
    child = SimpleNamespace(session_id='child', _subagent_id='sa-child', _parent_session_id='root',
                            _delegate_profile_home=str(tmp_path), _hcv_original_goal='ORIGINAL_GOAL',
                            _delegate_parent_ref=lambda: root)
    original_records = registry._active_subagents
    registry._active_subagents = {}
    track_prepared_child(child, root)
    adapter = NativeTreeAdapter(SimpleNamespace(), 'runtime',
                {'agent': root, 'profile_home': str(tmp_path), 'history_lock': threading.Lock()})
    original_lock = registry._active_subagents_lock
    trace = []

    class AfterActiveRead:
        armed = True
        def __enter__(self):
            original_lock.acquire()
            return self
        def __exit__(self, *exc):
            original_lock.release()
            if self.armed:
                self.armed = False
                trace.append('snapshot finished its empty active copy and released active lock')
                # Precisely the two real operations a child thread may finish
                # before the snapshot subsequently acquires _outcome_guard.
                _register_child(child, root, 'ORIGINAL_GOAL', owner_session_id='fixture-ui',
                                owner_transport=object(), owner_session_record={})
                trace.append('native _register_child added active and removed prepared')
            return False
    registry._active_subagents_lock = AfterActiveRead()
    try:
        snapshot_records = adapter._records()
        trace.append('snapshot finished its now-empty prepared copy')
        current_records = adapter._records()
        assert registry._active_subagents['sa-child']['agent'] is child
        assert {r['subagent_id'] for r in snapshot_records} == {'sa-child'}
        assert any(record['agent'] is child for record in current_records)
    finally:
        registry._active_subagents_lock = original_lock
        registry._active_subagents = original_records
        forget_prepared_child(child)

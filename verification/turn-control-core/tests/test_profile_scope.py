from pathlib import Path
import subprocess
import sys
import threading
from types import SimpleNamespace
import weakref

from hermes_constants import hermes_home_key, set_hermes_home_override, reset_hermes_home_override
from tui_gateway.hcv_stop_tree import NativeTreeAdapter, track_prepared_child, forget_prepared_child


class Agent:
    def __init__(self, home, sid='same-copied-root'):
        self.session_id = sid
        self._delegate_profile_home = home
        self._session_db = SimpleNamespace(db_path=Path(home) / 'state.db')
        self._process_owner_task_ids = {sid}
        self._current_task_id = sid
        self.stopped = False
    def hard_interrupt(self, *a, **kw):
        self.stopped = True
        return True


def test_profile_qualified_active_prepared_async_fence_and_unknown_receipts(tmp_path, monkeypatch):
    from tools import delegate_tool_registry as registry, async_delegation as asynchronous
    own_home, foreign_home = tmp_path / 'own', tmp_path / 'foreign'
    own, foreign = Agent(own_home), Agent(foreign_home)
    first, second = Agent(own_home, 'own-child'), Agent(foreign_home, 'foreign-child')
    queued = Agent(own_home, 'queued-child')
    for child, parent in ((first, own), (queued, own), (second, foreign)):
        child._delegate_parent_ref = weakref.ref(parent)
        child._subagent_id = child.session_id
        child._hcv_original_goal = 'PRESERVED_GOAL_' + child.session_id
    records = {child.session_id: {'agent': child, 'subagent_id': child.session_id,
               'owner_agent_session_id': 'same-copied-root'} for child in (first, second)}
    monkeypatch.setattr(registry, '_active_subagents', records)
    flags = []
    units = {key: {'delegation_id': key, 'status': 'running', 'session_key': 'same-copied-root',
                    'parent_session_id': 'same-copied-root', 'interrupt_fn': lambda key=key: flags.append(key),
                    **({'_profile_home': hermes_home_key(home)} if home else {})}
             for key, home in (('own-unit', own_home), ('foreign-unit', foreign_home), ('legacy-unit', None))}
    monkeypatch.setattr(asynchronous, '_records', units)
    track_prepared_child(queued, own)
    adapter = NativeTreeAdapter(SimpleNamespace(), 'runtime', {'agent': own, 'profile_home': str(own_home),
                                'history_lock': threading.Lock(), 'running': False})
    checkpoint = {'checkpoint_id': 'scoped', 'nodes': []}
    try:
        assert {r['subagent_id'] for r in adapter._records()} == {'own-child', 'queued-child'}
        adapter.fence(checkpoint)
        with asynchronous._records_lock:
            assert (hermes_home_key(own_home), 'parent_session_id', 'same-copied-root') in asynchronous._refused_by
            assert (hermes_home_key(foreign_home), 'parent_session_id', 'same-copied-root') not in asynchronous._refused_by
        assert asynchronous.interrupt_for_session(parent_session_id='same-copied-root', profile_home=own_home) == 1
        assert flags == ['own-unit']
        assert asynchronous.has_live_for_session(parent_session_id='same-copied-root', profile_home=foreign_home)
        # Unknown attribution is neither killed nor treated as confirmed stopped.
        pending = adapter.remaining(checkpoint)
        assert any(p['kind'] == 'delegation_owner_profile_unconfirmed' for p in pending)
        assert not second.stopped
    finally:
        adapter.unfence(checkpoint)
        forget_prepared_child(queued)


def test_native_profile_process_stop_leaves_copied_neighbor_and_unknown_running(tmp_path, monkeypatch):
    from tools import process_registry as processes
    registry = processes.ProcessRegistry()
    monkeypatch.setattr(processes, 'process_registry', registry)
    homes = [tmp_path / 'own', tmp_path / 'foreign']
    sessions, children = [], []
    try:
        for index, home in enumerate([*homes, homes[0]]):
            home.mkdir(exist_ok=True)
            token = set_hermes_home_override(home)
            child = subprocess.Popen([sys.executable, '-B', '-c', 'import sys;sys.stdin.read()'], stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            children.append(child)
            try:
                session = registry.adopt_local(child, command='synthetic-held-command', cwd=str(tmp_path),
                            task_id='same-copied-root', owner_task_id='same-copied-root', notify_on_complete=False)
            finally:
                reset_hermes_home_override(token)
            if index == 2:
                session.profile_home = ''  # genuine legacy/unattributed process
            sessions.append(session)
        root = Agent(homes[0])
        adapter = NativeTreeAdapter(SimpleNamespace(), 'runtime', {'agent': root, 'profile_home': str(homes[0]),
                                     'history_lock': threading.Lock(), 'running': False})
        checkpoint = {'checkpoint_id': 'pids', 'nodes': [], 'process_results': []}
        stopped = adapter.stop_processes(checkpoint)
        assert {item['session_id'] for item in stopped} == {sessions[0].id}
        children[0].wait(timeout=5)
        assert children[1].poll() is None and children[2].poll() is None
        pending = adapter.remaining(checkpoint)
        assert any(item['kind'] == 'process_owner_profile_unconfirmed' and item['session_id'] == sessions[2].id for item in pending)
        assert not any(item.get('session_id') == sessions[1].id for item in pending)
    finally:
        for session in sessions:
            if not session.exited:
                registry.kill_process(session.id, source='synthetic-test-cleanup')
        for child in children:
            if child.stdin and not child.stdin.closed:
                child.stdin.close()
            child.wait(timeout=5)


def test_late_old_cleanup_cannot_remove_restored_agent_with_same_public_id(tmp_path, monkeypatch):
    from tools import delegate_tool_registry as registry
    root = Agent(tmp_path)
    old, restored = Agent(tmp_path, 'same-child'), Agent(tmp_path, 'same-child')
    for child in (old, restored):
        child._delegate_parent_ref = weakref.ref(root)
        child._subagent_id = 'same-public-id'
        child._hcv_original_goal = 'ORIGINAL_GOAL'
    track_prepared_child(old, root)
    forget_prepared_child(old)
    track_prepared_child(restored, root)
    try:
        forget_prepared_child(old)  # old finally arrives after restoration
        monkeypatch.setattr(registry, '_active_subagents', {'same-public-id': {'agent': restored,
            'subagent_id': 'same-public-id', 'owner_agent_session_id': root.session_id}})
        registry._unregister_subagent('same-public-id', agent=old)
        assert registry._active_subagents['same-public-id']['agent'] is restored
        adapter = NativeTreeAdapter(SimpleNamespace(), 'runtime', {'agent': root, 'profile_home': str(tmp_path)})
        assert any(record['agent'] is restored for record in adapter._records())
    finally:
        forget_prepared_child(restored)

import contextvars
from pathlib import Path
import sys
import threading
import time
from types import SimpleNamespace
from unittest.mock import patch
import os
import subprocess

from hermes_constants import set_hermes_home_override, reset_hermes_home_override
from hermes_state import SessionDB
from tools.delegate_tool_child_run import _attach_child, _detach_child
from tools.delegate_tool_dispatch import _Batch, _execute_and_aggregate
from tui_gateway.hcv_stop_tree import Checkpoints, NativeTreeAdapter, TreeControl


class Agent:
    def __init__(self, **kwargs):
        self.session_id, self._session_db = kwargs['session_id'], kwargs['session_db']
        self.provider, self.model, self.base_url, self.api_key = 'fixture', 'fixture', 'http://127.0.0.1:1', 'fixture'
        self._current_task_id = self.session_id
        self._process_owner_task_ids = set()
        self._active_children, self._active_children_lock = [], threading.Lock()
        self._interrupt_requested = False
        self._hard_interrupt_requested = threading.Event()
        self._session_init_model_config = {}
        self._print_fn = lambda *a, **kw: None
        self.tool_progress_callback = kwargs.get('tool_progress_callback')
        self.started = threading.Event()
        self.original = kwargs.get('original', False)
        self.closed = False
        self.prompts = []
    def hard_interrupt(self, *a, **kw):
        self._interrupt_requested = True
        self._hard_interrupt_requested.set()
        return True
    def clear_interrupt(self, **kw):
        self._interrupt_requested = False
        self._hard_interrupt_requested.clear()
    def get_activity_summary(self):
        return {'api_call_count': 1, 'last_activity_ts': time.time()}
    def run_conversation(self, user_message, conversation_history=None, **kwargs):
        self.started.set()
        self.prompts.append((user_message, conversation_history))
        self._session_db.append_messages_batch(self.session_id, [{'role': 'user', 'content': user_message}])
        if self.original:
            assert self._hard_interrupt_requested.wait(5)
            return {'interrupted': True, 'final_response': 'Operation interrupted.', 'messages': [{'role': 'user', 'content': user_message}]}
        assert 'PRESERVED_GOAL_' + self.session_id in user_message
        if self.session_id == 'queued':
            assert conversation_history == [], 'Never-started child has no user history; goal must come from checkpoint'
        answer = 'RESUMED_' + self.session_id
        self._session_db.append_messages_batch(self.session_id, [{'role': 'assistant', 'content': answer}])
        return {'completed': True, 'interrupted': False, 'final_response': answer, 'messages': [], 'api_calls': 1}
    def close(self):
        if not self.closed and getattr(self, '_owns_session_db', False):
            from hermes_state_registry import release_or_close
            release_or_close(self._session_db)
        self.closed = True


def test_native_max_one_queued_child_stop_continue_preserves_both_ids_and_empty_history_goal(tmp_path, monkeypatch):
    if os.environ.get('HCV_QUEUED_PEER') != '1':
        # The ordinary profile runtime keeps native header/probe handles until
        # interpreter shutdown. Give this complete lifecycle its own process,
        # then the parent can clean its private directory after all handles close.
        runner = Path(__file__).resolve().parents[1] / 'run_tests.py'
        environment = dict(os.environ, HCV_QUEUED_PEER='1', HCV_CASE_HOME=str(tmp_path))
        result = subprocess.run([sys.executable, '-B', str(runner), 'native_max_one_queued'], env=environment,
                                capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=25)
        assert result.returncode == 0, result.stdout + result.stderr
        return
    from tools import delegate_tool as delegates, process_registry as processes
    from tools.delegate_tool_registry import _active_subagents, _active_subagents_lock
    home = tmp_path
    token = set_hermes_home_override(home)
    db = SessionDB(db_path=home / 'state.db')
    db.create_session('root', source='tui')
    root = Agent(session_id='root', session_db=db)
    root._delegate_depth = 0
    children = []
    tasks = []
    try:
        for sid in ('first', 'queued'):
            db.create_session(sid, source='subagent', parent_session_id='root', model_config={'_delegate_from': 'root'})
            child = Agent(session_id=sid, session_db=db, original=True)
            child._subagent_id, child._task_name, child._agent_path = 'sa-' + sid, sid, '/root/' + sid
            child._hcv_original_goal = 'PRESERVED_GOAL_' + sid
            child._delegate_depth, child._delegate_role = 1, 'leaf'
            child._delegate_profile_home = home
            child._parent_session_id = 'root'
            child._delegation_id = 'same-original-batch'
            import weakref
            child._delegate_parent_ref = weakref.ref(root)
            _attach_child(root, child)
            _detach_child(root, child)  # the real async path detaches before registry/run admission
            children.append(child)
            tasks.append({'goal': child._hcv_original_goal, 'task_name': sid, 'agent_path': child._agent_path})
        batch = _Batch(tasks, [(i, t, c) for i, (t, c) in enumerate(zip(tasks, children))], root, {'model': 'fixture'},
                       None, 'leaf', 1, 'same-original-batch', [], [], '', 'runtime', object(), {}, True, time.monotonic())
        original_result = {}
        def run():
            original_result.update(_execute_and_aggregate(batch, honor_parent_interrupt=False))
        worker = threading.Thread(target=contextvars.copy_context().run, args=(run,), daemon=True)
        worker.start()
        assert children[0].started.wait(3)
        assert not children[1].started.is_set()
        session = {'agent': root, 'session_key': 'root', 'profile_home': str(home), 'history_lock': threading.Lock(),
                   'running': False, 'transport': object()}
        server = SimpleNamespace(_retire_turn_marker=lambda *a: None, _interrupt_session_turn=lambda *a: root.hard_interrupt())
        adapter = NativeTreeAdapter(server, 'runtime', session)
        controller = TreeControl(Checkpoints(home / 'cache/hcv-stop-checkpoints'), adapter)
        stopped = controller.stop(adapter.owner, timeout=3)
        worker.join(3)
        assert stopped['state'] == 'stopped', stopped
        assert {n['stored_id'] for n in stopped['nodes']} == {'first', 'queued'}
        assert all(n['resumable'] and n['outcome']['status'] == 'interrupted' for n in stopped['nodes'])
        assert not children[1].started.is_set() and db.get_messages('queued') == []
        assert {n['goal'] for n in stopped['nodes']} == {'PRESERVED_GOAL_first', 'PRESERVED_GOAL_queued'}
        # Actual native builder/lifecycle/async registry with only the model fixture replaced.
        constructed = []
        def factory(**kwargs):
            child = Agent(**kwargs)
            constructed.append(child)
            return child
        monkeypatch.setattr(delegates, '_resolve_child_runtime', lambda *a, **kw: {'provider': 'fixture', 'model': 'fixture', 'base_url': 'http://127.0.0.1:1'})
        monkeypatch.setattr(delegates, '_resolve_child_credential_pool', lambda *a, **kw: None)
        monkeypatch.setattr(delegates, '_get_max_concurrent_children', lambda: 1)
        monkeypatch.setattr(delegates, '_load_config', lambda: {'max_iterations': 5})
        from tools.delegate_tree_resume import resume_children
        adapter.unfence(stopped)
        with patch.dict(sys.modules, {'run_agent': SimpleNamespace(AIAgent=factory)}):
            receipts = resume_children(root, stopped, ui_session_id='runtime', owner_transport=session['transport'], owner_session_record=session)
        deadline = time.monotonic() + 5
        from tools.async_delegation import has_live_for_session
        while time.monotonic() < deadline:
            if all(c.closed for c in constructed) and not has_live_for_session(parent_session_id='root', profile_home=home):
                break
            time.sleep(.01)
        assert {r['stored_id'] for r in receipts} == {'first', 'queued'}
        assert len({r['delegation_id'] for r in receipts}) == 1
        assert {c._subagent_id for c in constructed} == {'sa-first', 'sa-queued'}
        assert all(c.prompts for c in constructed)
        assert not has_live_for_session(parent_session_id='root', profile_home=home)
        assert all(any(m['content'] == 'RESUMED_' + sid for m in db.get_messages(sid)) for sid in ('first', 'queued'))
    finally:
        for child in children:
            child.hard_interrupt()
        db.close()
        from hermes_state_registry import close_all_under
        close_all_under(tmp_path)
        reset_hermes_home_override(token)

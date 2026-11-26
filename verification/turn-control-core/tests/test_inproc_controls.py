import asyncio
import contextvars
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
from types import SimpleNamespace
from unittest.mock import patch

from hermes_constants import hermes_home_key, set_hermes_home_override, reset_hermes_home_override
from hermes_state import SessionDB
import hermes_state_runtime as rt
from gateway.session_authority import SessionAuthority, LiveSession
from gateway.session_contract import SessionActor, SessionRef
from tools.delegate_tool_child_run import _attach_child, _detach_child
from tools.delegate_tool_dispatch import _Batch, _execute_and_aggregate
from tools.hcv_inproc_tree import prepare_inproc, finish_inproc
from test_queued_resume import Agent


def test_actual_inproc_authority_stop_and_continue_native_child_receipt(tmp_path, monkeypatch):
    if os.environ.get('HCV_INPROC_PEER') != '1':
        runner = Path(__file__).resolve().parents[1] / 'run_tests.py'
        result = subprocess.run([sys.executable, '-B', str(runner), 'actual_inproc_authority'],
            env=dict(os.environ, HCV_INPROC_PEER='1', HCV_CASE_HOME=str(tmp_path)),
            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=30)
        assert result.returncode == 0, result.stdout + result.stderr
        return
    import weakref
    from gateway.hcv_tree_owner import _state, stop_tree, human_revision, tree_status
    from tools import delegate_tool as delegates
    from tools.process_registry import process_registry
    from tools.async_delegation import has_live_for_session
    home = tmp_path
    token = set_hermes_home_override(home)
    db = SessionDB(db_path=home / 'state.db')
    db.create_session('root', source='tui')
    db.create_session('child', source='subagent', parent_session_id='root', model_config={'_delegate_from': 'root'})
    db.append_messages_batch('child', [{'role': 'assistant', 'content': 'COMPLETED_TOOL_KEEP_ONCE'}])
    epoch = rt.begin_runtime_epoch(db, instance_id='inproc-fixture')
    runner = SimpleNamespace(_draining=False)
    authority = SessionAuthority(runner, profile_id=hermes_home_key(home), instance_id='inproc-fixture', db=db, epoch=epoch)
    runner.session_authority = authority
    authority.sessions['root'] = LiveSession(source=None, route='agent:fixture:root')
    actor = SessionActor('human', authority.profile_id, frozenset({'session:control','session:read','session:submit'}), 'fixture')
    ref = SessionRef(authority.profile_id, 'root')
    connection = SimpleNamespace(authority=authority, actor=actor)
    root = Agent(session_id='root', session_db=db, original=True)
    root._delegate_depth = 0
    child = Agent(session_id='child', session_db=db, original=True)
    child._subagent_id, child._task_name, child._agent_path = 'sa-preserved', 'method_review', '/root/method_review'
    child._hcv_original_goal, child._delegate_depth, child._delegate_role = 'PRESERVED_GOAL_child', 1, 'leaf'
    child._delegate_profile_home, child._parent_session_id = home, 'root'
    child._delegate_parent_ref = weakref.ref(root)
    _attach_child(root, child)
    _detach_child(root, child)
    workers = []
    def claim(request_id):
        rt.admit_session_input(db, epoch=epoch, principal_id='human', session_id='root', request_id=request_id,
                               payload={'text': request_id})
        row = rt.claim_session_input(db, epoch=epoch, session_id='root')
        authority.executing['root'] = row['generation']
        authority.sessions['root'].event_stream.execution = {'admission_id': row['admission_id'],
                                                            'execution_generation': row['generation']}
        authority.adopt_agent('root', row['generation'], root)
        return row, SimpleNamespace(_approval_owner=(authority, 'root', row['generation']),
                                    _ctx=SimpleNamespace(session_key='agent:fixture:root'))
    def settle(row, turn):
        finish_inproc(turn)
        authority.executing.pop('root', None)
        rt.settle_session_input(db, epoch=epoch, admission_id=row['admission_id'], generation=row['generation'], outcome='completed')
        authority.sessions['root'].event_stream.execution = {}
    try:
        row, turn = claim('ORIGINAL_ROOT_PROMPT')
        assert prepare_inproc(turn, root)
        task = {'goal': child._hcv_original_goal, 'task_name': child._task_name, 'agent_path': child._agent_path}
        batch = _Batch([task], [(0, task, child)], root, {'model':'fixture'}, None, 'leaf', 1,
                       'original-unit', [], [], '', 'root', None, None, True, time.monotonic())
        work = threading.Thread(target=contextvars.copy_context().run,
                                args=(lambda: _execute_and_aggregate(batch, honor_parent_interrupt=False),), daemon=True)
        work.start()
        workers.append(work)
        assert child.started.wait(3)
        allow_settle = threading.Event()
        def root_model():
            assert root._hard_interrupt_requested.wait(5)
            assert allow_settle.wait(5)
            settle(row, turn)
        model = threading.Thread(target=contextvars.copy_context().run, args=(root_model,), daemon=True)
        model.start()
        workers.append(model)
        try:
            timed_out = asyncio.run(stop_tree(connection, ref, {'execution_generation':row['generation'],
                'cascade':True, 'request_id':'stop-once', 'timeout_ms':0}))
            assert timed_out['state'] == 'timeout', timed_out
            assert any(item['kind'] == 'root' for item in timed_out['remaining'])
            assert asyncio.run(tree_status(connection, ref, {}))['state'] == 'timeout'
        finally:
            allow_settle.set()
        for worker in workers:
            worker.join(3)
        assert all(not worker.is_alive() for worker in workers)
        assert not has_live_for_session(parent_session_id='root', profile_home=home)
        stopped = asyncio.run(tree_status(connection, ref, {'checkpoint_id': timed_out['checkpoint_id']}))
        assert stopped['state'] == 'stopped', stopped
        assert authority.delivered_stops['root'] == row['generation'], 'Native authority.interrupt must own the root stop'
        assert stopped['root_stored_id'] == 'root'
        repeated = asyncio.run(stop_tree(connection, ref, {'execution_generation':row['generation'],
            'cascade':True, 'checkpoint_id':stopped['checkpoint_id'], 'timeout_ms':3000}))
        assert repeated['state'] == 'stopped' and repeated['checkpoint_id'] == stopped['checkpoint_id']
        # A real completion note changes transcript watermark, not the accepted
        # human revision. It must be seen by the same continuation, not replayed.
        db.append_messages_batch('root', [{'role':'assistant','content':'ACTUAL_COMPLETION_NOTE'}])
        assert human_revision(authority, 'root') == row['seq']
        request_id = 'hcv-tree-continue-' + stopped['checkpoint_id']
        _state(authority)['continue']['root'] = {'checkpoint_id':stopped['checkpoint_id'], 'request_id':request_id}
        resumed_row, resumed_turn = claim(request_id)
        constructed = []
        def factory(**kwargs):
            value = Agent(**kwargs)
            constructed.append(value)
            return value
        monkeypatch.setattr(delegates, '_resolve_child_runtime', lambda *a, **kw: {'provider':'fixture','model':'fixture','base_url':'http://127.0.0.1:1'})
        monkeypatch.setattr(delegates, '_resolve_child_credential_pool', lambda *a, **kw: None)
        monkeypatch.setattr(delegates, '_load_config', lambda: {'max_iterations':5})
        with patch.dict(sys.modules, {'run_agent':SimpleNamespace(AIAgent=factory)}):
            assert prepare_inproc(resumed_turn, root)
        deadline = time.monotonic() + 5
        event = None
        while time.monotonic() < deadline:
            try:
                value = process_registry.completion_queue.get(timeout=.05)
            except Exception:
                continue
            if value.get('parent_session_id') == 'root':
                event = value
                break
        assert event and event['session_key'] == 'agent:fixture:root', event
        assert event['origin_ui_session_id'] == 'root'
        assert event['results'][0]['summary'] == 'RESUMED_child', event
        assert event['results'][0]['task_name'] == 'method_review'
        assert event['results'][0]['agent_path'] == '/root/method_review'
        assert len(constructed) == 1 and constructed[0]._subagent_id == 'sa-preserved'
        assert sum(m.get('content') == 'COMPLETED_TOOL_KEEP_ONCE' for m in db.get_messages('child')) == 1
        assert not has_live_for_session(parent_session_id='root', profile_home=home)
        # The root continues exactly as the current real native claim; no
        # duplicate prompt or synthetic TUI execution was opened by the helper.
        assert resumed_turn._hcv_tree_adapter.admission_id == resumed_row['admission_id']
        assert authority.executing['root'] == resumed_row['generation']
        settle(resumed_row, resumed_turn)
    finally:
        root.hard_interrupt()
        child.hard_interrupt()
        for worker in workers:
            worker.join(5)
        db.close()
        from hermes_state_registry import close_all_under
        close_all_under(home)
        reset_hermes_home_override(token)

from types import SimpleNamespace
from test_managed_resume import managed
from tools.delegate_tool import _restore_child_transcript
from agent.runtime_session_child import reserve_child_store
from run_agent import AIAgent

def test_resumed_managed_child_uses_native_constructor_contract_without_reserved_sidecar_merge(tmp_path,monkeypatch):
    with managed(tmp_path,monkeypatch) as (db,parent,connection,scope):
        original=reserve_child_store(parent)
        sid=original.reserved_session_id
        original.create_session(sid,'subagent',model='fixture')
        original.append_messages_batch(sid,[{'role':'user','content':'KEEP_ORIGINAL_GOAL'},
            {'role':'assistant','content':'KEEP_COMPLETED_RESULT'}])
        original.close()
        resumed=reserve_child_store(parent,resume_session_id=sid)
        try:
            agent=SimpleNamespace(_session_db=resumed,session_id=sid,_persist_disabled=False,
                _session_db_created=False,platform='subagent',model='fixture',_cached_system_prompt='fixture system',
                _parent_session_id='parent',_session_row_model_config=lambda:{'max_iterations':250,
                    '_task_name':'review','_agent_path':'/root/review','_delegate_from':'parent'})
            _restore_child_transcript(agent,{'stored_id':sid})
            AIAgent._ensure_db_session(agent)
            assert agent._session_db_created,'Native worker constructor must succeed before model access'
            assert not resumed.failure
            assert not agent._session_db_reserved
            assert any(row.get('content')=='KEEP_COMPLETED_RESULT' for row in agent._hcv_resume_history)
            resumed.append_messages_batch(sid,[{'role':'user','content':'CONTINUE'},
                {'role':'assistant','content':'REAL_RESUMED_RESULT'}])
            messages=db.get_messages(sid)
            assert [row['content'] for row in messages].count('KEEP_COMPLETED_RESULT')==1
            assert messages[-1]['content']=='REAL_RESUMED_RESULT'
        finally:
            resumed.close()

def test_resumed_plain_sessiondb_retains_its_native_reserved_constructor_merge(tmp_path):
    from hermes_state import SessionDB
    db=SessionDB(db_path=tmp_path/'state.db')
    try:
        db.create_session('child','subagent')
        child=SimpleNamespace(_session_db=db,session_id='child')
        _restore_child_transcript(child,{'stored_id':'child'})
        assert child._session_db_reserved is True
    finally:
        db.close()

import asyncio
import json
import unittest

from agent.runtime_session_child import reserve_child_store
from gateway.session_worker import worker_request
from hermes_state_runtime import RuntimeStoreError
from test_managed_resume import managed


def publish(store, old, new, source, profile='test'):
    assert store.try_acquire_compression_lock(old, 'compression-test-holder')
    cfg = store.get_session(old).get('model_config')
    cfg = json.loads(cfg) if isinstance(cfg, str) else cfg
    store.publish_compression_child(parent_session_id=old, child_session_id=new, source=source,
        messages=[{'role': 'user', 'content': 'COMPACTED_CONTEXT_' + new}], profile_name=profile,
        compression_lock_holder='compression-test-holder', model_config=cfg)


def test_actual_managed_compression_parent_and_child_keep_scope_identity_history(tmp_path, monkeypatch):
    with managed(tmp_path, monkeypatch) as (db, parent, connection, scope):
        child = reserve_child_store(parent)
        original_child = child.reserved_session_id
        child.create_session(original_child, 'subagent', model_config={'_task_name': 'compression_review',
            '_agent_path': '/root/compression_review', '_subagent_id': 'sa-compression-original'})
        child.append_messages_batch(original_child, [{'role': 'user', 'content': 'ORIGINAL_GOAL'},
            {'role': 'assistant', 'content': 'COMPLETED_TOOL_KEEP_ONCE'}])
        publish(child, original_child, 'child-tip', 'subagent')
        assert child.scope['session_id'] == 'child-tip'
        child.append_messages_batch('child-tip', [{'role': 'assistant', 'content': 'TIP_PARTIAL_KEEP_ONCE'}])
        child.close()
        publish(parent, 'parent', 'parent-tip', 'kanban')
        assert parent.scope['session_id'] == 'parent-tip'
        # The new owner asks with its verified rotated assignment, not the old claim.
        resumed = reserve_child_store(parent, resume_session_id='child-tip')
        try:
            proof = resumed._hcv_resume_context
            assert proof['origin_parent_id'] == 'parent'
            assert proof['origin_child_id'] == original_child
            assert proof['parent_compression_ids'] == ['parent', 'parent-tip']
            assert proof['child_compression_ids'] == [original_child, 'child-tip']
            assert resumed.scope['session_id'] == 'child-tip'
            assert db.get_session('child-tip')['parent_session_id'] == original_child
            assert db.get_session(original_child)['parent_session_id'] == 'parent'
            history = resumed.get_messages_as_conversation('child-tip')
            assert sum(m.get('content') == 'TIP_PARTIAL_KEEP_ONCE' for m in history) == 1
            cfg = json.loads(db.get_session('child-tip')['model_config'])
            assert cfg['_task_name'] == 'compression_review'
            assert cfg['_agent_path'] == '/root/compression_review'
            assert cfg.get('_subagent_id') == json.loads(db.get_session(original_child)['model_config']).get('_subagent_id')
            from tools.delegate_tree_lineage import store_compression_ids
            assert store_compression_ids(parent, 'parent-tip') == ['parent', 'parent-tip']
            assert store_compression_ids(resumed, 'child-tip') == [original_child, 'child-tip']
        finally:
            resumed.close()
        assert [m['content'] for m in db.get_messages('foreign-child')] == ['NEIGHBOR_UNTOUCHED']


def test_managed_resume_rejects_branch_reset_delegate_tool_foreign_profile_and_nonpreferred_sibling(tmp_path, monkeypatch):
    with managed(tmp_path, monkeypatch) as (db, parent, connection, scope):
        db.create_session('old-owner', source='kanban', profile_name='test')
        db.end_session('old-owner', 'compression')
        db.create_session('old-child', source='subagent', parent_session_id='old-owner', profile_name='test',
                          model_config={'_delegate_from': 'old-owner'})
        cases = [({'_branched_from': 'old-owner'}, 'kanban', 'test'),
                 ({'_reset_from': 'old-owner'}, 'kanban', 'test'),
                 ({'_delegate_from': 'old-owner'}, 'subagent', 'test'),
                 ({}, 'tool', 'test'), ({}, 'kanban', 'other-profile')]
        for config, source, profile in cases:
            db._execute_write(lambda conn: conn.execute(
                'UPDATE sessions SET parent_session_id=?,model_config=?,source=?,profile_name=? WHERE id=?',
                ('old-owner', json.dumps(config), source, profile, 'parent')))
            params = dict(parent.scope, sequence=parent.journal['next_sequence'], operation='child.reserve',
                          payload={'secret': 'test-child-secret-0000000001', 'resume_session_id': 'old-child'})
            with unittest.TestCase().assertRaisesRegex(RuntimeStoreError, 'permission_denied'):
                asyncio.run(worker_request(connection, None, params, operation='persist'))
        # A sibling can be related by attribution while not being the native preferred continuation.
        db._execute_write(lambda conn: conn.execute(
            "UPDATE sessions SET model_config=NULL,source='kanban',profile_name='test' WHERE id='parent'"))
        db.create_session('newer-preferred', source='kanban', parent_session_id='old-owner', profile_name='test')
        assert db.get_compression_chain('old-owner')[-1] == 'newer-preferred'
        with unittest.TestCase().assertRaisesRegex(RuntimeStoreError, 'permission_denied'):
            asyncio.run(worker_request(connection, None, params, operation='persist'))
        with db._read_ctx() as conn:
            assert conn.execute("SELECT COUNT(*) FROM worker_executions WHERE kind='child'").fetchone()[0] == 0

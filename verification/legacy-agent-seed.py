"""Only isolated GUI fixtures: canonical saved children plus truncated legacy receipts."""
from pathlib import Path
import json
import os
import time

PARENT = '20261108_124503_aab003'
TITLE = 'Сохранённые агенты'
CASES = (
    ('sa-0-cafe1101', '20261121_100001_1e9a01', 'deleg_fixture_legacy_named', 'saved_history_audit',
     'Проверь сохранённую историю именованного агента. ', 'Именованный сохранённый агент завершил проверку.'),
    ('sa-0-cafe1102', '20261121_100002_1e9a02', 'deleg_fixture_legacy_unnamed', None,
     'Проверь старую историю, где имя никогда не сохранялось. ', 'Старый агент без имени завершил проверку.'),
)


def seed_legacy_agents(db, project_folder, *, now=None):
    home = Path(os.environ.get('HERMES_HOME', '')).resolve()
    database = Path(db.db_path).resolve()
    if home.name != 'hermes-home' or database.parent != home:
        raise RuntimeError('Legacy GUI seed is allowed only in the separate hermes-home fixture')
    started = (time.time() if now is None else now) - 300
    db.create_session(PARENT, 'desktop', model='mock-model', cwd=str(project_folder),
                      profile_name='default', git_repo_root=str(project_folder))
    db.set_session_title(PARENT, TITLE)
    db.append_message(PARENT, 'user', 'Покажи результаты сохранённых проверяющих.', timestamp=started)
    proof = []
    for index, (worker, child, delegation, task_name, sentence, report) in enumerate(CASES):
        goal = sentence * 12 + 'Не меняй исходные файлы.'
        call = 'call_legacy_saved_' + str(index)
        # Neither args nor the dispatch/result store the friendly name or path.
        # The first case can recover it ONLY from the owned child's model_config.
        args = {'tasks': [{'goal': goal}], 'background': True}
        db.append_message(PARENT, 'assistant', None, tool_calls=[{'id': call, 'type': 'function',
            'function': {'name': 'delegate_task', 'arguments': json.dumps(args)}}], timestamp=started + 10 + index * 40)
        handle = {'status': 'dispatched', 'mode': 'background', 'count': 1, 'delegation_id': delegation,
                  'subagent_ids': [worker], 'goals': [goal], 'refused': []}
        db.append_message(PARENT, 'tool', json.dumps(handle), tool_name='delegate_task', tool_call_id=call,
                          timestamp=started + 11 + index * 40)
        db.append_message(PARENT, 'assistant', 'Сохранённое поручение передано проверяющему ' + str(index + 1) + '.',
                          timestamp=started + 12 + index * 40)
        config = {'_subagent_id': worker, '_delegate_from': PARENT,
                  'reasoning_config': {'enabled': True, 'effort': 'max'}}
        if task_name:
            config.update(_task_name=task_name, _agent_path='/root/' + task_name)
        db.create_session(child, 'subagent', parent_session_id=PARENT, cwd=str(project_folder),
                          profile_name='default', model='gpt-6.1-sol', model_config=config)
        db.set_session_hidden(child, True)
        db.append_message(child, 'user', goal, timestamp=started + 13 + index * 40)
        db.append_message(child, 'assistant', report, timestamp=started + 20 + index * 40)
        db.end_session(child, 'completed')
        result = {'results': [{'task_index': 0, 'status': 'completed', 'summary': report,
                               'model': 'gpt-6.1-sol', 'duration_seconds': 7}], 'delegation_id': delegation}
        def insert(conn):
            conn.execute('''INSERT INTO async_delegations
                (delegation_id,origin_session,origin_ui_session_id,parent_session_id,state,
                 dispatched_at,completed_at,updated_at,result_json,delivery_state,delivered_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?)''',
                (delegation, PARENT, PARENT, PARENT, 'completed', started + 10 + index * 40,
                 started + 20 + index * 40, started + 20 + index * 40, json.dumps(result),
                 'delivered', started + 22 + index * 40))
        db._execute_write(insert)
        heading = 'Subagent Task Completed: ' + goal[:175] + '…'
        raw = '[ASYNC DELEGATION COMPLETE — ' + delegation + ']\n--- RESULT ---\n' + report
        # The legacy metadata intentionally lacks delegation_id. Its exact
        # producer marker owns the relationship; no heading/goal matching.
        row_id = db.append_message(PARENT, 'user', raw, display_kind='async_delegation_complete',
            display_metadata={'display_text': heading}, timestamp=started + 22 + index * 40)
        db.append_message(PARENT, 'assistant', 'Сохранённый результат ' + str(index + 1) + ' получен.',
                          timestamp=started + 23 + index * 40)
        proof.append({'worker': worker, 'child': child, 'delegation': delegation, 'receiptRowId': row_id,
                      'hasStoredName': bool(task_name), 'goalLength': len(goal), 'headingLength': len(heading)})
    return {'parent': PARENT, 'title': TITLE, 'cases': proof}

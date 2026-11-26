from hermes_state import SessionDB
from hermes_state_runtime import (RuntimeStoreError, admit_session_input, begin_runtime_epoch,
                                  claim_session_input, list_session_admissions)


def test_queue_reorder_persists_and_is_used_by_claim(tmp_path):
    from gateway.hcv_queue_order import reorder

    db_path = tmp_path / 'queue.db'
    with SessionDB(db_path) as db:
        db.create_session('target', 'gui')
        db.create_session('neighbor', 'gui')
        epoch = begin_runtime_epoch(db, instance_id='one')
        def add(session, text, extra=None):
            return admit_session_input(db, epoch=epoch, session_id=session, principal_id='owner',
                request_id=text, payload={'text': text, **(extra or {})})
        a = add('target', 'A')
        hidden = add('target', 'Automation', {'local_automation_v1': True})
        b = add('target', 'B')
        add('neighbor', 'Neighbor')
        ids = [a['admission_id'], b['admission_id']]
        result = reorder(db, epoch=epoch, session_id='target', principal='owner', expected=ids,
                         desired=ids[::-1], eligible=lambda row: 'local_automation_v1' not in row['payload'])
        assert result == ids[::-1]
        try:
            reorder(db, epoch=epoch, session_id='target', principal='owner', expected=ids,
                    desired=ids[::-1], eligible=lambda row: True)
        except RuntimeStoreError as exc:
            assert exc.reason == 'stale_queue_order'
        else:
            raise AssertionError('changing eligible ids must invalidate the original order')
        c = add('target', 'C')
        assert [row['admission_id'] for row in list_session_admissions(db, session_id='target')] == [
            b['admission_id'], hidden['admission_id'], a['admission_id'], c['admission_id']]
        assert [row['seq'] for row in list_session_admissions(db, session_id='target', pending_only=False)] == sorted(
            [row['seq'] for row in (a, hidden, b, c)])
    with SessionDB(db_path) as db:
        epoch = begin_runtime_epoch(db, instance_id='two')
        assert claim_session_input(db, epoch=epoch, session_id='target', head=ids[0]) is False
        claimed = claim_session_input(db, epoch=epoch, session_id='target', head=ids[1])
        assert isinstance(claimed, dict) and claimed['request_id'] == 'B'
        assert list_session_admissions(db, session_id='neighbor')[0]['request_id'] == 'Neighbor'


if __name__ == '__main__':
    from pathlib import Path
    from tempfile import TemporaryDirectory

    with TemporaryDirectory() as directory:
        test_queue_reorder_persists_and_is_used_by_claim(Path(directory))

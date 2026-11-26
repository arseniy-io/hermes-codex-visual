"""Owner boundary tests use the real admission ledger and completion-note writer.

The model/physical worker is tested by the separate managed/inproc suites.
Here only the worker's durable resume acknowledgement is deliberately simulated.
"""
import asyncio
from contextlib import contextmanager
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest

HERE = Path(__file__).resolve().parent
from gateway import hcv_tree_owner as owner
from gateway.session_contract import AdmissionReceipt, SessionActor, SessionHandle, SessionRef, Submission
from hermes_constants import hermes_home_key
from hermes_state import SessionDB
import hermes_state_runtime as rt


class Authority:
    def __init__(self, folder):
        self.profile_id = str(folder)
        self.db = SessionDB(db_path=folder / 'state.db')
        self.db.create_session('root', source='tui', profile_name='fixture')
        self.epoch = rt.begin_runtime_epoch(self.db, instance_id='owner-test')
        self.instance_id = 'owner-test'
        self.runner = SimpleNamespace()
        self.sessions = {'root': SimpleNamespace()}
        self.submits = 0
        self.scheduled = 0
        self.cancel_saw_result = []
        self.on_submit = None
    def authorize(self, actor, ref, capability):
        if actor.profile_id != self.profile_id or ref.profile_id != self.profile_id:
            raise rt.RuntimeStoreError('profile_mismatch')
        if capability not in actor.capabilities:
            raise rt.RuntimeStoreError('permission_denied')
    def _handle(self, ref):
        row = self.db.get_session(ref.session_id)
        pending = rt.list_session_admissions(self.db, session_id=ref.session_id)
        state = 'running' if any(row['status'] == 'started' for row in pending) else 'idle'
        return SessionHandle(ref, self.instance_id, self.epoch, row['runtime_revision'], row['runtime_generation'], state)
    def check_approval_generation(self, sid, generation):
        handle = self._handle(SessionRef(self.profile_id, sid))
        if generation != handle.execution_generation or handle.execution_state != 'running':
            raise rt.RuntimeStoreError('stale_generation')
    def physical_target(self, ref):
        return self.db.get_compression_tip(ref.session_id)
    def _schedule(self, ref):
        self.scheduled += 1
    async def submit(self, actor, request):
        self.authorize(actor, request.ref, 'session:submit')
        self.submits += 1
        row = rt.admit_session_input(self.db, epoch=self.epoch, principal_id=actor.subject,
                                    session_id=request.ref.session_id, request_id=request.request_id, payload=dict(request.payload))
        if self.on_submit:
            self.on_submit(row)
        return AdmissionReceipt(row['admission_id'], request.ref, row['seq'], row['status'],
                                row['outcome'], self.epoch, row['generation'])
    async def cancel_queued(self, actor, ref, admission_id):
        self.authorize(actor, ref, 'session:submit')
        self.cancel_saw_result.append(str(self.db.get_messages_as_conversation('root')))
        return rt.cancel_session_input(self.db, epoch=self.epoch, admission_id=admission_id)


@contextmanager
def case():
    with tempfile.TemporaryDirectory(prefix='owner-', dir=HERE) as folder:
        authority = Authority(Path(folder))
        actor = SessionActor('human', authority.profile_id,
                             frozenset({'session:read', 'session:submit', 'session:control'}), 'socket')
        ref = SessionRef(authority.profile_id, 'root')
        connection = SimpleNamespace(authority=authority, actor=actor)
        first = rt.admit_session_input(authority.db, epoch=authority.epoch, principal_id=actor.subject,
                                      session_id='root', request_id='original', payload={'text': 'Original task'})
        claimed = rt.claim_session_input(authority.db, epoch=authority.epoch, session_id='root', head=first['admission_id'])
        rt.settle_session_input(authority.db, epoch=authority.epoch, admission_id=first['admission_id'],
                                generation=claimed['generation'], outcome='interrupted', result={})
        cp = {'schema': 1, 'owner': owner._owner(authority, 'root'), 'checkpoint_id': 'paused', 'state': 'stopped',
              'nodes': [], 'children_resumed': [], 'remaining': [],
              'stopped_tip': {'stored_id': 'root', 'human_sequence': owner.human_revision(authority, 'root')}}
        owner._store(authority).write(cp)
        try:
            yield authority, actor, ref, connection, cp
        finally:
            authority.db.close()


class OwnerTest(unittest.TestCase):
    def test_refused_submit_and_exact_old_retry_preserve_pause(self):
        async def run():
            with case() as (a, actor, ref, conn, cp):
                with self.assertRaises(rt.RuntimeStoreError):
                    async with owner.user_submission_scope(conn, ref) as result:
                        result['value'] = await a.submit(actor, Submission('original', ref, {'text': 'Changed payload'}, 'queue'))
                self.assertEqual(owner._read(a, 'root'), cp)
                async with owner.user_submission_scope(conn, ref) as result:
                    result['value'] = await a.submit(actor, Submission('original', ref, {'text': 'Original task'}, 'queue'))
                self.assertEqual(owner._read(a, 'root'), cp)
        asyncio.run(run())

    def test_successful_new_submit_invalidates_only_after_native_commit(self):
        async def run():
            with case() as (a, actor, ref, conn, cp):
                async with owner.user_submission_scope(conn, ref) as result:
                    result['value'] = await a.submit(actor, Submission('new', ref, {'text': 'New instruction'}, 'queue'))
                    self.assertEqual(owner._read(a, 'root'), cp)
                    self.assertTrue(owner.claim_paused(a, ref))
                self.assertTrue(owner._read(a, 'root')['invalidated_by_new_turn'])
                self.assertFalse(owner.claim_paused(a, ref))
        asyncio.run(run())

    def test_completed_child_result_is_not_lost_or_repeated_when_wake_is_withdrawn(self):
        async def run():
            with case() as (a, actor, ref, conn, cp):
                identity = '["async_delegation","finished-child"]'
                row = rt.admit_session_input(a.db, epoch=a.epoch, principal_id=actor.subject,
                    session_id='root', request_id='completion', payload={'text': 'EXACT_COMPLETED_CHILD_RESULT',
                    'local_automation_v1': {'identity': identity, 'display_kind': 'async_delegation_complete'}})
                self.assertEqual(owner.human_revision(a, 'root'), cp['stopped_tip']['human_sequence'])
                self.assertTrue(owner.claim_paused(a, ref))
                await owner._cancel_old_notifications(conn, ref)
                await owner._cancel_old_notifications(conn, ref)
                messages = a.db.get_messages_as_conversation('root')
                self.assertEqual(str(messages).count('EXACT_COMPLETED_CHILD_RESULT'), 1)
                self.assertIn('EXACT_COMPLETED_CHILD_RESULT', a.cancel_saw_result[0])
                self.assertEqual(rt.get_session_admission(a.db, admission_id=row['admission_id'])['status'], 'terminal')
                self.assertEqual(owner.human_revision(a, 'root'), cp['stopped_tip']['human_sequence'])
        asyncio.run(run())

    def test_exact_idle_stop_and_native_owner_normalization(self):
        async def run():
            with case() as (a, actor, ref, conn, cp):
                generation = a._handle(ref).execution_generation
                for _ in range(3):
                    result = await owner.stop_tree(conn, ref, {'checkpoint_id': 'paused', 'execution_generation': generation})
                    self.assertEqual(result['state'], 'stopped')
                    self.assertEqual(result['checkpoint_id'], 'paused')
                self.assertEqual(owner._owner(a, 'root')['profile_home'], hermes_home_key(a.profile_id))
                with self.assertRaises(rt.RuntimeStoreError):
                    await owner.stop_tree(conn, ref, {'checkpoint_id': 'old', 'execution_generation': generation})
                with self.assertRaises(rt.RuntimeStoreError):
                    await owner.stop_tree(conn, ref, {'checkpoint_id': 'paused', 'execution_generation': generation + 1})
        asyncio.run(run())

    def test_continue_native_admission_is_single_and_awaits_the_durable_worker_receipt(self):
        async def run():
            with case() as (a, actor, ref, conn, cp):
                acknowledged = asyncio.Event()
                tasks = []
                def admitted(row):
                    self.assertFalse(owner.claim_paused(a, ref))
                    self.assertEqual(owner.managed_bootstrap(a, ref, row)['checkpoint_id'], 'paused')
                    async def worker_receipt():
                        await acknowledged.wait()
                        value = owner._read(a, 'root')
                        value.update(state='resumed', children_resumed=[{'stored_id': 'child'}])
                        owner._store(a).write(value)
                    tasks.append(asyncio.create_task(worker_receipt()))
                a.on_submit = admitted
                first = asyncio.create_task(owner.continue_tree(conn, ref, {'checkpoint_id': 'paused'}))
                await asyncio.sleep(.05)
                self.assertFalse(first.done())
                second = asyncio.create_task(owner.continue_tree(conn, ref, {'checkpoint_id': 'paused'}))
                acknowledged.set()
                results = await asyncio.gather(first, second)
                self.assertTrue(all(value['state'] == 'resumed' for value in results))
                self.assertEqual(a.submits, 1)
                self.assertEqual(owner.human_revision(a, 'root'), cp['stopped_tip']['human_sequence'])
                await asyncio.gather(*tasks)
        asyncio.run(run())


if __name__ == '__main__':
    unittest.main(verbosity=2)

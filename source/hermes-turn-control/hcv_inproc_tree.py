"""Tree controls for the canonical owner's actual in-process TurnRunner agent."""
from __future__ import annotations

import asyncio
import contextvars
from pathlib import Path
import time
import threading

from hermes_constants import hermes_home_key
from hermes_state_runtime import RuntimeStoreError, get_session_admission
from gateway.session_contract import SessionRef
from tools.hcv_managed_tree import ManagedTreeAdapter, _public
from tui_gateway.hcv_stop_tree import Checkpoints, TreeControl, StopControlError, _owner_lock


class InprocTreeAdapter(ManagedTreeAdapter):
    def __init__(self, authority, sid, generation, agent, ctx, row, options):
        self.authority, self.logical_root = authority, str(sid)
        self.native_generation, self.agent = generation, agent
        self.root_id = str(agent.session_id)
        self.profile_home = hermes_home_key(authority.profile_id)
        self.human_revision = options['human_revision']
        self.sid, self.store, self._agents = self.logical_root, agent._session_db, {}
        self.session = {'agent': agent, 'transport': None, 'session_key': self.logical_root,
                        'profile_home': self.profile_home, 'history_lock': threading.RLock(),
                        'canonical_authority': authority, 'canonical_root_id': self.logical_root,
                        'canonical_generation': generation, 'canonical_completion_key': ctx.session_key,
                        'canonical_origin_ui_session_id': self.logical_root}
        self.admission_id, self.active, self.admitted = row['admission_id'], False, False
        self.native_interrupt = None
        self.stop_requested = threading.Event()
        if self.logical_root not in self.root_aliases():
            raise StopControlError('Canonical root is not a proven compression owner')
        self.bind_tree_owner()

    def generation(self):
        return {'admission_id': self.admission_id, 'generation': self.native_generation}

    def root_running(self):
        self.root_id = str(self.agent.session_id)
        return bool(self.active and self.authority.executing.get(self.logical_root) == self.native_generation)

    def signal(self, checkpoint):
        from agent.interrupt_compat import request_hard_interrupt
        from tools.async_delegation import interrupt_for_session
        # The owner loop validated actor and generation before handing us this
        # operation. Its FIFO gate prevents a follower from replacing this claim.
        if self.authority.adopted.get(self.logical_root) != (self.native_generation, self.agent):
            raise StopControlError('Current in-process tree owner changed')
        if self.native_interrupt is None:
            raise StopControlError('Native canonical Stop authority is missing')
        self.stop_requested.set()
        self.native_interrupt()
        for stored, profile in self._scopes(checkpoint):
            interrupt_for_session(session_key=stored, parent_session_id=stored,
                                  reason='user_stop_tree', profile_home=profile)
        for record in self._records():
            request_hard_interrupt(record['agent'], 'User stopped this task tree')

    def resume_root(self, checkpoint):
        if (self.authority.adopted.get(self.logical_root) != (self.native_generation, self.agent)
                or self.authority.executing.get(self.logical_root) != self.native_generation):
            raise StopControlError('Continuation is not the current native admission')
        self.active = True
        return {'accepted': True, 'request_id': self.admission_id, 'native_admission': True}


def prepare_inproc(turn, agent):
    owner = turn._approval_owner
    if owner is None:
        return True
    authority, sid, generation = owner
    live = authority.sessions.get(sid)
    if live is None:
        raise StopControlError('Current canonical session owner is missing')
    with live.event_stream.lock:
        if authority.adopted.get(sid) != (generation, agent) or authority.executing.get(sid) != generation:
            raise StopControlError('Current canonical execution changed before preparation')
        execution = dict(live.event_stream.execution)
    row = get_session_admission(authority.db, admission_id=execution.get('admission_id'))
    if not row or row['generation'] != generation or row['target_session_id'] != sid or row['status'] != 'started':
        raise StopControlError('Current native admission cannot be verified')
    from gateway.hcv_tree_owner import managed_bootstrap
    options = managed_bootstrap(authority, SessionRef(authority.profile_id, sid), row)
    adapter = InprocTreeAdapter(authority, sid, generation, agent, turn._ctx, row, options)
    authority.__dict__.setdefault('_hcv_inproc_trees', {})[sid] = adapter
    turn._hcv_tree_adapter = adapter
    checkpoints = Checkpoints(Path(adapter.profile_home) / 'cache/hcv-stop-checkpoints')
    controller = TreeControl(checkpoints, adapter)
    if checkpoint_id := options.get('checkpoint_id'):
        controller.resume(adapter.owner, checkpoint_id)
    else:
        with _owner_lock(adapter.owner):
            if adapter.stop_requested.is_set():
                return False
            checkpoint = checkpoints.read(adapter.owner)
            if checkpoint and not checkpoint.get('invalidated_by_new_turn'):
                if checkpoint['state'] in {'stopping', 'timeout', 'resuming'} or not options.get('allow_new_turn', False):
                    adapter.active = False
                    return False
                checkpoint['invalidated_by_new_turn'] = True
                checkpoints.write(checkpoint)
                adapter.unfence(checkpoint)
    if adapter.stop_requested.is_set():
        return False
    adapter.active = adapter.admitted = True
    return True


def finish_inproc(turn):
    adapter = getattr(turn, '_hcv_tree_adapter', None)
    if adapter is not None:
        adapter.active = False


async def stop_tree(authority, ref, frame, generation, *, actor):
    """Called after native owner authorization, while its FIFO is fenced."""
    request_id = frame['request_id']
    try:
        if (frame['root_id'] != ref.session_id or type(frame.get('human_revision')) is not int
                or frame['human_revision'] < 0):
            raise StopControlError('Invalid canonical tree frame')
        deadline = time.monotonic() + 30
        adapter = None
        while time.monotonic() < deadline:
            authority.check_approval_generation(ref.session_id, generation)
            candidate = getattr(authority, '_hcv_inproc_trees', {}).get(ref.session_id)
            if (candidate is not None and candidate.native_generation == generation
                    and authority.adopted.get(ref.session_id) == (generation, candidate.agent)):
                adapter = candidate
                break
            await asyncio.sleep(.01)
        if adapter is None:
            raise StopControlError('Current in-process tree owner is still constructing')
        adapter.human_revision = frame['human_revision']
        loop = asyncio.get_running_loop()
        adapter.native_interrupt = lambda: asyncio.run_coroutine_threadsafe(
            authority.interrupt(actor, ref, generation), loop).result(timeout=20)
        context = contextvars.copy_context()
        def work():
            authority.check_approval_generation(ref.session_id, generation)
            checkpoints = Checkpoints(Path(adapter.profile_home) / 'cache/hcv-stop-checkpoints')
            value = TreeControl(checkpoints, adapter).stop(adapter.owner, timeout=frame.get('timeout', 15),
                                                          expected_checkpoint_id=frame.get('checkpoint_id'))
            return _public(adapter, value)
        value = await asyncio.to_thread(context.run, work)
        return {'type': 'tree.ack', 'request_id': request_id, 'result': value}
    except Exception as exc:
        return {'type': 'tree.ack', 'request_id': request_id, 'error': str(exc)}

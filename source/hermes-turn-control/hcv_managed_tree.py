"""Canonical managed-worker tree control, never a TUI execution fallback."""
from __future__ import annotations

import contextvars
import logging
from pathlib import Path
import threading
import time

from tui_gateway.hcv_stop_tree import Checkpoints, NativeTreeAdapter, TreeControl, StopControlError, _home, _owner_lock
from tools.delegate_tree_lineage import store_compression_ids


class ManagedTreeAdapter(NativeTreeAdapter):
    def __init__(self, controls, frame, store, root_id):
        self.controls, self.frame, self.store = controls, frame, store
        self.agent = controls.agent
        self.root_id = str(self.agent.session_id)
        self.logical_root = str(root_id)
        self.profile_home = _home(frame['home'])
        self.human_revision = (frame.get('hcv_tree_v1') or {}).get('human_revision', 0)
        self.sid = self.logical_root
        self._agents = {}
        # This is the private current owner record of the worker's actual agent,
        # not tui_gateway.server._sessions or a synthetic UI execution session.
        self.session = {'agent': self.agent, 'transport': controls.channel, 'session_key': self.logical_root,
                        'profile_home': self.profile_home, 'history_lock': threading.RLock()}
        self.active = False
        if self.logical_root not in self.root_aliases():
            raise StopControlError('Canonical root is not a proven compression owner')
        self.bind_tree_owner()

    @property
    def owner(self):
        return {'profile_home': self.profile_home, 'root_id': self.logical_root}

    def generation(self):
        return {'execution_id': self.frame['scope']['execution_id'], 'generation': self.frame['scope']['generation']}

    def tip(self):
        return {'stored_id': self.logical_root, 'human_sequence': self.human_revision}

    def root_running(self):
        self.root_id = str(self.agent.session_id)
        return self.active

    def root_aliases(self):
        self.root_id = str(self.agent.session_id)
        return store_compression_ids(self.store, self.root_id)

    def signal(self, checkpoint):
        from agent.interrupt_compat import request_hard_interrupt
        from tools.async_delegation import interrupt_for_session
        self.controls.stop()
        for stored, profile in self._scopes(checkpoint):
            interrupt_for_session(session_key=stored, parent_session_id=stored,
                                  reason='user_stop_tree', profile_home=profile)
        for record in self._records():
            request_hard_interrupt(record['agent'], 'User stopped this task tree')

    def resume_root(self, checkpoint):
        # The owner already committed this exact continuation admission. The
        # current execute() will call its native run_worker_turns once.
        self.active = True
        return {'accepted': True, 'request_id': self.frame['scope']['execution_id'], 'native_admission': True}


def init_controls(controls):
    controls.hcv_tree = None
    controls.hcv_tree_ready = threading.Event()
    controls.hcv_tree_threads = []
    controls.hcv_tree_lock = threading.Lock()


def _public(adapter, value):
    result = {key: value[key] for key in ('state', 'checkpoint_id', 'remaining', 'children_resumed',
               'root_resume', 'resume_error', 'stopped_at') if key in value}
    result.update(root_runtime_id=adapter.logical_root, root_stored_id=adapter.logical_root,
                  checkpoint_root_stored_id=adapter.root_id, profile_home=adapter.profile_home)
    return result


def begin_stop(controls, frame):
    allowed = {'type', 'request_id', 'root_id', 'checkpoint_id', 'timeout', 'human_revision'}
    if (set(frame) - allowed or not {'type', 'request_id', 'root_id'} <= set(frame)
            or frame.get('type') != 'tree.stop'
            or any(not isinstance(frame.get(key), str) or not 1 <= len(frame[key]) <= 512 for key in ('request_id', 'root_id'))
            or 'human_revision' in frame and (type(frame['human_revision']) is not int or frame['human_revision'] < 0)):
        raise ValueError('invalid_tree_control')
    def work():
        try:
            if not controls.hcv_tree_ready.wait(30):
                raise StopControlError('Tree owner is still constructing')
            adapter = controls.hcv_tree
            if frame['root_id'] != adapter.logical_root:
                raise StopControlError('Tree owner mismatch')
            if 'human_revision' in frame:
                adapter.human_revision = frame['human_revision']
            store = Checkpoints(Path(adapter.profile_home) / 'cache/hcv-stop-checkpoints')
            value = TreeControl(store, adapter).stop(adapter.owner, timeout=frame.get('timeout', 15),
                                                     expected_checkpoint_id=frame.get('checkpoint_id'))
            controls.channel.send('tree.ack', request_id=frame['request_id'], result=_public(adapter, value))
        except Exception as exc:
            controls.channel.send('tree.ack', request_id=frame['request_id'], error=str(exc))
    context = contextvars.copy_context()
    thread = threading.Thread(target=context.run, args=(work,), name='managed-tree-stop', daemon=True)
    with controls.hcv_tree_lock:
        controls.hcv_tree_threads.append(thread)
        thread.start()


def prepare_root(controls, frame, store):
    options = frame.get('hcv_tree_v1') or {'root_id': str(controls.agent.session_id)}
    if (not isinstance(options, dict) or set(options) - {'root_id', 'checkpoint_id', 'allow_new_turn', 'human_revision'}
            or not isinstance(options.get('root_id'), str)
            or 'allow_new_turn' in options and type(options['allow_new_turn']) is not bool
            or 'human_revision' in options and (type(options['human_revision']) is not int or options['human_revision'] < 0)):
        raise ValueError('invalid_tree_bootstrap')
    adapter = controls.hcv_tree = ManagedTreeAdapter(controls, frame, store, options['root_id'])
    controls.hcv_tree_ready.set()
    checkpoints = Checkpoints(Path(adapter.profile_home) / 'cache/hcv-stop-checkpoints')
    controller = TreeControl(checkpoints, adapter)
    if checkpoint_id := options.get('checkpoint_id'):
        controller.resume(adapter.owner, checkpoint_id)
    else:
        with _owner_lock(adapter.owner):
            checkpoint = checkpoints.read(adapter.owner)
            if checkpoint and not checkpoint.get('invalidated_by_new_turn'):
                if checkpoint['state'] in {'stopping', 'timeout', 'resuming'}:
                    return False
                if not options.get('allow_new_turn', False):
                    return False
                checkpoint['invalidated_by_new_turn'] = True
                checkpoints.write(checkpoint)
                adapter.unfence(checkpoint)
        adapter.active = not controls.stopped.is_set()
    return not controls.stopped.is_set()


def finish_root(controls):
    adapter = controls.hcv_tree
    if adapter is None:
        return
    adapter.active = False
    # A managed admission otherwise retires its interpreter immediately after
    # root's answer. Its genuine detached children must finish/publish first.
    from tools.async_delegation import has_live_for_session
    while not controls.stopped.is_set() and any(
            has_live_for_session(session_key=sid, parent_session_id=sid, profile_home=adapter.profile_home)
            for sid in adapter.root_aliases()):
        time.sleep(.02)
    with controls.hcv_tree_lock:
        threads = list(controls.hcv_tree_threads)
    for thread in threads:
        if thread is not threading.current_thread():
            thread.join()
    if threads:
        # The owning worker is about to retire. Recheck here while its
        # native child results and process records are still available.
        try:
            checkpoints = Checkpoints(Path(adapter.profile_home) / 'cache/hcv-stop-checkpoints')
            TreeControl(checkpoints, adapter).status(adapter.owner, stop_generation=adapter.generation())
        except Exception:
            logging.getLogger(__name__).warning('Could not confirm a late tree stop', exc_info=True)

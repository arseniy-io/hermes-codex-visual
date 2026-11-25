"""Explicit, owner-scoped Stop-tree and durable continuation receipts.

This is an opt-in companion for session.interrupt(cascade=True), not the
ordinary interrupt used by edit/resend. No OS process is suspended or replayed.
"""
from __future__ import annotations

import hashlib
from contextlib import nullcontext
import json
import os
from pathlib import Path
import threading
import time
import uuid


class StopControlError(RuntimeError):
    pass


def _atomic_replace(source, target):
    # Windows readers briefly deny delete-sharing. Keep the previous complete
    # receipt visible while retrying that transient rename; never truncate it.
    for attempt in range(100):
        try:
            os.replace(source, target)
            return
        except PermissionError:
            if attempt == 99:
                raise
            time.sleep(.01)


class Checkpoints:
    def __init__(self, folder):
        self.folder = Path(folder)

    def path(self, owner):
        key = hashlib.sha256(json.dumps(owner, sort_keys=True).encode()).hexdigest()
        return self.folder / (key + ".json")

    def read(self, owner):
        path = self.path(owner)
        if not path.exists():
            return None
        value = json.loads(path.read_text(encoding="utf-8"))
        if value.get("owner") != owner or value.get("schema") != 1:
            raise StopControlError("Checkpoint ownership/schema mismatch")
        return value

    def write(self, value):
        self.folder.mkdir(parents=True, exist_ok=True)
        path = self.path(value["owner"])
        tmp = path.with_name(path.name + "." + uuid.uuid4().hex[:8] + ".tmp")
        try:
            with tmp.open("x", encoding="utf-8") as stream:
                json.dump(value, stream, ensure_ascii=False, sort_keys=True)
                stream.flush()
                os.fsync(stream.fileno())
            _atomic_replace(tmp, path)
        finally:
            tmp.unlink(missing_ok=True)


_locks_guard = threading.Lock()
_locks = {}
_outcome_guard = threading.Lock()
_outcome_targets = {}
_prepared_children = {}
_spawn_guard = threading.RLock()
_tree_spawn_refused = {}


def _home(value=None):
    from hermes_constants import hermes_home_key
    return hermes_home_key(value)


def track_prepared_child(child, parent):
    if getattr(child, '_hcv_started', False):
        return
    owner_home = getattr(parent, '_hcv_owner_profile_home', None)
    if not owner_home:
        database = getattr(parent, '_session_db', None)
        path = getattr(database, 'db_path', None)
        owner_home = str(Path(path).parent) if isinstance(path, (str, Path)) else _home()
    child._hcv_owner_profile_home = _home(owner_home)
    root_id = getattr(parent, '_hcv_tree_owner_root', None)
    if not root_id:
        root, seen = parent, set()
        while id(root) not in seen:
            seen.add(id(root))
            reference = getattr(root, '_delegate_parent_ref', None)
            ancestor = reference() if callable(reference) else None
            if ancestor is None:
                break
            root = ancestor
        root_id = str(getattr(root, 'session_id', '') or '')
    child._hcv_tree_owner_root = root_id
    with _spawn_guard:
        if (child._hcv_owner_profile_home, root_id) in _tree_spawn_refused:
            raise StopControlError('This task tree is stopped; continue it before creating helpers')
        with _outcome_guard:
            _prepared_children[id(child)] = {'agent': child, 'subagent_id': getattr(child, '_subagent_id', None),
                'owner_agent_session_id': str(getattr(parent, 'session_id', '') or ''),
                'goal': getattr(child, '_hcv_original_goal', ''), 'prepared': True,
                'delegation_id': getattr(child, '_delegation_id', None)}


def forget_prepared_child(child, *, started=False):
    with _outcome_guard:
        entry = _prepared_children.get(id(child))
        if entry is not None and entry['agent'] is child:
            _prepared_children.pop(id(child), None)
    if started:
        child._hcv_started = True


def close_prepared_child(child):
    with _outcome_guard:
        entry = _prepared_children.get(id(child))
    if entry is not None and entry['agent'] is child:
        status = 'interrupted' if getattr(child, '_interrupt_requested', False) else 'error'
        record_child_outcome(child, {'status': status, 'exit_reason': status})
        forget_prepared_child(child)


def record_child_outcome(child, entry):
    """Typed lifecycle receipt, written before the child leaves the registry."""
    value = {"stored_id": str(getattr(child, "session_id", "") or ""),
             "status": entry.get("status"), "exit_reason": entry.get("exit_reason")}
    child._hcv_last_turn_outcome = value
    with _outcome_guard:
        target = _outcome_targets.get(id(child))
    path = target[1] if target is not None and target[0] is child else None
    if path is not None and len(target) > 2:
        node = target[2]
        if node['stored_id'] != value['stored_id']:
            try:
                from tools.delegate_tree_lineage import store_compression_ids
                ids = store_compression_ids(child._session_db, value['stored_id'])
                if node['stored_id'] not in ids:
                    raise StopControlError('Child rotated outside its proven compression chain')
                node.update(stored_id=value['stored_id'], compression_ids=ids)
                path = path.with_name(hashlib.sha256(value['stored_id'].encode()).hexdigest()[:20] + '.json')
            except Exception as exc:
                child._hcv_outcome_persist_error = str(exc)
                return
    if path is not None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(path.name + "." + uuid.uuid4().hex[:8] + ".tmp")
        try:
            temporary.write_text(json.dumps(value), encoding="utf-8")
            _atomic_replace(temporary, path)
            with _outcome_guard:
                if _outcome_targets.get(id(child)) is target:
                    _outcome_targets.pop(id(child), None)
        except OSError as exc:
            child._hcv_outcome_persist_error = str(exc)
        finally:
            temporary.unlink(missing_ok=True)


def _owner_lock(owner):
    key = json.dumps(owner, sort_keys=True)
    with _locks_guard:
        return _locks.setdefault(key, threading.RLock())


class TreeControl:
    """Adapter owns scope, signalling, status and native history continuation.

    A saved 'resuming' receipt is deliberately not retried after a crash: the
    first dispatch might have executed. The caller must reconcile its receipts.
    """
    def __init__(self, store, adapter, *, sleep=time.sleep, monotonic=time.monotonic):
        self.store, self.adapter = store, adapter
        self.sleep, self.monotonic = sleep, monotonic

    def _tip(self):
        method = getattr(self.adapter, "tip", None)
        return method() if callable(method) else None

    def _generation(self):
        method = getattr(self.adapter, "generation", None)
        return method() if callable(method) else None

    def stop(self, owner, *, timeout=15, expected_checkpoint_id=None):
        with _owner_lock(owner):
            old = self.store.read(owner)
            if expected_checkpoint_id is not None:
                if not old or old.get("checkpoint_id") != expected_checkpoint_id:
                    raise StopControlError("Stop checkpoint is no longer current")
                if old.get("invalidated_by_new_turn"):
                    raise StopControlError("Stale Stop cannot interrupt a newer turn")
                if old["state"] == "stopped" and (self.adapter.root_running() or old.get("stopped_tip") != self._tip()):
                    raise StopControlError("Stale Stop cannot interrupt a newer turn")
                expected = old.get("resume_generation") if old["state"] == "resumed" else old.get("stop_generation")
                if self.adapter.root_running() and expected is not None and expected != self._generation():
                    raise StopControlError("Stale Stop generation cannot interrupt a newer turn")
            if old and old["state"] in {"stopped", "resuming", "resumed"}:
                # A later running turn gets a new checkpoint. A repeated click
                # on the stopped/continuing generation never sends more signals.
                if old["state"] == "resuming":
                    raise StopControlError("Continuation is still being admitted")
                if not self.adapter.remaining(old) and old.get("stopped_tip") == self._tip():
                    return old
            admission_guard = getattr(self.adapter, 'admission_guard', None)
            with admission_guard() if callable(admission_guard) else nullcontext():
                if old and old["state"] in {"stopping", "timeout"}:
                    checkpoint = old
                else:
                    checkpoint = {"schema": 1, "owner": owner, "checkpoint_id": uuid.uuid4().hex,
                                  "state": "stopping", "created_at": time.time(),
                                  "nodes": self.adapter.snapshot(), "children_resumed": [],
                                  "process_results": [], "errors": [], "stop_generation": self._generation()}
                    aliases = getattr(self.adapter, 'root_aliases', None)
                    checkpoint['root_aliases'] = aliases() if callable(aliases) else []
                    self.store.write(checkpoint)
                self.adapter.fence(checkpoint)
            # The native root interrupt is sent BEFORE waiting for descendants.
            # Fencing occurs first, so a child admitted after snapshot is refused.
            self.adapter.signal(checkpoint)
            checkpoint["process_results"] = self.adapter.stop_processes(checkpoint)
            deadline = self.monotonic() + max(0, min(float(timeout), 60))
            while True:
                latest = {item["session_id"]: item for item in checkpoint["process_results"]}
                latest.update({item["session_id"]: item for item in self.adapter.stop_processes(checkpoint)})
                checkpoint["process_results"] = list(latest.values())
                remaining = self.adapter.remaining(checkpoint)
                checkpoint["remaining"] = remaining
                if not remaining:
                    self.adapter.reconcile(checkpoint)
                    checkpoint.update(state="stopped", stopped_at=time.time(), stopped_tip=self._tip())
                    self.store.write(checkpoint)
                    return checkpoint
                if self.monotonic() >= deadline:
                    checkpoint.update(state="timeout", checked_at=time.time())
                    self.store.write(checkpoint)
                    return checkpoint
                self.sleep(min(.05, max(0, deadline - self.monotonic())))

    def status(self, owner, *, stop_generation=None):
        with _owner_lock(owner):
            checkpoint = self.store.read(owner)
            if not checkpoint:
                return {"state": "none"}
            if (checkpoint["state"] in {"stopping", "timeout"}
                    and (stop_generation is None or checkpoint.get("stop_generation") == stop_generation)):
                remaining = self.adapter.remaining(checkpoint)
                checkpoint["remaining"] = remaining
                if not remaining:
                    self.adapter.reconcile(checkpoint)
                    checkpoint.update(state="stopped", stopped_at=time.time(), stopped_tip=self._tip())
                self.store.write(checkpoint)
            return checkpoint

    def resume(self, owner, checkpoint_id):
        with _owner_lock(owner):
            checkpoint = self.status(owner)
            if checkpoint.get("checkpoint_id") != checkpoint_id:
                raise StopControlError("Checkpoint is no longer current")
            if checkpoint.get("invalidated_by_new_turn"):
                raise StopControlError("Checkpoint history changed after Stop; continuation refused")
            if checkpoint["state"] == "resumed":
                return checkpoint
            if checkpoint["state"] == "resuming":
                raise StopControlError("Continuation dispatch is unconfirmed; reconcile before retry")
            if checkpoint["state"] != "stopped" or self.adapter.root_running():
                raise StopControlError("Tree is not stopped")
            if checkpoint.get("stopped_tip") != self._tip():
                raise StopControlError("Checkpoint history changed after Stop; continuation refused")
            # Persist before the first external dispatch. A process crash cannot
            # silently retry a possibly successful child/root turn.
            checkpoint.pop('resume_error', None)
            checkpoint.update(state="resuming", resume_started_at=time.time(),
                              resume_attempt=int(checkpoint.get('resume_attempt', 0)) + 1)
            self.store.write(checkpoint)
            try:
                self.adapter.unfence(checkpoint)
                receipts = self.adapter.resume_children(checkpoint)
                checkpoint["children_resumed"] = receipts
                self.store.write(checkpoint)
                checkpoint["root_resume"] = self.adapter.resume_root(checkpoint)
                checkpoint["resume_generation"] = self._generation()
                checkpoint.update(state="resumed", resumed_at=time.time())
                self.store.write(checkpoint)
                return checkpoint
            except Exception as exc:
                checkpoint["resume_error"] = str(exc)
                if isinstance(exc, ValueError) and not checkpoint.get("children_resumed"):
                    # Preparation failed before any dispatch. Keep the stop fence
                    # and allow a safe retry after the missing source is fixed.
                    self.adapter.fence(checkpoint)
                    checkpoint["state"] = "stopped"
                self.store.write(checkpoint)
                raise


class NativeTreeAdapter:
    def __init__(self, server, sid, session):
        self.server, self.sid, self.session = server, sid, session
        self.agent = session.get("agent")
        self.root_id = str(getattr(self.agent, "session_id", "") or session.get("session_key") or "")
        from hermes_constants import get_hermes_home
        self.profile_home = _home(session.get("profile_home") or get_hermes_home())
        if not self.root_id or not self.profile_home:
            raise StopControlError("Missing durable session owner")
        self._agents = {}
        self.bind_tree_owner()

    def bind_tree_owner(self):
        self.agent._hcv_tree_owner_root = self.owner['root_id']
        self.agent._hcv_owner_profile_home = self.profile_home

    def admission_guard(self):
        return _spawn_guard

    @property
    def owner(self):
        return {"profile_home": self.profile_home, "root_id": self.root_id}

    def _records(self):
        from tools.delegate_tool_registry import _active_subagents, _active_subagents_lock, _owns_subagent_record
        with _active_subagents_lock:
            records = [dict(record) for record in _active_subagents.values()]
            # Registration publishes active before removing prepared. Holding
            # the active lock through both reads preserves that handoff.
            with _outcome_guard:
                records += [dict(record) for record in _prepared_children.values()]
        owned = {}
        for record in records:
            child = record.get('agent')
            owner_home = getattr(child, '_hcv_owner_profile_home', None)
            if not owner_home:
                child_home = getattr(child, '_delegate_profile_home', None)
                database_path = getattr(getattr(child, '_session_db', None), 'db_path', None)
                owner_home = child_home or (str(Path(database_path).parent) if isinstance(database_path, (str, Path)) else None)
            if owner_home and _home(owner_home) == self.profile_home and _owns_subagent_record(record, self.agent):
                owned[id(child)] = record
        return list(owned.values())

    def root_aliases(self):
        from tools.delegate_tree_lineage import store_compression_ids
        database = getattr(self.agent, '_session_db', None)
        return store_compression_ids(database, self.root_id) if database is not None else [self.root_id]

    def snapshot(self):
        result = []
        for record in self._records():
            child = record.get("agent")
            stored = str(getattr(child, "session_id", "") or "")
            if not stored:
                raise StopControlError("Cannot stop/resume a child without durable identity")
            self._agents[stored] = child
            from tools.delegate_tree_lineage import store_compression_ids
            database = getattr(child, '_session_db', None)
            try:
                compression_ids = store_compression_ids(database, stored) if database is not None else [stored]
            except Exception:
                if not getattr(child, '_hcv_last_turn_outcome', None):
                    raise
                compression_ids = [stored]  # terminal receipt won the registry/close race
            from tools.terminal_tool import get_session_cwd
            task_id = str(getattr(child, "_current_task_id", "") or record.get("subagent_id") or "")
            result.append({"stored_id": stored, "subagent_id": record.get("subagent_id"),
                           "parent_stored_id": str(record.get("owner_agent_session_id") or self.root_id),
                           "task_name": getattr(child, "_task_name", None),
                           "agent_path": getattr(child, "_agent_path", None),
                           "goal": getattr(child, '_hcv_original_goal', None) or record.get("goal", ""),
                           "context": getattr(child, '_hcv_original_context', None),
                           "images": list(getattr(child, '_delegate_images', None) or []),
                           "prepared": bool(record.get('prepared')),
                           "delegation_id": record.get('delegation_id') or getattr(child, '_delegation_id', None),
                           "compression_ids": compression_ids,
                           "model": getattr(child, "model", None),
                           "provider": getattr(child, "provider", None), "cwd": get_session_cwd(task_id),
                           "profile_home": _home(getattr(child, '_hcv_execution_profile_home', None) or getattr(child, "_delegate_profile_home", None) or self.profile_home),
                           "process_owners": sorted({str(x) for x in getattr(child, "_process_owner_task_ids", ())
                                                     if x} | {str(getattr(child, "_current_task_id", "") or "")} - {""})})
        return result

    def _ids(self, checkpoint):
        return list(dict.fromkeys([self.root_id, *checkpoint.get('root_aliases', ())] + [node["stored_id"] for node in checkpoint["nodes"]]))

    def _scopes(self, checkpoint):
        scopes = {(stored, self.profile_home) for stored in [self.root_id, *checkpoint.get('root_aliases', ())]}
        scopes.update((stored, _home(node.get('profile_home') or self.profile_home)) for node in checkpoint['nodes']
                      for stored in [node['stored_id'], *node.get('compression_ids', ())])
        return scopes

    def fence(self, checkpoint):
        from tools.async_delegation import refuse_for_session
        with _spawn_guard:
            _tree_spawn_refused[(self.profile_home, self.owner['root_id'])] = checkpoint['checkpoint_id']
        for stored, profile in self._scopes(checkpoint):
            refuse_for_session(("hcv-stop-tree", checkpoint["checkpoint_id"], stored, profile),
                               session_key=stored, parent_session_ids=(stored,), profile_home=profile)
        for node in checkpoint["nodes"]:
            child = self._agents.get(node["stored_id"])
            if child is not None:
                with _outcome_guard:
                    _outcome_targets[id(child)] = (child, self._outcome_path(checkpoint, node), node)
                if getattr(child, "_hcv_last_turn_outcome", None):
                    record_child_outcome(child, child._hcv_last_turn_outcome)

    def _outcome_path(self, checkpoint, node):
        key = hashlib.sha256(node["stored_id"].encode()).hexdigest()[:20]
        return Path(self.profile_home) / "cache" / "hcv-stop-checkpoints" / checkpoint["checkpoint_id"] / (key + ".json")

    def _outcome(self, checkpoint, node):
        path = self._outcome_path(checkpoint, node)
        if not path.exists():
            child = self._agents.get(node['stored_id'])
            outcome = getattr(child, '_hcv_last_turn_outcome', None) if child is not None else None
            if outcome:
                with _outcome_guard:
                    _outcome_targets[id(child)] = (child, path, node)
                record_child_outcome(child, outcome)
            if not path.exists():
                return None
        value = json.loads(path.read_text(encoding="utf-8"))
        if value.get("stored_id") != node["stored_id"]:
            raise StopControlError("Child outcome identity mismatch")
        return value

    def reconcile(self, checkpoint):
        for node in checkpoint["nodes"]:
            outcome = self._outcome(checkpoint, node)
            if outcome is None:
                raise StopControlError("Stopped child has no confirmed outcome")
            node["outcome"] = outcome
            node["resumable"] = outcome.get("status") == "interrupted" or outcome.get("exit_reason") == "interrupted"

    def unfence(self, checkpoint):
        from tools.async_delegation import allow_for_session
        with _spawn_guard:
            key = (self.profile_home, self.owner['root_id'])
            if _tree_spawn_refused.get(key) == checkpoint['checkpoint_id']:
                _tree_spawn_refused.pop(key, None)
        for stored, profile in self._scopes(checkpoint):
            allow_for_session(("hcv-stop-tree", checkpoint["checkpoint_id"], stored, profile))

    def signal(self, checkpoint):
        from agent.interrupt_compat import request_hard_interrupt
        from tools.async_delegation import interrupt_for_session
        # This adapter executes in the process owning the actual agent.
        # _interrupt_session_turn purges queued prompts and approvals as usual.
        with self.session["history_lock"]:
            marker = str(self.session.pop("_active_turn_marker_key", "") or "")
        self.server._retire_turn_marker(self.session, marker)
        if self.agent is not None or self.session.get("running") or self.session.get("_compute_host_active"):
            self.server._interrupt_session_turn(self.sid, self.session)
        for stored, profile in self._scopes(checkpoint):
            interrupt_for_session(session_key=stored, parent_session_id=stored, reason="user_stop_tree", profile_home=profile)
        for record in self._records():
            request_hard_interrupt(record.get("agent"), "User stopped this task tree")

    def _process_owners(self, checkpoint):
        owners = {str(value) for value in getattr(self.agent, "_process_owner_task_ids", ()) if value}
        owners.update({str(self.session.get("session_key") or ""), self.root_id,
                       str(getattr(self.agent, "_current_task_id", "") or "")})
        for node in checkpoint["nodes"]:
            owners.update(node.get("process_owners", ()))
        for record in self._records():
            child = record.get("agent")
            owners.update(str(value) for value in getattr(child, "_process_owner_task_ids", ()) if value)
            owners.add(str(getattr(child, "_current_task_id", "") or ""))
        return owners - {""}

    def stop_processes(self, checkpoint):
        from tools.process_registry import process_registry
        result = []
        ids = set()
        for owner, profile in self._process_scopes(checkpoint):
            for record in process_registry.list_sessions(task_id=owner, profile_home=profile):
                if record.get("status") == "running":
                    ids.add(record["session_id"])
        for process_id in ids:
            result.append({"session_id": process_id,
                           **process_registry.kill_process(process_id, source="user_stop_tree", consume_output=True)})
        return result

    def _process_scopes(self, checkpoint):
        root_owners = {str(value) for value in getattr(self.agent, '_process_owner_task_ids', ()) if value}
        root_owners.update({self.root_id, str(self.session.get('session_key') or ''),
                            str(getattr(self.agent, '_current_task_id', '') or '')})
        scopes = {(owner, self.profile_home) for owner in root_owners if owner}
        for node in checkpoint['nodes']:
            scopes.update((owner, _home(node.get('profile_home') or self.profile_home))
                          for owner in node.get('process_owners', ()) if owner)
        for record in self._records():
            child = record['agent']
            profile = _home(getattr(child, '_hcv_execution_profile_home', None) or getattr(child, '_delegate_profile_home', None) or self.profile_home)
            owners = set(getattr(child, '_process_owner_task_ids', ()) or ())
            owners.add(getattr(child, '_current_task_id', None))
            scopes.update((str(owner), profile) for owner in owners if owner)
        return scopes

    def root_running(self):
        return bool(self.session.get("running"))

    def generation(self):
        with self.session["history_lock"]:
            inflight = self.session.get("inflight_turn")
            return {"started_at": inflight.get("started_at") if isinstance(inflight, dict) else None,
                    "agent_turn_id": str(getattr(self.agent, "_current_turn_id", "") or "")}

    def tip(self):
        database = getattr(self.agent, "_session_db", None)
        if database is None:
            from contextlib import nullcontext
            context = self.server._session_db(self.session)
        else:
            from contextlib import nullcontext
            context = nullcontext(database)
        with context as database:
            if database is None:
                raise StopControlError("Cannot verify durable checkpoint history")
            from agent.runtime_session_store import call_off_event_loop
            watermark = call_off_event_loop(database.get_active_message_watermark, self.root_id)
        return {"stored_id": self.root_id, "watermark": watermark}

    def remaining(self, checkpoint):
        from tools.async_delegation import has_live_for_session
        from tools.process_registry import process_registry
        pending = []
        if self.root_running():
            pending.append({"kind": "root", "stored_id": self.root_id})
        for record in self._records():
            pending.append({"kind": "child", "subagent_id": record.get("subagent_id")})
        for node in checkpoint["nodes"]:
            if self._outcome(checkpoint, node) is None:
                pending.append({"kind": "child_outcome_unconfirmed", "stored_id": node["stored_id"]})
        for stored, profile in self._scopes(checkpoint):
            if has_live_for_session(session_key=stored, parent_session_id=stored, profile_home=profile):
                pending.append({"kind": "delegation", "stored_id": stored})
            from tools.async_delegation import _session_records, _LIVE_STATES
            if any(not record.get('_profile_home') for record in _session_records(_LIVE_STATES, stored, '', stored)):
                pending.append({'kind': 'delegation_owner_profile_unconfirmed', 'stored_id': stored})
        for owner, profile in self._process_scopes(checkpoint):
            for process in process_registry.list_sessions(task_id=owner, profile_home=profile):
                if process.get("status") == "running":
                    pending.append({"kind": "process", "session_id": process["session_id"]})
            for process in process_registry.list_sessions(task_id=owner):
                if process.get('status') != 'running':
                    continue
                raw = process_registry.get(process['session_id'])
                if raw is not None and not getattr(raw, 'profile_home', ''):
                    pending.append({'kind': 'process_owner_profile_unconfirmed', 'session_id': process['session_id']})
        for result in checkpoint.get("process_results", ()):
            if result.get("status") == "error" or result.get("scope_stop_failed"):
                pending.append({"kind": "process_kill_unconfirmed", "session_id": result["session_id"]})
        return pending

    def resume_children(self, checkpoint):
        from tools.delegate_tree_resume import resume_children
        return resume_children(self.agent, checkpoint, ui_session_id=self.sid,
                               owner_transport=self.session.get("transport"), owner_session_record=self.session)

    def resume_root(self, checkpoint):
        # Same saved conversation, a new turn. Never replay an old tool call.
        rid = "tree-continue-" + checkpoint["checkpoint_id"]
        text = ("Продолжи остановленную задачу с сохранённого состояния. Выполненные действия и результаты "
                "инструментов уже находятся в истории; не запускай их повторно. Прерванные команды "
                "завершены, сначала проверь их фактический результат. Помощники возобновлены в тех же чатах.")
        import contextvars
        done = threading.Event()
        result = {}
        def dispatch():
            try:
                with self.session["history_lock"]:
                    if self.session.get("running") or self.session.get("_closing"):
                        raise StopControlError("Another root turn won continuation admission")
                    self.session["running"] = True
                    self.session["_turn_cancel_requested"] = False
                    self.session["_hcv_tree_continuation_checkpoint"] = checkpoint["checkpoint_id"]
                result["accepted"] = self.server._run_prompt_submit(rid, self.sid, self.session, text)
                if not result["accepted"]:
                    with self.session["history_lock"]:
                        self.session["running"] = False
            except BaseException as exc:
                result["error"] = str(exc)
            finally:
                self.session.pop("_hcv_tree_continuation_checkpoint", None)
                done.set()
        context = contextvars.copy_context()
        threading.Thread(target=context.run, args=(dispatch,), daemon=True, name=rid).start()
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            if done.is_set() and result.get("accepted"):
                return {"request_id": rid, "accepted": True}
            if done.is_set():
                raise StopControlError("Root continuation refused: " + str(result.get("error", "not admitted")))
            done.wait(.01)
        raise StopControlError("Root continuation admission unconfirmed")


def control(server, sid, operation, *, checkpoint_id=None, timeout=15):
    session = server._sessions.get(sid)
    if session is None:
        raise StopControlError("Session not found")
    adapter = NativeTreeAdapter(server, sid, session)
    store = Checkpoints(Path(adapter.profile_home) / "cache" / "hcv-stop-checkpoints")
    controller = TreeControl(store, adapter)
    if operation == "stop":
        value = controller.stop(adapter.owner, timeout=timeout, expected_checkpoint_id=checkpoint_id)
    elif operation == "status":
        value = controller.status(adapter.owner)
        if value.get("invalidated_by_new_turn"):
            # Preserve the private checkpoint to reject stale Continue/Stop,
            # but never hydrate a newly mounted UI as paused on old work.
            value = {"state": "none"}
    elif operation == "continue":
        refusal = server._ensure_active_session_slot(sid, session)
        if refusal is not None:
            raise StopControlError("Continuation owner refused: " + str(refusal))
        value = controller.resume(adapter.owner, checkpoint_id)
    else:
        raise StopControlError("Unknown tree control operation")
    result = {key: value.get(key) for key in ("state", "checkpoint_id", "remaining", "children_resumed",
                                             "root_resume", "resume_error", "stopped_at") if key in value}
    result.update(root_runtime_id=sid,
                  root_stored_id=str(session.get("session_key") or adapter.root_id),
                  checkpoint_root_stored_id=adapter.root_id, profile_home=adapter.profile_home)
    if operation == "stop":
        result["status"] = "interrupted"
    return result


def note_turn_started(server, sid, session):
    """Every native root admission invalidates the previous paused generation.

    The explicit Continue owns one private admission slot. All subsequent
    prompts/notification turns use this gate before any model or tool work.
    """
    expected = session.pop("_hcv_tree_continuation_checkpoint", None)
    if expected:
        return True
    adapter = NativeTreeAdapter(server, sid, session)
    store = Checkpoints(Path(adapter.profile_home) / "cache" / "hcv-stop-checkpoints")
    lock = _owner_lock(adapter.owner)
    if not lock.acquire(blocking=False):
        # Stop is settling this same owner. Do not wait behind it while holding
        # a running turn which Stop itself must observe as settled.
        return False
    try:
        checkpoint = store.read(adapter.owner)
        if checkpoint is None:
            return True
        if checkpoint["state"] in {"stopping", "timeout", "resuming"}:
            return False
        checkpoint["invalidated_by_new_turn"] = True
        store.write(checkpoint)
        adapter.unfence(checkpoint)
        return True
    finally:
        lock.release()

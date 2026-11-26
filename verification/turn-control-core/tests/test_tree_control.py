from pathlib import Path
import subprocess
import sys
import threading
import time

import unittest
from tui_gateway.hcv_stop_tree import Checkpoints, TreeControl, NativeTreeAdapter, record_child_outcome


OWNER = {"profile_home": "isolated-test", "root_id": "root"}


class Processes:
    def __init__(self):
        self.root = subprocess.Popen([sys.executable, "-B", "-c", "import sys;sys.stdin.read()"], stdin=subprocess.PIPE)
        self.child = subprocess.Popen([sys.executable, "-B", "-c", "import sys;sys.stdin.read()"], stdin=subprocess.PIPE)
        self.neighbor = subprocess.Popen([sys.executable, "-B", "-c", "import sys;sys.stdin.read()"], stdin=subprocess.PIPE)
        self.fenced = False
        self.signals = self.resumes = 0
        self.children = []

    def snapshot(self):
        return [{"stored_id": "child"}]

    def fence(self, cp):
        self.fenced = True

    def signal(self, cp):
        assert self.fenced
        self.signals += 1
        self.root.stdin.close()
        self.child.stdin.close()

    def stop_processes(self, cp):
        return []

    def root_running(self):
        return self.root.poll() is None

    def remaining(self, cp):
        return [{"kind": label} for label, p in (("root", self.root), ("child", self.child)) if p.poll() is None]

    def reconcile(self, cp):
        cp["nodes"][0].update(outcome={"status": "interrupted"}, resumable=True)

    def unfence(self, cp):
        self.fenced = False

    def resume_children(self, cp):
        self.children.append(cp["nodes"][0]["stored_id"])
        return [{"stored_id": "child", "parent_stored_id": "root", "delegation_id": "resumed"}]

    def resume_root(self, cp):
        self.resumes += 1
        return {"accepted": True}

    def close(self):
        for p in (self.root, self.child, self.neighbor):
            if p.stdin and not p.stdin.closed:
                p.stdin.close()
            p.wait(timeout=5)


def test_single_stop_real_backgroundchild_and_neighbor_then_persisted_continue(tmp_path):
    adapter = Processes()
    try:
        store = Checkpoints(tmp_path)
        stopped = TreeControl(store, adapter).stop(OWNER)
        assert stopped["state"] == "stopped"
        assert adapter.root.poll() is not None and adapter.child.poll() is not None
        assert adapter.neighbor.poll() is None
        # A new controller simulates reopening. Repeated Stop preserves checkpoint.
        assert TreeControl(store, adapter).stop(OWNER)["checkpoint_id"] == stopped["checkpoint_id"]
        assert adapter.signals == 1
        resumed = TreeControl(store, adapter).resume(OWNER, stopped["checkpoint_id"])
        assert resumed["state"] == "resumed" and adapter.children == ["child"]
        assert TreeControl(store, adapter).resume(OWNER, stopped["checkpoint_id"])["state"] == "resumed"
        assert adapter.resumes == 1 and adapter.neighbor.poll() is None
    finally:
        adapter.close()


def test_timeout_is_not_false_stopped(tmp_path):
    adapter = Processes()
    try:
        adapter.signal = lambda cp: None
        state = TreeControl(Checkpoints(tmp_path), adapter).stop(OWNER, timeout=0)
        assert state["state"] == "timeout" and state["remaining"]
        with unittest.TestCase().assertRaisesRegex(Exception, "not stopped"):
            TreeControl(Checkpoints(tmp_path), adapter).resume(OWNER, state["checkpoint_id"])
    finally:
        adapter.close()


def test_proven_predispatch_failure_allows_new_attempt_and_clears_old_error(tmp_path):
    adapter = Processes()
    try:
        store = Checkpoints(tmp_path)
        stopped = TreeControl(store, adapter).stop(OWNER)
        original = adapter.resume_children
        def refuse(cp):
            raise ValueError('Missing child workspace before any dispatch')
        adapter.resume_children = refuse
        with unittest.TestCase().assertRaisesRegex(ValueError, 'Missing child workspace'):
            TreeControl(store, adapter).resume(OWNER, stopped['checkpoint_id'])
        first = store.read(OWNER)
        assert first['state'] == 'stopped' and first['resume_attempt'] == 1
        assert first['resume_error'] and adapter.children == []
        adapter.resume_children = original
        second = TreeControl(store, adapter).resume(OWNER, stopped['checkpoint_id'])
        assert second['state'] == 'resumed' and second['resume_attempt'] == 2
        assert 'resume_error' not in second and adapter.children == ['child']
    finally:
        adapter.close()


def test_status_and_continue_are_serialized_by_owner_barrier(tmp_path):
    adapter = Processes()
    store = Checkpoints(tmp_path)
    entered, release, continued = threading.Event(), threading.Event(), threading.Event()
    try:
        # Save a timeout which is now fully settled, so status would write stopped.
        adapter.fenced = True
        adapter.signal({})
        adapter.root.wait(timeout=5)
        adapter.child.wait(timeout=5)
        cp = {"schema": 1, "owner": OWNER, "checkpoint_id": "race", "state": "timeout", "nodes": adapter.snapshot()}
        store.write(cp)
        original_remaining = adapter.remaining
        def remaining(value):
            entered.set()
            assert release.wait(3)
            return original_remaining(value)
        adapter.remaining = remaining
        status_thread = threading.Thread(target=lambda: TreeControl(store, adapter).status(OWNER))
        status_thread.start()
        assert entered.wait(3)
        resume_thread = threading.Thread(target=lambda: (TreeControl(store, adapter).resume(OWNER, "race"), continued.set()))
        resume_thread.start()
        assert not continued.wait(.1), "Continue must not race a stale status write"
        release.set()
        status_thread.join(3)
        resume_thread.join(3)
        assert continued.is_set()
        assert store.read(OWNER)["state"] == "resumed"
        assert adapter.resumes == 1
    finally:
        release.set()
        adapter.close()


def test_completed_child_wins_snapshot_stop_race_without_replay(tmp_path, monkeypatch):
    from types import SimpleNamespace
    from tools import async_delegation
    monkeypatch.setattr(async_delegation, "refuse_for_session", lambda *a, **kw: None)
    child = SimpleNamespace(session_id="child")
    root = SimpleNamespace(session_id="root")
    session = {"agent": root, "session_key": "root", "profile_home": str(tmp_path)}
    adapter = NativeTreeAdapter(SimpleNamespace(), "runtime", session)
    adapter._agents["child"] = child
    checkpoint = {"checkpoint_id": "completion-race", "nodes": [{"stored_id": "child"}]}
    # Child returns and unregisters after snapshot but before Stop can signal it.
    record_child_outcome(child, {"status": "completed", "exit_reason": "completed"})
    adapter.fence(checkpoint)
    adapter.reconcile(checkpoint)
    assert checkpoint["nodes"][0]["outcome"]["status"] == "completed"
    assert checkpoint["nodes"][0]["resumable"] is False


def test_missing_child_receipt_never_becomes_confirmed_stop(tmp_path):
    from types import SimpleNamespace
    adapter = NativeTreeAdapter(SimpleNamespace(), "runtime", {
        "agent": SimpleNamespace(session_id="root"), "profile_home": str(tmp_path)})
    with unittest.TestCase().assertRaisesRegex(Exception, "no confirmed outcome"):
        adapter.reconcile({"checkpoint_id": "absent", "nodes": [{"stored_id": "child"}]})


def test_restart_during_resume_does_not_dispatch_twice_and_stale_generation_is_refused(tmp_path):
    adapter = Processes()
    try:
        store = Checkpoints(tmp_path)
        stopped = TreeControl(store, adapter).stop(OWNER)
        stale = stopped["checkpoint_id"]
        stopped.update(state="resuming", children_resumed=[{"stored_id": "child"}])
        store.write(stopped)
        with unittest.TestCase().assertRaisesRegex(Exception, "unconfirmed"):
            TreeControl(store, adapter).resume(OWNER, stale)
        assert adapter.resumes == 0 and adapter.children == []
        stopped.update(state="stopped", checkpoint_id="new-generation")
        store.write(stopped)
        with unittest.TestCase().assertRaisesRegex(Exception, "no longer current"):
            TreeControl(store, adapter).resume(OWNER, stale)
        assert adapter.resumes == 0 and adapter.children == []
    finally:
        adapter.close()


def test_old_checkpoint_cannot_continue_or_stop_newer_prompt_on_same_stored_id(tmp_path):
    adapter = Processes()
    try:
        adapter.tip = lambda: {"stored_id": "root", "watermark": 10}
        adapter.generation = lambda: {"started_at": 1, "agent_turn_id": "turn-a"}
        controller = TreeControl(Checkpoints(tmp_path), adapter)
        checkpoint = controller.stop(OWNER)
        assert adapter.signals == 1
        # New prompt B has completed, so a boolean busy check alone is unsafe.
        adapter.tip = lambda: {"stored_id": "root", "watermark": 12}
        adapter.generation = lambda: {"started_at": 2, "agent_turn_id": "turn-b"}
        with unittest.TestCase().assertRaisesRegex(Exception, "history changed"):
            controller.resume(OWNER, checkpoint["checkpoint_id"])
        with unittest.TestCase().assertRaisesRegex(Exception, "Stale Stop"):
            controller.stop(OWNER, expected_checkpoint_id=checkpoint["checkpoint_id"])
        assert adapter.signals == 1 and adapter.resumes == 0 and adapter.children == []
        # B is still running: the old Stop must also fail BEFORE any signal.
        adapter.root_running = lambda: True
        with unittest.TestCase().assertRaisesRegex(Exception, "Stale Stop"):
            controller.stop(OWNER, expected_checkpoint_id=checkpoint["checkpoint_id"])
        assert adapter.signals == 1
    finally:
        adapter.close()


def test_native_admission_invalidates_even_resumed_checkpoint_before_next_model_turn(tmp_path):
    from types import SimpleNamespace
    from tui_gateway.hcv_stop_tree import note_turn_started, control
    root = SimpleNamespace(session_id="root")
    session = {"agent": root, "profile_home": str(tmp_path), "history_lock": threading.Lock()}
    server = SimpleNamespace()
    adapter = NativeTreeAdapter(server, "runtime", session)
    store = Checkpoints(tmp_path / "cache/hcv-stop-checkpoints")
    checkpoint = {"schema": 1, "owner": adapter.owner, "checkpoint_id": "a", "state": "resuming", "nodes": []}
    store.write(checkpoint)
    session["_hcv_tree_continuation_checkpoint"] = "a"
    assert note_turn_started(server, "runtime", session) is True
    assert not store.read(adapter.owner).get("invalidated_by_new_turn")
    checkpoint["state"] = "resumed"
    store.write(checkpoint)
    assert note_turn_started(server, "runtime", session) is True
    assert store.read(adapter.owner)["invalidated_by_new_turn"] is True
    server._sessions = {"runtime": session}
    public = control(server, "runtime", "status")
    assert public["state"] == "none" and "checkpoint_id" not in public
    assert store.read(adapter.owner)["checkpoint_id"] == "a"
    with unittest.TestCase().assertRaisesRegex(Exception, "history changed"):
        TreeControl(store, adapter).resume(adapter.owner, "a")
    with unittest.TestCase().assertRaisesRegex(Exception, "Stale Stop"):
        TreeControl(store, adapter).stop(adapter.owner, expected_checkpoint_id="a")


def test_receipt_binds_exact_native_session_key_when_agent_rotates_independently(tmp_path):
    from types import SimpleNamespace
    from tui_gateway.hcv_stop_tree import control
    session = {"agent": SimpleNamespace(session_id="compression-tip"), "session_key": "ui-stored-original",
               "profile_home": str(tmp_path), "history_lock": threading.Lock()}
    server = SimpleNamespace(_sessions={"runtime": session})
    receipt = control(server, "runtime", "status")
    assert receipt["state"] == "none"
    assert receipt["root_runtime_id"] == "runtime"
    assert receipt["root_stored_id"] == "ui-stored-original"
    assert receipt["checkpoint_root_stored_id"] == "compression-tip"

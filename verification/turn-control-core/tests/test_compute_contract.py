import contextlib
import threading
from types import SimpleNamespace

from tui_gateway.compute_host import ComputeHost
from tui_gateway.host_supervisor import HostSupervisor


def test_compute_tree_control_is_nonblocking_to_the_reader_and_carries_bootstrap(tmp_path, monkeypatch):
    from tui_gateway import hcv_stop_tree
    host = ComputeHost.__new__(ComputeHost)
    entered, release, acked = threading.Event(), threading.Event(), threading.Event()
    transport = object()
    session = {"agent": object(), "history_lock": threading.Lock(), "history": [],
               "session_key": "stored", "running": False, "history_version": 0}
    server = SimpleNamespace(_sessions={}, _session_profile_runtime_scope=lambda *a, **kw: contextlib.nullcontext(),
                             _install_borrowed_lease=lambda sid, value, frame: None,
                             _session_info=lambda *a: {"model": "fixture"})
    def ensure(server_arg, frame):
        assert frame["sid"] == "runtime" and frame["session_key"] == "stored"
        server_arg._sessions["runtime"] = session
        return session
    host._ensure_server_session = ensure
    host._guarded = lambda frame, error, body: body(server, frame["sid"], frame["request_id"])
    replies = []
    def reply(kind, sid, request_id, **payload):
        replies.append((kind, payload))
        acked.set()
    host._reply = reply
    def control(*a, **kw):
        entered.set()
        assert release.wait(3)
        return {"state": "resumed", "root_runtime_id": "runtime", "root_stored_id": "stored"}
    monkeypatch.setattr(hcv_stop_tree, "control", control)
    host._handle_tree_control({"sid": "runtime", "request_id": "rpc", "operation": "continue",
                               "session_frame": {"sid": "runtime", "session_key": "stored"}})
    assert entered.wait(3)
    assert not acked.is_set(), "Slow tree work must run off the host reader thread"
    release.set()
    assert acked.wait(3)
    assert replies[0][0] == "tree.ack" and replies[0][1]["result"]["root_running"] is False


def test_supervisor_registers_root_completion_before_continue_frame():
    supervisor = HostSupervisor.__new__(HostSupervisor)
    supervisor._lock = threading.Lock()
    supervisor._pending_turns = {}
    supervisor.start = lambda: None
    def await_reply(frame, request_id, timeout):
        assert frame["type"] == "tree.control" and frame["session_frame"]["session_key"] == "stored"
        assert "tree-continue-checkpoint" in supervisor._pending_turns
        return {"result": {"state": "resumed", "root_running": True}}
    supervisor._await_reply = await_reply
    completions = []
    supervisor.tree_control("runtime", operation="continue", checkpoint_id="checkpoint",
                            session_frame={"session_key": "stored"}, on_complete=completions.append)
    assert supervisor.has_pending_turn("runtime")
    supervisor._handle_host_frame({"type": "turn.end", "request_id": "tree-continue-checkpoint", "sid": "runtime"})
    assert not supervisor.has_pending_turn("runtime")
    assert len(completions) == 1

import contextlib
import threading
from types import SimpleNamespace


def test_real_server_dispatch_validates_cascade_status_continue_contracts(tmp_path, monkeypatch):
    from tui_gateway import server, hcv_stop_tree
    from tui_gateway.contracts import registry
    monkeypatch.setattr(registry, "STRICT", True)
    session = {"agent": SimpleNamespace(session_id="stored"), "profile_home": str(tmp_path),
               "history_lock": threading.Lock(), "session_key": "stored", "running": False}
    monkeypatch.setattr(server, "_sessions", {"runtime": session})
    monkeypatch.setattr(server, "_tts_stream_stop", lambda: None)
    monkeypatch.setattr(server, "_resume_wake_after_interrupt", lambda: None)
    monkeypatch.setattr(server, "_session_uses_compute_host", lambda s: False)
    monkeypatch.setattr(server, "_session_profile_runtime_scope", lambda *a, **kw: contextlib.nullcontext())
    calls = []
    def control(server_arg, sid, operation, **kwargs):
        calls.append((sid, operation, kwargs))
        result = {"state": "stopped" if operation != "continue" else "resumed", "checkpoint_id": "checkpoint",
                  "root_runtime_id": sid, "root_stored_id": "stored", "profile_home": str(tmp_path), "remaining": []}
        if operation == "stop":
            result["status"] = "interrupted"
        return result
    monkeypatch.setattr(hcv_stop_tree, "control", control)
    for method, params, expected in (
        ("session.interrupt", {"session_id": "runtime", "cascade": True, "request_id": "ui-stop"}, "stop"),
        ("session.tree_status", {"session_id": "runtime"}, "status"),
        ("session.continue_tree", {"session_id": "runtime", "checkpoint_id": "checkpoint"}, "continue"),
    ):
        finished = threading.Event()
        responses = []
        transport = SimpleNamespace(write=lambda response: (responses.append(response), finished.set()))
        assert server.dispatch({"jsonrpc": "2.0", "id": expected, "method": method, "params": params}, transport) is None
        assert finished.wait(5), method
        assert "result" in responses[-1], responses
        assert calls[-1][1] == expected
        assert responses[-1]["result"]["root_runtime_id"] == "runtime"
    assert calls[0][2]["timeout"] == 15
    assert calls[2][2]["checkpoint_id"] == "checkpoint"

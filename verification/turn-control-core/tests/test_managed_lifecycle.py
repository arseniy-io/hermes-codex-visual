import asyncio
import json
import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

from gateway.session_worker import worker_request
from hermes_state import SessionDB
import hermes_state_runtime as rt


def test_real_managed_worker_nested_child_completion_reaches_parent(tmp_path, monkeypatch):
    from gateway import session_worker_child
    monkeypatch.setattr(session_worker_child, "delegation_limits", lambda *a: (10, 4))
    db = SessionDB(db_path=tmp_path / "state.db")
    db.create_session("parent", source="tui", profile_name="fixture")
    db.create_session("neighbor", source="tui", profile_name="fixture")
    for sid, parent in (("top", "parent"), ("leaf", "top")):
        db.create_session(sid, source="subagent", parent_session_id=parent, profile_name="fixture")
        db.append_messages_batch(sid, [{"role": "user", "content": "ORIGINAL_GOAL_" + sid},
                                      {"role": "assistant", "content": "ALREADY_DONE_" + sid}])
        db.end_session(sid, "agent_close")
    authority = SimpleNamespace(db=db, epoch=rt.begin_runtime_epoch(db, instance_id="lifecycle-owner"), profile_id="p",
                                _require_admission_open=lambda: None, wake_after_worker=lambda sid: None,
                                authorize=lambda *a: None, sessions={}, logical_owner=lambda sid: sid)
    connection = SimpleNamespace(authority=authority, actor=SimpleNamespace(
        subject="human", profile_id="p", capabilities={"session:submit", "worker:adopt"}))
    peer = Path(__file__).resolve().parents[1] / "managed_peer.py"
    home = tmp_path / "profile"
    home.mkdir()
    environment = dict(os.environ, HERMES_HOME=str(home), PYTHONDONTWRITEBYTECODE="1", HERMES_DISABLE_LAZY_INSTALLS="1")
    stderr = (tmp_path / "peer-stderr.log").open("w", encoding="utf-8")
    process = subprocess.Popen([sys.executable, "-B", str(peer)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=stderr, text=True, encoding="utf-8", env=environment)
    try:
        process.stdin.write(json.dumps({"home": str(home)}) + "\n")
        process.stdin.flush()
        outcome = None
        for raw in process.stdout:
            frame = json.loads(raw)
            if frame.get("done"):
                outcome = frame
                break
            operation = frame["method"].split(".", 1)[1]
            try:
                ref = SimpleNamespace(session_id=frame["params"]["session_id"])
                value = asyncio.run(worker_request(connection, ref, frame["params"], operation=operation))
                response = {"result": value}
            except Exception as exc:
                response = {"error": type(exc).__name__ + ":" + str(exc)}
            process.stdin.write(json.dumps(response) + "\n")
            process.stdin.flush()
        process.wait(timeout=25)
        stderr.flush()
        assert process.returncode == 0, (tmp_path / "peer-stderr.log").read_text(encoding="utf-8")
        assert outcome and outcome["calls"] == ["leaf", "top"]
        assert {x["stored_id"] for x in outcome["receipts"]} == {"top", "leaf"}
        assert all(db.get_session(sid)["parent_session_id"] == parent for sid, parent in (("top", "parent"), ("leaf", "top")))
        assert db.get_messages("neighbor") == []
        with db._read_ctx() as conn:
            row = conn.execute("SELECT state,delivery_state,parent_session_id FROM async_delegations").fetchone()
            assert tuple(row) == ("completed", "delivered", "parent")
        top_history = db.get_messages("top")
        assert sum(m.get("content") == "ALREADY_DONE_top" for m in top_history) == 1
        assert any("LEAF_RESUMED_RESULT" in str(m.get("content")) for m in top_history)
    finally:
        if process.poll() is None:
            process.stdin.close()
            process.terminate()
            process.wait(timeout=5)
        stderr.close()
        db.close()

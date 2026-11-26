import asyncio
from contextlib import contextmanager
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
import unittest

import psutil

from agent.runtime_session_store import RuntimeSessionStore
from agent.runtime_session_child import reserve_child_store
from gateway.session_worker import worker_request
from hermes_cli.process_identity import worker_birth
from hermes_state import SessionDB
import hermes_state_runtime as rt
from hermes_state_runtime_workers import CHILD_SEPARATOR


@contextmanager
def managed(tmp_path, monkeypatch):
    from gateway import session_worker_child
    monkeypatch.setattr(session_worker_child, "delegation_limits", lambda *a: (10, 4))
    db = SessionDB(db_path=tmp_path / "state.db")
    db.create_session("parent", source="kanban", profile_name="test")
    db.create_session("neighbor", source="kanban", profile_name="test")
    db.create_session("foreign-child", source="subagent", parent_session_id="neighbor", profile_name="test")
    db.append_messages_batch("foreign-child", [{"role": "assistant", "content": "NEIGHBOR_UNTOUCHED"}])
    process = subprocess.Popen([sys.executable, "-B", "-c", "import sys;sys.stdin.read()"], stdin=subprocess.PIPE)
    authority = SimpleNamespace(db=db, epoch=rt.begin_runtime_epoch(db, instance_id="test-owner"), profile_id="p",
                                _require_admission_open=lambda: None, wake_after_worker=lambda sid: None,
                                authorize=lambda *a: None, sessions={}, logical_owner=lambda sid: sid)
    connection = SimpleNamespace(authority=authority, actor=SimpleNamespace(
        subject="human", profile_id="p", capabilities={"session:submit", "worker:adopt"}))
    scope = {"profile_id": "p", "session_id": "parent", "execution_id": "compute", "generation": 0,
             "pid": process.pid, "birth": worker_birth(psutil.Process(process.pid)), "secret": "s" * 32}
    registration = asyncio.run(worker_request(connection, None, scope | {"kind": "compute"}, operation="register"))
    scope["epoch"] = registration["owner_epoch"]
    def rpc(method, **params):
        assert method == "worker.persist"
        return asyncio.run(worker_request(connection, None, params, operation="persist"))
    parent = RuntimeSessionStore(rpc, scope, tmp_path / "outbox")
    try:
        yield db, parent, connection, scope
    finally:
        try:
            parent.close()
        finally:
            process.stdin.close()
            process.wait(timeout=5)
            db.close()


def test_managed_existing_child_keeps_history_uses_new_owner_reserved_claim(tmp_path, monkeypatch):
    with managed(tmp_path, monkeypatch) as (db, parent, connection, scope):
        child = reserve_child_store(parent)
        stored, old_execution = child.reserved_session_id, child.scope["execution_id"]
        child.create_session(stored, "subagent", model="fixture", model_config={"_task_name": "method_review"})
        child.append_messages_batch(stored, [{"role": "user", "content": "INITIAL_GOAL"},
                                             {"role": "assistant", "content": "ALREADY_COMPLETED_TOOL_RESULT"}])
        child.close()
        assert db.get_session(stored)["ended_at"] is not None
        resumed = reserve_child_store(parent, resume_session_id=stored)
        try:
            assert resumed.reserved_session_id == stored
            assert resumed.scope["execution_id"] != old_execution
            assert resumed.scope["secret"] != child.scope["secret"]
            assert resumed.scope["execution_id"].startswith("compute" + CHILD_SEPARATOR)
            assert db.get_session(stored)["ended_at"] is None
            history = resumed.get_messages_as_conversation(stored, include_ancestors=False, repair_alternation=True)
            assert any(m.get("content") == "ALREADY_COMPLETED_TOOL_RESULT" for m in history)
            resumed.append_messages_batch(stored, [{"role": "user", "content": "CONTINUE_FROM_CHECKPOINT"},
                                                  {"role": "assistant", "content": "ACTUAL_RESUMED_RESULT"}])
            with unittest.TestCase().assertRaisesRegex(ValueError, "child_still_running"):
                reserve_child_store(parent, resume_session_id=stored)
            assert not parent.failure, "Expected live-child refusal must not poison parent receipts"
            with db._read_ctx() as conn:
                rows = conn.execute("SELECT execution_id,status FROM worker_executions WHERE session_id=?", (stored,)).fetchall()
            assert {tuple(row) for row in rows} == {(old_execution, "terminal"), (resumed.scope["execution_id"], "running")}
            assert db.get_session(stored)["parent_session_id"] == "parent"
            assert [m["content"] for m in db.get_messages("foreign-child")] == ["NEIGHBOR_UNTOUCHED"]
        finally:
            resumed.close()


def test_managed_existing_child_rejects_foreign_owner_and_forged_parent(tmp_path, monkeypatch):
    with managed(tmp_path, monkeypatch) as (db, parent, connection, scope):
        request = scope | {"sequence": 1, "operation": "child.reserve",
                           "payload": {"secret": "fresh-child-secret-00001", "resume_session_id": "foreign-child"}}
        with unittest.TestCase().assertRaisesRegex(rt.RuntimeStoreError, "permission_denied"):
            asyncio.run(worker_request(connection, None, request, operation="persist"))
        request["payload"] = {"secret": "fresh-child-secret-00001"}
        request["secret"] = "f" * 32
        with unittest.TestCase().assertRaisesRegex(rt.RuntimeStoreError, "permission_denied"):
            asyncio.run(worker_request(connection, None, request, operation="persist"))
        child = reserve_child_store(parent)
        child.close()
        with db._read_ctx() as conn:
            assert conn.execute("SELECT COUNT(*) FROM worker_executions WHERE kind='child'").fetchone()[0] == 1
        assert [m["content"] for m in db.get_messages("foreign-child")] == ["NEIGHBOR_UNTOUCHED"]


def test_managed_nested_reservation_restores_exact_parent_before_leaf(tmp_path, monkeypatch):
    with managed(tmp_path, monkeypatch) as (db, parent, connection, scope):
        child = reserve_child_store(parent)
        grandchild = reserve_child_store(child)
        child_id, grand_id = child.reserved_session_id, grandchild.reserved_session_id
        grandchild.append_messages_batch(grand_id, [{"role": "assistant", "content": "LEAF_CHECKPOINT"}])
        grandchild.close()
        child.close()
        restored_parent = reserve_child_store(parent, resume_session_id=child_id)
        restored_leaf = reserve_child_store(restored_parent, resume_session_id=grand_id)
        try:
            assert db.get_session(grand_id)["parent_session_id"] == child_id
            assert restored_leaf.scope["execution_id"].startswith(restored_parent.scope["execution_id"] + CHILD_SEPARATOR)
            assert restored_leaf.get_messages_as_conversation(grand_id)[0]["content"] == "LEAF_CHECKPOINT"
        finally:
            restored_leaf.close()
            restored_parent.close()

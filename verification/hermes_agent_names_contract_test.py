"""Producer/data-path tests for explicit Codex-compatible delegation names.

Run with scripts/check-hermes-agent-names.py so every owning module is the staged
candidate while Hermes state and the database stay inside a temporary profile.
"""

import asyncio
from contextlib import closing, contextmanager
import json
import os
from queue import Queue
import sqlite3
import time
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from tools import hcv_agent_names as identity


def test_explicit_name_and_full_goal_are_separate_without_mutating_input():
    original = [{"task_name": "scenario_review", "goal": "Применить документы к восьми ситуациям.",
                 "group": "together", "role": "leaf"}]
    tasks, error = identity.prepare_tasks(original, SimpleNamespace())
    assert error is None
    assert tasks == [{**original[0], "agent_path": "/root/scenario_review"}]
    assert original[0] == {"task_name": "scenario_review", "goal": "Применить документы к восьми ситуациям.",
                           "group": "together", "role": "leaf"}


def test_no_name_is_derived_from_a_legacy_goal():
    original = [{"goal": "Проверь имена агентов", "context": "known"}]
    tasks, error = identity.prepare_tasks(original, SimpleNamespace())
    assert error is None and tasks == original
    assert identity.task_metadata(tasks) == {}
    assert identity.result_identities({"results": [{"task_index": 0}]}, {}) == {"results": [{"task_index": 0}]}


@pytest.mark.parametrize("name", ["Проверка", "Method review", "method/review", "method-review", "", 42])
def test_invalid_explicit_name_is_rejected_before_spawning(name):
    tasks, error = identity.prepare_tasks([{"goal": "A full independent task", "task_name": name}], SimpleNamespace())
    assert tasks is None and "Task 0" in error and "task_name" in error


@pytest.mark.parametrize("name", ["_review", "review__check", "review_"])
def test_all_codex_documented_name_characters_remain_valid(name):
    assert identity.make_identity(name, SimpleNamespace()) == {"task_name": name, "agent_path": "/root/" + name}


def test_nested_and_resumed_children_keep_the_recorded_parent_path():
    child = SimpleNamespace(_session_init_model_config={})
    identity.attach_child_identity(child, identity.make_identity("method_review", SimpleNamespace()))
    assert identity.make_identity("schema_check", child) == {
        "task_name": "schema_check", "agent_path": "/root/method_review/schema_check"}
    resumed = SimpleNamespace(session_id="owned-child", _session_db=SimpleNamespace(
        get_session=lambda sid: {"model_config": json.dumps(child._session_init_model_config)}))
    assert identity.make_identity("schema_check", resumed)["agent_path"] == "/root/method_review/schema_check"
    tasks, _ = identity.prepare_tasks([{"goal": "owned", "agent_path": "/foreign/forged"}], resumed)
    assert "agent_path" not in tasks[0]


def test_parent_identity_restores_through_real_sync_and_async_session_stores(tmp_path):
    from hermes_state import AsyncSessionDB, SessionDB
    db = SessionDB(tmp_path / "state.db")
    db.create_session("named-parent", source="subagent", model_config={
        "_task_name": "method_review", "_agent_path": "/root/method_review"})
    try:
        for store in (db, AsyncSessionDB(db)):
            parent = SimpleNamespace(session_id="named-parent", _session_db=store)
            assert identity.make_identity("nested_review", parent)["agent_path"] == "/root/method_review/nested_review"
            async def inside_running_loop():
                return identity.make_identity("nested_review", parent)
            assert asyncio.run(inside_running_loop())["agent_path"] == "/root/method_review/nested_review"
    finally:
        db.close()


def test_parent_identity_read_failure_does_not_create_a_new_root():
    def unavailable(sid):
        raise RuntimeError("store unavailable")
    tasks, error = identity.prepare_tasks([{"goal": "full task", "task_name": "nested_review"}],
        SimpleNamespace(session_id="named-parent", _session_db=SimpleNamespace(get_session=unavailable)))
    assert tasks is None and "Cannot restore the parent agent_path" in error


def test_call_wide_metadata_keeps_original_task_indexes_and_null_legacy_entries():
    tasks, _ = identity.prepare_tasks([
        {"goal": "first legacy task"}, {"goal": "second", "task_name": "method_review"},
        {"goal": "third", "task_name": "schema_check"}], SimpleNamespace())
    metadata = identity.task_metadata(tasks)
    assert metadata == {"task_names": [None, "method_review", "schema_check"],
                        "agent_paths": [None, "/root/method_review", "/root/schema_check"]}
    result = identity.result_identities({"results": [{"task_index": 2, "status": "failed"}, {"task_index": 0}]}, metadata)
    assert result["results"] == [{"task_index": 2, "status": "failed", "task_name": "schema_check",
                                  "agent_path": "/root/schema_check"}, {"task_index": 0}]


def test_real_model_schema_requires_name_while_receiver_keeps_legacy_calls():
    from tools.delegate_tool import DELEGATE_TASK_SCHEMA, _build_dynamic_schema_overrides
    tasks = DELEGATE_TASK_SCHEMA["parameters"]["properties"]["tasks"]["items"]
    assert tasks["required"] == ["goal", "task_name"]
    assert tasks["properties"]["task_name"]["pattern"] == identity.TASK_NAME_PATTERN
    assert "English snake_case" in tasks["properties"]["task_name"]["description"]
    assert "Result-delivery bucket" in tasks["properties"]["group"]["description"]
    with patch("tools.delegate_tool_config._get_independent_completions", return_value=True):
        schema = _build_dynamic_schema_overrides()
    assert schema["parameters"]["properties"]["tasks"]["items"]["required"] == ["goal", "task_name", "group"]
    with patch("tools.delegate_tool_config._get_independent_completions", return_value=False):
        schema = _build_dynamic_schema_overrides()
    assert schema["parameters"]["properties"]["tasks"]["items"]["required"] == ["goal", "task_name"]


def test_legacy_single_goal_and_live_agent_dispatch_keep_top_level_task_name():
    from run_agent import AIAgent
    from tools.delegate_tool_tasks import _normalize_task_list
    tasks, error = _normalize_task_list("Original full goal", None, None, None, "leaf", 4,
                                      task_name="method_review")
    assert error is None and tasks[0]["task_name"] == "method_review"
    prepared, error = identity.prepare_tasks(tasks, SimpleNamespace())
    assert error is None and prepared[0]["agent_path"] == "/root/method_review"
    with patch("tools.delegate_tool.delegate_task", return_value="ok") as dispatch:
        result = AIAgent._dispatch_delegate_task(SimpleNamespace(_delegate_depth=0), {
            "goal": "Original full goal", "task_name": "method_review"})
    assert result == "ok" and dispatch.call_args.kwargs["task_name"] == "method_review"
    assert dispatch.call_args.kwargs["goal"] == "Original full goal"


def test_identity_is_unchanged_in_actual_lifecycle_and_wire_payloads():
    from tools.delegate_tool_progress import _build_child_progress_callback
    from tui_gateway.tool_progress import _subagent_payload
    events = []
    parent = SimpleNamespace(tool_progress_callback=lambda *args, **kwargs: events.append((args, kwargs)))
    fields = identity.make_identity("method_review", parent)
    shared = {**fields, "session_id": "child-session", "delegation_id": "delegation-1"}
    relay = _build_child_progress_callback(0, "Полное поручение остаётся отдельным", parent,
                                         subagent_id="sa-0-owned", session_ref=shared)
    relay("subagent.spawn_requested")
    relay("subagent.start")
    relay("subagent.complete", status="completed", summary="Done")
    assert [args[0] for args, _ in events] == ["subagent.spawn_requested", "subagent.start", "subagent.complete"]
    for args, kwargs in events:
        assert identity.identity_fields(kwargs) == fields
        payload = _subagent_payload(args[0], args[1], args[2], kwargs, show_reasoning=False)
        assert identity.identity_fields(payload) == fields
        assert payload["goal"] == "Полное поручение остаётся отдельным"
        assert payload["child_session_id"] == "child-session"


def test_named_single_goal_constructs_and_runs_a_child_with_one_identity():
    from tests.tools.test_delegate import _make_mock_parent
    from tools.delegate_tool import delegate_task
    events = []
    parent = _make_mock_parent()
    parent.session_id = "parent-session"
    parent.tool_progress_callback = lambda *args, **kwargs: events.append((args, kwargs))
    child = MagicMock()
    child.session_id = "constructed-child-session"
    child._session_db = None
    child._persist_disabled = True
    child._session_init_model_config = {}
    child.run_conversation.return_value = {"final_response": "Done", "completed": True, "api_calls": 1}
    def construct(**kwargs):
        child.tool_progress_callback = kwargs["tool_progress_callback"]
        return child
    with patch("run_agent.AIAgent", side_effect=construct):
        result = json.loads(delegate_task(goal="Original full task description", task_name="method_review",
                                         parent_agent=parent))
    fields = {"task_name": "method_review", "agent_path": "/root/method_review"}
    assert "results" in result, result
    assert identity.identity_fields(result["results"][0]) == fields
    lifecycle = [(args[0], kwargs) for args, kwargs in events if args[0] in (
        "subagent.spawn_requested", "subagent.start", "subagent.complete")]
    assert [name for name, _ in lifecycle] == ["subagent.spawn_requested", "subagent.start", "subagent.complete"]
    for _, payload in lifecycle:
        assert identity.identity_fields(payload) == fields
        assert payload["child_session_id"] == "constructed-child-session"
    assert child._session_init_model_config["_task_name"] == "method_review"
    assert child._session_init_model_config["_agent_path"] == "/root/method_review"


def test_actual_registry_roster_results_and_child_session_carry_the_same_name():
    from gateway.session_ancillary import subagent_row
    from tools import delegate_tool_child_run as child_run
    from tools import delegate_tool_registry as registry
    fields = identity.make_identity("method_review", SimpleNamespace())
    child = SimpleNamespace(_session_init_model_config={}, _subagent_id="sa-0-named", _parent_subagent_id=None,
                            _delegate_depth=1, _delegate_role="leaf", session_id="child-sid", model="test-model")
    parent = SimpleNamespace(session_id="parent-sid")
    identity.attach_child_identity(child, fields)
    sid = child_run._register_child(child, parent, "Original goal", owner_session_id="ui-session",
                                    owner_transport=object(), owner_session_record=object())
    try:
        record = registry._active_subagents[sid]
        assert identity.identity_fields(subagent_row(record)) == fields
        with patch.object(registry, "_owns_subagent_record", return_value=True):
            assert identity.identity_fields(registry._list_payload(parent)["subagents"][0]) == fields
        schema = SimpleNamespace(schema=None)
        result = child_run._build_result_entry(child, {"completed": True, "final_response": "Done"}, 0, 0.1, schema)
        assert identity.identity_fields(result) == fields
        failed = child_run._fabricated_entry(0, "timeout", "stopped", child)
        assert identity.identity_fields(failed) == fields
        assert identity.session_identity(child) == {"_task_name": "method_review", "_agent_path": "/root/method_review"}
    finally:
        registry._unregister_subagent(sid, agent=child)


def test_background_handle_and_group_dispatch_store_call_wide_identity_by_index():
    from tools import delegate_tool_dispatch as dispatch
    tasks, _ = identity.prepare_tasks([{"goal": "Legacy task"}, {"goal": "Named task", "task_name": "schema_check"}],
                                      SimpleNamespace())
    child = SimpleNamespace(_subagent_id="sa-1-owned", model="test-model")
    batch = SimpleNamespace(task_list=tasks, children=[(1, tasks[1], child)], live_deleg_id="deleg-all",
                            refused=[{"task_index": 0, "status": "rejected"}], live_paths=[])
    handle = dispatch._dispatched_payload(batch, [(batch, "deleg-all")])
    assert handle["task_names"] == [None, "schema_check"]
    assert handle["agent_paths"] == [None, "/root/schema_check"]
    unit = SimpleNamespace(**{**batch.__dict__, "context": None, "top_role": "leaf", "creds": {"model": None},
                              "live_writers": [], "session_key": "", "parent_session_id": "parent",
                              "origin_ui_session_id": "ui", "origin_session_id": "parent"})
    with patch("tools.async_delegation.dispatch_async_delegation_batch", return_value={}) as call:
        dispatch._dispatch_unit(unit, "deleg-all-1", "deleg-all", {})
    assert call.call_args.kwargs["task_names"] == [None, "schema_check"]
    assert call.call_args.kwargs["agent_paths"] == [None, "/root/schema_check"]
    assert call.call_args.kwargs["task_indexes"] == [1]


def test_async_completion_and_restart_results_keep_explicit_identity():
    from tools import async_delegation as ledger
    metadata = {"task_names": ["method_review", "schema_check"],
                "agent_paths": ["/root/method_review", "/root/schema_check"]}
    record = {"delegation_id": "named-completion", "is_batch": True, "goal": "combined", "goals": ["first", "second"],
              "task_indexes": [1], "dispatched_at": time.time(), "completed_at": time.time(), **metadata}
    result = {"results": [{"task_index": 1, "status": "completed", "summary": "Done"}]}
    local_queue = Queue()
    with patch("tools.process_registry.process_registry.completion_queue", local_queue), \
            patch.object(ledger, "_persist_completion") as persist:
        ledger._push_completion_event(record, result, "completed")
    event = local_queue.get_nowait()
    assert identity.stored_metadata(event) == metadata
    assert identity.identity_fields(event["results"][0]) == {"task_name": "schema_check", "agent_path": "/root/schema_check"}
    assert identity.identity_fields(persist.call_args.args[1]["results"][0]) == identity.identity_fields(event["results"][0])
    partial = json.dumps({"partial": True, "results": [{"task_index": 0, "status": "completed", "summary": "Done"}]})
    recovered = ledger._recovered_results({**record, "task_indexes": [0, 1]}, partial, "owner exited")
    assert [r["task_name"] for r in recovered] == ["method_review", "schema_check"]
    assert recovered[1]["status"] == "unknown"


def test_worker_owned_sqlite_ledger_round_trips_names_through_dispatch_and_completion(tmp_path):
    import psutil
    from gateway.session_worker_delegation import worker_delegation_handlers
    from hermes_cli.process_identity import worker_birth
    from hermes_state import SessionDB
    from tools import async_delegation as ledger
    metadata = {"task_names": ["method_review"], "agent_paths": ["/root/method_review"]}
    db = SessionDB(tmp_path / "state.db")
    db.create_session("parent", source="cli")
    handlers = worker_delegation_handlers("worker-names", os.getpid(), worker_birth(psutil.Process()))
    def apply(name, **payload):
        return db._execute_write(lambda conn: handlers["delegation." + name](db, conn, "parent", payload))
    try:
        with closing(sqlite3.connect(tmp_path / "state.db")) as conn:
            ledger._initialize_schema(conn)
        apply("dispatch", delegation_id="deleg-named", task={"goal": "original", "goals": ["original"],
              "is_batch": True, **metadata}, dispatched_at=time.time(), parent_session_id="parent", session_key="",
              origin_ui_session_id="", origin_session_id="")
        event = {"type": "async_delegation", "delegation_id": "deleg-named", "parent_session_id": "parent",
                 "session_key": "", "origin_ui_session_id": "", "origin_session_id": "", "status": "completed",
                 "completed_at": time.time(), "is_batch": True, "results": [], **metadata}
        apply("complete", event=event, result={"results": [], **metadata})
        with db._read_ctx() as conn:
            row = conn.execute("SELECT task_json,event_json,result_json FROM async_delegations WHERE delegation_id=?",
                               ("deleg-named",)).fetchone()
        for raw in row:
            assert identity.stored_metadata(json.loads(raw)) == metadata
    finally:
        db.close()


def test_worker_child_constructor_persists_name_and_restores_nested_path(tmp_path):
    from agent.runtime_session_child import ChildSessionStore
    from agent.runtime_session_store import WorkerRPC
    from hermes_state import SessionDB
    from hermes_state_runtime import begin_runtime_epoch, mutate_worker_execution, register_worker_execution
    db = SessionDB(tmp_path / "state.db")
    db.create_session("parent", source="cli")
    db.create_session("child", source="subagent", parent_session_id="parent", model_config={"_delegate_from": "parent"})
    epoch = begin_runtime_epoch(db, instance_id="names-fixture")
    scope = dict(epoch=epoch, execution_id="worker-names", session_id="child", generation=0)
    register_worker_execution(db, **scope, kind="compute", adoption_secret="fixture-private")
    class InProcessOwnerLink:
        def send(self, request_id, message):
            request = json.loads(message)
            self.reply = {"result": mutate_worker_execution(db, **request["params"])}
        def receive(self, timeout):
            return self.reply
    link = InProcessOwnerLink()
    rpc = WorkerRPC(tmp_path)
    rpc._connection = lambda: link  # Keep the real loop guard and receipt contract; replace only the socket.
    store = ChildSessionStore(rpc, scope, tmp_path / "outbox")
    try:
        store.create_session("child", "subagent", model_config={"_task_name": "method_review",
            "_agent_path": "/root/method_review", "_delegate_from": "parent", "max_iterations": 5})
        assert db.get_session_model_config_value("child", "_task_name") == "method_review"
        assert db.get_session_model_config_value("child", "_agent_path") == "/root/method_review"
        assert db.get_session_model_config_value("child", "_delegate_from") == "parent"
        resumed = SimpleNamespace(session_id="child", _session_db=store)
        assert identity.make_identity("nested_review", resumed)["agent_path"] == "/root/method_review/nested_review"
        async def inside_running_loop():
            return identity.make_identity("nested_review", resumed)
        assert asyncio.run(inside_running_loop())["agent_path"] == "/root/method_review/nested_review"
        assert store.failure is None
    finally:
        store.close()
        db.close()


def test_abandoned_split_group_keeps_names_and_original_indexes_in_both_saved_projections(tmp_path):
    from tools import async_delegation as ledger
    path = tmp_path / "state.db"
    with closing(sqlite3.connect(path)) as connection:
        ledger._initialize_schema(connection)
    @contextmanager
    def transaction():
        with closing(sqlite3.connect(path)) as connection:
            try:
                yield connection
                connection.commit()
            except BaseException:
                connection.rollback()
                raise
    metadata = {"task_names": ["method_review", "schema_check"],
                "agent_paths": ["/root/method_review", "/root/schema_check"], "task_indexes": [1]}
    record = {"delegation_id": "split-group", "goal": "same full goal", "goals": ["same full goal", "same full goal"],
              "is_batch": True, "dispatched_at": time.time(), **metadata}
    with patch.object(ledger, "_transaction", transaction), patch.object(ledger, "worker_ledger", return_value=None), \
            patch.object(ledger, "_owner_liveness", return_value=lambda pid, birth: False), \
            patch("tools.async_delegation_recovery_hints.git_state_hint", return_value=None):
        ledger._persist_dispatch(record)
        assert ledger.recover_abandoned_delegations() == 1
    with closing(sqlite3.connect(path)) as connection:
        event_raw, result_raw = connection.execute("SELECT event_json,result_json FROM async_delegations").fetchone()
    for raw in (event_raw, result_raw):
        saved = json.loads(raw)
        assert saved["status"] == "unknown"
        assert saved["task_indexes"] == [1]
        assert identity.stored_metadata(saved) == {key: value for key, value in metadata.items() if key != "task_indexes"}
        assert identity.indexed_identity(saved, saved["task_indexes"][0]) == {
            "task_name": "schema_check", "agent_path": "/root/schema_check"}

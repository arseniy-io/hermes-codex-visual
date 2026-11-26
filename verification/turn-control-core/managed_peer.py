"""Synthetic managed worker. Only the model endpoint/constructor is replaced."""
import contextlib
import json
import os
from pathlib import Path
import sys
import threading
import time
import types

HERE = Path(__file__).resolve().parent
RUNTIME = Path(os.environ["LOCALAPPDATA"]) / "hermes/hermes-agent"
wire = sys.stdout
sys.stdout = sys.stderr
sys.dont_write_bytecode = True
sys.path.insert(0, str(RUNTIME))
sys.path.insert(0, str(HERE.parents[1] / ".local/hermes-turn-control-check/candidate"))
for name in ("tools", "agent", "gateway", "tui_gateway"):
    __import__(name).__path__.insert(0, str(HERE.parents[1] / ".local/hermes-turn-control-check/candidate" / name))
import psutil
from hermes_cli.process_identity import worker_birth
import agent.runtime_session_store as stores
from tools.process_registry import process_registry

lock = threading.RLock()
def rpc(method, **params):
    with lock:
        wire.write(json.dumps({"method": method, "params": params}) + "\n")
        wire.flush()
        response = json.loads(sys.stdin.readline())
    if "error" in response:
        raise RuntimeError(response["error"])
    return response["result"]

initial = json.loads(sys.stdin.readline())
scope = {"profile_id": "p", "session_id": "parent", "execution_id": "compute-peer", "generation": 0,
         "pid": os.getpid(), "birth": worker_birth(psutil.Process()), "secret": "p" * 32}
registered = rpc("worker.register", **scope, kind="compute")
scope["epoch"] = registered["owner_epoch"]
stores._worker_process = True
root_store = stores.RuntimeSessionStore(rpc, scope, Path(initial["home"]) / "outbox")
calls = []

class ModelFixture:
    def __init__(self, **kwargs):
        self.session_id = kwargs["session_id"]
        self._session_db = kwargs["session_db"]
        self.model = "fixture"
        self.provider = "fixture"
        self.api_mode = "chat_completions"
        self.base_url = "http://127.0.0.1:1"
        self.api_key = "fixture-key"
        self._active_children = []
        self._active_children_lock = threading.Lock()
        self._session_init_model_config = {}
        self._current_task_id = self.session_id
        self._process_owner_task_ids = set()
        self._interrupt_requested = False
        self._hard_interrupt_requested = threading.Event()
        self._print_fn = lambda *a, **kw: None
        self.tool_progress_callback = kwargs.get("tool_progress_callback")
        self.max_iterations = 5
        self.closed = False
    def clear_interrupt(self, **kwargs):
        self._interrupt_requested = False
        self._hard_interrupt_requested.clear()
    def hard_interrupt(self, *args, **kwargs):
        self._interrupt_requested = True
        self._hard_interrupt_requested.set()
        return True
    interrupt = hard_interrupt
    def get_activity_summary(self):
        return {"api_call_count": 1, "last_activity_ts": time.time()}
    def run_conversation(self, user_message, conversation_history=None, **kwargs):
        assert conversation_history, "Restored child must receive its saved native history"
        assert any("ALREADY_DONE_" in str(m.get("content")) for m in conversation_history)
        calls.append(self.session_id)
        if self.session_id == "top":
            assert "LEAF_RESUMED_RESULT" in user_message, "Parent must see actual restored leaf output before model resumes"
            answer = "TOP_RESUMED_WITH_LEAF_RESULT"
        else:
            answer = "LEAF_RESUMED_RESULT"
        self._session_db.append_messages_batch(self.session_id, [{"role": "user", "content": user_message},
                                                                {"role": "assistant", "content": answer}])
        return {"completed": True, "interrupted": False, "final_response": answer, "api_calls": 1,
                "messages": conversation_history + [{"role": "user", "content": user_message},
                                                     {"role": "assistant", "content": answer}]}
    def close(self):
        if not self.closed and self._session_db is not root_store:
            self._session_db.close()
        self.closed = True

fake_run_agent = types.ModuleType("run_agent")
fake_run_agent.AIAgent = ModelFixture
sys.modules["run_agent"] = fake_run_agent
from tools import delegate_tool as delegates
# Provider routing is outside this lifecycle test; no provider is contacted.
delegates._resolve_child_runtime = lambda *a, **kw: {"provider": "fixture", "base_url": "http://127.0.0.1:1", "model": "fixture"}
delegates._resolve_child_credential_pool = lambda *a, **kw: None
delegates._get_max_spawn_depth = lambda: 4
delegates._get_orchestrator_enabled = lambda: True
delegates._load_config = lambda: {"max_iterations": 5}
root = ModelFixture(session_id="parent", session_db=root_store)
root._delegate_depth = 0
transport = object()
owner = {"agent": root, "transport": transport}
checkpoint = {"owner": {"root_id": "parent"}, "checkpoint_id": "managed-test", "nodes": [
    {"stored_id": "top", "subagent_id": "sa-top-original", "parent_stored_id": "parent", "goal": "TOP_ORIGINAL_GOAL",
     "task_name": "method_review", "agent_path": "/root/method_review", "resumable": True,
     "model": "fixture", "provider": "fixture", "profile_home": initial["home"], "cwd": initial["home"]},
    {"stored_id": "leaf", "subagent_id": "sa-leaf-original", "parent_stored_id": "top", "goal": "LEAF_ORIGINAL_GOAL",
     "task_name": "leaf_review", "agent_path": "/root/method_review/leaf_review", "resumable": True,
     "model": "fixture", "provider": "fixture", "profile_home": initial["home"], "cwd": initial["home"]}]}
try:
    from tools.delegate_tree_resume import resume_children
    receipts = resume_children(root, checkpoint, ui_session_id="runtime-ui-different", owner_transport=transport,
                               owner_session_record=owner)
    event = process_registry.completion_queue.get(timeout=20)
    assert event["type"] == "async_delegation", event
    assert event["parent_session_id"] == "parent" and event["origin_ui_session_id"] == "parent", event
    entry = event["results"][0]
    assert entry["summary"] == "TOP_RESUMED_WITH_LEAF_RESULT", event
    assert entry["task_name"] == "method_review" and entry["agent_path"] == "/root/method_review", event
    assert calls == ["leaf", "top"], calls
    from tools.async_delegation import claim_event_delivery, complete_event_delivery
    claim = claim_event_delivery(event, "test-parent")
    assert claim
    complete_event_delivery(event, claim)
    wire.write(json.dumps({"done": True, "receipts": receipts, "event": event, "calls": calls}) + "\n")
    wire.flush()
finally:
    root_store.close()

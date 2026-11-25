from __future__ import annotations
import ast
import contextlib
import copy
import importlib.util
import json
import sqlite3
import sys
import threading
import tempfile
import shutil
import time
import types
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("hcv_display_candidate", ROOT / "source/hermes-tool-display/data.py")
display = importlib.util.module_from_spec(spec)
spec.loader.exec_module(display)
NAME = "mcp__github__fetch_file"

stage_spec = importlib.util.spec_from_file_location("hcv_stage_tool_display_tests", ROOT / "scripts/stage-hermes-tool-display.py")
stage_module = importlib.util.module_from_spec(stage_spec)
stage_spec.loader.exec_module(stage_module)
CORE = stage_module.CORE

def load_installer():
    installer_spec = importlib.util.spec_from_file_location("hcv_install_tool_display_tests", ROOT / "scripts/install-hermes-tool-display.py")
    installer = importlib.util.module_from_spec(installer_spec)
    installer_spec.loader.exec_module(installer)
    return installer


def tool(title, **kwargs):
    return types.SimpleNamespace(name="fetch_file", title=title, annotations={"title": "Annotation title", "readOnlyHint": True},
        meta={"openai/toolInvocation/invoking": "  Читаю GitHub…  ", "openai/toolInvocation/invoked": "Готово ✓", "secret": "SHOULD-NOT-APPEAR"}, **kwargs)


def snapshot(title):
    return {"version": 1, "tools": [{"registered_name": NAME, "server": "github", "tool": "fetch_file", "definition": display.definition(tool(title))}]}


def msg(role, uid, title=None, call_id="reused"):
    if role == "assistant":
        return {"role": role, "_tool_call_uids": {call_id: uid}, "tool_calls": [{"id": call_id, "function": {"name": NAME, "arguments": '{"path":"README.md"}'}}]}
    return {"role": role, "tool_call_id": call_id, "tool_name": NAME, "_tool_call_uid": uid,
        "display_metadata": {"tool_result_metadata": {display.SAVED: snapshot(title)}}, "content": "unchanged tool result"}


def title_of(message):
    args = json.loads(message["tool_calls"][0]["function"]["arguments"])
    return args[display.ARG][0]["display"]["definition"]["title"]


class DB:
    def __init__(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("CREATE TABLE messages (role TEXT, tool_call_uid TEXT, display_metadata TEXT, active INT, compacted INT)")
    def insert(self, uid, title):
        self.conn.execute("INSERT INTO messages VALUES ('tool',?,?,1,0)", (uid, json.dumps(msg("tool", uid, title)["display_metadata"])))
    def _read_all(self, sql, args):
        return self.conn.execute(sql, args).fetchall()


class MetadataTests(unittest.TestCase):
    def setUp(self):
        self.profile = "first"
        self.raw = tool("fetch_file")
        core = types.ModuleType("tools.mcp_tool")
        core._lock = threading.RLock()
        core._mcp_tool_server_names = {NAME: "github"}
        core._servers = {("first", "github"): types.SimpleNamespace(_tools=[self.raw]),
                         ("second", "github"): types.SimpleNamespace(_tools=[tool("Second profile")])}
        core._lazy_server_configs = {}
        self.core = core
        tools = types.ModuleType("tools"); tools.__path__ = []; tools.mcp_tool = core; tools.hcv_tool_display = display
        schema = types.ModuleType("tools.mcp_tool_schema"); schema.mcp_prefixed_tool_name = lambda server, name: "mcp__" + server + "__" + name
        scope = types.ModuleType("tools.mcp_tool_scope"); scope._resolve_server_key = lambda name: (self.profile, name)
        cache = types.ModuleType("tools.mcp_schema_cache"); cache.config_fingerprint = lambda config: config["fingerprint"]; cache.get_cached_entry = lambda name, fingerprint: None
        self.cache = cache
        agent = types.ModuleType("agent"); agent.__path__ = []
        app = types.ModuleType("agent.display")
        def base(name, args):
            names = [name] if name != "tool_call" else [row["name"] for row in args.get("calls", [args])]
            return [types.SimpleNamespace(as_payload=lambda name=name: {"kind": "mcp", "app": "GitHub", "name": name, "action": "fetch file", "text": "GitHub · fetch file", "emoji": "🔌", "preview": ""}) for name in names]
        app.tool_labels_for_call = base
        app._detect_tool_failure = lambda name, result: (False, "")
        app.is_neutral_failure = lambda name, result: False
        self.edit_calls = []
        app.render_edit_diff_with_delta = lambda *args, **kwargs: self.edit_calls.append(kwargs) or False
        image = types.ModuleType("agent.terminal_image"); image.tool_image_path = lambda *args, **kwargs: None
        todo = types.ModuleType("tools.todo_tool"); todo.is_todo_tool_name = lambda name: False
        self.modules = {"tools": tools, "tools.mcp_tool": core, "tools.mcp_tool_schema": schema, "tools.mcp_tool_scope": scope,
                        "tools.mcp_schema_cache": cache, "tools.hcv_tool_display": display, "tools.todo_tool": todo,
                        "agent": agent, "agent.display": app, "agent.terminal_image": image}
        self.patched = patch.dict(sys.modules, self.modules); self.patched.start()
    def tearDown(self):
        self.patched.stop()
    def test_only_display_literals_are_captured(self):
        value = display.capture(NAME, {"secret_arg": "never copied"})
        self.assertEqual(value["tools"][0]["definition"]["title"], "fetch_file")
        self.assertEqual(value["tools"][0]["definition"]["_meta"]["openai/toolInvocation/invoking"], "  Читаю GitHub…  ")
        self.assertNotIn("SHOULD-NOT-APPEAR", json.dumps(value)); self.assertNotIn("secret_arg", json.dumps(value))
        fields = display.cache_fields(self.raw, {"readOnlyHint": True})
        self.assertEqual(fields["annotations"], {"readOnlyHint": True, "title": "Annotation title"})
    def test_owning_profile_and_lossy_name_mapping(self):
        self.assertEqual(display.capture(NAME, {})["tools"][0]["definition"]["title"], "fetch_file")
        self.profile = "second"
        self.assertEqual(display.capture(NAME, {})["tools"][0]["definition"]["title"], "Second profile")
        self.assertIsNone(display.capture("mcp__github__not_registered", {}))
    def test_same_call_snapshot_is_immutable_and_id_reuse_gets_new_occurrence(self):
        session = {}
        old = display.begin(session, "same", NAME, {})
        self.raw.title = "Changed catalogue"
        self.assertEqual(display.finish(session, "same", NAME, {}), old)
        new = display.begin(session, "same", NAME, {})
        self.assertEqual(new["tools"][0]["definition"]["title"], "Changed catalogue")
        self.assertNotEqual(old, new)
    def test_history_uid_not_reused_provider_id_owns_each_title(self):
        messages = [msg("assistant", "uid-A"), msg("tool", "uid-A", "Old title"), msg("assistant", "uid-B"), msg("tool", "uid-B", "New title")]
        original = copy.deepcopy(messages)
        output = display.project_history(messages)
        self.assertEqual(title_of(output[0]), "Old title"); self.assertEqual(title_of(output[2]), "New title")
        self.assertEqual(messages, original)
        self.assertEqual(json.loads(messages[0]["tool_calls"][0]["function"]["arguments"]), {"path": "README.md"})
    def test_pagination_and_owning_profile_use_only_recorded_uid_sidecars(self):
        first, second = DB(), DB(); first.insert("uid-A", "First profile"); second.insert("uid-A", "Second profile")
        page = [msg("assistant", "uid-A")]
        self.assertEqual(title_of(display.project_history(page, first)[0]), "First profile")
        self.assertEqual(title_of(display.project_history(page, second)[0]), "Second profile")
        self.assertNotIn(display.ARG, page[0]["tool_calls"][0]["function"]["arguments"])
    def test_old_history_and_ambiguous_copies_never_use_new_catalogue(self):
        legacy = [{"role": "assistant", "tool_calls": [{"id": "same", "function": {"name": NAME, "arguments": "{}"}}]},
                  {"role": "tool", "tool_call_id": "same", "content": "old output"}]
        with patch.object(display, "capture", side_effect=AssertionError("history must not read catalogue")):
            self.assertEqual(display.project_history(legacy), legacy)
            db = DB(); db.insert("uid-A", "One"); db.insert("uid-A", "Conflicting copy")
            self.assertEqual(display.project_history([msg("assistant", "uid-A")], db), [msg("assistant", "uid-A")])
    def test_lazy_cache_metadata_and_first_live_connection_are_distinct(self):
        self.core._servers.clear(); self.core._lazy_server_configs[("first", "github")] = {"fingerprint": "route-A"}
        self.assertIsNone(display.capture(NAME, {}), "old cache has no historical title")
        self.cache.get_cached_entry = lambda name, fingerprint: {"tools": [{"name": "fetch_file", **display.definition(self.raw)}]}
        self.assertEqual(display.capture(NAME, {})["tools"][0]["definition"]["title"], "fetch_file")
    def test_actual_gateway_start_prepare_complete_keep_real_args_unchanged(self):
        source = ast.parse(stage_module.candidates(CORE)[1]["tui_gateway/tool_progress.py"].decode("utf8"))
        selected = [node for node in source.body if isinstance(node, ast.FunctionDef) and node.name in {"_on_tool_start", "_prepare_tool_result_metadata", "_on_tool_complete"}]
        emitted = []; sessions = {"runtime": {}}
        env = {"json": json, "time": time, "contextlib": contextlib, "_sessions": sessions,
               "_connector_lifecycle_is_stale": lambda *args: False, "_tool_progress_enabled": lambda sid: True,
               "_tool_lifecycle_required_for_ui": lambda name: False, "_connector_tool_lifecycle": lambda *args: False,
               "_tool_ctx": lambda name, args: "exact preview", "_session_verbose": lambda sid: False,
               "_tool_labels": lambda name, args: [label.as_payload() for label in sys.modules["agent.display"].tool_labels_for_call(name, args)],
               "_tool_summary": lambda *args: None, "_publish_session_control_snapshot": lambda *args, **kwargs: None,
               "_emit_tool_lifecycle": lambda event, sid, name, args, payload: emitted.append((event, copy.deepcopy(args), copy.deepcopy(payload)))}
        exec(compile(ast.Module(body=selected, type_ignores=[]), "candidate_lifecycle", "exec"), env)
        edit_snapshot = object()
        sessions["runtime"]["edit_snapshots"] = {"call-exact": edit_snapshot}
        real_args = {"path": "README.md"}; original = copy.deepcopy(real_args)
        env["_on_tool_start"]("runtime", "call-exact", NAME, real_args)
        durable = env["_prepare_tool_result_metadata"]("runtime", "call-exact", NAME, real_args, '"body"')
        self.raw.title = "later catalogue"
        env["_on_tool_complete"]("runtime", "call-exact", NAME, real_args, '"body"')
        self.assertEqual(real_args, original)
        self.assertIs(self.edit_calls[0]["snapshot"], edit_snapshot)
        self.assertEqual([event[0] for event in emitted], ["tool.start", "tool.complete"])
        for _, args, payload in emitted:
            self.assertEqual(args, original); self.assertEqual(payload["args"], original)
            self.assertEqual(payload["labels"][0]["display"]["definition"]["title"], "fetch_file")
            self.assertNotIn(display.SAVED, payload)
        self.assertEqual(durable["tool_result_metadata"][display.SAVED]["tools"][0]["definition"]["title"], "fetch_file")

    def test_explicit_uid_list_keeps_two_reused_call_ids_in_one_assistant(self):
        assistant = msg("assistant", ["uid-A", "uid-B"])
        assistant["tool_calls"].append(copy.deepcopy(assistant["tool_calls"][0]))
        output = display.project_history([assistant, msg("tool", "uid-A", "First"), msg("tool", "uid-B", "Second")])
        values = [json.loads(call["function"]["arguments"])[display.ARG][0]["display"]["definition"]["title"] for call in output[0]["tool_calls"]]
        self.assertEqual(values, ["First", "Second"])

    def test_empty_old_cache_definition_is_enriched_only_at_current_completion(self):
        self.core._servers.clear()
        self.core._lazy_server_configs[("first", "github")] = {"fingerprint": "route-A"}
        self.cache.get_cached_entry = lambda *args: {"tools": [{"name": "fetch_file"}]}
        session = {}
        first = display.begin(session, "cold", NAME, {})
        self.assertEqual(first["tools"][0]["definition"], {})
        self.core._servers[("first", "github")] = types.SimpleNamespace(_tools=[self.raw])
        done = display.finish(session, "cold", NAME, {})
        self.assertEqual(done["tools"][0]["definition"]["title"], "fetch_file")
        self.assertEqual(first["tools"][0]["definition"], {})

    def test_actual_provider_builder_strips_saved_ui_fields_without_changing_tool_args(self):
        source = ast.parse((CORE / "agent/turn_context.py").read_text(encoding="utf8"))
        function = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == "build_api_messages")
        metadata = ast.parse((CORE / "agent/message_metadata.py").read_text(encoding="utf8"))
        declaration = next(node for node in metadata.body if isinstance(node, ast.Assign) and
            any(isinstance(target, ast.Name) and target.id == "PERSISTENCE_ONLY_MESSAGE_FIELDS" for target in node.targets))
        persistence = {node.value for node in ast.walk(declaration) if isinstance(node, ast.Constant) and isinstance(node.value, str)}
        self.assertIn("display_metadata", persistence)
        for name, values in {
            "agent.agent_runtime_helpers": {"fill_empty_non_final_wire_payload": lambda *args, **kwargs: None},
            "agent.conversation_loop": {"_clone_message_for_send": copy.deepcopy},
            "agent.replay_cleanup": {"canonicalize_replay_history": lambda rows, **kwargs: rows},
            "agent.image_replay": {"replay_for_agent": lambda *args: None},
            "agent.anthropic_thinking_replay": {"apply_rejected_thinking_suppression": lambda *args: None},
        }.items():
            module = types.ModuleType(name)
            module.__dict__.update(values)
            self.modules[name] = module
        env = {"Any": object, "PERSISTENCE_ONLY_MESSAGE_FIELDS": persistence,
               "stamped_reasoning_tokens": lambda message: 0}
        exec(compile(ast.Module(body=[function], type_ignores=[]), "native_provider_builder", "exec"), env)
        canonical = [msg("assistant", "uid-A"), msg("tool", "uid-A", "Saved title")]
        original = copy.deepcopy(canonical)
        agent = types.SimpleNamespace(_current_turn_timestamp=1, ephemeral_system_prompt="",
            _copy_reasoning_content_for_api=lambda *args: None, _should_sanitize_tool_calls=lambda: False)
        with patch.dict(sys.modules, self.modules):
            wire, _ = env["build_api_messages"](agent, canonical, current_turn_user_idx=None,
                ext_prefetch_cache=None, plugin_user_context=None, moa_config=None, active_system_prompt=None)
        self.assertEqual(canonical, original)
        self.assertNotIn("display_metadata", wire[1])
        self.assertNotIn(display.SAVED, json.dumps(wire))
        self.assertEqual(json.loads(wire[0]["tool_calls"][0]["function"]["arguments"]), {"path": "README.md"})

    @unittest.skipUnless(importlib.util.find_spec("pydantic"), "Use the installed Hermes Python to validate its native Pydantic wire contract")
    def test_actual_closed_wire_contract_accepts_optional_display_and_preserves_literals(self):
        source = stage_module.candidates(CORE)[1]["tui_gateway/contracts/common.py"].decode("utf8")
        parsed = ast.parse(source)
        classes = [node for node in parsed.body if isinstance(node, ast.ClassDef) and node.name in {"ToolLabelKind", "ToolLabel"}]
        spec = importlib.util.spec_from_file_location("hcv_native_contract_base", CORE / "tui_gateway/contracts/base.py")
        base = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(base)
        env = {"Payload": base.Payload, "WireEnum": base.WireEnum, "JsonValue": base.JsonValue}
        exec(compile(ast.Module(body=classes, type_ignores=[]), "candidate_tool_label_contract", "exec"), env)
        env["ToolLabel"].model_rebuild(_types_namespace=env)
        value = display.labels_for(NAME, {}, snapshot("  Exact title  "))[0]
        accepted = env["ToolLabel"].model_validate(value).model_dump(exclude_none=True)
        self.assertEqual(accepted, value)
        self.assertEqual(accepted["display"]["definition"]["title"], "  Exact title  ")


def reverse_patch(raw, hunks, name):
    reverse = [(dest, sum(line[0] != "-" for line in body), start,
        [("-" if line[0] == "+" else "+" if line[0] == "-" else " ") + line[1:] for line in body])
        for start, _, dest, body in hunks]
    return stage_module.apply(raw, reverse, name)


class InstallTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="hcv-tool-display-")
        self.root = Path(self.temporary.name)
        self.core, self.candidate = self.root / "core", self.root / "candidate"
        self.core.mkdir()
        current, self.output = stage_module.candidates(CORE)
        manifest = json.loads((stage_module.ASSETS / "manifest.json").read_text(encoding="utf8"))
        transformations = stage_module.patches((stage_module.ASSETS / "core.patch").read_text(encoding="utf8"))
        timeline = ROOT / "source/hermes-timeline"
        timeline_manifest = json.loads((timeline / "manifest.json").read_text(encoding="utf8"))
        timeline_patches = stage_module.patches((timeline / "core.patch").read_text(encoding="utf8"))
        self.baseline = {}
        for name, hashes in manifest["files"].items():
            raw = current[name]
            digest = stage_module.digest(raw)
            if digest in hashes.get("successors", ()):
                # In the fixture only, roll back the exact later timeline
                # contract before reconstructing the installer baseline.
                successor = timeline_manifest["files"][name]
                self.assertEqual(digest, successor["candidate"])
                self.assertEqual(hashes["candidate"], successor["baseline"])
                raw = reverse_patch(raw, timeline_patches[name], name)
                self.assertEqual(stage_module.digest(raw), hashes["candidate"])
            if stage_module.digest(raw) == hashes["candidate"]:
                raw = reverse_patch(raw, transformations[name], name)
            self.assertEqual(stage_module.digest(raw), hashes["baseline"])
            self.baseline[name] = raw
        for name, raw in self.baseline.items():
            target = self.core / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
        stage_module.write_candidate(self.candidate, self.core)
        self.installer = load_installer()
    def tearDown(self):
        self.temporary.cleanup()
    def test_stage_does_not_mutate_core_and_hash_mismatch_refuses(self):
        for name, raw in self.baseline.items():
            self.assertEqual((self.core / name).read_bytes(), raw)
        first = next(iter(self.baseline))
        (self.core / first).write_bytes(self.baseline[first] + b"# unknown change\n")
        with self.assertRaisesRegex(RuntimeError, "unverified source"):
            stage_module.candidates(self.core)
    def test_exact_install_and_idempotent_reinstall(self):
        backup, output = self.installer.install(self.core, self.candidate, self.root / "backup")
        self.assertIsNotNone(backup)
        for name, raw in output.items():
            self.assertEqual((self.core / name).read_bytes(), raw)
        again, same = self.installer.install(self.core, self.candidate, self.root / "backup")
        self.assertIsNone(again); self.assertEqual(output, same)
        for name, raw in self.baseline.items():
            self.assertEqual((backup / name).read_bytes(), raw)
    def test_tampered_candidate_is_refused_before_install(self):
        first = next(iter(self.output))
        (self.candidate / first).write_bytes(b"bad candidate")
        with self.assertRaisesRegex(RuntimeError, "Staged source differs"):
            self.installer.install(self.core, self.candidate, self.root / "backup")
        for name, raw in self.baseline.items():
            self.assertEqual((self.core / name).read_bytes(), raw)
    def test_partial_publish_failure_rolls_back_every_own_write(self):
        original_publish = self.installer.publish
        calls = []
        def fail_once(path, data, **kwargs):
            calls.append(path)
            if len(calls) == 3:
                raise OSError("simulated third publish failure")
            return original_publish(path, data, **kwargs)
        with patch.object(self.installer, "publish", side_effect=fail_once):
            with self.assertRaisesRegex(OSError, "simulated"):
                self.installer.install(self.core, self.candidate, self.root / "backup")
        for name, raw in self.baseline.items():
            self.assertEqual((self.core / name).read_bytes(), raw)
        self.assertFalse((self.core / "tools/hcv_tool_display.py").exists())
    def test_foreign_existing_helper_is_never_overwritten(self):
        (self.core / "tools/hcv_tool_display.py").write_bytes(b"# foreign helper\n")
        with self.assertRaisesRegex(RuntimeError, "different MCP display helper"):
            self.installer.install(self.core, self.candidate, self.root / "backup")


if __name__ == "__main__":
    unittest.main(verbosity=2)

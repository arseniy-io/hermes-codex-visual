"""Contract tests against real Hermes appliers in disposable profile homes.

Run using Hermes's Python environment with its source on PYTHONPATH. No model,
network request, installed plugin or owner's profile is used.
"""
import importlib.util
import json
import os
import re
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch


class ActivityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sandbox = tempfile.TemporaryDirectory(prefix="hcv-activity-tests-")
        cls.base = Path(cls.sandbox.name)
        cls.old_env = {key: os.environ.get(key) for key in ("HERMES_HOME", "HERMES_RUNTIME_DIR")}
        os.environ["HERMES_HOME"] = str(cls.base / "launch")
        os.environ["HERMES_RUNTIME_DIR"] = str(cls.base / "runtime")
        os.environ["HERMES_DISABLE_LAZY_INSTALLS"] = "1"
        from hermes_constants import set_hermes_home_override, reset_hermes_home_override
        cls.set_home, cls.reset_home = staticmethod(set_hermes_home_override), staticmethod(reset_hermes_home_override)
        cls.model = patch("agent.oneshot.run_oneshot", return_value="Изменить правило проверки и сохранить результат.")
        cls.model_mock = cls.model.start()
        spec = importlib.util.spec_from_file_location("hcv_activity_candidate", Path(os.environ.get("HCV_ACTIVITY_BACKEND_SOURCE", Path(__file__).resolve().parents[1] / "source/usage-backend")) / "activity.py")
        cls.activity = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.activity)

    @classmethod
    def tearDownClass(cls):
        cls.model.stop()
        for key, value in cls.old_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        cls.sandbox.cleanup()

    def setUp(self):
        self.model_mock.reset_mock(return_value=True, side_effect=True)
        self.model_mock.return_value = "Изменить правило проверки и сохранить результат."
        self.temp = tempfile.TemporaryDirectory(dir=self.base)
        self.home = Path(self.temp.name)
        self.token = self.set_home(self.home)
        (self.home / "config.yaml").write_text("memory:\n  memory_enabled: true\n  user_profile_enabled: true\n  write_approval: true\nskills:\n  write_approval: true\n", encoding="utf-8")
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        app = FastAPI()
        app.include_router(self.activity.router)
        self.client = TestClient(app)

    def tearDown(self):
        deadline = time.monotonic() + 5
        while self.activity._SUMMARY_RUNNING and time.monotonic() < deadline:
            time.sleep(0.01)
        self.client.close()
        self.reset_home(self.token)
        self.temp.cleanup()

    def proposal(self, kind="skills", payload=None):
        from tools import write_approval
        payload = payload or {"action": "patch", "name": "demo", "old_string": "old", "new_string": "new"}
        return write_approval.stage_write(kind, payload, summary="Проверка", origin="background_review")

    def test_desktop_and_agent_manifest_versions_match(self):
        root = Path(os.environ.get("HCV_ACTIVITY_PROJECT_ROOT", Path(__file__).resolve().parents[1]))
        version = json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
        manifest = (root / "source/usage-backend/plugin.yaml").read_text(encoding="utf-8")
        self.assertEqual(re.search(r"(?m)^version:\s*(\S+)\s*$", manifest).group(1), version)

    def skill(self):
        path = self.home / "skills" / "demo" / "SKILL.md"
        path.parent.mkdir(parents=True)
        path.write_text('---\nname: demo\ndescription: Test skill\n---\n\nold\n', encoding="utf-8")
        return path

    def detail(self, rec):
        response = self.client.get(f"/activity/{rec['subsystem']}/{rec['id']}")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def decide(self, rec, detail, action="approve"):
        return self.client.post(f"/activity/{rec['subsystem']}/{rec['id']}/{action}", json={key: detail[key] for key in ("scope", "version", "signature")})

    def test_native_baseline_and_notification_hook(self):
        from agent.background_review import _action_lines, _classify_review_result
        from agent.inline_tool_executors import apply_transform_tool_result
        from types import SimpleNamespace
        rec = self.proposal()
        data = {"success": True, "staged": True, "pending_id": rec["id"], "message": "Staged", "extra": 3}
        self.assertEqual(_action_lines(data, {"tool": "skill_manage"}, False), [])
        original = json.dumps(data)
        # Use the real inline path used by the native memory tool too.
        def invoke(name, **kwargs):
            self.assertEqual(name, "transform_tool_result")
            return [self.activity.proposal_notification(**kwargs)]
        with patch("hermes_cli.lifecycle.has_hook", return_value=True), patch("hermes_cli.lifecycle.invoke_hook", side_effect=invoke):
            changed = apply_transform_tool_result(SimpleNamespace(session_id="test", _inherited_conversation_id="test"), function_name="skill_manage", function_args={}, result=original, effective_task_id="test", tool_call_id="call")
        transformed = json.loads(changed)
        self.assertEqual(transformed["extra"], 3)
        self.assertTrue(transformed["proposal_staged"])
        self.assertTrue(_action_lines(transformed, {"tool": "skill_manage"}, False))
        self.assertEqual(_classify_review_result(_action_lines(transformed, {"tool": "skill_manage"}, False)), "skill")
        self.assertIsNone(self.activity.proposal_notification(tool_name="read_file", result=original))
        self.assertIsNone(self.activity.proposal_notification(tool_name="memory", result=original))

    def test_list_and_real_skill_apply(self):
        path = self.skill()
        rec = self.proposal()
        response = self.client.get("/activity").json()
        self.assertEqual(response["schema"], 1)
        self.assertEqual(len(response["items"]), 1)
        detail = self.detail(rec)
        self.assertTrue(detail["applicable"], detail)
        self.assertIn("old", detail["preview"])
        self.assertIn("new", detail["preview"])
        response = self.decide(rec, detail)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["status"], "approved")
        self.assertIn("new", path.read_text(encoding="utf-8"))
        self.assertEqual(self.client.get("/activity").json()["items"], [])
        self.assertEqual(self.decide(rec, detail).status_code, 409)

    def test_legacy_explicit_main_skill_path(self):
        path = self.skill()
        rec = self.proposal(payload={"action": "patch", "name": "demo", "file_path": "SKILL.md", "old_string": "old", "new_string": "new"})
        detail = self.detail(rec)
        self.assertTrue(detail["applicable"], detail)
        response = self.decide(rec, detail)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("new", path.read_text(encoding="utf-8"))

    def test_native_full_skill_file_write_can_be_reviewed_and_accepted(self):
        path = self.skill()
        before = path.read_text(encoding="utf-8")
        after = before.replace("old", "updated guidance")
        rec = self.proposal(payload={"action": "write_file", "name": "demo", "file_path": "SKILL.md",
                                     "file_content": after})
        detail = self.detail(rec)
        self.assertTrue(detail["applicable"], detail)
        self.assertEqual(detail["changes"][0]["before"], before)
        self.assertEqual(detail["changes"][0]["after"], after)
        response = self.decide(rec, detail)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(path.read_text(encoding="utf-8"), after)

    def test_stale_source_and_changed_proposal_cannot_apply(self):
        path = self.skill()
        rec = self.proposal()
        detail = self.detail(rec)
        path.write_text(path.read_text(encoding="utf-8") + "extra\n", encoding="utf-8")
        self.assertEqual(self.decide(rec, detail).status_code, 409)
        current = self.detail(rec)
        p = self.home / "pending" / "skills" / (rec["id"] + ".json")
        rec["summary"] = "different"
        p.write_text(json.dumps(rec), encoding="utf-8")
        self.assertEqual(self.decide(rec, current).status_code, 409)
        self.assertIn("old", path.read_text(encoding="utf-8"))

    def test_same_id_replacement_after_apply_is_not_discarded(self):
        self.skill()
        rec = self.proposal()
        detail = self.detail(rec)
        from tools import skill_manager_tool as sm
        original = sm.apply_skill_pending
        def replace_after(payload):
            result = original(payload)
            changed = dict(rec, summary="Replacement proposal")
            (self.home / "pending" / "skills" / (rec["id"] + ".json")).write_text(json.dumps(changed), encoding="utf-8")
            return result
        with patch.object(sm, "apply_skill_pending", side_effect=replace_after):
            response = self.decide(rec, detail)
        self.assertEqual(response.status_code, 409, response.text)
        pending = self.home / "pending" / "skills" / (rec["id"] + ".json")
        self.assertEqual(json.loads(pending.read_text(encoding="utf-8"))["summary"], "Replacement proposal")
        self.assertNotEqual(self.client.get("/activity").json()["items"][0]["version"], detail["version"])

    def test_unknown_cleanup_is_not_reapplied(self):
        self.skill()
        rec = self.proposal()
        detail = self.detail(rec)
        from tools import write_approval as wa, skill_manager_tool as sm
        with patch.object(wa, "discard_pending", return_value=False), patch.object(sm, "apply_skill_pending", wraps=sm.apply_skill_pending) as apply:
            first = self.decide(rec, detail)
            reopened = self.detail(rec)
            self.assertFalse(reopened["applicable"])
            self.assertIn("уже отправлялось", reopened["reason"])
            self.assertIn("old_string", reopened["preview"])
            self.assertIn("new_string", reopened["preview"])
            second = self.decide(rec, reopened)
        self.assertEqual(first.status_code, 503)
        self.assertEqual(second.status_code, 409)
        self.assertEqual(apply.call_count, 1)

    def test_concurrent_http_approvals_apply_once(self):
        self.skill()
        rec = self.proposal()
        detail = self.detail(rec)
        from tools import skill_manager_tool as sm
        barrier = threading.Barrier(3)
        statuses = []
        def worker():
            token = self.set_home(self.home)
            try:
                barrier.wait()
                statuses.append(self.decide(rec, detail).status_code)
            finally:
                self.reset_home(token)
        with patch.object(sm, "apply_skill_pending", wraps=sm.apply_skill_pending) as apply:
            threads = [threading.Thread(target=worker) for _ in range(2)]
            for t in threads: t.start()
            barrier.wait()
            for t in threads: t.join(10)
            self.assertFalse(any(t.is_alive() for t in threads))
        self.assertEqual(sorted(statuses), [200, 409])
        self.assertEqual(apply.call_count, 1)

    def test_unknown_memory_outcome_keeps_full_preview_but_disables_approval(self):
        path = self.home / "memories" / "MEMORY.md"
        path.parent.mkdir()
        path.write_text("original entry", encoding="utf-8")
        rec = self.proposal("memory", {"action": "add", "target": "memory", "content": "proposed entry"})
        detail = self.detail(rec)
        from tools import write_approval as wa
        with patch.object(wa, "discard_pending", return_value=False):
            self.assertEqual(self.decide(rec, detail).status_code, 503)
        reopened = self.detail(rec)
        self.assertFalse(reopened["applicable"])
        self.assertIn("уже отправлялось", reopened["reason"])
        self.assertIn("### Было", reopened["preview"])
        self.assertIn("### Станет", reopened["preview"])
        self.assertIn("original entry", reopened["preview"])
        self.assertIn("proposed entry", reopened["preview"])
        self.assertEqual(self.decide(rec, reopened).status_code, 409)

    def test_memory_real_apply_stale_pin_and_full_preview(self):
        path = self.home / "memories" / "MEMORY.md"
        path.parent.mkdir()
        path.write_text("one\n§\ntwo", encoding="utf-8")
        rec = self.proposal("memory", {"action": "batch", "target": "memory", "operations": [{"action": "patch", "old_text": "one", "content": "ONE", "matched_entry": "one"}, {"action": "add", "content": "three"}]})
        detail = self.detail(rec)
        self.assertTrue(detail["applicable"], detail)
        self.assertIn("three", detail["preview"])
        response = self.decide(rec, detail)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("ONE", path.read_text(encoding="utf-8"))
        self.assertIn("three", path.read_text(encoding="utf-8"))

    def test_memory_changes_inside_native_lock_are_refused(self):
        path = self.home / "memories" / "MEMORY.md"
        path.parent.mkdir()
        path.write_text("one", encoding="utf-8")
        rec = self.proposal("memory", {"action": "add", "target": "memory", "content": "two"})
        detail = self.detail(rec)
        from tools.memory_tool import MemoryStore
        original = MemoryStore._mutate
        def race(store, target, mutate, **kwargs):
            path.write_text("changed", encoding="utf-8")
            return original(store, target, mutate, **kwargs)
        with patch.object(MemoryStore, "_mutate", race):
            response = self.decide(rec, detail)
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(path.read_text(encoding="utf-8"), "changed")
        self.assertFalse(self.activity._claim_path("memory", rec["id"], detail["version"]).exists())
        reopened = self.detail(rec)
        self.assertTrue(reopened["applicable"], reopened)
        self.assertIn("changed", reopened["preview"])
        self.assertIn("two", reopened["preview"])
        response = self.decide(rec, reopened)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(path.read_text(encoding="utf-8"), "changed\n§\ntwo")

    def test_memory_approval_can_be_retried_after_native_capacity_refusal(self):
        (self.home / "config.yaml").write_text(
            "memory:\n  memory_enabled: true\n  memory_char_limit: 20\n  write_approval: true\n",
            encoding="utf-8")
        path = self.home / "memories" / "MEMORY.md"
        path.parent.mkdir(exist_ok=True)
        path.write_text("1234567890", encoding="utf-8")
        rec = self.proposal("memory", {"action": "add", "target": "memory", "content": "abcdefghijklmn"})
        detail = self.detail(rec)
        response = self.decide(rec, detail)
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(path.read_text(encoding="utf-8"), "1234567890")
        self.assertFalse(self.activity._claim_path("memory", rec["id"], detail["version"]).exists())
        events = self.client.get("/activity").json()["recent"]
        self.assertEqual([event["status"] for event in events], ["not_applied"])

        path.write_text("one", encoding="utf-8")
        reopened = self.detail(rec)
        self.assertTrue(reopened["applicable"], reopened)
        response = self.decide(rec, reopened)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(path.read_text(encoding="utf-8"), "one\n§\nabcdefghijklmn")

    def test_explanation_uses_changes_and_is_cached_for_source_version(self):
        path = self.skill()
        rec = self.proposal()
        self.assertEqual(self.client.get("/activity").json()["items"][0]["summary"], "")
        detail = self.detail(rec)
        deadline = time.monotonic() + 5
        while detail["explanation"]["status"] == "pending" and time.monotonic() < deadline:
            time.sleep(0.01)
            detail = self.detail(rec)
        self.assertEqual(detail["explanation"]["status"], "ready")
        self.assertEqual(detail["explanation"]["text"], "Изменить правило проверки и сохранить результат.")
        self.assertEqual(detail["changes"][0]["fragments"], [{"before": "old", "after": "new"}])
        self.assertNotIn("description: Test skill", json.dumps(detail["changes"][0]["fragments"]))
        self.activity._save_intent("skills", rec["id"], {"context": "Назначение пришло позже."}, origins={"background_review"})
        self.activity._SUMMARY_OUTCOMES.clear()
        self.assertEqual(self.detail(rec)["explanation"], detail["explanation"])
        response = self.client.post(f"/activity/skills/{rec['id']}/explanation",
                                    json={key: detail[key] for key in ("scope", "version", "signature")})
        self.assertEqual(response.json()["explanation"], detail["explanation"])
        self.assertEqual(self.model_mock.call_count, 1)
        path.write_text(path.read_text(encoding="utf-8") + "new context\n", encoding="utf-8")
        changed = self.detail(rec)
        self.assertNotEqual(changed["signature"], detail["signature"])
        self.assertEqual(changed["explanation"]["status"], "pending")
        deadline = time.monotonic() + 5
        while self.activity._SUMMARY_RUNNING and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertEqual(self.model_mock.call_count, 2)

    def test_legacy_explanation_survives_late_author_note_and_moves_into_history(self):
        self.skill()
        rec = self.proposal()
        detail = self.activity._detail("skills", rec["id"])[0]
        current, legacy = self.activity._summary_paths("skills", rec["id"], detail["version"], detail["signature"], {})
        legacy[0].parent.mkdir(parents=True)
        ready = {"status": "ready", "text": "Ранее объяснённая правка."}
        legacy[0].write_text(json.dumps(ready, ensure_ascii=False), encoding="utf-8")
        self.activity._save_intent("skills", rec["id"], {"context": "Назначение пришло позже."}, origins={"background_review"})
        self.assertEqual(self.detail(rec)["explanation"], ready)
        self.assertTrue(current.is_file())
        self.model_mock.assert_not_called()
        self.assertEqual(self.decide(rec, detail, "reject").status_code, 200)
        self.assertFalse(current.exists())
        self.assertFalse(legacy[0].exists())
        self.assertEqual(self.client.get("/activity").json()["recent"][0]["description"], ready["text"])

    def test_rejection_during_generation_cannot_leave_an_explanation_file(self):
        self.skill()
        rec = self.proposal()
        started, finish = threading.Event(), threading.Event()

        def explain(**_):
            started.set()
            finish.wait(5)
            return "Краткое описание проверочной правки."

        self.model_mock.side_effect = explain
        try:
            detail = self.detail(rec)
            self.assertEqual(detail["explanation"]["status"], "pending")
            self.assertTrue(started.wait(5))
            self.assertEqual(self.decide(rec, detail, "reject").status_code, 200)
        finally:
            finish.set()
        deadline = time.monotonic() + 5
        while self.activity._SUMMARY_RUNNING and time.monotonic() < deadline:
            time.sleep(0.01)
        path, _ = self.activity._summary_paths("skills", rec["id"], detail["version"], detail["signature"], {})
        self.assertFalse(self.activity._SUMMARY_RUNNING)
        self.assertFalse(path.exists())

    def test_failed_explanation_does_not_repeat_without_explicit_retry(self):
        self.skill()
        rec = self.proposal()
        self.model_mock.return_value = "длинный ответ " * 100
        detail = self.detail(rec)
        deadline = time.monotonic() + 5
        while detail["explanation"]["status"] == "pending" and time.monotonic() < deadline:
            time.sleep(0.01)
            detail = self.detail(rec)
        self.assertEqual(detail["explanation"]["status"], "error")
        self.detail(rec)
        self.assertEqual(self.model_mock.call_count, 1)
        self.model_mock.return_value = "Уточнить правило и сохранить результат."
        response = self.client.post(f"/activity/skills/{rec['id']}/explanation",
                                    json={key: detail[key] for key in ("scope", "version", "signature")})
        self.assertEqual(response.status_code, 200)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            detail = self.detail(rec)
            if detail["explanation"]["status"] != "pending":
                break
            time.sleep(0.01)
        self.assertEqual(detail["explanation"]["status"], "ready")
        self.assertEqual(self.model_mock.call_count, 2)

    def test_decisions_and_unknown_outcome_are_recorded_in_the_correct_profile(self):
        self.skill()
        rec = self.proposal()
        detail = self.detail(rec)
        deadline = time.monotonic() + 5
        while detail["explanation"]["status"] == "pending" and time.monotonic() < deadline:
            time.sleep(0.01)
            detail = self.detail(rec)
        cached, _ = self.activity._summary_paths("skills", rec["id"], detail["version"], detail["signature"], {})
        self.assertTrue(cached.is_file())
        self.assertEqual(self.decide(rec, detail).status_code, 200)
        self.assertFalse(cached.exists())
        history = self.client.get("/activity").json()
        self.assertTrue(history["history_available"])
        self.assertEqual([item["status"] for item in history["recent"]], ["approved"])
        self.assertEqual(history["recent"][0]["description"], "Изменить правило проверки и сохранить результат.")
        other = self.home / "profiles" / "other"
        other.mkdir(parents=True)
        token = self.set_home(other)
        try:
            self.assertEqual(self.client.get("/activity").json()["recent"], [])
        finally:
            self.reset_home(token)

    def test_missing_review_lock_never_claims_completion(self):
        self.activity._journal_start("review", ["skills"], "", lock_id="0" * 32)
        snapshot = self.client.get("/activity").json()
        self.assertEqual(snapshot["running"], [])
        self.assertEqual(snapshot["recent"][0]["status"], "unknown")

    def test_legacy_journal_uses_partial_indexes_and_keeps_recent_order(self):
        from contextlib import closing
        import sqlite3

        path = self.home / "plugin-data/hermes-codex-visual/activity-history.sqlite3"
        path.parent.mkdir(parents=True)
        with closing(sqlite3.connect(path)) as db, db:
            db.execute("CREATE TABLE events (id TEXT PRIMARY KEY, category TEXT NOT NULL, kinds TEXT NOT NULL, "
                       "name TEXT NOT NULL, status TEXT NOT NULL, started REAL NOT NULL, finished REAL, lock_id TEXT)")
            db.executemany("INSERT INTO events VALUES (?, 'review', '[\"skills\"]', '', 'completed', ?, NULL, NULL)",
                           ((str(i), i // 2) for i in range(400)))
            recent_ids = [row[0] for row in db.execute(
                "SELECT id FROM events WHERE status!='running' ORDER BY started DESC LIMIT 150")]

        snapshot = self.client.get("/activity").json()
        self.assertTrue(snapshot["history_available"])
        self.assertEqual([item["id"] for item in snapshot["recent"]], recent_ids)
        self.assertTrue(all(item["description"] == "" for item in snapshot["recent"]))
        with closing(sqlite3.connect(path)) as db:
            for predicate, name in (("status='running'", "activity_running_by_start"),
                                    ("status!='running'", "activity_recent_by_start")):
                plan = str(db.execute(
                    f"EXPLAIN QUERY PLAN SELECT * FROM events WHERE {predicate} ORDER BY started DESC, rowid LIMIT 150"
                ).fetchall())
                self.assertIn(name, plan)
                self.assertNotIn("TEMP B-TREE", plan)

    def test_history_failure_does_not_hide_the_real_queue(self):
        import sqlite3
        self.proposal()
        with patch.object(self.activity, "_journal_snapshot", side_effect=sqlite3.OperationalError("unavailable")):
            snapshot = self.client.get("/activity").json()
        self.assertFalse(snapshot["history_available"])
        self.assertEqual(len(snapshot["items"]), 1)

    def test_new_review_reason_is_saved_only_for_the_actual_staged_version(self):
        self.skill()
        rec = self.proposal()
        tool_call = {"id": "call-new", "function": {"name": "skill_manage", "arguments": "{}"}}
        messages = [{"role": "assistant", "tool_calls": [tool_call]},
                    {"role": "tool", "tool_call_id": "call-new", "content": json.dumps(
                        {"success": True, "staged": True, "pending_id": rec["id"]})},
                    {"role": "assistant", "content": json.dumps({"activity_explanations": [
                        {"id": rec["id"], "what": "Изменить правило", "why": "Чтобы точнее проверять результаты"}]})}]
        self.activity._capture_review_intents(messages, [])
        _, version, _ = self.activity._record("skills", rec["id"])
        self.assertEqual(self.activity._read_intent("skills", rec["id"], version)["why"], "Чтобы точнее проверять результаты")
        detail = self.detail(rec)
        deadline = time.monotonic() + 5
        while detail["explanation"]["status"] == "pending" and time.monotonic() < deadline:
            time.sleep(0.01)
            detail = self.detail(rec)
        self.assertEqual(detail["explanation"]["status"], "ready")
        self.assertIn("Чтобы точнее проверять результаты", self.model_mock.call_args.kwargs["user_input"])
        rec["summary"] = "replacement"
        (self.home / "pending" / "skills" / (rec["id"] + ".json")).write_text(json.dumps(rec), encoding="utf-8")
        _, changed_version, _ = self.activity._record("skills", rec["id"])
        self.assertEqual(self.activity._read_intent("skills", rec["id"], changed_version), {})

    def test_foreground_reason_requires_a_single_matching_staged_proposal(self):
        from tools import write_approval
        rec = write_approval.stage_write("skills", {"action": "patch", "name": "demo", "old_string": "old", "new_string": "new"},
                                        summary="fixture", origin="foreground")
        history = [{"role": "user", "content": "Проверь"},
                   {"role": "assistant", "tool_calls": [{"id": "call-fg", "function": {"name": "skill_manage"}}]},
                   {"role": "tool", "tool_call_id": "call-fg", "content": json.dumps(
                       {"success": True, "staged": True, "pending_id": rec["id"]})}]
        self.activity.capture_foreground_intent(assistant_response="Уточню правило, чтобы результаты были точнее.",
                                                conversation_history=history)
        _, version, _ = self.activity._record("skills", rec["id"])
        self.assertIn("точнее", self.activity._read_intent("skills", rec["id"], version)["context"])

    def test_observer_carries_new_reason_and_staged_result_from_native_fork(self):
        from types import SimpleNamespace
        from agent import background_review as bg
        self.skill()
        rec = self.proposal()
        messages = [{"role": "assistant", "tool_calls": [{"id": "call-bg", "function": {"name": "skill_manage"}}]},
                    {"role": "tool", "tool_call_id": "call-bg", "content": json.dumps(
                        {"success": True, "staged": True, "pending_id": rec["id"]})},
                    {"role": "assistant", "content": json.dumps({"activity_explanations": [
                        {"id": rec["id"], "what": "Уточнить правило", "why": "Чтобы точнее проверять"}]})}]
        seen, callbacks = {}, []
        def native_worker(agent, messages_snapshot, prompt, task_cfg=None, review_run=None, review_memory=False, explicit=False):
            seen["prompt"] = prompt
        def native_fork(agent, messages_snapshot, prompt, task_cfg, review_run, st, review_memory=False, explicit=False):
            st.review_messages = messages
        with patch.object(bg, "_run_review_in_thread", native_worker), patch.object(bg, "_run_review_fork", native_fork):
            self.activity._install_review_observer(SimpleNamespace(on_unload=callbacks.append))
            try:
                bg._run_review_in_thread(None, [], "Исходное поручение")
                self.assertIn("activity_explanations", seen["prompt"])
                self.assertIn("create and all", seen["prompt"])
                self.assertIn("one skill_manage batch", seen["prompt"])
                self.activity._REVIEW_LOCAL.frame = {}
                bg._run_review_fork(None, [], "prompt", None, None, SimpleNamespace(review_messages=[]))
                self.assertIn("предложение для навыка", self.activity._REVIEW_LOCAL.frame["description"])
                _, version, _ = self.activity._record("skills", rec["id"])
                self.assertEqual(self.activity._read_intent("skills", rec["id"], version)["why"], "Чтобы точнее проверять")
            finally:
                self.activity._REVIEW_LOCAL.frame = None
                callbacks[0]()

    def test_observer_records_a_real_native_review_lifecycle(self):
        from contextvars import copy_context
        from types import SimpleNamespace
        from agent import background_review as bg
        entered, release = threading.Event(), threading.Event()
        callbacks = []
        self.activity._install_review_observer(SimpleNamespace(on_unload=callbacks.append))
        parent = SimpleNamespace(memory_notifications="on")
        def review_fork(agent, messages, prompt, config, run, state, *args):
            entered.set()
            self.assertTrue(release.wait(5))
            state.review_messages = []
        try:
            with patch.object(bg, "_parent_can_emit_tool_calls", return_value=True), \
                 patch.object(bg, "_run_review_fork", side_effect=review_fork), \
                 patch.object(bg, "_set_thread_approval_callback"), \
                 patch.object(bg, "_track_review_fork"), \
                 patch.object(bg, "finish_background_review_run"):
                target, _ = bg.spawn_background_review_thread(parent, [], review_skills=True)
                thread = threading.Thread(target=copy_context().run, args=(target,))
                thread.start()
                self.assertTrue(entered.wait(5))
                active = self.client.get("/activity").json()
                self.assertEqual(len(active["running"]), 1)
                self.assertEqual(active["running"][0]["kinds"], ["skills"])
                release.set()
                thread.join(5)
                self.assertFalse(thread.is_alive())
                done = self.client.get("/activity").json()
                self.assertEqual(done["running"], [])
                self.assertEqual(done["recent"][0]["status"], "completed")
        finally:
            release.set()
            callbacks[0]()

    def test_profile_boundary_and_reject_after_source_changed(self):
        path = self.skill()
        rec = self.proposal()
        detail = self.detail(rec)
        other = self.home / "profiles" / "other"
        other.mkdir(parents=True)
        token = self.set_home(other)
        try:
            self.assertNotEqual(self.client.get("/activity").json()["scope"], detail["scope"])
            self.assertEqual(self.client.get("/activity").json()["items"], [])
            self.assertEqual(self.decide(rec, detail).status_code, 409)
        finally:
            self.reset_home(token)
        path.write_text("changed", encoding="utf-8")
        self.assertEqual(self.decide(rec, detail, "reject").status_code, 200)

    def test_unsupported_and_large_proposal_can_be_rejected(self):
        self.skill()
        rec = self.proposal(payload={"action": "patch", "name": "demo", "old_string": "old", "new_string": "new", "file_path": "../../secret"})
        detail = self.detail(rec)
        self.assertFalse(detail["applicable"])
        self.assertEqual(self.decide(rec, detail).status_code, 422)
        self.assertEqual(self.decide(rec, detail, "reject").status_code, 200)
        rec = self.proposal()
        with patch.object(self.activity, "_MAX_RECORD", 20):
            detail = self.detail(rec)
            self.assertFalse(detail["applicable"])
            self.assertEqual(self.decide(rec, detail, "reject").status_code, 200)

    def test_missing_skill_keeps_complete_proposed_file_visible_without_approval(self):
        rec = self.proposal(payload={"action": "batch", "operations": [
            {"action": "write_file", "name": "not-created", "file_path": "references/guide.md",
             "file_content": "# Reference guide\nFull proposed reference content"},
        ]})
        detail = self.detail(rec)
        self.assertFalse(detail["applicable"])
        self.assertIn("не найден", detail["reason"])
        self.assertEqual(detail["skill_action"], "files")
        self.assertEqual(detail["missing_skill"], "not-created")
        self.assertEqual(detail["proposed_files"], [{"file": "references/guide.md", "heading": "Reference guide",
                                                       "content": "# Reference guide\nFull proposed reference content"}])
        self.assertIn("references/guide.md", detail["preview"])
        self.assertIn("Full proposed reference content", detail["preview"])
        self.assertEqual(self.decide(rec, detail).status_code, 422)
        self.model_mock.assert_not_called()

    def test_separate_create_then_files_can_be_reviewed_and_applied_in_order(self):
        create = self.proposal(payload={"action": "batch", "operations": [
            {"action": "create", "name": "new-review", "content":
             "---\nname: new-review\ndescription: Test new skill\n---\nNew instructions\n"},
        ]})
        files = self.proposal(payload={"action": "batch", "operations": [
            {"action": "write_file", "name": "new-review", "file_path": "references/first.md",
             "file_content": "# First guide\nfirst content"},
            {"action": "write_file", "name": "new-review", "file_path": "references/second.md",
             "file_content": "# Second guide\nsecond content"},
        ]})
        items = {item["id"]: item for item in self.client.get("/activity").json()["items"]}
        self.assertEqual(items[create["id"]]["skill_action"], "create")
        self.assertEqual(items[files["id"]]["skill_action"], "files")
        blocked = self.detail(files)
        self.assertFalse(blocked["applicable"])
        self.assertEqual([f["heading"] for f in blocked["proposed_files"]], ["First guide", "Second guide"])
        self.assertEqual(self.decide(files, blocked).status_code, 422)
        self.assertFalse((self.home / "skills" / "new-review").exists())
        self.assertEqual(self.decide(create, self.detail(create)).status_code, 200)
        updated = self.detail(files)
        self.assertTrue(updated["applicable"], updated)
        self.assertNotIn("missing_skill", updated)
        self.assertEqual(self.decide(files, updated).status_code, 200)
        self.assertEqual((self.home / "skills/new-review/references/first.md").read_text(encoding="utf-8"),
                         "# First guide\nfirst content")
        self.assertEqual((self.home / "skills/new-review/references/second.md").read_text(encoding="utf-8"),
                         "# Second guide\nsecond content")

    def test_single_new_skill_batch_contains_and_applies_complete_files(self):
        rec = self.proposal(payload={"action": "batch", "operations": [
            {"action": "create", "name": "whole-review", "content":
             "---\nname: whole-review\ndescription: Test skill\n---\nInstructions\n"},
            {"action": "write_file", "name": "whole-review", "file_path": "references/guide.md",
             "file_content": "# Guide\nFull reference"},
        ]})
        detail = self.detail(rec)
        self.assertEqual(detail["skill_action"], "create")
        self.assertTrue(detail["applicable"], detail)
        self.assertIn("Full reference", detail["preview"])
        self.assertEqual(self.decide(rec, detail).status_code, 200)
        self.assertEqual((self.home / "skills/whole-review/references/guide.md").read_text(encoding="utf-8"),
                         "# Guide\nFull reference")

    def test_missing_mixed_operations_do_not_claim_files_are_the_full_proposal(self):
        rec = self.proposal(payload={"action": "batch", "operations": [
            {"action": "write_file", "name": "not-created", "file_path": "references/guide.md", "file_content": "new"},
            {"action": "patch", "name": "not-created", "old_string": "old", "new_string": "new"},
        ]})
        detail = self.detail(rec)
        self.assertFalse(detail["applicable"])
        self.assertEqual(detail["proposed_files"], [])
        self.assertIn('"old_string": "old"', detail["preview"])

    def test_removed_files_and_skill_delete_show_full_text(self):
        skill = self.skill().parent
        (skill / "references").mkdir()
        (skill / "references" / "notes.md").write_text("all deleted content", encoding="utf-8")
        rec = self.proposal(payload={"action": "remove_file", "name": "demo", "file_path": "references/notes.md"})
        self.assertIn("all deleted content", self.detail(rec)["preview"])
        rec = self.proposal(payload={"action": "delete", "name": "demo"})
        detail = self.detail(rec)
        self.assertTrue(detail["applicable"], detail)
        self.assertIn("all deleted content", detail["preview"])
        self.assertIn("description: Test skill", detail["preview"])


    def test_repeated_unchanged_lines_never_reach_the_explanation(self):
        private = "НЕИЗМЕНЁННАЯ ЛИЧНАЯ СТРОКА"
        before = "\n".join(["старое начало"] + [private] * 300 + ["старый конец"])
        after = "\n".join(["новое начало"] + [private] * 300 + ["новый конец"])
        change = self.activity._change("demo", "SKILL.md", "patch", before, after)
        self.assertNotIn(private, json.dumps(change["fragments"], ensure_ascii=False))
        self.assertEqual(change["fragments"], [
            {"before": "старое начало", "after": "новое начало"},
            {"before": "старый конец", "after": "новый конец"},
        ])

    def test_summary_request_excludes_unchanged_repeated_lines(self):
        path = self.skill()
        private = "НЕИЗМЕНЁННАЯ ЛИЧНАЯ СТРОКА"
        before = "\n".join(["---", "name: demo", "description: Test skill", "---", "старое начало"]
                           + [private] * 300 + ["старый конец", ""])
        after = before.replace("старое начало", "новое начало").replace("старый конец", "новый конец")
        path.write_text(before, encoding="utf-8")
        rec = self.proposal(payload={"action": "patch", "name": "demo", "content": after})
        detail = self.detail(rec)
        deadline = time.monotonic() + 5
        while detail["explanation"]["status"] == "pending" and time.monotonic() < deadline:
            time.sleep(0.01)
            detail = self.detail(rec)
        self.assertEqual(detail["explanation"]["status"], "ready")
        prompt = self.model_mock.call_args.kwargs["user_input"]
        self.assertNotIn(private, prompt)
        self.assertIn("старое начало", prompt)
        self.assertIn("новый конец", prompt)

    def test_expensive_comparison_uses_full_text_without_model_call(self):
        with patch.object(self.activity, "_MAX_DIFF_MATCHES", 4):
            before = "\n".join(["old"] + ["same"] * 5 + ["old end"])
            after = "\n".join(["new"] + ["same"] * 5 + ["new end"])
            change = self.activity._change("demo", "SKILL.md", "patch", before, after)
        self.assertIs(change["fragments_unavailable"], True)
        self.assertEqual(change["fragments"], [])
        self.assertEqual((change["before"], change["after"]), (before, after))
        explanation = self.activity._explanation({"changes": [change], "applicable": True})
        self.assertEqual(explanation["status"], "unavailable")
        self.model_mock.assert_not_called()

    def test_full_rewrite_patch_is_marked_for_warning(self):
        self.skill()
        rec = self.proposal(payload={"action": "patch", "name": "demo",
                                     "content": "---\nname: demo\ndescription: New\n---\nnew text\n"})
        detail = self.detail(rec)
        self.assertTrue(detail["applicable"], detail)
        self.assertEqual(detail["changes"][0]["action"], "patch")
        self.assertIs(detail["changes"][0]["full_replacement"], True)
        deadline = time.monotonic() + 5
        while detail["explanation"]["status"] == "pending" and time.monotonic() < deadline:
            time.sleep(0.01)
            detail = self.detail(rec)
        self.assertEqual(detail["explanation"]["status"], "ready")
        prompt = json.loads(self.model_mock.call_args.kwargs["user_input"])
        self.assertIs(prompt["изменения"][0]["полная_замена"], True)

    def test_batch_patch_uses_the_file_created_by_the_previous_operation(self):
        skill = self.skill().parent
        operations = [
            {"action": "write_file", "name": "demo", "file_path": "references/new.md", "file_content": "first text"},
            {"action": "patch", "name": "demo", "file_path": "references/new.md", "old_string": "first", "new_string": "second"},
        ]
        rec = self.proposal(payload={"action": "batch", "operations": operations})
        detail = self.detail(rec)
        self.assertTrue(detail["applicable"], detail)
        self.assertIsNone(detail["changes"][0]["before"])
        self.assertEqual(detail["changes"][1]["before"], "first text")
        self.assertEqual(detail["changes"][1]["after"], "second text")
        self.assertEqual(detail["changes"][1]["fragments"], [{"before": "first text", "after": "second text"}])
        response = self.decide(rec, detail)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual((skill / "references/new.md").read_text(encoding="utf-8"), "second text")


if __name__ == "__main__":
    unittest.main(verbosity=2)

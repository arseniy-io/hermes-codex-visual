"""Exercise the staged Hermes guard and file tools without the working profile."""

import contextlib
import hashlib
import json
import unittest
from unittest.mock import patch

from tools import approval, approval_context, approval_gateway_wait
from tools import file_tools as ft, file_tools_write_guards as guards
from tools.file_operations_common import ReadResult, WriteResult
from tools.patch_parser import apply_v4a_operations, parse_v4a_patch


class Files:
    cwd = "/workspace"

    def __init__(self):
        self.data = {"AGENTS.md": "old rules\n", "notes.md": "old note\n"}

    def read_file_raw(self, path):
        if path not in self.data:
            return ReadResult(error="missing", not_found=True)
        text = self.data[path]
        return ReadResult(content=text, _content_sha256=hashlib.sha256(text.encode()).hexdigest())

    def write_file(self, path, content, pre_content=None):
        self.data[path] = content
        return WriteResult(_content_sha256=hashlib.sha256(content.encode()).hexdigest())

    def delete_file(self, path):
        del self.data[path]
        return WriteResult()

    def move_file(self, source, target):
        self.data[target] = self.data.pop(source)
        return WriteResult()

    def patch_v4a(self, patch_text):
        operations, error = parse_v4a_patch(patch_text)
        assert error is None
        return apply_v4a_operations(operations, self)


class GuardTests(unittest.TestCase):
    def setUp(self):
        self.files = Files()
        self.calls = []
        self.choice = "once"
        self.change_during_prompt = False
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(ft, "_get_file_ops", return_value=self.files))
        self.stack.enter_context(patch.object(ft, "_resolve_or_none", side_effect=lambda path, task_id, **kw: path))
        self.stack.enter_context(patch.object(ft.file_state, "lock_path", side_effect=lambda path: contextlib.nullcontext()))
        for name in ("_check_sensitive_path", "_check_binary_document_write", "_check_cross_profile_path",
                     "_check_approval_required_write", "_stale_overwrite_blocker", "_whole_file_rewrite_hint"):
            self.stack.enter_context(patch.object(ft, name, return_value=None))
        for name in ("_note_edited", "_mark_full_write_baseline", "_carry_full_write_baselines", "_reset_patch_failures"):
            self.stack.enter_context(patch.object(ft, name))
        self.stack.enter_context(patch.object(ft, "_edit_warnings", return_value=[]))
        self.stack.enter_context(patch.object(ft, "_known_full_content_sha256", return_value={}))
        self.stack.enter_context(patch.object(ft, "_rewrite_v4a_patch_paths_for_host", side_effect=lambda patch, *a: patch))
        self.stack.enter_context(patch.object(guards, "_protected_instruction_config", return_value=(True, [])))
        self.stack.enter_context(patch.object(guards, "_protected_instruction_reason",
            side_effect=lambda path, *a, **kw: "AGENTS.md" if path == "AGENTS.md" else None))
        self.stack.enter_context(patch.object(approval_context, "get_current_session_key", return_value="test-session"))
        self.stack.enter_context(patch.object(approval_context, "is_local_interactive_session", return_value=True))
        self.stack.enter_context(patch.object(approval_context, "is_viewer_turn_with_approver", return_value=True))
        self.stack.enter_context(patch.dict(approval._gateway_notify_cbs, {"test-session": lambda data: None}))
        self.stack.enter_context(patch.object(approval_gateway_wait, "_await_gateway_decision", side_effect=self.decide))

    def decide(self, session, notify, data, **kwargs):
        self.calls.append(data)
        if self.change_during_prompt:
            self.files.data["notes.md"] = "other process changed the file\n"
        return {"resolved": True, "choice": self.choice}

    def call_patch(self, reason="Keep the two instructions in sync"):
        text = """*** Begin Patch
*** Update File: AGENTS.md
@@
-old rules
+new rules
*** Update File: notes.md
@@
-old note
+new note
*** End Patch"""
        return json.loads(ft.patch_tool(mode="patch", patch=text, approval_reason=reason))

    def test_approval_shows_all_files_before_one_operation(self):
        result = self.call_patch()
        self.assertFalse(result.get("error"), result)
        self.assertEqual(len(self.calls), 1)
        review = self.calls[0]["hcv_review"]
        self.assertEqual(review["reason"], "Keep the two instructions in sync")
        self.assertEqual({item["path"] for item in review["files"]}, {"AGENTS.md", "notes.md"})
        self.assertIn("+new note", next(item["diff"] for item in review["files"] if item["path"] == "notes.md"))
        self.assertEqual(self.files.data, {"AGENTS.md": "new rules\n", "notes.md": "new note\n"})

    def test_reject_never_writes_either_file(self):
        self.choice = "deny"
        result = self.call_patch()
        self.assertIn("BLOCKED", result["error"])
        self.assertEqual(self.files.data, {"AGENTS.md": "old rules\n", "notes.md": "old note\n"})

    def test_changed_file_rejects_the_old_approval(self):
        self.change_during_prompt = True
        result = self.call_patch()
        self.assertIn("changed after the approval preview", result["error"])
        self.assertEqual(self.files.data["AGENTS.md"], "old rules\n")
        self.assertEqual(self.files.data["notes.md"], "other process changed the file\n")

    def test_missing_reason_stops_before_prompt(self):
        result = self.call_patch(reason=None)
        self.assertIn("approval_reason", result["error"])
        self.assertEqual(self.calls, [])
        self.assertEqual(self.files.data["AGENTS.md"], "old rules\n")


if __name__ == "__main__":
    unittest.main()

"""Exercise real Hermes patch parsing against an isolated in-memory backend."""

import hashlib
import importlib.util
import pathlib
import unittest
from unittest.mock import patch

from tools.file_operations_common import ReadResult

MODULE = pathlib.Path(__file__).resolve().parents[1] / "source" / "hermes-approval" / "preview.py"
spec = importlib.util.spec_from_file_location("hcv_approval_preview", MODULE)
preview = importlib.util.module_from_spec(spec)
import sys
sys.modules[spec.name] = preview
spec.loader.exec_module(preview)


class Source:
    cwd = "/workspace"

    def __init__(self, files):
        self.files = dict(files)

    def read_file_raw(self, path):
        if path not in self.files:
            return ReadResult(error="missing", not_found=True)
        text = self.files[path]
        return ReadResult(content=text, _content_sha256=hashlib.sha256(text.encode()).hexdigest())


class ApprovalPreviewTests(unittest.TestCase):
    def test_multifile_patch_shows_every_file_and_the_reason(self):
        source = Source({f"file{i}.md": f"old {i}\n" for i in range(8)})
        patch = "*** Begin Patch\n" + "".join(
            f"*** Update File: file{i}.md\n@@\n-old {i}\n+new {i}\n" for i in range(8)
        ) + "*** End Patch"
        review, originals = preview.make_review(source, mode="patch", patch=patch, reason="Обновить правила")
        self.assertEqual(review["reason"], "Обновить правила")
        self.assertEqual(len(review["files"]), 8)
        self.assertEqual({f["path"] for f in review["files"]}, set(source.files))
        for i, item in enumerate(review["files"]):
            self.assertIn(f"-old {i}", item["diff"])
            self.assertIn(f"+new {i}", item["diff"])
        self.assertTrue(preview.snapshots_match(source, originals))
        self.assertEqual(source.files["file0.md"], "old 0\n")
        source.files["file3.md"] = "someone else edited this\n"
        self.assertFalse(preview.snapshots_match(source, originals))

    def test_create_delete_and_move_all_show_both_endpoints(self):
        source = Source({"AGENTS.md": "rules\n", "old.txt": "move me\n", "delete.txt": "gone\n"})
        patch = """*** Begin Patch
*** Update File: AGENTS.md
@@
-rules
+new rules
*** Move File: old.txt -> new.txt
*** Delete File: delete.txt
*** Add File: created.txt
+hello
*** End Patch"""
        review, originals = preview.make_review(source, mode="patch", patch=patch, reason="Keep the files consistent")
        ops = {item["path"]: item["operation"] for item in review["files"]}
        self.assertEqual(ops, {"AGENTS.md": "edit", "old.txt": "delete", "new.txt": "create",
                               "delete.txt": "delete", "created.txt": "create"})
        source.files["new.txt"] = "another process created this"
        self.assertFalse(preview.snapshots_match(source, originals))

    def test_replace_and_full_write_use_current_contents(self):
        source = Source({"AGENTS.md": "line one\r\nline two\r\n"})
        review, originals = preview.make_review(source, mode="replace", path="AGENTS.md",
            old_string="line two", new_string="new line", reason="Fix the instruction")
        self.assertIn("-line two", review["files"][0]["diff"])
        self.assertIn("+new line", review["files"][0]["diff"])
        self.assertTrue(preview.snapshots_match(source, originals))
        review, _ = preview.make_review(source, mode="write", path="AGENTS.md",
            content="replacement\n", reason="Replace the outdated instructions")
        self.assertIn("+replacement", review["files"][0]["diff"])

    def test_no_reason_or_secret_is_not_presented_as_a_complete_review(self):
        source = Source({"AGENTS.md": "before\n"})
        with self.assertRaises(preview.ReviewUnavailable):
            preview.make_review(source, mode="write", path="AGENTS.md", content="after\n")
        with self.assertRaises(preview.ReviewUnavailable):
            preview.make_review(source, mode="write", path="AGENTS.md",
                content="api_key=sk-abcdefghijklmnopqrstuv123456\n", reason="Update")

    def test_oversized_changes_and_too_many_files_are_not_shown_as_complete(self):
        source = Source({"AGENTS.md": "before\n"})
        with patch.object(preview, "MAX_REVIEW_CHARS", 32):
            with self.assertRaises(preview.ReviewUnavailable):
                preview.make_review(source, mode="write", path="AGENTS.md",
                    content="a" * 64, reason="Update")
        many_files = "*** Begin Patch\n" + "".join(
            f"*** Add File: file{i}.md\n+new {i}\n" for i in range(3)
        ) + "*** End Patch"
        with patch.object(preview, "MAX_FILES", 2):
            with self.assertRaises(preview.ReviewUnavailable):
                preview.make_review(Source({}), mode="patch", patch=many_files, reason="Update")

    def test_failed_or_changed_source_never_passes_recheck(self):
        source = Source({"AGENTS.md": "before\n"})
        _, originals = preview.make_review(source, mode="write", path="AGENTS.md", content="after\n", reason="Update")
        del source.files["AGENTS.md"]
        self.assertFalse(preview.snapshots_match(source, originals))
        with self.assertRaises(preview.ReviewUnavailable):
            preview.make_review(source, mode="replace", path="AGENTS.md", old_string="a", new_string="b", reason="Update")


if __name__ == "__main__":
    unittest.main()

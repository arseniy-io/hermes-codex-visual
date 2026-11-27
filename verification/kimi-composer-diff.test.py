"""Regression coverage for proved edits and native per-turn snapshots."""
from hashlib import sha256
import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest

TARGET = Path(__file__).resolve().parents[1] / "source/hermes-timeline/file_capture.py"
SPEC = importlib.util.spec_from_file_location("hcv_file_changes_test", TARGET)
capture = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(capture)


def digest(data):
    return sha256(data).hexdigest()


class NativeChangesTest(unittest.TestCase):
    def setUp(self):
        self.folder = TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.a = str(Path(self.folder.name) / "a.txt")
        self.b = str(Path(self.folder.name) / "b.txt")
        self.events = []
        self.agent = SimpleNamespace(session_id="owner", _current_turn_id="one",
            tool_progress_callback=lambda event, *args, **kw: self.events.append((event, kw["hcv_diff"])))

    def report(self, edits, name="patch"):
        result = capture.decorate_result('{"success":true}', edits=edits)
        self.assertEqual(str(result), '{"success":true}')
        capture.report_turn_diff(self.agent, name, result)

    def diff(self):
        event, packet = self.events[-1]
        self.assertEqual(event, "hcv.turn_diff")
        self.assertTrue(capture.valid_turn_diff(packet))
        return packet["diff"]

    def test_capture_write_keeps_original_saved_contract(self):
        Path(self.a).write_bytes(b"new\r\n")
        saved, edits = capture.capture_write({"path": self.a, "before": b"old\r\n", "cwd": self.folder.name},
            SimpleNamespace(verified=True, _content_sha256=digest(b"new\r\n")))
        self.assertIn("-old\r\n+new\r\n", saved["diff"])
        self.assertEqual(saved["files"][0]["beforeSha256"], digest(b"old\r\n"))
        self.assertEqual(edits, ((self.a, b"old\r\n", b"new\r\n"),))
        metadata = {"existing": True}
        message = {"display_metadata": metadata}
        capture.attach(message, capture.decorate_result("model", saved, edits))
        self.assertEqual(message["display_metadata"], {**metadata, "hcv_file_changes": saved})

    def test_verified_multi_file_patch_and_wrong_hash(self):
        Path(self.a).write_bytes(b"replacement\n")
        before = {self.a: b"starting\n", self.b: b"removed\n"}
        good = SimpleNamespace(_writes=[(self.a, digest(b"starting\n"), digest(b"replacement\n"))],
                               files_deleted=[self.b])
        edits = capture.capture_patch(before, good)
        self.assertEqual(edits, ((self.a, b"starting\n", b"replacement\n"), (self.b, b"removed\n", None)))
        self.report(edits)
        self.assertEqual(self.diff().count("diff --git "), 2)
        self.assertIn("\n+++ /dev/null\n", self.diff())
        bad = SimpleNamespace(_writes=[(self.a, digest(b"foreign\n"), digest(b"replacement\n"))], files_deleted=[self.b])
        self.assertIsNone(capture.capture_patch(before, bad))

    def test_compares_first_and_latest_bytes_of_each_file(self):
        self.report(((self.a, b"old\n", b"first\nextra\n"),))
        self.report(((self.a, b"first\nextra\n", b"latest\n"),))
        self.report(((self.b, None, b"created\n"),), name="write_file")
        self.assertEqual(self.diff().count("diff --git "), 2)
        self.assertIn("-old\n+latest\n", self.diff())
        self.assertNotIn("first", self.diff())
        self.report(((self.a, b"latest\n", b"old\n"), (self.b, b"created\n", None)))
        self.assertEqual(self.diff(), "")
        self.assertEqual([packet["revision"] for _, packet in self.events], [1, 2, 3, 4])

    def test_no_op_and_read_only_keep_the_current_snapshot(self):
        self.report(())
        self.assertEqual(self.events, [])
        self.report(((self.a, b"old\n", b"new\n"),))
        expected = self.diff()
        self.report(())
        self.report(None, name="terminal")
        self.assertEqual(len(self.events), 1)
        self.assertEqual(self.diff(), expected)

    def test_unproven_or_concurrent_change_hides_until_new_turn(self):
        self.report(((self.a, b"one\n", b"two\n"),))
        self.report(((self.a, b"other-owner\n", b"three\n"),))
        self.assertEqual(self.diff(), "")
        self.report(((self.b, None, b"another\n"),))
        self.assertEqual(len(self.events), 2)
        self.agent._current_turn_id = "two"
        self.report(((self.a, b"three\n", b"four\n"),))
        self.assertIn("-three\n+four\n", self.diff())
        self.assertEqual(self.events[-1][1]["revision"], 1)

    def test_codex_runtime_does_not_publish_a_second_source(self):
        self.agent.api_mode = "codex_app_server"
        self.report(((self.a, b"one\n", b"two\n"),))
        self.assertEqual(self.events, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)

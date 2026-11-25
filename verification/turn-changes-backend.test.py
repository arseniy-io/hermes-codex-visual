from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import os
import sys
import types
import ast
from contextlib import ExitStack, contextmanager
sys._hermes_relaunched = True
# Database classification imports conversation_loop's pure carrier constants.
# Keep that import from bootstrapping/relaunching a whole CLI for a DB test.
bootstrap = types.ModuleType('hermes_bootstrap')
def no_network(*args, **kwargs):
    raise AssertionError('Network is forbidden in synthetic DB verification')
bootstrap._happy_eyeballs_create_connection = no_network
sys.modules.setdefault('hermes_bootstrap', bootstrap)
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("hcv_turn_changes", Path(__file__).resolve().parents[1] / "source/usage-backend/turn_changes.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
sys.path.insert(0, str(Path(os.environ["LOCALAPPDATA"]) / "hermes/hermes-agent"))


class TurnChangesTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix="hcv-synthetic-")
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name).resolve()
        self.repo = self.root / "repo"
        self.repo.mkdir()
        subprocess.run(["git", "init", "-q", str(self.repo)], check=True)
        self.home = self.root / "profile"
        self.home.mkdir()
        self.home_patch = patch.object(mod, "_home", return_value=self.home)
        self.home_patch.start()
        self.addCleanup(self.home_patch.stop)

    def batch(self, old, new, path="one.txt"):
        import difflib
        text = "".join(difflib.unified_diff(old.splitlines(True), new.splitlines(True),
                                            fromfile="a/" + path, tofile="b/" + path))
        result = mod.normalized_batch(text, str(self.repo))
        result.update(sourceRowId=path + old + new, savedPatch=text)
        return result

    def snapshot(self, batches):
        self.turn = {"id": "user-row-1", "batches": batches}
        self.read_patch = patch.object(mod, "_read_turns", return_value=[self.turn])
        self.read_patch.start()
        self.addCleanup(self.read_patch.stop)
        return mod.turn_changes("child", "parent")["turns"][0]

    def body(self, snapshot, action="undo"):
        return {**{key: snapshot[key] for key in ("scope", "snapshotId", "revision")},
                "sessionId": "child", "parentId": "parent", "action": action}

    def test_two_edits_same_path_reverse_in_order_and_reapply(self):
        first = self.batch("before\n", "middle\n")
        second = self.batch("middle\n", "after\n")
        (self.repo / "one.txt").write_bytes(b"after\n")
        snap = self.snapshot([first, second])
        self.assertEqual([{k:f[k] for k in ("path","added","removed")} for f in snap["files"]], [{"path": "one.txt", "added": 2, "removed": 2}])
        self.assertEqual(snap["files"][0]["unifiedDiff"], first["savedPatch"] + second["savedPatch"])
        result = mod.apply_turn_changes(self.body(snap))
        self.assertEqual(result["status"], "success")
        self.assertEqual((self.repo / "one.txt").read_text(), "before\n")
        with self.assertRaises(mod.HTTPException) as exc:
            mod.apply_turn_changes(self.body(snap))
        self.assertEqual(exc.exception.status_code, 409)
        refreshed = mod.turn_changes("child", "parent")["turns"][0]
        self.assertEqual(refreshed["nextAction"], "reapply")
        self.assertEqual(mod.apply_turn_changes(self.body(refreshed, "reapply"))["status"], "success")
        self.assertEqual((self.repo / "one.txt").read_text(), "after\n")

    def test_conflict_does_not_change_user_edit(self):
        batch = self.batch("before\n", "after\n")
        (self.repo / "one.txt").write_bytes(b"hand edit\n")
        snap = self.snapshot([batch])
        outcome = mod.apply_turn_changes(self.body(snap))
        self.assertEqual(outcome["status"], "failed")
        self.assertEqual(outcome["errorCode"], "conflict")
        self.assertEqual((self.repo / "one.txt").read_text(), "hand edit\n")

    def test_multifile_first_touched_order_and_counts(self):
        one = self.batch("old\n", "new\n", "z.txt")
        two = self.batch("first\n", "second\n", "a.txt")
        combined = mod.normalized_batch(one["patch"] + two["patch"], str(self.repo))
        combined.update(sourceRowId="tool-result", savedPatch=one["patch"] + two["patch"])
        (self.repo / "z.txt").write_bytes(b"new\n")
        (self.repo / "a.txt").write_bytes(b"second\n")
        snap = self.snapshot([combined])
        self.assertEqual([f["path"] for f in snap["files"]], ["z.txt", "a.txt"])
        self.assertEqual(mod.apply_turn_changes(self.body(snap))["status"], "success")
        self.assertEqual((self.repo / "z.txt").read_text(), "old\n")
        self.assertEqual((self.repo / "a.txt").read_text(), "first\n")

    def test_scope_snapshot_and_revision_bound(self):
        batch = self.batch("before\n", "after\n")
        (self.repo / "one.txt").write_bytes(b"after\n")
        snap = self.snapshot([batch])
        for field, value in [("scope", "foreign"), ("snapshotId", "foreign"), ("revision", 12)]:
            body = self.body(snap)
            body[field] = value
            with self.assertRaises(mod.HTTPException) as exc:
                mod.apply_turn_changes(body)
            self.assertEqual(exc.exception.status_code, 409)
        self.assertEqual((self.repo / "one.txt").read_text(), "after\n")

    def test_partial_fences_following_duplicate(self):
        old = self.batch("first\n", "middle\n")
        new = self.batch("middle\n", "after\n")
        broken = self.batch("original\n", "changed\n", "two.txt")
        (self.repo / "one.txt").write_bytes(b"after\n")
        (self.repo / "two.txt").write_bytes(b"manual\n")
        snap = self.snapshot([old, broken, new])
        result = mod.apply_turn_changes(self.body(snap))
        self.assertEqual(result["status"], "partial")
        self.assertEqual((self.repo / "one.txt").read_text(), "middle\n")
        fresh = mod.turn_changes("child", "parent")["turns"][0]
        self.assertEqual(fresh["status"], "partial")
        with self.assertRaises(mod.HTTPException):
            mod.apply_turn_changes(self.body(fresh))
        self.assertEqual((self.repo / "one.txt").read_text(), "middle\n")

    def test_reapply_survives_compression_and_migrates_legacy_state(self):
        from hermes_state import SessionDB
        batch = self.batch("before\n", "after\n")
        captured = {"version": 1, "cwd": str(self.repo), "cwdBackend": "local", "diff": batch["savedPatch"]}
        target = self.repo / "one.txt"
        target.write_bytes(b"after\n")
        with SessionDB(self.home / "state.db") as db:
            db.create_session("start", "cli", profile_name="default", cwd=str(self.repo))
            db.end_session("start", "compression")
            db.create_session("tip1", "cli", profile_name="default", parent_session_id="start", cwd=str(self.repo))
            db.append_message("tip1", "user", "Edit fixture", message_uid="fixture-prompt")
            db.append_message("tip1", "tool", '{"verified":true}', tool_name="write_file",
                display_metadata={"hcv_file_changes": captured})
            db.append_message("tip1", "assistant", "Fixture edited")

        # Simulate an Undo recorded by a version that used the requested tip id.
        turn = mod._read_turns("tip1", "tip1")[0]
        legacy = {k: v for k, v in turn.items() if k != "owners"}
        with patch.object(mod, "_read_turns", return_value=[legacy]):
            initial = mod.turn_changes("tip1", "tip1")["turns"][0]
            action = {**self.body(initial), "sessionId": "tip1", "parentId": "tip1"}
            self.assertEqual(mod.apply_turn_changes(action)["status"], "success")
        self.assertEqual(target.read_bytes(), b"before\n")

        with SessionDB(self.home / "state.db") as db:
            db.end_session("tip1", "compression")
            db.create_session("tip2", "cli", profile_name="default", parent_session_id="tip1", cwd=str(self.repo))
            db.append_message("tip2", "user", "Follow up")
            self.assertEqual(db.resolve_resume_session_id("start"), "tip2")

        current = mod.turn_changes("tip2", "tip2")["turns"][0]
        self.assertEqual(current["nextAction"], "reapply")
        self.assertEqual(current["revision"], 1)
        self.assertEqual(mod.turn_changes("tip1", "tip1")["turns"][0]["snapshotId"], current["snapshotId"])
        action = {**self.body(current, "reapply"), "sessionId": "tip2", "parentId": "tip2"}
        self.assertEqual(mod.apply_turn_changes(action)["status"], "success")
        self.assertEqual(target.read_bytes(), b"after\n")
        from contextlib import closing
        import sqlite3
        with closing(sqlite3.connect(mod._state_file())) as db:
            self.assertEqual(db.execute("SELECT id,revision FROM patch_state").fetchall(),
                             [(current["snapshotId"], 2)])

    def test_paths_no_parent_git_or_links(self):
        patch_text = "--- a/../outside.txt\n+++ b/../outside.txt\n@@ -1 +1 @@\n-before\n+after\n"
        with self.assertRaises(ValueError):
            mod.normalized_batch(patch_text, str(self.repo))
        patch_text = "--- a/one.txt\n+++ b/one.txt\n@@ -1 +1 @@\n-before\n+after\n"
        self.assertIsNone(mod.normalized_batch(patch_text, None)["patch"])

    def test_hunk_file_content_not_interpreted_as_header(self):
        text = "--- a/one.txt\n+++ b/one.txt\n@@ -1 +1 @@\n---- a/not-a-file\n++++ b/not-a-file\n"
        files = mod.patch_files(text)
        self.assertEqual(len(files), 1)
        self.assertEqual((files[0]["added"], files[0]["removed"]), (1, 1))

    def test_real_native_db_saved_patch_parent_proof_and_display_sidecar(self):
        from hermes_state import SessionDB
        batch = self.batch("before\n", "after\n")
        captured = {"version": 1, "cwd": str(self.repo), "cwdBackend": "local", "diff": batch["savedPatch"]}
        with SessionDB(self.home / "state.db") as db:
            db.create_session("parent", "cli", profile_name="default", cwd=str(self.repo))
            db.create_session("child", "cli", parent_session_id="parent", profile_name="default", cwd=str(self.repo))
            db.create_session("foreign", "cli", profile_name="default", cwd=str(self.repo))
            db.append_message("child", "user", "Edit fixture", message_uid="fixture-prompt-uid")
            db.append_message("child", "assistant", None,
                tool_calls=[{"id": "repeat-provider-id", "function": {"name": "write_file", "arguments": json.dumps({"path": "one.txt", "content": "after\n"})}}])
            db.append_message("child", "tool", json.dumps({"bytes_written": 6, "verified": True}),
                tool_name="write_file", tool_call_id="repeat-provider-id",
                display_metadata={"hcv_file_changes": captured})
            db.append_message("child", "assistant", "Fixture edited")
        (self.repo / "one.txt").write_bytes(b"after\n")
        result = mod.turn_changes("child", "parent")
        self.assertEqual(len(result["turns"]), 1)
        snapshot = result["turns"][0]
        self.assertEqual(snapshot["turnId"], "fixture-prompt-uid")
        self.assertTrue(snapshot["canApply"])
        self.assertEqual([{k:f[k] for k in ("path","added","removed")} for f in snapshot["files"]], [{"path": "one.txt", "added": 1, "removed": 1}])
        self.assertIn("-before\n+after\n", snapshot["files"][0]["unifiedDiff"])
        with self.assertRaises(mod.HTTPException) as error:
            mod.turn_changes("child", "foreign")
        self.assertEqual(error.exception.status_code, 404)
        self.assertEqual(mod.apply_turn_changes(self.body(snapshot))["status"], "success")
        self.assertEqual((self.repo / "one.txt").read_text(), "before\n")


class FileCaptureTest(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location("capture", Path(__file__).resolve().parents[1] / "source/hermes-timeline/file_capture.py")
        self.capture = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.capture)
        temp = tempfile.TemporaryDirectory(prefix="hcv-capture-")
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name).resolve()
        self.repo = self.root / "repo"
        self.repo.mkdir()
        subprocess.run(["git", "init", "-q", str(self.repo)], check=True)
        self.target = self.repo / "fixture.txt"

    def after(self, before, content):
        from types import SimpleNamespace
        import hashlib
        self.target.write_bytes(content)
        result = SimpleNamespace(error=None, verified=True, _content_sha256=hashlib.sha256(content).hexdigest())
        return self.capture.capture_after({"path": str(self.target), "before": before, "cwd": str(self.repo)}, result)

    def test_new_file_capture_reverse_removes_file_and_reapply_recreates(self):
        snapshot = self.after(None, b"fixture without final newline")
        self.assertEqual(snapshot["files"][0]["operation"], "add")
        self.assertIn("\\ No newline at end of file", snapshot["diff"])
        batch = mod.normalized_batch(snapshot["diff"], str(self.repo))
        for action in ("--reverse", None):
            args = ["apply", "--check", "-p1"] + ([action] if action else [])
            result = mod._git(self.repo, *args, input=batch["patch"])
            self.assertEqual(result.returncode, 0, result.stderr)
            args.remove("--check")
            self.assertEqual(mod._git(self.repo, *args, input=batch["patch"]).returncode, 0)
            self.assertEqual(self.target.exists(), action is None)
        self.assertEqual(self.target.read_bytes(), b"fixture without final newline")

    def test_bom_crlf_saved_bytes_restore_exactly(self):
        before, after = b"\xef\xbb\xbfbefore\r\n", b"\xef\xbb\xbfafter\r\n"
        snapshot = self.after(before, after)
        batch = mod.normalized_batch(snapshot["diff"], str(self.repo))
        result = mod._git(self.repo, "apply", "--reverse", "-p1", input=batch["patch"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.target.read_bytes(), before)

    def test_git_lines_keep_non_lf_separators_inside_file_content(self):
        for separator in (b"\x0b", b"\x0c", b"\r", "\u2028".encode()):
            with self.subTest(separator=separator):
                before, after = b"first" + separator + b"before\n", b"first" + separator + b"after\n"
                snapshot = self.after(before, after)
                batch = mod.normalized_batch(snapshot["diff"], str(self.repo))
                result = mod._git(self.repo, "apply", "--reverse", "-p1", input=batch["patch"])
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(self.target.read_bytes(), before)
                result = mod._git(self.repo, "apply", "-p1", input=batch["patch"])
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(self.target.read_bytes(), after)

    def test_snapshot_is_private_string_attribute_and_native_metadata(self):
        snapshot = self.after(b"before\n", b"after\n")
        raw = '{"bytes_written":6,"verified":true}'
        decorated = self.capture.decorate_result(raw, snapshot)
        self.assertIsInstance(decorated, str)
        self.assertEqual(str(decorated), raw)
        self.assertEqual(json.dumps(decorated), json.dumps(raw))
        message = {"content": decorated, "display_metadata": {"hcv_tool_display": {"keep": "unchanged"}}}
        self.capture.attach(message, decorated)
        self.assertEqual(message["display_metadata"]["hcv_file_changes"], snapshot)
        self.assertEqual(message["display_metadata"]["hcv_tool_display"], {"keep": "unchanged"})
        self.assertEqual(json.loads(message["content"]), json.loads(raw))

    def test_failed_unverified_or_oversized_capture_unavailable(self):
        from types import SimpleNamespace
        self.target.write_bytes(b"after\n")
        before = {"path": str(self.target), "before": b"before\n", "cwd": str(self.repo)}
        self.assertIsNone(self.capture.capture_after(before, SimpleNamespace(error="failure", verified=True)))
        self.assertIsNone(self.capture.capture_after(before, SimpleNamespace(error=None, verified=False)))
        self.assertIsNone(self.capture.capture_after(before, SimpleNamespace(error=None, verified=True, _content_sha256="wrong")))

    def test_real_write_function_candidate_preserves_json_and_captures_under_the_write_lock(self):
        import hashlib
        import threading
        from types import SimpleNamespace
        lock = threading.RLock()
        positions = []
        @contextmanager
        def lock_path(_path):
            with lock:
                positions.append('enter')
                try:
                    yield
                finally:
                    positions.append('exit')
        class Ops:
            env = None
            def write_file(inner, path, content):
                positions.append('write')
                self.assertEqual(positions[0], 'enter')
                self.assertNotIn('exit', positions)
                data = content.encode('utf-8')
                Path(path).write_bytes(data)
                return SimpleNamespace(error=None, verified=True, _content_sha256=hashlib.sha256(data).hexdigest(),
                                       to_dict=lambda: {"bytes_written": len(data), "verified": True})
        ops = Ops()
        source = (Path(__file__).resolve().parents[1] / '.local/hermes-timeline-check/candidate/tools/file_tools.py').read_text(encoding='utf8')
        fn = next(node for node in ast.parse(source).body if isinstance(node, ast.FunctionDef) and node.name == 'write_file_tool')
        scope = {'Path': Path, 'json': json, 'ExitStack': ExitStack, 'file_state': SimpleNamespace(lock_path=lock_path),
                 '_resolve_or_none': lambda path, task: path, '_get_file_ops': lambda task: ops,
                 '_stale_overwrite_blocker': lambda *args: None, '_edit_warnings': lambda *args: [],
                 '_whole_file_rewrite_hint': lambda *args: None, '_is_internal_file_tool_content': lambda *args: False,
                 '_mark_full_write_baseline': lambda *args: None, '_note_edited': lambda *args: None,
                 '_update_read_timestamp': lambda *args: None, '_is_expected_write_exception': lambda exc: False,
                 'logger': SimpleNamespace(debug=lambda *args, **kwargs: None, error=lambda *args, **kwargs: None),
                 'tool_error': lambda value: json.dumps({'error': value})}
        for key in ['_check_sensitive_path', '_check_binary_document_write', '_check_protected_instruction_write',
                    '_check_approval_required_write', '_check_cross_profile_path']:
            scope[key] = lambda *args, **kwargs: None
        exec(compile(ast.Module(body=[fn], type_ignores=[]), 'native-file-tools-candidate', 'exec'), scope)
        stub_tools = types.ModuleType('tools')
        stub_tools.__path__ = []
        stub_tools.hcv_file_changes = self.capture
        file_tools = types.ModuleType('tools.file_tools')
        file_tools._file_ops_uses_host_paths = lambda file_ops: file_ops.env is None
        paths = types.ModuleType('tools.file_tools_paths')
        paths._authoritative_workspace_root = lambda task: str(self.repo)
        self.target.write_bytes(b'before\n')
        with patch.dict(sys.modules, {'tools': stub_tools, 'tools.hcv_file_changes': self.capture,
                                     'tools.file_tools': file_tools, 'tools.file_tools_paths': paths}):
            result = scope['write_file_tool'](str(self.target), 'after\n', task_id='fixture-task')
        self.assertEqual(positions, ['enter', 'write', 'exit'])
        self.assertEqual(json.loads(result), {'bytes_written': 6, 'verified': True,
                                             'resolved_path': str(self.target), 'files_modified': [str(self.target)]})
        self.assertEqual(self.target.read_bytes(), b'after\n')
        snapshot = result._hcv_file_changes
        self.assertIn('-before\n+after\n', snapshot['diff'])
        self.assertEqual(snapshot['cwd'], str(self.repo))


if __name__ == "__main__":
    unittest.main(verbosity=2)

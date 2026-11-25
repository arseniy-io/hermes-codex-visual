"""Isolated checks for release_batch; never touches the actual shared project."""

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
from uuid import uuid4


TOOL = Path(__file__).with_name("release_batch.py")
if not TOOL.exists():
    TOOL = Path(__file__).absolute().parent.parent / "scripts/release_batch.py"
TEST_PARENT = TOOL.parent if TOOL.parent.name != "scripts" else TOOL.parent.parent / ".local"
SPEC = importlib.util.spec_from_file_location("release_batch", TOOL)
batch = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(batch)
lock = batch._lock_module()


class BatchTests(unittest.TestCase):
    def setUp(self):
        # A test touches only its own synthetic tree inside the delegated folder.
        self.temp = tempfile.TemporaryDirectory(prefix="batch-fixture-", dir=TEST_PARENT)
        self.root = Path(self.temp.name) / "project"
        for folder in ("source", "verification", "scripts", "docs", ".local"):
            (self.root / folder).mkdir(parents=True, exist_ok=True)
        lock.change(self.root, "acquire", "owner-a", task="fixture")
        self.untouched = self.root / "source" / "dirty.js"
        self.untouched.write_bytes(b"not committed, preserve me\n")

    def tearDown(self):
        self.temp.cleanup()

    def bundle(self, name, entries, checks=None):
        base = self.root / ".local" / (name + "-base")
        candidate = self.root / ".local" / (name + "-candidate")
        out = self.root / ".local" / (name + "-bundle")
        base.mkdir()
        candidate.mkdir()
        for path, before, after in entries:
            old = base / path
            new = candidate / path
            target = self.root / path
            old.parent.mkdir(parents=True, exist_ok=True)
            new.parent.mkdir(parents=True, exist_ok=True)
            target.parent.mkdir(parents=True, exist_ok=True)
            if before is not None:
                old.write_bytes(before)
                if not target.exists():
                    target.write_bytes(before)
            new.write_bytes(after)
        result = batch.prepare(self.root, base, candidate, out, name,
                               [entry[0] for entry in entries], checks or ["sidebar-activity"])
        return out, result["sha256"]

    def apply(self, bundle_pairs, name="transaction", owner="owner-a"):
        return batch.apply(self.root, [path for path, _ in bundle_pairs],
                           [digest for _, digest in bundle_pairs],
                           self.root / ".local" / name, owner)

    def windows_deny_guests(self, path):
        proc = subprocess.run(["icacls", str(path), "/deny", "*S-1-5-32-546:(R)"],
                              capture_output=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)

    def windows_dacl(self, path):
        saved = self.root / ".local" / ("acl-" + uuid4().hex + ".txt")
        proc = subprocess.run(["icacls", str(path), "/save", str(saved)], capture_output=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        text = saved.read_bytes().decode("utf-16le").lstrip("\ufeff")
        descriptors = [line for line in text.splitlines() if line.startswith("D:")]
        self.assertEqual(len(descriptors), 1, text)
        return descriptors[0]

    def create_windows_metadata(self, path):
        stream = str(path) + ":hcv_fixture_stream"
        with open(stream, "wb") as handle:
            handle.write(b"extra NTFS stream")
        self.windows_deny_guests(path)
        descriptor = self.windows_dacl(path)
        self.assertIn(";;;BG)", descriptor)
        self.assertIn("(D;", descriptor)
        return descriptor

    def assert_windows_metadata(self, path, descriptor):
        with open(str(path) + ":hcv_fixture_stream", "rb") as handle:
            self.assertEqual(handle.read(), b"extra NTFS stream")
        self.assertEqual(self.windows_dacl(path), descriptor)

    def test_prepare_review_and_apply_independent_bundles(self):
        first = self.bundle("first", [("source/a.js", b"old a\n", b"new a\n")],
                            ["sidebar-activity", "unit:a"])
        second = self.bundle("second", [("verification/b.txt", b"old b", b"new b"),
                                        ("source/new.js", None, b"new file\n")],
                             ["mcp-page", "sidebar-activity"])
        packages, checks = batch.inspect(self.root, [first[0], second[0]])
        self.assertEqual(checks, ["mcp-page", "sidebar-activity", "unit:a"])
        self.assertEqual([package["sha256"] for package in packages], [first[1], second[1]])
        self.assertIn(b"No newline at end of file", (second[0] / "changes.diff").read_bytes())
        self.assertEqual(self.untouched.read_bytes(), b"not committed, preserve me\n")
        self.assertEqual((self.root / "source/a.js").read_bytes(), b"old a\n")
        result = self.apply([first, second])
        self.assertEqual(result["status"], "applied")
        self.assertEqual((self.root / "source/a.js").read_bytes(), b"new a\n")
        self.assertEqual((self.root / "verification/b.txt").read_bytes(), b"new b")
        self.assertEqual((self.root / "source/new.js").read_bytes(), b"new file\n")
        self.assertEqual(self.untouched.read_bytes(), b"not committed, preserve me\n")
        journal = json.loads(Path(result["journal"]).read_text(encoding="utf-8"))
        self.assertEqual(journal["status"], "applied")
        self.assertTrue(all(record["applied"] for record in journal["files"]))
        new_entry = next(record for record in journal["files"] if record["path"] == "source/new.js")
        self.assertIsNone(new_entry["before"])
        self.assertEqual(journal["checks_union"], checks)

    def test_overlapping_bundles_refuse_before_writing_anything(self):
        first = self.bundle("first", [("source/a.js", b"old\n", b"new one\n")])
        second = self.bundle("second", [("source/a.js", b"old\n", b"new two\n")])
        with self.assertRaisesRegex(batch.BatchError, "overlap"):
            self.apply([first, second])
        self.assertEqual((self.root / "source/a.js").read_bytes(), b"old\n")
        self.assertFalse((self.root / ".local/transaction").exists())

    def test_changed_workspace_file_stops_entire_batch(self):
        first = self.bundle("first", [("source/a.js", b"old a\n", b"new a\n"),
                                      ("source/b.js", b"old b\n", b"new b\n")])
        (self.root / "source/b.js").write_bytes(b"someone else's changes\n")
        with self.assertRaisesRegex(batch.BatchError, "changed"):
            self.apply([first])
        self.assertEqual((self.root / "source/a.js").read_bytes(), b"old a\n")
        self.assertEqual((self.root / "source/b.js").read_bytes(), b"someone else's changes\n")
        self.assertEqual(self.untouched.read_bytes(), b"not committed, preserve me\n")
        self.assertFalse((self.root / ".local/transaction").exists())

    def test_new_file_appeared_after_snapshot_is_never_overwritten(self):
        first = self.bundle("first", [("source/new.js", None, b"ours\n")])
        target = self.root / "source/new.js"
        target.write_bytes(b"someone else's new file\n")
        with self.assertRaisesRegex(batch.BatchError, "changed"):
            self.apply([first])
        self.assertEqual(target.read_bytes(), b"someone else's new file\n")

    def test_reviewed_hash_and_embedded_bytes_must_match(self):
        first = self.bundle("first", [("source/a.js", b"old\n", b"new\n")])
        manifest_path = first[0] / "bundle.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["task"] = "different description"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(batch.BatchError, "changed after review"):
            self.apply([first])
        # Even if a new digest is supplied, corrupted bytes fail their own hash.
        manifest["files"][0]["after_base64"] = "dGFtcGVyZWQ="
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(batch.BatchError, "hash does not match"):
            batch.inspect(self.root, [first[0]])
        self.assertEqual((self.root / "source/a.js").read_bytes(), b"old\n")

    def test_changed_diff_is_refused_before_review_and_apply(self):
        first = self.bundle("first", [("source/a.js", b"old\n", b"new\n")])
        (first[0] / "changes.diff").write_text("not the diff\n", encoding="utf-8")
        with self.assertRaisesRegex(batch.BatchError, "diff is inconsistent"):
            batch.inspect(self.root, [first[0]])
        with self.assertRaisesRegex(batch.BatchError, "diff is inconsistent"):
            self.apply([first])
        self.assertEqual((self.root / "source/a.js").read_bytes(), b"old\n")

    def test_wrong_or_missing_owner_cannot_apply(self):
        first = self.bundle("first", [("source/a.js", b"old\n", b"new\n")])
        for owner in ("owner-b", ""):
            with self.assertRaises(Exception):
                self.apply([first], owner=owner)
            self.assertFalse((self.root / ".local/transaction").exists())
            self.assertEqual((self.root / "source/a.js").read_bytes(), b"old\n")

    def test_interrupted_apply_preserves_recovery_bytes_and_never_repeats(self):
        first = self.bundle("first", [("source/a.js", b"old a\n", b"new a\n"),
                                      ("source/b.js", b"old b\n", b"new b\n")])
        real_replace = batch._replace_target
        calls = []

        def interrupted(path, content, existed, pending):
            calls.append(path.name)
            if len(calls) == 2:
                raise OSError("injected failure")
            return real_replace(path, content, existed, pending)

        with mock.patch.object(batch, "_replace_target", side_effect=interrupted):
            with self.assertRaisesRegex(OSError, "injected failure"):
                self.apply([first])
        transaction = self.root / ".local/transaction"
        journal = json.loads((transaction / "journal.json").read_text(encoding="utf-8"))
        self.assertEqual(journal["status"], "interrupted")
        self.assertEqual(journal["in_progress"], "source/b.js")
        self.assertEqual((self.root / "source/a.js").read_bytes(), b"new a\n")
        self.assertEqual((self.root / "source/b.js").read_bytes(), b"old b\n")
        for record in journal["files"]:
            self.assertEqual(batch._digest((transaction / record["before"]).read_bytes()), record["before_sha256"])
            self.assertEqual(batch._digest((transaction / record["after"]).read_bytes()), record["after_sha256"])
        with self.assertRaises(batch.BatchError):
            self.apply([first])
        # Even after a person restores the original, the same journal may not be reused.
        (self.root / "source/a.js").write_bytes(b"old a\n")
        with self.assertRaises((FileExistsError, batch.BatchError)):
            self.apply([first])
        self.assertEqual(self.untouched.read_bytes(), b"not committed, preserve me\n")

    def test_lost_lock_during_apply_stops_without_rollback(self):
        first = self.bundle("first", [("source/a.js", b"old a\n", b"new a\n"),
                                      ("source/b.js", b"old b\n", b"new b\n")])
        real_replace = batch._replace_target
        def release_after_first(path, content, existed, pending):
            real_replace(path, content, existed, pending)
            lock.change(self.root, "release", "owner-a", note="fixture loss")
        with mock.patch.object(batch, "_replace_target", side_effect=release_after_first):
            with self.assertRaises(Exception):
                self.apply([first])
        journal = json.loads((self.root / ".local/transaction/journal.json").read_text(encoding="utf-8"))
        self.assertEqual(journal["status"], "interrupted")
        self.assertEqual((self.root / "source/a.js").read_bytes(), b"new a\n")
        self.assertEqual((self.root / "source/b.js").read_bytes(), b"old b\n")

    def test_external_edit_between_replacements_is_not_overwritten(self):
        first = self.bundle("first", [("source/a.js", b"old a\n", b"new a\n"),
                                      ("source/b.js", b"old b\n", b"new b\n")])
        real_replace = batch._replace_target
        def change_second(path, content, existed, pending):
            real_replace(path, content, existed, pending)
            (self.root / "source/b.js").write_bytes(b"other work\n")
        with mock.patch.object(batch, "_replace_target", side_effect=change_second):
            with self.assertRaisesRegex(batch.BatchError, "changed"):
                self.apply([first])
        self.assertEqual((self.root / "source/a.js").read_bytes(), b"new a\n")
        self.assertEqual((self.root / "source/b.js").read_bytes(), b"other work\n")
        journal = json.loads((self.root / ".local/transaction/journal.json").read_text(encoding="utf-8"))
        self.assertEqual(journal["status"], "interrupted")

    def test_unsafe_paths_case_collisions_and_missing_parent_are_refused(self):
        base = self.root / ".local/base"
        candidate = self.root / ".local/candidate"
        base.mkdir()
        candidate.mkdir()
        for path in ("../source/a.js", "source/../a.js", "source/a:stream", "source/CON.txt",
                     "source/CONOUT$", "source/CONIN$", "source/CON .txt", "source/COM¹",
                     "source/COM².txt", "source/LPT³", "source/ foo", " source/foo",
                     "source/a\\b.js", ".local/release-owner.json", "scripts/release_lock.py"):
            with self.subTest(path=path), self.assertRaises(batch.BatchError):
                batch.prepare(self.root, base, candidate, self.root / ".local/out", "task", [path], ["check"])
        first = self.bundle("first", [("source/A.js", b"old\n", b"one\n")])
        second = self.bundle("second", [("source/a.js", b"old\n", b"two\n")])
        with self.assertRaisesRegex(batch.BatchError, "overlap"):
            self.apply([first, second])
        third = self.bundle("third", [("source/subdir/new.js", None, b"new\n")])
        # The folder is safe to remove: it is empty and was created by this test.
        (self.root / "source/subdir").rmdir()
        with self.assertRaisesRegex(batch.BatchError, "Parent folder missing"):
            self.apply([third])
        self.assertFalse((self.root / ".local/transaction").exists())

    def test_unverified_platform_stops_before_any_backup_or_replacement(self):
        first = self.bundle("first", [("source/a.js", b"old\n", b"new\n")])
        with mock.patch.object(batch, "_supports_safe_replacement", return_value=False):
            with self.assertRaisesRegex(batch.BatchError, "unavailable on this platform"):
                self.apply([first])
        self.assertEqual((self.root / "source/a.js").read_bytes(), b"old\n")
        self.assertFalse((self.root / ".local/transaction").exists())

    @unittest.skipUnless(os.name == "nt", "Requires NTFS and Windows ACLs")
    def test_ntfs_stream_and_dacl_preserved_in_replacement_and_full_backup(self):
        first = self.bundle("first", [("source/a.js", b"old a\n", b"new a\n")])
        target = self.root / "source/a.js"
        before_acl = self.create_windows_metadata(target)
        result = self.apply([first])
        journal_path = Path(result["journal"])
        journal = json.loads(journal_path.read_text(encoding="utf-8"))
        backup = journal_path.parent / journal["files"][0]["before_full"]
        self.assertEqual(target.read_bytes(), b"new a\n")
        self.assertEqual(backup.read_bytes(), b"old a\n")
        self.assert_windows_metadata(target, before_acl)
        self.assert_windows_metadata(backup, before_acl)
        self.assertEqual(batch._identity(backup), tuple(journal["files"][0]["original_identity"]))
        self.assertNotEqual(batch._identity(target), batch._identity(backup))

    @unittest.skipUnless(os.name == "nt", "Requires NTFS and Windows ACLs")
    def test_ntfs_stream_and_dacl_recoverable_after_interrupted_replacement(self):
        first = self.bundle("first", [("source/a.js", b"old a\n", b"new a\n"),
                                      ("source/b.js", b"old b\n", b"new b\n")])
        target = self.root / "source/a.js"
        before_acl = self.create_windows_metadata(target)
        real_replace = batch._replace_target
        def fail_after_replacement(path, content, existed, pending):
            real_replace(path, content, existed, pending)
            raise OSError("failure after OS replacement")
        with mock.patch.object(batch, "_replace_target", side_effect=fail_after_replacement):
            with self.assertRaisesRegex(OSError, "failure after OS replacement"):
                self.apply([first])
        transaction = self.root / ".local/transaction"
        journal = json.loads((transaction / "journal.json").read_text(encoding="utf-8"))
        self.assertEqual(journal["status"], "interrupted")
        self.assertEqual(journal["in_progress"], "source/a.js")
        self.assertTrue(journal["pending_path"].endswith(".tmp"))
        backup = transaction / journal["files"][0]["before_full"]
        self.assertEqual(target.read_bytes(), b"new a\n")
        self.assertEqual(backup.read_bytes(), b"old a\n")
        self.assertEqual((self.root / "source/b.js").read_bytes(), b"old b\n")
        self.assert_windows_metadata(target, before_acl)
        self.assert_windows_metadata(backup, before_acl)

    @unittest.skipUnless(os.name == "nt", "Requires NTFS and Windows ACLs")
    def test_full_backup_failure_prevents_all_replacements(self):
        first = self.bundle("first", [("source/a.js", b"old a\n", b"new a\n"),
                                      ("source/b.js", b"old b\n", b"new b\n")])
        target = self.root / "source/a.js"
        before_acl = self.create_windows_metadata(target)
        real_link = os.link
        calls = []
        def fail_second_link(src, dst):
            calls.append(str(dst))
            if len(calls) == 2:
                raise OSError("hard links unavailable")
            return real_link(src, dst)
        with mock.patch.object(batch.os, "link", side_effect=fail_second_link):
            with self.assertRaisesRegex(OSError, "hard links unavailable"):
                self.apply([first])
        transaction = self.root / ".local/transaction"
        journal = json.loads((transaction / "journal.json").read_text(encoding="utf-8"))
        self.assertEqual(journal["status"], "interrupted")
        self.assertTrue(journal["files"][0]["backup_linked"])
        self.assertFalse(journal["files"][1]["backup_linked"])
        backup = transaction / journal["files"][0]["before_full"]
        self.assertEqual(target.read_bytes(), b"old a\n")
        self.assertEqual((self.root / "source/b.js").read_bytes(), b"old b\n")
        self.assert_windows_metadata(target, before_acl)
        self.assert_windows_metadata(backup, before_acl)

    @unittest.skipUnless(os.name == "nt", "Windows file-identity regression")
    def test_identity_changed_with_same_bytes_is_refused_before_replacement(self):
        first = self.bundle("first", [("source/a.js", b"old a\n", b"new a\n")])
        target = self.root / "source/a.js"
        real_link = os.link
        def substitute_after_link(src, dst):
            real_link(src, dst)
            substitute = target.with_name(".synthetic-other-file")
            substitute.write_bytes(b"old a\n")
            os.replace(substitute, target)
        with mock.patch.object(batch.os, "link", side_effect=substitute_after_link):
            with self.assertRaisesRegex(batch.BatchError, "full backup identity"):
                self.apply([first])
        journal_path = self.root / ".local/transaction/journal.json"
        journal = json.loads(journal_path.read_text(encoding="utf-8"))
        self.assertEqual(journal["status"], "interrupted")
        self.assertEqual(target.read_bytes(), b"old a\n")
        backup = journal_path.parent / journal["files"][0]["before_full"]
        self.assertEqual(backup.read_bytes(), b"old a\n")
        self.assertNotEqual(batch._identity(target), batch._identity(backup))

    def test_symlinked_candidate_is_refused(self):
        base = self.root / ".local/base"
        candidate = self.root / ".local/candidate"
        (base / "source").mkdir(parents=True)
        (candidate / "source").mkdir(parents=True)
        secret = self.root / ".local/private"
        secret.write_bytes(b"secret\n")
        try:
            (candidate / "source/a.js").symlink_to(secret)
        except (OSError, NotImplementedError):
            self.skipTest("Creating a symlink is unavailable for this user")
        with self.assertRaisesRegex(batch.BatchError, "link or junction"):
            batch.prepare(self.root, base, candidate, self.root / ".local/out",
                          "task", ["source/a.js"], ["check"])
        self.assertEqual(secret.read_bytes(), b"secret\n")

    @unittest.skipUnless(os.name == "nt", "Windows junction regression")
    def test_junction_ancestor_in_candidate_is_refused(self):
        base = self.root / ".local/base"
        candidate = self.root / ".local/candidate"
        (base / "source").mkdir(parents=True)
        (candidate / "source").mkdir(parents=True)
        outside = self.root / ".local/outside"
        outside.mkdir()
        (outside / "a.js").write_bytes(b"other bytes\n")
        link = candidate / "source/link"
        created = subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(outside)],
                                 capture_output=True)
        if created.returncode:
            self.skipTest("Creating a junction is unavailable for this user")
        try:
            with self.assertRaisesRegex(batch.BatchError, "link or junction"):
                batch.prepare(self.root, base, candidate, self.root / ".local/out",
                              "task", ["source/link/a.js"], ["check"])
            self.assertEqual((outside / "a.js").read_bytes(), b"other bytes\n")
        finally:
            os.rmdir(link)

    def test_cli_review_and_digest_requirement(self):
        first = self.bundle("first", [("source/a.js", b"old\n", b"new\n")])
        env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", PYTHONIOENCODING="utf-8")
        result = subprocess.run([sys.executable, "-B", str(TOOL), "review", "--root", str(self.root),
                                 "--bundle", str(first[0])], capture_output=True, text=True, encoding="utf-8", env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        reviewed = json.loads(result.stdout)
        self.assertEqual(reviewed["bundles"][0]["sha256"], first[1])
        rejected = subprocess.run([sys.executable, "-B", str(TOOL), "apply", "--root", str(self.root),
                                   "--bundle", str(first[0]), "--sha256", "0" * 64,
                                   "--transaction", str(self.root / ".local/transaction"),
                                   "--owner", "owner-a"], capture_output=True, text=True, encoding="utf-8", env=env)
        self.assertEqual(rejected.returncode, 2)
        self.assertIn("changed after review", rejected.stderr)
        self.assertEqual((self.root / "source/a.js").read_bytes(), b"old\n")

    def test_full_cli_handoff_in_synthetic_workspace(self):
        base = self.root / ".local/base"
        candidate = self.root / ".local/candidate"
        out = self.root / ".local/out"
        transaction = self.root / ".local/receipt"
        (base / "source").mkdir(parents=True)
        (candidate / "source").mkdir(parents=True)
        (base / "source/a.js").write_bytes(b"before\n")
        (candidate / "source/a.js").write_bytes(b"after\n")
        (self.root / "source/a.js").write_bytes(b"before\n")
        env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", PYTHONIOENCODING="utf-8")
        def cli(*args):
            return subprocess.run([sys.executable, "-B", str(TOOL), *args],
                                  capture_output=True, text=True, encoding="utf-8", env=env)
        prepared = cli("prepare", "--root", str(self.root), "--base", str(base),
                       "--candidate", str(candidate), "--out", str(out),
                       "--task", "Synthetic change", "--file", "source/a.js",
                       "--check", "sidebar-activity", "--check", "unit:example")
        self.assertEqual(prepared.returncode, 0, prepared.stderr)
        bundle = json.loads(prepared.stdout)
        reviewed = cli("review", "--root", str(self.root), "--bundle", str(out))
        self.assertEqual(reviewed.returncode, 0, reviewed.stderr)
        self.assertEqual(json.loads(reviewed.stdout)["bundles"][0]["sha256"], bundle["sha256"])
        applied = cli("apply", "--root", str(self.root), "--bundle", str(out),
                      "--sha256", bundle["sha256"], "--transaction", str(transaction),
                      "--owner", "owner-a")
        self.assertEqual(applied.returncode, 0, applied.stderr)
        self.assertEqual(json.loads(applied.stdout)["status"], "applied")
        self.assertEqual((self.root / "source/a.js").read_bytes(), b"after\n")
        self.assertEqual(self.untouched.read_bytes(), b"not committed, preserve me\n")


if __name__ == "__main__":
    unittest.main(verbosity=2)

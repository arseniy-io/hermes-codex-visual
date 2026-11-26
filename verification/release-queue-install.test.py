import os
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from contextlib import closing
from hashlib import sha256
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import release_queue_install as install


INTENT = "intent-1"
THIS_FILE = Path(__file__).resolve()


def digest(data):
    return None if data is None else sha256(data).hexdigest()


def contents(path):
    try:
        return path.read_bytes()
    except FileNotFoundError:
        return None


class Maintenance:
    """Filesystem-backed double. It can guard this fixture, which has no Hermes."""

    proven = True

    def __init__(self, root, interrupt=None):
        self.root = root
        self.held = root / "maintenance"
        self.active = root / "loaded"
        self.events = root / "events"
        self.interrupt = interrupt or (lambda point: None)
        self.fail = set()

    def note(self, event):
        with self.events.open("a", encoding="ascii") as stream:
            stream.write(event + "\n")

    def validate_targets(self, intent_id, targets):
        if any(path.parent != self.root / "targets" for path in targets):
            raise install.InstallError("Outside test scope")

    def enter(self, intent_id):
        if self.held.exists():
            assert self.held.read_text() == intent_id
        else:
            self.held.write_text(intent_id)
        self.note("enter")
        self.interrupt("enter")

    def verify_base(self, intent_id, expected):
        assert self.held.read_text() == intent_id
        assert self.active.read_text() == "old"
        self.check_files(expected)
        self.note("verify_base")

    def check_files(self, expected):
        for path, wanted in expected.items():
            assert digest(contents(path)) == wanted, path

    def probe(self, intent_id, version, expected):
        assert self.held.read_text() == intent_id
        self.check_files(expected)
        self.active.write_text(version)
        self.check_files(expected)
        self.note("probe_" + version)
        self.interrupt("probe_" + version)
        if version in self.fail:
            raise RuntimeError("test gateway is unavailable")
        return {"intent_id": intent_id, "version": version,
                "evidence": {"loaded": self.active.read_text(), "gateway": "ready"}}

    def leave(self, intent_id):
        if self.held.exists():
            assert self.held.read_text() == intent_id
            self.held.unlink()
        self.note("leave")
        self.interrupt("leave")


class Fixture:
    def __init__(self, root, *, create=False, interrupt=None):
        self.root = root
        self.journal = root / "journal"
        self.targets = root / "targets"
        self.registry = root / "committed"
        self.maintenance = Maintenance(root, interrupt)
        self.interrupt = self.maintenance.interrupt
        self.originals = {"a": b"first old", "b": b"second old", "c": None, "d": None}
        self.candidate = {"a": b"first new", "b": None, "c": b"", "d": None}
        if create:
            self.targets.mkdir()
            self.maintenance.active.write_text("old")
            for name, data in self.originals.items():
                if data is not None:
                    (self.targets / name).write_bytes(data)
        self.changes = [{"target": self.targets / name, "before": digest(old),
                         "after": self.candidate[name]} for name, old in self.originals.items()]

    def files(self):
        return {name: contents(self.targets / name) for name in self.originals}

    def events(self):
        return self.maintenance.events.read_text().splitlines()

    def commit(self, receipt):
        assert self.maintenance.held.read_text() == INTENT
        assert self.maintenance.active.read_text() == "new"
        assert self.files() == self.candidate
        assert receipt["evidence"]["gateway"] == "ready"
        self.maintenance.note("commit")
        self.registry.write_text(receipt["intent_id"])
        self.interrupt("commit")

    def committed(self, intent_id):
        return self.registry.exists() and self.registry.read_text() == intent_id

    def apply(self, *, changes=None, commit=None, is_committed=None):
        return install.apply_release(self.journal, INTENT, self.changes if changes is None else changes,
                                     self.maintenance, commit or self.commit, is_committed or self.committed)

    def recover(self, *, is_committed=None):
        return install.recover_release(self.journal, self.maintenance, is_committed or self.committed)


def child(root, stop_at):
    def interrupt(point):
        if point == stop_at:
            (root / "ready").write_text(point)
            time.sleep(30)
            os._exit(99)

    fixture = Fixture(root, interrupt=interrupt)
    move = install._move

    def interrupted_move(source, target, *, replace):
        move(source, target, replace=replace)
        if target == fixture.targets / "a":
            interrupt("first_replace")

    with patch.object(install, "_move", interrupted_move):
        fixture.apply()


class InstallTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="hcv-queue-install-")
        self.addCleanup(temporary.cleanup)
        self.fixture = Fixture(Path(temporary.name), create=True)

    def assert_status(self, status, action, **kwargs):
        with self.assertRaises(install.InstallError) as error:
            action(**kwargs)
        self.assertEqual(error.exception.status, status)

    def kill_at(self, point):
        f = self.fixture
        ready = f.root / "ready"
        process = subprocess.Popen([sys.executable, "-B", str(THIS_FILE), "--child", str(f.root), point],
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            deadline = time.monotonic() + 8
            while not ready.exists() and process.poll() is None and time.monotonic() < deadline:
                time.sleep(0.02)
            if not ready.exists():
                process.kill()
                _, errors = process.communicate(timeout=5)
                self.fail(f"Child failed to reach {point}: {errors}")
            self.assertIsNone(process.poll())
            self.assert_status("busy", f.recover)
        finally:
            if process.poll() is None:
                process.kill()
            process.communicate(timeout=5)
        self.assertNotEqual(process.returncode, 0)

    def test_batch_changes_and_committed_retry_without_new_probe(self):
        f = self.fixture
        before_meta = install._read_target(f.targets / "a")[1]
        result = f.apply()
        self.assertEqual(result["status"], "committed")
        self.assertEqual(f.files(), f.candidate)
        self.assertEqual(install._read_target(f.targets / "a")[1], before_meta)
        self.assertEqual(f.events(), ["enter", "verify_base", "probe_new", "commit", "leave"])
        self.assertEqual(f.apply(changes=list(reversed(f.changes))), result)
        self.assertEqual(f.recover(), result)
        self.assertEqual(f.events().count("probe_new"), 1)
        self.assertFalse(f.maintenance.held.exists())

    def test_gateway_failure_restores_and_loads_old(self):
        f = self.fixture
        f.maintenance.fail.add("new")
        self.assert_status("rolled_back", f.apply)
        self.assertEqual(f.files(), f.originals)
        self.assertEqual(f.maintenance.active.read_text(), "old")
        self.assertEqual(f.events(), ["enter", "verify_base", "probe_new", "enter", "probe_old", "leave"])
        self.assertFalse(f.registry.exists())
        self.assertFalse(f.maintenance.held.exists())
        f.maintenance.fail.clear()
        self.assertEqual(f.apply()["status"], "committed")

    def test_failed_old_probe_leaves_barrier_for_retry(self):
        f = self.fixture
        f.maintenance.fail.update({"old", "new"})
        self.assert_status("blocked", f.apply)
        self.assertTrue(f.maintenance.held.exists())
        self.assertEqual(f.files(), f.originals)
        f.maintenance.fail.clear()
        self.assertEqual(f.recover()["status"], "rolled_back")
        self.assertFalse(f.maintenance.held.exists())

    def test_lost_commit_response_uses_registry(self):
        f = self.fixture

        def commit(receipt):
            f.commit(receipt)
            raise OSError("reply lost")

        self.assertEqual(f.apply(commit=commit)["status"], "committed")
        self.assertNotIn("probe_old", f.events())

    def test_unknown_registry_after_commit_keeps_barrier(self):
        f = self.fixture
        self.assert_status("unknown", f.apply, is_committed=lambda intent: None if f.committed(intent) else False)
        self.assertTrue(f.maintenance.held.exists())
        self.assertEqual(f.files(), f.candidate)
        self.assertEqual(f.recover()["status"], "committed")
        self.assertEqual(f.events(), ["enter", "verify_base", "probe_new", "commit", "leave"])

    def test_kill_after_first_replace_rolls_back_from_independent_backups(self):
        f = self.fixture
        self.kill_at("first_replace")
        self.assertEqual((f.targets / "a").read_bytes(), f.candidate["a"])
        with closing(sqlite3.connect(f.journal / "install.sqlite3")) as db, db:
            rows = db.execute("SELECT old, new FROM files ORDER BY id").fetchall()
        self.assertEqual(rows, list(zip(f.originals.values(), f.candidate.values())))
        self.assertTrue(f.maintenance.held.exists())
        self.assertEqual(f.recover()["status"], "rolled_back")
        self.assertEqual(f.files(), f.originals)
        self.assertEqual(f.maintenance.active.read_text(), "old")

    def test_kill_after_new_probe_before_commit_rolls_back(self):
        f = self.fixture
        self.kill_at("probe_new")
        self.assertEqual(f.files(), f.candidate)
        self.assertEqual(f.maintenance.active.read_text(), "new")
        self.assertFalse(f.registry.exists())
        self.assertEqual(f.recover()["status"], "rolled_back")
        self.assertEqual(f.files(), f.originals)
        self.assertEqual(f.maintenance.active.read_text(), "old")

    def test_kill_after_commit_retry_only_leaves(self):
        f = self.fixture
        self.kill_at("commit")
        before = f.events()
        self.assertTrue(f.maintenance.held.exists())
        self.assertEqual(f.apply()["status"], "committed")
        self.assertEqual(f.events(), before + ["leave"])
        self.assertEqual(f.files(), f.candidate)
        self.assertEqual(f.maintenance.active.read_text(), "new")

    def test_kill_after_leave_retry_does_not_enter_or_replace(self):
        f = self.fixture
        self.kill_at("leave")
        self.assertFalse(f.maintenance.held.exists())
        (f.targets / "a").write_bytes(b"work after leave")
        before = f.events()
        self.assertEqual(f.recover()["status"], "committed")
        self.assertEqual(f.events(), before + ["leave"])
        self.assertEqual(contents(f.targets / "a"), b"work after leave")

    def test_kill_on_entry_recovers_without_backups(self):
        f = self.fixture
        self.kill_at("enter")
        self.assertTrue(f.maintenance.held.exists())
        self.assertEqual(f.recover()["status"], "rolled_back")
        self.assertEqual(f.files(), f.originals)
        self.assertEqual(f.events(), ["enter", "enter", "probe_old", "leave"])

    def test_foreign_file_on_recovery_preserves_entire_current_set(self):
        f = self.fixture
        self.kill_at("probe_new")
        (f.targets / "b").write_bytes(b"independent change")
        before = f.files()
        self.assert_status("foreign", f.recover)
        self.assertEqual(f.files(), before)
        self.assertTrue(f.maintenance.held.exists())
        self.assertNotIn("probe_old", f.events())
        self.assertNotIn("leave", f.events())

    def test_corrupt_backup_blocked_without_live_changes(self):
        f = self.fixture
        self.kill_at("first_replace")
        with closing(sqlite3.connect(f.journal / "install.sqlite3")) as db, db:
            db.execute("UPDATE files SET old = ? WHERE id = 0", (b"corrupt",))
        before = f.files()
        self.assert_status("unknown", f.recover)
        self.assertEqual(f.files(), before)
        self.assertTrue(f.maintenance.held.exists())

    def test_foreign_absence_before_install(self):
        f = self.fixture
        (f.targets / "a").unlink()
        before = f.files()
        self.assert_status("foreign", f.apply)
        self.assertEqual(f.files(), before)
        self.assertFalse(f.registry.exists())

    def test_unproven_adapter_leaves_files_and_journal_untouched(self):
        f = self.fixture
        f.maintenance.proven = False
        self.assert_status("blocked", f.apply)
        self.assertFalse(f.journal.exists())
        self.assertFalse(f.maintenance.held.exists())
        self.assertEqual(f.files(), f.originals)
        self.assertEqual(f.recover()["status"], "idle")

    def test_plan_collision_and_adapter_scope_refused(self):
        f = self.fixture
        self.assert_status("blocked", f.apply, changes=f.changes + f.changes[:1])
        change = {"target": f.journal / "owned", "before": None, "after": b"x"}
        self.assert_status("blocked", f.apply, changes=[change])
        change["target"] = f.root / "outside"
        self.assert_status("blocked", f.apply, changes=[change])
        self.assertFalse(change["target"].exists())
        self.assertFalse(f.maintenance.held.exists())

    def test_hardlinked_target_refused(self):
        f = self.fixture
        alias = f.root / "hardlink"
        os.link(f.targets / "a", alias)
        self.assert_status("foreign", f.apply)
        self.assertEqual(alias.read_bytes(), f.originals["a"])
        self.assertFalse(f.registry.exists())

    def test_symlink_or_junction_ancestor_refused(self):
        f = self.fixture
        real = f.root / "other"
        real.mkdir()
        target = f.targets / "redirect"
        if os.name == "nt":
            import _winapi

            _winapi.CreateJunction(str(real), str(target))
        else:
            target.symlink_to(real, target_is_directory=True)
        change = {"target": target / "new", "before": None, "after": b"x"}
        f.maintenance.validate_targets = lambda *args: None  # Engine must refuse it independently.
        self.assert_status("foreign", f.apply, changes=[change])
        self.assertFalse((real / "new").exists())

    @unittest.skipUnless(os.name == "nt", "Windows file permissions")
    def test_windows_replacement_preserves_custom_permissions_on_rollback_and_retry(self):
        f = self.fixture
        target = f.targets / "a"
        subprocess.run(["icacls", str(target), "/grant", "*S-1-5-32-545:(R)"],
                       check=True, capture_output=True)
        original = install._read_target(target)
        self.assertNotEqual(original[1], install._read_target(f.targets / "b")[1])

        f.maintenance.fail.add("new")
        self.assert_status("rolled_back", f.apply)
        self.assertEqual(install._read_target(target), original)
        f.maintenance.fail.clear()

        self.assertEqual(f.apply()["status"], "committed")
        self.assertEqual(install._read_target(target), (f.candidate["a"], original[1]))

    @unittest.skipUnless(os.name == "nt", "Windows alternate streams")
    def test_windows_refuses_named_data_stream_before_replacing_any_target(self):
        f = self.fixture
        stream = Path(str(f.targets / "b") + ":hcv-test")
        stream.write_bytes(b"stream data")
        self.assert_status("blocked", f.apply)
        self.assertEqual(f.files(), f.originals)
        self.assertEqual(stream.read_bytes(), b"stream data")


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "--child":
        child(Path(sys.argv[2]), sys.argv[3])
    else:
        unittest.main(verbosity=2)

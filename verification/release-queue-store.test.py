from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from hashlib import sha256
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
from tempfile import TemporaryDirectory
from threading import Barrier
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from release_queue_store import QueueError, QueueStore


def digest(value):
    return sha256(value.encode("utf-8")).hexdigest()


def base(number):
    return {"id": digest(f"base-{number}"), "version": f"0.15.{number}", "proof": {"reviewed": True}}


def payload(task_id, after="bmV3"):
    return {"files": [{"path": f"source/{task_id}.js", "before": "b2xk", "after": after}],
            "evidence": {"check": "local test"}}


def receipt(intent, ready, new_base):
    return {**ready, "intent_id": intent["id"], "new_base_id": new_base["id"], "verified": True}


class QueueStoreTests(unittest.TestCase):
    def setUp(self):
        folder = TemporaryDirectory(prefix="hcv-queue-test-")
        self.addCleanup(folder.cleanup)
        self.path = Path(folder.name) / "queue # % test.sqlite"
        self.queue = QueueStore(self.path)
        self.base = base(131)

    def submit(self, task_id, revision=1, *, after="bmV3", base_id=None):
        base_id = self.base["id"] if base_id is None else base_id
        if self.queue.task(task_id) is None:
            self.queue.register_task(task_id, f"Task {task_id}", base_id)
        return self.queue.submit(task_id, revision, base_id, digest(f"{task_id}-{revision}"),
                                 payload(task_id, after), ["fixture"])

    def ready(self, selection, new_base, archive="archive"):
        details = {"archive_sha256": digest(archive), "version": new_base["version"]}
        self.queue.save_candidate(selection, "ready", details)
        return details

    def complete(self, intent, new_base, archive="archive"):
        selection = intent["selection"]
        ready = self.ready(selection, new_base, archive)
        return self.queue.complete_install(intent["id"], selection["key"], new_base, receipt(intent, ready, new_base))

    def test_bootstrap_and_empty_freeze(self):
        self.assertIsNone(self.queue.current_base())
        empty = self.queue.selection()
        self.assertIsNone(empty["base"])
        self.assertEqual(empty["items"], [])
        self.assertIsNone(self.queue.freeze())
        with self.assertRaises(QueueError):
            self.queue.register_task("task-01", "Task 01", self.base["id"])
        for invalid in ({"id": "not-a-hash", "version": "0.15.131"},
                        {**self.base, "version": "v0.15.131"}, {**self.base, "extra": {1: "wrong key"}}):
            with self.subTest(invalid=invalid), self.assertRaises(QueueError):
                self.queue.set_base(invalid)
        self.assertEqual(self.queue.set_base(self.base), self.base)
        self.assertEqual(self.queue.set_base(dict(reversed(list(self.base.items())))), self.base)
        self.assertEqual(self.queue.current_base(), self.base)
        self.assertNotEqual(self.queue.selection()["key"], empty["key"])
        self.assertIsNone(self.queue.freeze())
        with self.assertRaises(QueueError):
            self.queue.set_base(base(132))
        self.assertEqual(self.queue.current_base(), self.base)

    def test_two_waves_of_five_install_separately(self):
        self.queue.set_base(self.base)
        for number in (4, 2, 0, 3, 1):
            self.submit(f"task-{number}")
        selection = self.queue.selection()
        self.assertEqual([item["task_id"] for item in selection["items"]], [f"task-{n}" for n in range(5)])
        first = self.queue.freeze()
        self.assertEqual(first["selection"], selection)
        for number in range(5, 10):
            self.submit(f"task-{number}")
        self.assertEqual(self.queue.freeze(), first)
        self.assertEqual(self.queue.pending_install(), first)
        self.assertEqual(len(self.queue.selection()["items"]), 10)
        self.complete(first, base(132), "first archive")
        self.assertIsNone(self.queue.pending_install())
        next_selection = self.queue.selection()
        self.assertEqual(next_selection["base"], base(132))
        self.assertEqual([item["task_id"] for item in next_selection["items"]], [f"task-{n}" for n in range(5, 10)])
        self.assertTrue(all(item["base_id"] == self.base["id"] for item in next_selection["items"]))
        second = self.queue.freeze()
        self.assertEqual(second["selection"], next_selection)
        self.complete(second, base(133), "second archive")
        self.assertIsNone(self.queue.freeze())
        self.assertEqual(self.queue.current_base(), base(133))
        status = self.queue.status()
        self.assertEqual(status["base"], {"id": base(133)["id"], "version": "0.15.133"})
        self.assertEqual(status["selection"]["count"], 0)
        self.assertTrue(all(task["latest_revision"] == task["installed_revision"] == 1 for task in status["tasks"]))
        self.assertEqual(json.loads(json.dumps(status)), status)

    def test_ten_concurrent_connections_and_one_freeze(self):
        path = self.path.with_name("concurrent.sqlite")
        start = Barrier(10, timeout=15)
        submitted = Barrier(10, timeout=15)

        def worker(number):
            start.wait()
            queue = QueueStore(path)
            queue.set_base(self.base)
            task_id = f"task-{number}"
            queue.register_task(task_id, f"Task {number}", self.base["id"])
            item = queue.submit(task_id, 1, self.base["id"], digest(task_id), payload(task_id), ["fixture"])
            submitted.wait()
            duplicate = queue.submit("task-0", 1, self.base["id"], digest("task-0"), payload("task-0"), ["fixture"])
            return item, duplicate, queue.freeze()

        with ThreadPoolExecutor(max_workers=10) as pool:
            results = list(pool.map(worker, range(10)))
        self.assertTrue(all(result[1] == results[0][0] for result in results))
        self.assertEqual(len({entry[2]["id"] for entry in results}), 1)
        queue = QueueStore(path)
        self.assertEqual(queue.pending_install()["selection"], queue.selection())
        self.assertEqual([item["task_id"] for item in queue.selection()["items"]], [f"task-{n}" for n in range(10)])
        self.assertEqual(len(queue.status()["tasks"]), 10)

    def test_exact_replay_conflicting_bytes_and_expected_sequence(self):
        self.queue.set_base(self.base)
        first = self.submit("same")
        self.assertEqual(self.queue.register_task("same", "Changed title", self.base["id"])["title"], "Task same")
        second = self.submit("same", 2, after="dHdv")
        self.assertEqual(self.submit("same"), first)
        reordered = dict(reversed(list(payload("same").items())))
        self.assertEqual(self.queue.submit("same", 1, self.base["id"], first["digest"], reordered, ["fixture"]), first)
        with self.assertRaisesRegex(QueueError, "immutable"):
            self.submit("same", after="Y29uZmxpY3Q=")
        with self.assertRaisesRegex(QueueError, "immutable"):
            self.queue.submit("same", 1, self.base["id"], first["digest"], payload("same"), ["another-check"])
        with self.assertRaisesRegex(QueueError, "Expected revision 3"):
            self.submit("same", 4)
        self.assertEqual(self.queue.selection()["items"], [{**second, "installed_revision": None}])

    def test_rejects_invalid_inputs_without_changing_queue(self):
        self.queue.set_base(self.base)
        base_id = self.base["id"]
        for task_id in ("../escape", "two words", "", 1):
            with self.subTest(task_id=task_id), self.assertRaises(QueueError):
                self.queue.register_task(task_id, "Task", base_id)
        self.queue.register_task("task", "Task", base_id)
        attempts = [
            ("unknown", 1, base_id, digest("patch"), payload("task"), []),
            ("task", True, base_id, digest("patch"), payload("task"), []),
            ("task", 2**63, base_id, digest("patch"), payload("task"), []),
            ("task", 1, digest("unknown base"), digest("patch"), payload("task"), []),
            ("task", 1, base_id, "bad digest", payload("task"), []),
            ("task", 1, base_id, digest("patch"), {"files": [{"path": "x", "before": None}]}, []),
            ("task", 1, base_id, digest("patch"), {"files": [{"path": "x", "before": None, "after": 42}]}, []),
            ("task", 1, base_id, digest("patch"), payload("task"), "not a list"),
        ]
        for args in attempts:
            with self.subTest(args=args), self.assertRaises(QueueError):
                self.queue.submit(*args)
        self.assertEqual(self.queue.selection()["items"], [])

    def test_late_revisions_use_immutable_installed_predecessor(self):
        self.queue.set_base(self.base)
        r1 = self.submit("same")
        first = self.queue.freeze()
        r2 = self.submit("same", 2, after="dHdv")
        self.assertEqual(self.queue.pending_install()["selection"]["items"], [{**r1, "installed_revision": None}])
        self.complete(first, base(132), "first archive")
        self.assertEqual(self.queue.register_task("same", "Renamed task", base(132)["id"])["base_id"], self.base["id"])
        self.assertEqual(self.queue.selection()["items"], [{**r2, "installed_revision": r1}])
        second = self.queue.freeze()
        r3 = self.submit("same", 3, after="dGhyZWU=")
        self.assertEqual(self.queue.freeze(), second)
        self.assertEqual(second["selection"]["items"], [{**r2, "installed_revision": r1}])
        self.assertEqual(self.queue.selection()["items"], [{**r3, "installed_revision": r1}])
        self.complete(second, base(133), "second archive")
        self.assertEqual(self.queue.selection()["items"], [{**r3, "installed_revision": r2}])
        self.assertEqual(self.queue.installed(second["id"])["selection"], second["selection"])
        self.assertEqual(self.submit("same"), r1)
        self.assertEqual(self.queue.selection()["items"], [{**r3, "installed_revision": r2}])

    def test_historical_and_current_revision_bases_survive_restart(self):
        self.queue.set_base(self.base)
        r1 = self.submit("same")
        self.complete(self.queue.freeze(), base(132))
        r2 = self.submit("same", 2, base_id=base(132)["id"])
        intent = self.queue.freeze()
        self.assertEqual(intent["selection"]["items"], [{**r2, "installed_revision": r1}])
        ready = self.ready(intent["selection"], base(133), "second archive")
        script = (
            "from pathlib import Path; import json, sys; sys.path.insert(0, sys.argv[2]); "
            "from release_queue_store import QueueStore; "
            "q = QueueStore(Path(sys.argv[1])); i = q.freeze(); "
            "print(json.dumps([i, q.candidate(i['selection']['key']), q.status()]))"
        )
        scripts = Path(__file__).resolve().parents[1] / "scripts"
        fresh = subprocess.run([sys.executable, "-B", "-c", script, str(self.path), str(scripts)],
                               cwd=Path(__file__).resolve().parent, capture_output=True, check=True, timeout=15)
        reopened_intent, candidate, status = json.loads(fresh.stdout)
        self.assertEqual(reopened_intent, intent)
        self.assertEqual(candidate, {"key": intent["selection"]["key"], "state": "ready", "details": ready})
        self.assertEqual(status["selection"]["key"], intent["selection"]["key"])
        self.assertEqual(status["pending_install"]["candidate_state"], "ready")
        self.assertEqual(status["tasks"][0]["installed_revision"], 1)

    def test_candidate_identity_and_ready_survives_late_error(self):
        self.queue.set_base(self.base)
        self.submit("same")
        self.complete(self.queue.freeze(), base(132), "first archive")
        self.submit("same", 2)
        selection = self.queue.selection()
        for field in ("key", "base", "payload", "installed_revision"):
            forged = deepcopy(selection)
            if field == "key":
                forged["key"] = digest("forged selection")
            elif field == "base":
                forged["base"]["proof"]["reviewed"] = False
            elif field == "payload":
                forged["items"][0][field]["files"][0]["after"] = "ZmFrZQ=="
            else:
                forged["items"][0][field] = None
            with self.subTest(field=field), self.assertRaises(QueueError):
                self.ready(forged, base(133))
        blocked = self.queue.save_candidate(selection, "blocked", {"reason": "merge conflict"})
        self.assertEqual(blocked["state"], "blocked")
        ready = self.ready(selection, base(133))
        retained = self.queue.save_candidate(selection, "blocked", {"reason": "late failure"})
        self.assertEqual(retained, {"key": selection["key"], "state": "ready", "details": ready})
        self.assertEqual(self.queue.candidate(selection["key"]), retained)
        self.complete(self.queue.freeze(), base(133))
        self.assertEqual(self.queue.save_candidate(selection, "ready", ready), retained)

    def test_rejects_false_success_wrong_selection_and_old_zip(self):
        self.queue.set_base(self.base)
        self.submit("first")
        old = self.queue.selection()
        new_base = base(132)
        old_ready = self.ready(old, new_base, "old archive")
        self.submit("second")
        intent = self.queue.freeze()
        key = intent["selection"]["key"]
        old_receipt = receipt(intent, old_ready, new_base)
        with self.assertRaisesRegex(QueueError, "frozen install request"):
            self.queue.complete_install(intent["id"], old["key"], new_base, old_receipt)
        with self.assertRaisesRegex(QueueError, "no ready candidate"):
            self.queue.complete_install(intent["id"], key, new_base, old_receipt)
        self.queue.save_candidate(intent["selection"], "blocked", {"reason": "test failure"})
        with self.assertRaisesRegex(QueueError, "no ready candidate"):
            self.queue.complete_install(intent["id"], key, new_base, old_receipt)
        with self.assertRaisesRegex(QueueError, "newer"):
            self.ready(intent["selection"], self.base)
        self.ready(intent["selection"], new_base, "old archive")
        with self.assertRaisesRegex(QueueError, "retired"):
            self.ready(intent["selection"], new_base, "verified replacement archive")
        previous = self.queue.candidate(key)
        self.queue.requeue_candidate(intent["selection"], previous, "review replacement", {})
        with self.assertRaisesRegex(QueueError, "no ready candidate"):
            self.queue.complete_install(intent["id"], key, new_base, old_receipt)
        ready = self.ready(intent["selection"], new_base, "verified replacement archive")
        good_receipt = receipt(intent, ready, new_base)
        for invalid in (old_receipt, dict(ready), {**good_receipt, "verified": False},
                        {**good_receipt, "verified": 1}, {**good_receipt, "new_base_id": digest("wrong base")},
                        {**good_receipt, "version": "0.15.130"}):
            with self.subTest(invalid=invalid), self.assertRaises(QueueError):
                self.queue.complete_install(intent["id"], key, new_base, invalid)
        self.assertEqual(self.queue.current_base(), self.base)
        self.assertEqual(self.queue.pending_install(), intent)
        self.assertIsNone(self.queue.installed(intent["id"]))
        self.assertEqual(len(self.queue.selection()["items"]), 2)
        self.queue.complete_install(intent["id"], key, new_base, good_receipt)
        self.assertEqual(self.queue.current_base(), new_base)

    def test_commit_retry_is_idempotent_even_after_later_release(self):
        self.queue.set_base(self.base)
        self.submit("first")
        intent = self.queue.freeze()
        key = intent["selection"]["key"]
        new_base = base(132)
        ready = self.ready(intent["selection"], new_base)
        proof = receipt(intent, ready, new_base)
        installed = self.queue.complete_install(intent["id"], key, new_base, proof)
        self.queue = QueueStore(self.path)
        self.assertEqual(self.queue.installed(intent["id"]), installed)
        self.assertEqual(self.queue.complete_install(intent["id"], key, new_base, proof), installed)
        self.submit("first", 2)
        self.complete(self.queue.freeze(), base(133), "second archive")
        self.assertEqual(self.queue.complete_install(intent["id"], key, new_base, proof), installed)
        self.assertEqual(self.queue.current_base(), base(133))
        self.assertIsNone(self.queue.freeze())
        with self.assertRaisesRegex(QueueError, "already installed"):
            self.queue.complete_install(intent["id"], key, new_base, {**proof, "changed": True})

    def test_cancel_closes_only_its_intent_and_rejects_old_receipt(self):
        self.queue.set_base(self.base)
        self.submit("same")
        intent = self.queue.freeze()
        new_base = base(132)
        key = intent["selection"]["key"]
        ready = self.ready(intent["selection"], new_base)
        proof = receipt(intent, ready, new_base)
        cancelled = {"id": intent["id"], "state": "cancelled"}
        self.assertEqual(self.queue.cancel(intent["id"]), cancelled)
        self.assertEqual(self.queue.cancel(intent["id"]), cancelled)
        self.assertIsNone(self.queue.pending_install())
        self.assertIsNone(self.queue.installed(intent["id"]))
        next_intent = self.queue.freeze()
        self.assertNotEqual(next_intent["id"], intent["id"])
        self.assertEqual(next_intent["selection"]["key"], key)
        with self.assertRaisesRegex(QueueError, "no longer open"):
            self.queue.complete_install(intent["id"], key, new_base, proof)
        with self.assertRaisesRegex(QueueError, "does not match the intent"):
            self.queue.complete_install(next_intent["id"], key, new_base, proof)
        self.assertEqual(self.queue.pending_install(), next_intent)
        self.queue.complete_install(next_intent["id"], key, new_base, receipt(next_intent, ready, new_base))
        with self.assertRaises(QueueError):
            self.queue.cancel(next_intent["id"])

    def test_install_transaction_rolls_back_if_one_revision_update_fails(self):
        self.queue.set_base(self.base)
        self.submit("first")
        self.submit("second")
        intent = self.queue.freeze()
        new_base = base(132)
        ready = self.ready(intent["selection"], new_base)
        key = intent["selection"]["key"]
        proof = receipt(intent, ready, new_base)
        connection = sqlite3.connect(self.path)
        try:
            with connection:
                connection.execute("""CREATE TRIGGER fail_second BEFORE UPDATE ON revisions
                    WHEN NEW.task_id = 'second' BEGIN SELECT RAISE(ABORT, 'forced failure'); END""")
            with self.assertRaisesRegex(QueueError, "forced failure"):
                self.queue.complete_install(intent["id"], key, new_base, proof)
            self.assertEqual(self.queue.pending_install(), intent)
            self.assertEqual(self.queue.current_base(), self.base)
            self.assertEqual(len(self.queue.selection()["items"]), 2)
            self.assertIsNone(self.queue.installed(intent["id"]))
            with connection:
                connection.execute("DROP TRIGGER fail_second")
        finally:
            connection.close()
        self.queue.complete_install(intent["id"], key, new_base, proof)
        self.assertIsNone(self.queue.freeze())

    def test_database_and_sidecars_reject_links_and_unsafe_paths(self):
        root = self.path.parent
        with self.assertRaises(QueueError):
            QueueStore(root / "child" / ".." / "unexpected.sqlite")
        self.assertFalse((root / "unexpected.sqlite").exists())
        if os.name == "nt":
            for name in ("CON.sqlite", "queue:stream", "ends-with-space "):
                with self.subTest(name=name), self.assertRaises(QueueError):
                    QueueStore(root / name)
        alias = root / "hardlink.sqlite"
        os.link(self.path, alias)
        with self.assertRaisesRegex(QueueError, "singly linked"):
            QueueStore(alias)
        alias.unlink()
        other = root / "other.sqlite"
        other.write_bytes(b"do not touch")
        sidecar = self.path.with_name(self.path.name + "-journal")
        os.link(other, sidecar)
        with self.assertRaisesRegex(QueueError, "singly linked"):
            self.queue.current_base()
        self.assertEqual(other.read_bytes(), b"do not touch")

    def test_unrelated_database_is_refused(self):
        path = self.path.with_name("other.sqlite")
        connection = sqlite3.connect(path)
        try:
            with connection:
                connection.execute("CREATE TABLE unrelated (data TEXT)")
        finally:
            connection.close()
        previous = path.read_bytes()
        with self.assertRaisesRegex(QueueError, "not a supported release queue"):
            QueueStore(path)
        self.assertEqual(path.read_bytes(), previous)


if __name__ == "__main__":
    unittest.main(verbosity=2)

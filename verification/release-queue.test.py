"""Exercise the queue, exact ZIP selection and recovery through the release entry point."""

from argparse import Namespace
from pathlib import Path
import json
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile, ZipInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import release_queue as queue
import release_queue_build as builds
import release_queue_install as installer
import release_workflow as workflow
from release_queue_store import QueueError, QueueStore


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


class IsolatedMaintenance:
    proven = True

    def __init__(self, targets, release):
        self.targets = set(targets)
        self.release = release
        self.active = None
        self.gateway_ready = True
        self.fail_leave = False

    def validate_targets(self, intent, paths):
        assert set(paths) == self.targets

    def enter(self, intent):
        assert self.active in (None, intent)
        self.active = intent

    def verify_base(self, intent, expected):
        assert self.active == intent

    def probe(self, intent, version, expected):
        assert self.active == intent
        return {"intent_id": intent, "version": version, "evidence": {
            "release_version": self.release["version"],
            "archive_sha256": self.release["archive_sha256"],
            "desktop_loaded": True, "gateway_ready": self.gateway_ready or version == "old",
            "installed_components_verified": True,
        }}

    def leave(self, intent):
        assert self.active in (None, intent)
        if self.fail_leave:
            raise RuntimeError("interrupted while leaving maintenance")
        self.active = None


class QueueWorkflowTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix="hcv-queue-integration-")
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        self.project = root / "project"
        self.state = root / "registry"
        self.installation = root / "hermes-fixture"
        self.version = "1.2.9"
        self.write_project()
        self.base_id = builds.fingerprint(self.project)["id"]
        self.store = QueueStore(self.state / "registry.sqlite3")
        self.store.set_base(builds.snapshot(self.project, self.state / "bases", self.base_id))
        self.candidate_calls = []

    def write_project(self):
        project = self.project
        write(project / "package.json", json.dumps({
            "name": "hermes-codex-visual", "version": self.version,
        }).encode())
        write(project / "package-lock.json", json.dumps({
            "version": self.version, "packages": {"": {"version": self.version}},
        }).encode())
        write(project / "LICENSE", b"License\n")
        write(project / "THIRD_PARTY_NOTICES.txt", b"Notices\n")
        write(project / "verification/sandbox.spec.mjs",
              b"process.env.HERMES_VISUAL_FOCUS === 'sidebar-activity'\n"
              b"process.env.HERMES_VISUAL_FOCUS === 'composer'\n"
              b"process.env.HERMES_VISUAL_FOCUS === 'zoom-banner'\n")
        actual = Path(queue.__file__).resolve().with_name("package.py")
        (project / "scripts").mkdir(parents=True)
        shutil.copyfile(actual, project / "scripts/package.py")
        for number in range(1, 12):
            write(project / self.feature(number), b"off\n")

    @staticmethod
    def feature(number):
        return f"source/feature-{number:02d}.txt"

    def handoff(self, number, revision=1, focus="sidebar-activity"):
        path = self.feature(number)
        task = f"task-{number:02d}"
        result = queue.begin_task(self.store, self.state, task, task, [path])
        write(Path(result["candidate"]) / path, f"on-{number}-{revision}\n".encode())
        options = Namespace(task=task, revision=revision, evidence="focused check passed",
                            bundle=None, files=[path], deletions=[], sha256=None,
                            check=[focus])
        return queue.submit_task(self.project, self.state, self.store, options)

    def build_fixture(self, project, state, selection, version):
        # Only the external compile and Hermes scenario are substituted here.
        # The real input snapshot, merge, exact receipts and install path run.
        self.candidate_calls.append(selection["key"])
        job = state / "builds" / f"{selection['key'][:8]}-fixture-{len(self.candidate_calls)}"
        job.mkdir(parents=True)
        _, files, checks, _ = builds._combine(state / "bases", selection, job)
        builds._set_version(files, version)
        workspace = job / "workspace"
        for name, data in files.items():
            write(workspace / name, data)
        new_base_id = builds.fingerprint(workspace)["id"]
        new_base = builds.snapshot(workspace, state / "bases", new_base_id)
        plugin = b"".join(files[self.feature(number)] for number in range(1, 12))
        write(workspace / ".local/plugin.js", plugin)
        archive = job / "release.zip"
        with ZipFile(archive, "w") as package:
            for name, data in {
                "plugin.js": plugin, "LICENSE": files["LICENSE"],
                "THIRD_PARTY_NOTICES.txt": files["THIRD_PARTY_NOTICES.txt"],
            }.items():
                package.writestr(ZipInfo("hermes-codex-visual/" + name), data)
        journal = job / "test-receipt.json"
        write(journal, b"isolated fixture verification")
        return {"selection_key": selection["key"], "version": version, "checks": checks,
                "snapshot": new_base, "workspace": str(workspace), "archive": str(archive),
                "archive_sha256": workflow.digest(archive.read_bytes()), "test_only": False,
                "journal": str(journal), "journal_sha256": workflow.digest(journal.read_bytes())}

    def prepare(self, **options):
        with patch.object(queue.builder, "prepare", self.build_fixture):
            return queue.prepare_pending(self.project, self.state, self.store, **options)

    def plan(self, candidate):
        desktop = self.installation / "plugin.js"
        server = self.installation / "backend.txt"
        for path in (desktop, server):
            write(path, b"previous")
        previous = workflow.digest(b"previous")
        maintenance = IsolatedMaintenance((desktop, server), candidate)

        def targets(old, new, files, receipt):
            return [{"target": desktop, "before": previous, "after": files["plugin.js"]},
                    {"target": server, "before": previous, "after": files["LICENSE"]}]

        return desktop, server, maintenance, targets

    def test_two_waves_exact_zip_once_and_late_revision_kept(self):
        for number in range(1, 6):
            self.handoff(number)
        self.prepare()
        for number in range(6, 11):
            self.handoff(number)
        self.prepare()
        request = queue.request_install(self.project, self.state, self.store)
        self.assertEqual(request["status"], "waiting_for_maintenance")
        self.assertEqual(len(request["items"]), 10)
        self.handoff(3, 2)
        self.handoff(11)
        key = self.store.pending_install()["selection"]["key"]
        candidate = self.store.candidate(key)["details"]
        desktop, server, maintenance, plan = self.plan(candidate)
        with patch.object(queue.builder, "prepare", side_effect=AssertionError("unexpected rebuild")):
            applied = queue.request_install(self.project, self.state, self.store,
                                            maintenance=maintenance, plan=plan)
        self.assertEqual(applied["status"], "committed")
        self.assertEqual(applied["request"], request["request"])
        self.assertEqual(len(self.candidate_calls), 2)
        self.assertEqual(desktop.read_bytes(), b"".join(
            [f"on-{number}-1\n".encode() for number in range(1, 11)] + [b"off\n"]))
        self.assertEqual(server.read_bytes(), b"License\n")
        reopened = QueueStore(self.store.path)
        self.assertEqual(reopened.current_base()["version"], "1.2.10")
        self.assertEqual([(item["task_id"], item["revision"]) for item in reopened.selection()["items"]],
                         [("task-03", 2), ("task-11", 1)])
        self.prepare()
        next_candidate = self.store.candidate(self.store.selection()["key"])["details"]
        with ZipFile(next_candidate["archive"]) as archive:
            contents = archive.read("hermes-codex-visual/plugin.js")
        self.assertIn(b"on-3-2\n", contents)
        self.assertIn(b"on-11-1\n", contents)
        self.assertIn(b"on-10-1\n", contents)

    def test_waiting_command_installs_its_original_selection_when_background_finishes(self):
        self.handoff(1)
        calls = []

        def install(project, state, store, apply, *, request):
            calls.append(request)
            pending = store.pending_install()
            candidate = store.candidate(pending["selection"]["key"]) if pending else None
            if candidate is None:
                return apply(project, state, store, request=request)
            _, _, maintenance, plan = self.plan(candidate["details"])
            return apply(project, state, store, maintenance=maintenance, plan=plan, request=request)

        def worker_finishes(_seconds):
            self.handoff(2)
            self.prepare()

        with patch.object(queue, "launch_worker", return_value={"worker": "notified"}), \
                patch.object(queue.time, "sleep", side_effect=worker_finishes):
            result = queue.run_live_install(self.project, self.state, self.store, install, None)

        self.assertEqual(calls, [None, result["request"]])
        self.assertEqual(result["status"], "committed")
        progress = {task["task_id"]: task["installed_revision"] for task in self.store.status()["tasks"]}
        self.assertEqual(progress, {"task-01": 1, "task-02": None})

    def test_freeze_during_preparation_does_not_use_old_zip(self):
        self.handoff(1)
        self.prepare()
        self.handoff(2)
        with patch.object(queue, "launch_worker", return_value={"worker": "notified"}):
            request = queue.request_install(self.project, self.state, self.store)
            self.handoff(3)
            repeated = queue.request_install(self.project, self.state, self.store)
        self.assertEqual(request, repeated)
        self.assertEqual(request["status"], "preparing")
        self.assertEqual([item["task"] for item in request["items"]], ["task-01", "task-02"])
        self.assertEqual(queue.cancel_request(self.state, self.store, request["request"])["state"], "cancelled")
        self.assertEqual(len(self.store.selection()["items"]), 3)

    def test_actually_read_archive_and_verification_receipt(self):
        self.handoff(1)
        self.prepare()
        key = self.store.selection()["key"]
        candidate = self.store.candidate(key)["details"]
        Path(candidate["archive"]).write_bytes(b"changed")
        with patch.object(queue, "launch_worker", return_value={"worker": "notified"}):
            outcome = queue.request_install(self.project, self.state, self.store)
        self.assertEqual(outcome["status"], "preparing")
        self.assertIn("archive changed", outcome["reason"])
        self.assertIsNotNone(self.store.pending_install())
        self.prepare()
        ready_again = self.store.candidate(key)["details"]
        self.assertEqual(ready_again["archive_sha256"], candidate["archive_sha256"])
        self.assertNotEqual(ready_again["archive"], candidate["archive"])
        self.assertEqual(self.candidate_calls, [key, key])

    def test_gateway_failure_rolls_back_and_retry_reuses_same_archive(self):
        self.handoff(1)
        self.prepare()
        key = self.store.selection()["key"]
        candidate = self.store.candidate(key)["details"]
        desktop, server, maintenance, plan = self.plan(candidate)
        maintenance.gateway_ready = False
        with self.assertRaisesRegex(installer.InstallError, "Previous release restored"):
            queue.request_install(self.project, self.state, self.store, maintenance=maintenance, plan=plan)
        self.assertEqual(self.store.current_base()["id"], self.base_id)
        self.assertEqual(desktop.read_bytes(), b"previous")
        self.assertEqual(server.read_bytes(), b"previous")
        pending = self.store.pending_install()["id"]
        maintenance.gateway_ready = True
        result = queue.request_install(self.project, self.state, self.store, maintenance=maintenance, plan=plan)
        self.assertEqual(result["status"], "committed")
        self.assertEqual(result["request"], pending)
        self.assertEqual(self.candidate_calls, [key])

    def test_recovery_after_commit_returns_old_request_and_does_not_freeze_next(self):
        self.handoff(1)
        self.prepare()
        request = queue.request_install(self.project, self.state, self.store)
        key = self.store.pending_install()["selection"]["key"]
        self.handoff(2)
        _, _, maintenance, plan = self.plan(self.store.candidate(key)["details"])
        maintenance.fail_leave = True
        with self.assertRaisesRegex(installer.InstallError, "interrupted"):
            queue.request_install(self.project, self.state, self.store, maintenance=maintenance, plan=plan)
        self.assertIsNotNone(self.store.installed(request["request"]))
        maintenance.fail_leave = False
        recovered = queue.request_install(self.project, self.state, self.store, maintenance=maintenance, plan=plan)
        self.assertTrue(recovered["recovered"])
        self.assertEqual(recovered["request"], request["request"])
        self.assertEqual(recovered["status"], "committed")
        self.assertIsNone(self.store.pending_install())
        repeated = queue.request_install(self.project, self.state, self.store, request=request["request"])
        self.assertEqual(repeated["status"], "committed")
        self.assertEqual([row["task_id"] for row in self.store.selection()["items"]], ["task-02"])

    def test_querying_completed_request_does_not_recover_a_different_request(self):
        self.handoff(1)
        self.prepare()
        key = self.store.selection()["key"]
        _, _, first_maintenance, first_plan = self.plan(self.store.candidate(key)["details"])
        first = queue.request_install(self.project, self.state, self.store,
                                      maintenance=first_maintenance, plan=first_plan)
        self.handoff(2)
        self.prepare()
        key = self.store.selection()["key"]
        _, _, second_maintenance, second_plan = self.plan(self.store.candidate(key)["details"])
        second_maintenance.fail_leave = True
        with self.assertRaisesRegex(installer.InstallError, "interrupted"):
            queue.request_install(self.project, self.state, self.store,
                                  maintenance=second_maintenance, plan=second_plan)
        second_id = second_maintenance.active
        self.assertIsNotNone(second_id)
        second_maintenance.fail_leave = False
        previous = queue.request_install(self.project, self.state, self.store,
                                         maintenance=second_maintenance, plan=second_plan, request=first["request"])
        self.assertEqual(previous["status"], "committed")
        self.assertEqual(previous["request"], first["request"])
        self.assertEqual(second_maintenance.active, second_id)
        recovered = queue.request_install(self.project, self.state, self.store, maintenance=second_maintenance,
                                          plan=second_plan, request=second_id)
        self.assertTrue(recovered["recovered"])
        self.assertEqual(recovered["request"], second_id)

    def test_missing_workspace_file_is_repaired_from_exact_selection(self):
        self.handoff(1)
        self.prepare()
        key = self.store.selection()["key"]
        previous = self.store.candidate(key)["details"]
        (Path(previous["workspace"]) / ".local/plugin.js").unlink()
        result = self.prepare(retry=True)
        self.assertEqual(result["processed"][0]["status"], "ready")
        repaired = self.store.candidate(key)["details"]
        self.assertEqual(repaired["archive_sha256"], previous["archive_sha256"])
        self.assertNotEqual(repaired["workspace"], previous["workspace"])
        self.assertEqual(queue.request_install(self.project, self.state, self.store)["status"],
                         "waiting_for_maintenance")

    def test_reject_scenario_without_branch_proof_before_accepting_submission(self):
        with self.assertRaisesRegex(QueueError, "registered result.*composer"):
            self.handoff(1, focus="composer")
        self.assertEqual(self.store.selection()["items"], [])

    def test_requesting_additional_focus_revalidates_the_same_zip(self):
        self.handoff(1)
        self.prepare()
        key = self.store.selection()["key"]
        prior = self.store.candidate(key)["details"]
        self.prepare(retry=True, selection_key=key, integration_checks=["zoom-banner"])
        ready = self.store.candidate(key)["details"]
        self.assertEqual(ready["archive_sha256"], prior["archive_sha256"])
        self.assertEqual(ready["checks"], ["sidebar-activity", "zoom-banner"])
        self.assertEqual(self.candidate_calls, [key, key])

    def test_recover_completed_build_without_running_builder_again(self):
        self.handoff(1)
        selected = self.store.selection()
        receipt = self.build_fixture(self.project, self.state, selected, "1.2.10")
        with patch.object(queue.builder, "recover_prepared", return_value=receipt), patch.object(
                queue.builder, "prepare", side_effect=AssertionError("completed build was repeated")):
            result = queue.prepare_pending(self.project, self.state, self.store)
        self.assertEqual(result["processed"][0]["status"], "ready")
        self.assertEqual(self.store.candidate(selected["key"])["details"], receipt)


if __name__ == "__main__":
    unittest.main(verbosity=2)

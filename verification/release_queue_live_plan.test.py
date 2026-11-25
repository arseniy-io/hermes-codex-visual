"""Use synthetic release trees and the real queue/journal on private paths."""

import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from zipfile import ZipFile

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT / "scripts"))

import release_queue as queue
import release_queue_build as builder
import release_queue_install as engine
import release_workflow as workflow
from release_queue_live_plan import ActiveCore, PlanError, describe_core, make_plan


PLUGIN = "hermes-codex-visual"
CORE_TARGET = "agent/turn_context.py"
CORE_HELPER = "agent/hcv_timeline.py"
CORE_BYTES = b"active turn context\n"
HELPER_BYTES = b"exact compatible helper\n"
AGENT_FILES = (
    "__init__.py", "assistant.py", "activity.py", "turn_changes.py", "timeline.py",
    "agent_receipts.py", "dashboard/manifest.json", "dashboard/plugin_api.py",
)


def put(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def write_json(path, value):
    put(path, json.dumps(value).encode("utf-8"))


def read(path):
    try:
        return path.read_bytes()
    except FileNotFoundError:
        return None


class Registry:
    result = None

    def complete_install(self, intent, selection, base, confirmation):
        self.result = intent, selection, base, confirmation

    def installed(self, intent):
        return self.result if self.result and self.result[0] == intent else None


class Maintenance:
    proven = True

    def __init__(self, receipt, changes, *, fail=False):
        self.receipt = receipt
        self.changes = {change["target"]: change for change in changes}
        self.fail = fail
        self.active = None
        self.probes = []

    def validate_targets(self, intent, targets):
        assert set(targets) == self.changes.keys()

    def enter(self, intent):
        assert self.active in (None, intent)
        self.active = intent

    def verify_base(self, intent, expected):
        assert self.active == intent
        assert expected == {name: value["before"] for name, value in self.changes.items()}

    def probe(self, intent, version, expected):
        assert self.active == intent
        for target, digest in expected.items():
            data = read(target)
            assert (None if data is None else workflow.digest(data)) == digest
        self.probes.append(version)
        if self.fail and version == "new":
            raise engine.InstallError("Isolated gateway unavailable")
        return {"intent_id": intent, "version": version, "evidence": {
            "release_version": self.receipt["version"],
            "archive_sha256": self.receipt["archive_sha256"],
            "desktop_loaded": True,
            "gateway_ready": True,
            "installed_components_verified": True,
        }}

    def leave(self, intent):
        assert self.active == intent
        self.active = None


class PlanTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix="hcv-release-plan-")
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.project = self.root / "project"
        self.state = self.root / "state"
        self.desktop = self.root / "desktop" / PLUGIN
        self.agent = self.root / "agent" / PLUGIN
        self.core = self.root / "core"
        self.workspace = self.state / "build" / "workspace"
        self.old_workspace = self.root / "old-workspace"
        old = self.build(self.old_workspace, "1.0.0", "old")
        ready = self.build(self.workspace, "1.0.1", "new")
        self.old, self.old_archive, self.old_members, self.old_agents = old
        self.new, self.archive, self.members, self.agents = ready
        self.old["archive_sha256"] = workflow.digest(self.old_archive.read_bytes())
        shutil.copytree(self.old_workspace, self.project)
        self.old_archive = self.project / "dist" / self.old_archive.name
        put(self.desktop / "plugin.js", self.old_members["plugin.js"])
        for name in self.old_agents:
            put(self.agent / name, self.old_members[name])
        put(self.core / CORE_TARGET, CORE_BYTES)
        put(self.core / CORE_HELPER, HELPER_BYTES)
        old_bundle, _ = describe_core(self.old_members, self.old_agents)
        new_bundle, _ = describe_core(self.members, self.agents)
        self.evidence = ActiveCore(old_bundle, new_bundle, {
            CORE_TARGET: workflow.digest(CORE_BYTES), CORE_HELPER: workflow.digest(HELPER_BYTES),
        })
        outputs = workflow.build_outputs(self.workspace, workflow.read_json(self.workspace / "package.json"),
                                         self.agents) + [".local/plugin.js"]
        self.receipt = {
            "version": self.new["version"], "snapshot": self.new, "workspace": str(self.workspace),
            "archive": str(self.archive), "archive_sha256": workflow.digest(self.archive.read_bytes()),
            "test_only": False,
            "outputs": {name: {"path": str(self.workspace / name),
                               "sha256": workflow.digest((self.workspace / name).read_bytes())}
                        for name in outputs},
        }

    def build(self, root, version, label, *, agent_version=None):
        manifest = {"name": PLUGIN, "version": version, "hermesAgentPackage": True, "hermesTimelineCore": True}
        write_json(root / "package.json", manifest)
        write_json(root / "package-lock.json", {"version": version})
        put(root / "LICENSE", b"fixture license\n")
        put(root / "THIRD_PARTY_NOTICES.txt", b"fixture notices\n")
        put(root / f"source/{label}.js", label.encode())
        put(root / "source/untouched.js", b"common")
        put(root / "verification/sandbox.spec.mjs", b"fixture\n")
        for name in ("package.py", "build.mjs"):
            put(root / "scripts" / name, (PROJECT / "scripts" / name).read_bytes())
        put(root / "scripts/stage-hermes-timeline.py", b"# synthetic core stage\n")
        put(root / "scripts/install-hermes-timeline.py", b"# synthetic installer\n")
        folder = root / "source/hermes-timeline"
        put(folder / "timing.py", HELPER_BYTES)
        for name in ("file_capture.py", "core.patch", "README.md"):
            put(folder / name, b"fixture\n")
        write_json(folder / "manifest.json", {
            "version": 1, "files": {CORE_TARGET: {"candidate": workflow.digest(CORE_BYTES)}},
            "helpers": [{"source": "timing.py", "target": CORE_HELPER, "candidate": workflow.digest(HELPER_BYTES)}],
        })
        backend = root / "source/usage-backend"
        put(backend / "plugin.yaml", f"version: {agent_version or version}\n".encode())
        for name in AGENT_FILES:
            put(backend / name, (name + "\n").encode())
        put(backend / "activity.py", label.encode())
        put(root / "plugin.js", ("module " + label).encode())
        put(root / ".local/plugin.js", (root / "plugin.js").read_bytes())
        declared, agents = workflow.declared_files(root, manifest)
        for name in agents:
            put(root / name, declared[name].read_bytes())
        archive = root / "dist" / f"{PLUGIN}-v{version}-local.zip"
        archive.parent.mkdir()
        with ZipFile(archive, "w") as package:
            for name, source in declared.items():
                package.writestr(PLUGIN + "/" + name, source.read_bytes())
        put(root / "dist/SHA256SUMS.txt",
            f"{workflow.digest(archive.read_bytes())}  {archive.name}\n"
            f"{workflow.digest((root / 'plugin.js').read_bytes())}  plugin.js\n".encode())
        base = builder.snapshot(root, self.state / "bases", builder.fingerprint(root)["id"])
        if agent_version is not None:
            return base, archive, {name: source.read_bytes() for name, source in declared.items()}, agents
        _, members, _, _ = workflow.read_archive(root, archive)
        return base, archive, members, agents

    def callback(self, **settings):
        settings.setdefault("active_core", self.evidence)
        return make_plan(self.project, self.state, self.desktop, self.agent, self.core, **settings)

    def plan(self, **settings):
        return self.callback(**settings)(self.old, self.new, self.members, self.receipt)

    def apply(self, callback, maintenance, store):
        intent = {"id": "f" * 64, "selection": {"base": self.old, "key": "selection"}}
        return queue.apply_ready(self.state, store, intent, self.receipt, maintenance, callback)

    def test_exact_archived_components_shared_outputs_and_core_guards(self):
        put(self.project / "source/untouched.js", b"independent edit")
        changes = self.plan()
        mapped = {row["target"]: row for row in changes}
        self.assertEqual(mapped[self.desktop / "plugin.js"]["after"], self.members["plugin.js"])
        for name in self.agents:
            if self.old_members.get(name) == self.members[name]:
                self.assertNotIn(self.agent / name, mapped)
            else:
                self.assertEqual(mapped[self.agent / name]["after"], self.members[name])
        self.assertEqual(mapped[self.project / "dist" / self.archive.name]["after"], self.archive.read_bytes())
        self.assertEqual(mapped[self.project / "source/old.js"]["after"], None)
        self.assertEqual(mapped[self.project / "source/new.js"]["before"], None)
        self.assertEqual(mapped[self.core / CORE_TARGET]["before"], workflow.digest(CORE_BYTES))
        self.assertEqual(mapped[self.core / CORE_TARGET]["after"], CORE_BYTES)
        self.assertNotIn(self.project / "source/untouched.js", mapped)
        self.assertNotIn(self.desktop / "LICENSE", mapped)
        self.assertNotIn(self.agent / "source/hermes-timeline/timing.py", mapped)
        self.assertEqual((self.desktop / "plugin.js").read_bytes(), self.old_members["plugin.js"])
        self.assertFalse((self.project / "dist" / self.archive.name).exists())

    def test_project_cas_preserves_foreign_and_allows_exact_preapplied(self):
        affected = self.project / "source/new.js"
        put(affected, b"unrelated work")
        with self.assertRaisesRegex(PlanError, "Unreviewed file.*new.js"):
            self.plan()
        put(affected, b"reconciled project release")
        changes = self.plan(project_before={"source/new.js": workflow.digest(b"reconciled project release")})
        self.assertEqual(next(row["before"] for row in changes if row["target"] == affected),
                         workflow.digest(b"reconciled project release"))
        put(affected, b"new")
        changes = self.plan()
        self.assertNotIn(affected, {row["target"] for row in changes})
        put(self.project / "dist" / self.archive.name, b"foreign ZIP")
        with self.assertRaisesRegex(PlanError, "Unreviewed file.*local.zip"):
            self.plan()

    def test_known_mixed_installed_base_and_hardlink_refusal(self):
        put(self.desktop / "plugin.js", b"separately verified Desktop")
        with self.assertRaisesRegex(PlanError, "Unreviewed file.*plugin.js"):
            self.plan()
        pins = {"plugin.js": workflow.digest(b"separately verified Desktop")}
        changes = {row["target"]: row for row in self.plan(installed_before=pins)}
        self.assertEqual(changes[self.desktop / "plugin.js"]["before"], pins["plugin.js"])
        os.link(self.agent / "assistant.py", self.root / "unchanged-hardlink")
        self.assertNotIn(self.agent / "assistant.py", {row["target"] for row in self.plan(installed_before=pins)})
        os.link(self.agent / "plugin.yaml", self.root / "changed-hardlink")
        with self.assertRaisesRegex(PlanError, "independent regular file.*plugin.yaml"):
            self.plan(installed_before=pins)

    def test_legacy_base_loads_archived_zip_and_checks_split_version(self):
        previous, archive, members, _ = self.build(self.root / "legacy", "1.0.0", "old",
                                                    agent_version="0.9.9")
        archived = self.state / "archives" / archive.name
        put(archived, archive.read_bytes())
        self.old = dict(previous, archive=str(archived), archive_sha256=workflow.digest(archive.read_bytes()),
                        agent_version="0.9.9")
        for target in (self.agent / "plugin.yaml", self.project / "plugin.yaml",
                       self.project / "source/usage-backend/plugin.yaml"):
            put(target, members["plugin.yaml"])
        put(self.project / "dist/SHA256SUMS.txt", (archive.parent / "SHA256SUMS.txt").read_bytes())
        changes = {row["target"]: row for row in self.plan()}
        self.assertEqual(changes[self.agent / "plugin.yaml"]["before"], workflow.digest(members["plugin.yaml"]))
        self.assertEqual(changes[self.agent / "plugin.yaml"]["after"], b"version: 1.0.1\n")
        del self.old["agent_version"]
        with self.assertRaisesRegex(PlanError, "Previous ZIP agent version differs"):
            self.plan()
        self.old["archive"] = str(archive)
        with self.assertRaisesRegex(PlanError, "inside state/archives"):
            self.plan()

    def test_core_evidence_blocks_missing_drift_and_unapproved_checkout(self):
        with self.assertRaisesRegex(PlanError, "need reviewed active-core evidence"):
            self.plan(active_core=None)
        stale = ActiveCore(self.evidence.old_bundle_sha256, "0" * 64, self.evidence.files)
        with self.assertRaisesRegex(PlanError, "Core bundle differs"):
            self.plan(active_core=stale)
        incomplete = ActiveCore(self.evidence.old_bundle_sha256, self.evidence.new_bundle_sha256, {
            CORE_TARGET: workflow.digest(CORE_BYTES),
        })
        with self.assertRaisesRegex(PlanError, "coverage differs"):
            self.plan(active_core=incomplete)
        put(self.core / CORE_HELPER, b"unexpected")
        with self.assertRaisesRegex(PlanError, "Active core changed"):
            self.plan()
        bogus = ActiveCore(self.evidence.old_bundle_sha256, self.evidence.new_bundle_sha256, {
            **self.evidence.files, CORE_HELPER: workflow.digest(b"unexpected"),
        })
        with self.assertRaisesRegex(PlanError, "not a candidate or approved successor"):
            self.plan(active_core=bogus)

    def test_rejects_tampered_archive_output_and_frozen_source(self):
        desktop = self.workspace / "plugin.js"
        put(desktop, b"unverified output")
        with self.assertRaisesRegex(PlanError, "Ready build output differs.*plugin.js"):
            self.plan()
        put(desktop, self.members["plugin.js"])
        put(self.workspace / "source/new.js", b"changed input")
        with self.assertRaisesRegex(PlanError, "workspace differs"):
            self.plan()
        put(self.workspace / "source/new.js", b"new")
        put(self.archive, b"changed ZIP")
        with self.assertRaisesRegex(PlanError, "ZIP SHA-256 changed"):
            self.plan()

    def test_apply_ready_uses_exact_plan_and_restores_all_touched_paths(self):
        changes = self.plan()
        callback = self.callback()
        old = {row["target"]: read(row["target"]) for row in changes}
        store = Registry()
        failed = Maintenance(self.receipt, changes, fail=True)
        with self.assertRaisesRegex(engine.InstallError, "Previous release restored"):
            self.apply(callback, failed, store)
        self.assertEqual(failed.probes, ["new", "old"])
        self.assertIsNone(store.result)
        self.assertEqual({target: read(target) for target in old}, old)
        maintenance = Maintenance(self.receipt, changes)
        result = self.apply(callback, maintenance, store)
        self.assertEqual(result["status"], "committed")
        self.assertEqual(maintenance.probes, ["new"])
        self.assertEqual(store.result[2]["archive_sha256"], self.receipt["archive_sha256"])
        self.assertEqual({row["target"]: read(row["target"]) for row in changes},
                         {row["target"]: row["after"] for row in changes})

    def test_engine_rejects_foreign_write_after_planning(self):
        changes = self.plan()
        maintenance = Maintenance(self.receipt, changes)
        store = Registry()
        affected = self.project / "source/old.js"

        def stale_plan(old, new, members, receipt):
            put(affected, b"another writer")
            return changes

        with self.assertRaisesRegex(engine.InstallError, "Unexpected bytes, absence or permissions"):
            self.apply(stale_plan, maintenance, store)
        self.assertEqual(affected.read_bytes(), b"another writer")
        self.assertEqual((self.desktop / "plugin.js").read_bytes(), self.old_members["plugin.js"])
        self.assertIsNone(store.result)


if __name__ == "__main__":
    unittest.main()


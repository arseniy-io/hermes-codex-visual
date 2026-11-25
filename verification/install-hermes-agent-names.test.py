"""Check the version-pinned installer on disposable source trees only."""

import contextlib
from hashlib import sha256
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from pinned_hermes_fixture import read_stock_sources


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("hcv_agent_names_installer_test", ROOT / "scripts/install-hermes-agent-names.py")
installer = importlib.util.module_from_spec(spec)
with patch.object(sys, "dont_write_bytecode", True):
    spec.loader.exec_module(installer)
REAL_CORE = installer.stage.CORE.resolve()


def files_under(root):
    return {path.relative_to(root).as_posix(): path.read_bytes() for path in root.rglob("*") if path.is_file()}


class AgentNameInstallerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.baselines = read_stock_sources(REAL_CORE, installer.stage.EXPECTED)
        # Agent names were first installed after the Approval companion.
        approval_spec = importlib.util.spec_from_file_location(
            "hcv_approval_fixture", ROOT / "scripts/stage-hermes-approval-core.py")
        approval = importlib.util.module_from_spec(approval_spec)
        with patch.object(sys, "dont_write_bytecode", True):
            approval_spec.loader.exec_module(approval)
        name = "gateway/session_ancillary.py"
        cls.baselines[name] = approval.ancillary(cls.baselines[name].decode("utf-8")).encode("utf-8")

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="hcv-agent-names-installer-test-")
        self.temp_root = Path(self.temp.name).resolve()
        self.assertTrue(self.temp_root.is_relative_to(Path(tempfile.gettempdir()).resolve()))
        self.addCleanup(self.temp.cleanup)
        self.workspace = self.temp_root / "workspace"
        self.local_appdata = self.temp_root / "localappdata"
        self.core = self.local_appdata / "hermes/hermes-agent"
        self.out = self.temp_root / "staged"
        helper = self.workspace / "source/hermes-agent-names/identity.py"
        helper.parent.mkdir(parents=True)
        helper.write_bytes((ROOT / "source/hermes-agent-names/identity.py").read_bytes())

        self.originals = {}
        for name, original in self.baselines.items():
            self.assertEqual(sha256(original).hexdigest(), installer.stage.EXPECTED[name], "Pinned source drift: " + name)
            target = self.core / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(original)
            self.originals[name] = original

        patches = [patch.object(installer, "ROOT", self.workspace),
                   patch.object(installer.stage, "ROOT", self.workspace),
                   patch.object(installer.stage, "CORE", self.core),
                   patch.object(installer.stage, "OUT", self.out),
                   patch.dict(os.environ, {"LOCALAPPDATA": str(self.local_appdata)}),
                   patch.object(sys, "argv", ["installer-test", "--install"])]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)
        staged_originals, self.candidates = installer.stage.candidates(self.core)
        self.assertEqual(staged_originals, self.originals)
        for name, candidate in self.candidates.items():
            target = self.out / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(candidate)

    def install(self):
        with contextlib.redirect_stdout(io.StringIO()):
            installer.main()

    def test_installs_the_exact_staged_bytes_and_preserves_pinned_backups(self):
        self.install()
        self.assertEqual(files_under(self.core), self.candidates)
        self.assertEqual(files_under(self.out), self.candidates)
        backups = list((self.workspace / ".local").glob("agent-names-core-rollback-*"))
        self.assertEqual(len(backups), 1)
        manifest = json.loads((backups[0] / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(set(manifest), set(self.candidates))
        for name, candidate in self.candidates.items():
            self.assertEqual(manifest[name]["candidate"], sha256(candidate).hexdigest())
            if name in self.originals:
                self.assertEqual((backups[0] / name).read_bytes(), self.originals[name])
                self.assertEqual(manifest[name]["original"], sha256(self.originals[name]).hexdigest())
            else:
                self.assertIsNone(manifest[name]["original"])
                self.assertFalse((backups[0] / name).exists())
        before_repeat = files_under(self.temp_root)
        with self.assertRaises(RuntimeError):
            self.install()
        self.assertEqual(files_under(self.temp_root), before_repeat)

    def test_source_drift_is_refused_before_any_install_or_backup_write(self):
        name = next(iter(self.originals))
        target = self.core / name
        target.write_bytes(self.originals[name] + b"\n# Unrelated concurrent change\n")
        before = files_under(self.temp_root)
        with self.assertRaisesRegex(RuntimeError, "changed|unverified"):
            self.install()
        self.assertEqual(files_under(self.temp_root), before)
        self.assertFalse((self.workspace / ".local").exists())
        self.assertFalse((self.core / "tools/hcv_agent_names.py").exists())

    def test_staged_byte_drift_is_refused_without_changing_the_core(self):
        target = self.out / "tools/hcv_agent_names.py"
        target.write_bytes(target.read_bytes() + b"\n# Not the tested artifact\n")
        before = files_under(self.temp_root)
        with self.assertRaisesRegex(RuntimeError, "staged source differs"):
            self.install()
        self.assertEqual(files_under(self.temp_root), before)
        self.assertFalse((self.workspace / ".local").exists())

    def test_failed_temporary_cleanup_rolls_back_the_already_linked_helper(self):
        before = files_under(self.core)
        native_unlink = Path.unlink
        blocked = False

        def unlink_once(path, *args, **kwargs):
            nonlocal blocked
            if not blocked and path.name.startswith("hcv_agent_names.py.hcv-"):
                blocked = True
                raise PermissionError("simulated temporary-file lock")
            return native_unlink(path, *args, **kwargs)

        with patch.object(Path, "unlink", unlink_once):
            with self.assertRaisesRegex(PermissionError, "simulated temporary-file lock"):
                self.install()
        self.assertTrue(blocked)
        self.assertEqual(files_under(self.core), before)
        self.install()
        self.assertEqual(files_under(self.core), self.candidates)

    def test_partial_publish_failure_restores_originals_and_removes_new_helper(self):
        before = files_under(self.core)
        replace_file = installer.os.replace
        calls = 0

        def fail_once(source, target):
            nonlocal calls
            self.assertTrue(Path(source).resolve().is_relative_to(self.core.resolve()))
            self.assertTrue(Path(target).resolve().is_relative_to(self.core.resolve()))
            calls += 1
            if calls == 2:
                raise OSError("simulated atomic publication failure")
            return replace_file(source, target)

        with patch.object(installer.os, "replace", side_effect=fail_once), self.assertRaisesRegex(OSError, "simulated"):
            self.install()
        self.assertGreaterEqual(calls, 3, "At least one original must be restored after the injected failure")
        self.assertEqual(files_under(self.core), before)
        self.assertFalse((self.core / "tools/hcv_agent_names.py").exists())
        self.assertEqual(list(self.core.rglob("*.hcv-*.tmp")), [])
        self.assertEqual(files_under(self.out), self.candidates)


if __name__ == "__main__":
    unittest.main()

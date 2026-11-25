"""Exercise installation and rollback on temporary copies, never the real core."""

import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from pinned_hermes_fixture import read_stock_sources

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("hcv_installer_test", ROOT / "scripts/install-hermes-approval-core.py")
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)
REAL_CORE = installer.stage.CORE


class InstallerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.baselines = read_stock_sources(REAL_CORE, installer.stage.EXPECTED)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="hcv-installer-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.core = self.root / "hermes/hermes-agent"
        self.out = self.root / "staged"
        self.source = self.root / "source/hermes-approval"
        self.source.mkdir(parents=True)
        (self.source / "preview.py").write_bytes((ROOT / "source/hermes-approval/preview.py").read_bytes())
        transformations = {"tools/file_tools.py": installer.stage.file_tools,
                           "tools/file_tools_write_guards.py": installer.stage.guards,
                           "tools/approval_gateway_wait.py": installer.stage.gateway,
                           "tools/approval.py": installer.stage.approval,
                           "gateway/session_ancillary.py": installer.stage.ancillary}
        self.originals = {}
        for name, raw in self.baselines.items():
            self.assertEqual(installer.digest(raw), installer.stage.EXPECTED[name], name)
            self.originals[name] = raw
            target = self.core / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
            candidate = self.out / name
            candidate.parent.mkdir(parents=True, exist_ok=True)
            candidate.write_bytes(transformations[name](raw.decode("utf-8")).encode("utf-8"))
        (self.out / "tools/hcv_approval_preview.py").write_bytes((self.source / "preview.py").read_bytes())
        self.patches = [patch.object(installer, "ROOT", self.root),
                        patch.object(installer.stage, "CORE", self.core),
                        patch.object(installer.stage, "OUT", self.out),
                        patch.dict("os.environ", {"LOCALAPPDATA": str(self.root)}),
                        patch("sys.argv", ["installer", "--install"])]
        for item in self.patches:
            item.start()
            self.addCleanup(item.stop)

    def test_install_and_repeat_refusal(self):
        installer.main()
        for name in self.originals:
            self.assertEqual((self.core / name).read_bytes(), (self.out / name).read_bytes())
        self.assertEqual((self.core / "tools/hcv_approval_preview.py").read_bytes(),
                         (self.out / "tools/hcv_approval_preview.py").read_bytes())
        with self.assertRaises(RuntimeError):
            installer.main()

    def test_changed_core_is_not_overwritten(self):
        target = self.core / "tools/file_tools.py"
        target.write_bytes(b"someone else's change")
        with self.assertRaises(RuntimeError):
            installer.main()
        self.assertEqual(target.read_bytes(), b"someone else's change")
        self.assertFalse((self.core / "tools/hcv_approval_preview.py").exists())

    def test_partial_failure_restores_our_previous_writes(self):
        original_replace = installer.replace_file
        calls = 0

        def fail_once(path, data):
            nonlocal calls
            calls += 1
            if calls == 3:
                raise OSError("simulated failure")
            original_replace(path, data)

        with patch.object(installer, "replace_file", side_effect=fail_once), self.assertRaises(OSError):
            installer.main()
        for name, raw in self.originals.items():
            self.assertEqual((self.core / name).read_bytes(), raw)
        self.assertFalse((self.core / "tools/hcv_approval_preview.py").exists())


if __name__ == "__main__":
    unittest.main()

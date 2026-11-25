"""Isolated ownership and build-guard checks; no Hermes or production builds."""

from hashlib import sha256
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

PROJECT = Path(__file__).absolute().parent.parent
TOOL = PROJECT / "scripts/release_lock.py"
spec = importlib.util.spec_from_file_location("release_lock", TOOL)
lock = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lock)


class OwnershipChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="hcv-release-check-")
        self.root = Path(self.temp.name)
        self.assertEqual(self.root.parent.resolve(), Path(tempfile.gettempdir()).resolve())
        self.assertTrue(self.root.name.startswith("hcv-release-check-"))
        self.env = {k: v for k, v in os.environ.items() if k not in ("HCV_RELEASE_OWNER", "HCV_RELEASE_PYTHON")}
        self.env["PYTHONDONTWRITEBYTECODE"] = "1"
        self.env["PYTHONIOENCODING"] = "utf-8"

    def tearDown(self):
        self.temp.cleanup()

    def cli(self, *args, root=None, **kw):
        return subprocess.run([sys.executable, "-B", str(TOOL), *args, "--root", str(root or self.root)],
                              capture_output=True, text=True, encoding="utf-8", env=self.env, **kw)

    def test_read_only_status_and_require(self):
        self.assertFalse(json.loads(self.cli("status").stdout)["enabled"])
        self.assertEqual(self.cli("require").returncode, 2)
        self.assertEqual(self.cli("require", "--if-enabled").returncode, 0)
        self.assertEqual(self.cli("require", "--if-enabled", "--owner", "a").returncode, 2)
        self.assertFalse((self.root / ".local").exists())

    def test_owner_phase_release_and_enrollment(self):
        self.assertEqual(self.cli("acquire", "--owner", "a", "--task", "fixture").returncode, 0)
        state = self.root / ".local/release-owner.json"
        original = state.read_bytes()
        self.assertEqual(self.cli("acquire", "--owner", "a").returncode, 0)
        self.assertEqual(original, state.read_bytes())
        for command in ("acquire", "release", "require"):
            self.assertEqual(self.cli(command, "--owner", "b").returncode, 2)
            self.assertEqual(original, state.read_bytes())
        self.assertEqual(self.cli("phase", "--owner", "a", "--phase", "test").returncode, 0)
        self.assertEqual(json.loads(state.read_text())["phase"], "test")
        self.assertEqual(self.cli("release", "--owner", "a").returncode, 0)
        self.assertTrue(json.loads(self.cli("status").stdout)["enabled"])
        self.assertEqual(self.cli("require", "--if-enabled").returncode, 2)
        self.assertTrue((self.root / ".local/release-owner.guard").is_file())
        self.assertEqual(self.cli("acquire", "--owner", "b").returncode, 0)

    def test_two_contenders_exactly_one_owner(self):
        for index in range(6):
            folder = self.root / str(index)
            folder.mkdir()
            processes = [subprocess.Popen([sys.executable, "-B", str(TOOL), "acquire", "--root", str(folder), "--owner", owner],
                                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=self.env) for owner in ("a", "b")]
            for process in processes:
                process.communicate(timeout=10)
            self.assertEqual(sorted(p.returncode for p in processes), [0, 2])
            self.assertIn(json.loads((folder / ".local/release-owner.json").read_text())["owner"], ("a", "b"))

    def test_corrupt_and_unknown_state_fail_closed(self):
        folder = self.root / ".local"
        folder.mkdir()
        state = folder / "release-owner.json"
        for content in ("", "{broken", "[]", '{"schema":99,"owner":null}', '{"schema":1}', '{"schema":1,"owner":42}'):
            state.write_text(content)
            self.assertEqual(self.cli("require", "--if-enabled").returncode, 2)
            self.assertEqual(self.cli("acquire", "--owner", "a").returncode, 2)
            self.assertEqual(state.read_text(), content)

    def test_os_guard_released_after_process_exit_but_lease_remains(self):
        self.assertEqual(self.cli("acquire", "--owner", "a").returncode, 0)
        code = "import sys,importlib.util,time; s=importlib.util.spec_from_file_location('lock',sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m);\nwith m._transaction(sys.argv[2]):\n print('held',flush=True); time.sleep(30)"
        process = subprocess.Popen([sys.executable, "-B", "-c", code, str(TOOL), str(self.root)],
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=self.env)
        try:
            self.assertEqual(process.stdout.readline().strip(), "held")
            self.assertEqual(self.cli("release", "--owner", "a").returncode, 2)
        finally:
            process.kill()
            process.communicate(timeout=10)
        self.assertEqual(self.cli("acquire", "--owner", "b").returncode, 2)
        self.assertEqual(self.cli("release", "--owner", "a", "--note", "owner confirmed stopped").returncode, 0)
        self.assertEqual(self.cli("acquire", "--owner", "b").returncode, 0)

    def test_reparse_local_refused(self):
        outside = self.root / "outside"
        outside.mkdir()
        link = self.root / ".local"
        try:
            if os.name == "nt":
                # Directory junctions do not require symlink privileges.
                result = subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(outside)], capture_output=True)
                if result.returncode:
                    self.skipTest("Cannot create test junction")
            else:
                link.symlink_to(outside, target_is_directory=True)
            self.assertEqual(self.cli("status").returncode, 2)
            self.assertEqual(self.cli("require", "--if-enabled").returncode, 2)
            self.assertEqual(self.cli("acquire", "--owner", "a").returncode, 2)
            self.assertEqual(list(outside.iterdir()), [])
        finally:
            if link.is_symlink():
                link.unlink()
            elif link.exists():
                os.rmdir(link)

    def fixture(self):
        (self.root / "scripts").mkdir()
        (self.root / "source").mkdir()
        (self.root / ".local").mkdir()
        for name in ("release_lock.py", "package.py"):
            shutil.copyfile(PROJECT / "scripts" / name, self.root / "scripts" / name)
        # Use the real trusted dependency without copying node_modules.
        source = (PROJECT / "scripts/build.mjs").read_text(encoding="utf-8")
        dependency = (PROJECT / "node_modules/esbuild/lib/main.js").as_uri()
        source = source.replace("from 'esbuild'", "from " + json.dumps(dependency))
        (self.root / "scripts/build.mjs").write_text(source, encoding="utf-8")
        (self.root / "package.json").write_text(json.dumps({"name": "hermes-codex-visual", "version": "0.0.1", "type": "module"}))
        (self.root / "LICENSE").write_text("fixture license")
        (self.root / "THIRD_PARTY_NOTICES.txt").write_text("fixture notices")
        svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
        assets = {"icons": dict.fromkeys(["newChat", "plugins", "folder", "folderOpen", "edit", "messageEdit", "laptop", "chatPreviewComputer"], svg),
                  "avatars": [[svg, svg]], "install": dict.fromkeys(["pending", "done", "failed", "disclosure"], svg)}
        (self.root / "source/visual-assets.json").write_text(json.dumps(assets))
        (self.root / "source/plugin.js").write_text("import assets from './visual-assets.json'; export default { version: HCV_LOCAL_VERSION, assets };")

    def run_fixture(self, command, owner=None, **kwargs):
        env = dict(self.env)
        if owner:
            env["HCV_RELEASE_OWNER"] = owner
        env.update(kwargs.pop("env_changes", {}))
        return subprocess.run(command, cwd=self.root, env=env, capture_output=True, text=True, encoding="utf-8", **kwargs)

    def test_build_and_package_guards_on_miniature_project(self):
        self.fixture()
        build = ["node", "scripts/build.mjs"]
        package = [sys.executable, "-B", "scripts/package.py"]
        # A clean clone must not try to start Python for a Node build.
        public = self.run_fixture(build, env_changes={"HCV_RELEASE_PYTHON": "missing-python-for-test"})
        self.assertEqual(public.returncode, 0, public.stderr)
        self.assertEqual(self.run_fixture(package).returncode, 0)
        module = self.root / "plugin.js"
        archive = self.root / "dist/hermes-codex-visual-v0.0.1.zip"
        before = (module.read_bytes(), archive.read_bytes())
        self.assertEqual(self.cli("acquire", "--owner", "a").returncode, 0)
        for command in (build, package):
            for owner in (None, "b"):
                denied = self.run_fixture(command, owner)
                self.assertNotEqual(denied.returncode, 0)
                self.assertEqual((module.read_bytes(), archive.read_bytes()), before)
            allowed = self.run_fixture(command, "a")
            self.assertEqual(allowed.returncode, 0, allowed.stderr)
        self.assertEqual(module.read_bytes(), before[0], "Guard must not change bundle bytes")
        self.assertEqual(self.cli("release", "--owner", "a").returncode, 0)
        self.assertEqual(self.run_fixture(build + ["--check"]).returncode, 0)
        self.assertNotEqual(self.run_fixture(build).returncode, 0)
        state = self.root / ".local/release-owner.json"
        state.write_text("{broken")
        for command in (build, package):
            self.assertNotEqual(self.run_fixture(command).returncode, 0)
            self.assertEqual((module.read_bytes(), archive.read_bytes()), before)
        state.unlink()
        for command in (build, package):
            self.assertNotEqual(self.run_fixture(command, "a").returncode, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)

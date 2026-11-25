"""Exercise admission with exact copied Hermes files and a fresh private profile."""

import hashlib
import json
import os
from pathlib import Path
import py_compile
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import release_queue_live_fence as fence


class HookTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = Path(os.environ["LOCALAPPDATA"]) / "hermes"
        cls.temp = tempfile.TemporaryDirectory(prefix="hcv-gate-test-")
        cls.addClassCleanup(cls.temp.cleanup)
        cls.sandbox = Path(cls.temp.name).resolve()
        cls.root = cls.sandbox / "Hermes fixture"
        packaged = Path(fence._PACKAGED)
        shutil.copytree(cls.source / packaged, cls.root / packaged, ignore=shutil.ignore_patterns("debug.log"))
        for entry in fence.patch_gate_files(cls.source):
            path = cls.root / entry["target"].relative_to(cls.source)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(entry["original"])
        cls.plan = fence.patch_gate_files(cls.root)
        cls.exe = cls.root / packaged / "Hermes.exe"
        cls.marker = cls.root / fence.MARKER_NAME
        cls.permit = cls.root / fence.PROBE_NAME
        cls.leases = cls.root / fence.LEASE_DIR_NAME
        cls.env = {key: os.environ[key] for key in ("SYSTEMROOT", "WINDIR", "SYSTEMDRIVE") if key in os.environ}
        for key in (
            "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP",
            "HERMES_HOME", "HERMES_DESKTOP_USER_DATA_DIR", "HERMES_GATEWAY_LOCK_DIR", "XDG_STATE_HOME",
        ):
            path = cls.sandbox / key
            path.mkdir()
            cls.env[key] = str(path)
        cls.env["HERMES_DESKTOP_SKIP_PROTOCOL_REGISTRATION"] = "1"
        cls.env["HERMES_DESKTOP_IGNORE_EXISTING"] = "1"
        cls.env["HERMES_DESKTOP_ISOLATED_BACKEND"] = "1"
        cls.env["HERMES_DESKTOP_CDP_PORT"] = "off"
        cls.probe_root = cls.sandbox / "Probe fixture"
        cls.probe_root.mkdir()
        cls.probe_env = cls.env.copy()
        for key in (
            "HERMES_HOME", "APPDATA", "LOCALAPPDATA", "HERMES_DESKTOP_USER_DATA_DIR",
            "HERMES_GATEWAY_LOCK_DIR", "XDG_STATE_HOME",
        ):
            path = cls.probe_root / key
            path.mkdir()
            cls.probe_env[key] = str(path)
        cls.probe_env[fence.PROBE_TOKEN_ENV] = "private-fixture-token"

    def setUp(self):
        self.marker.unlink(missing_ok=True)
        self.permit.unlink(missing_ok=True)
        for row in self.plan:
            row["target"].write_bytes(row["before"])

    def install_hooks_in_fixture(self):
        for row in self.plan:
            row["target"].write_bytes(row["after"])

    def electron_probe(self, env=None):
        return subprocess.run(
            [self.exe, "--hermes-sandbox-probe"], cwd=self.sandbox, env=self.env if env is None else env,
            capture_output=True, timeout=12, check=False,
        ).returncode

    def open_probe(self, **overrides):
        self.marker.write_text(
            json.dumps({"schema": 1, "intent_id": "fixture-request", "project": str(self.sandbox)}),
            encoding="utf-8",
        )
        payload = {
            "schema": 1, "intent_id": "fixture-request", "probe_root": str(self.probe_root),
            "token_sha256": hashlib.sha256(self.probe_env[fence.PROBE_TOKEN_ENV].encode("utf-8")).hexdigest(),
        }
        self.permit.write_text(json.dumps(payload | overrides), encoding="utf-8")

    def python_probe(self, env):
        row = next(item for item in self.plan if item["target"].name == "run_bootstrap.py")
        end = row["after"].index(b"del _hcv_windows_admit_runtime") + len(b"del _hcv_windows_admit_runtime")
        prefix = row["after"][:end].decode("utf-8")
        return subprocess.run(
            [sys.executable, "-B", "-c", prefix], cwd=self.sandbox, env=env, capture_output=True, timeout=6,
        ).returncode

    def test_actual_electron_probe_requires_token_and_intent(self):
        self.install_hooks_in_fixture()
        self.open_probe()
        self.assertEqual(self.electron_probe(self.probe_env), 0)
        minimal_scope = {key: value for key, value in self.probe_env.items() if key not in fence._PROBE_OVERRIDES}
        self.assertEqual(self.electron_probe(minimal_scope), 0)
        self.assertTrue((Path(minimal_scope["APPDATA"]) / "Hermes").is_dir())
        no_token = self.probe_env.copy()
        del no_token[fence.PROBE_TOKEN_ENV]
        self.assertEqual(self.electron_probe(no_token), fence.BLOCKED_EXIT_CODE)
        self.assertEqual(self.python_probe(no_token), fence.BLOCKED_EXIT_CODE)
        wrong_token = self.probe_env | {fence.PROBE_TOKEN_ENV: "other-token"}
        self.assertEqual(self.electron_probe(wrong_token), fence.BLOCKED_EXIT_CODE)
        self.assertEqual(self.python_probe(wrong_token), fence.BLOCKED_EXIT_CODE)
        self.open_probe(intent_id="other-request")
        self.assertEqual(self.electron_probe(self.probe_env), fence.BLOCKED_EXIT_CODE)
        self.assertEqual(self.python_probe(self.probe_env), fence.BLOCKED_EXIT_CODE)
        self.open_probe()
        self.marker.write_text('{"schema":1,"intent_id":"fixture-request"}', encoding="utf-8")
        self.assertEqual(self.electron_probe(self.probe_env), fence.BLOCKED_EXIT_CODE)
        self.assertEqual(self.python_probe(self.probe_env), fence.BLOCKED_EXIT_CODE)
        self.open_probe()
        self.marker.write_text("{", encoding="utf-8")
        self.assertEqual(self.electron_probe(self.probe_env), fence.BLOCKED_EXIT_CODE)
        self.assertEqual(self.python_probe(self.probe_env), fence.BLOCKED_EXIT_CODE)
        self.open_probe()
        self.permit.unlink()
        self.assertEqual(self.electron_probe(self.probe_env), fence.BLOCKED_EXIT_CODE)
        self.assertEqual(self.python_probe(self.probe_env), fence.BLOCKED_EXIT_CODE)

    def test_probe_scope_and_actual_electron_override(self):
        self.install_hooks_in_fixture()
        self.open_probe()
        self.assertEqual(self.python_probe(self.probe_env), 0)
        for key in ("HERMES_HOME", "APPDATA", "LOCALAPPDATA", "HERMES_DESKTOP_USER_DATA_DIR"):
            with self.subTest(key=key):
                env = self.probe_env | {key: self.env[key]}
                self.assertEqual(self.python_probe(env), fence.BLOCKED_EXIT_CODE)
                self.assertEqual(self.electron_probe(env), fence.BLOCKED_EXIT_CODE)
        self.assertEqual(
            self.python_probe(self.probe_env | {"HERMES_HOME": str(self.probe_root)}), fence.BLOCKED_EXIT_CODE,
        )
        self.open_probe(probe_root=str(self.sandbox))
        self.assertEqual(self.electron_probe(self.probe_env), fence.BLOCKED_EXIT_CODE)
        self.assertEqual(self.python_probe(self.probe_env), fence.BLOCKED_EXIT_CODE)

    def test_probe_rejects_junction_to_sibling_directory(self):
        self.install_hooks_in_fixture()
        self.open_probe()
        junction = self.probe_root / "junction"
        command = [os.environ["COMSPEC"], "/d", "/c", "mklink", "/J", junction, self.env["HERMES_HOME"]]
        subprocess.run(command, cwd=self.sandbox, capture_output=True, timeout=6, check=True)
        try:
            env = self.probe_env | {"HERMES_HOME": str(junction)}
            self.assertEqual(self.electron_probe(env), fence.BLOCKED_EXIT_CODE)
            self.assertEqual(self.python_probe(env), fence.BLOCKED_EXIT_CODE)
        finally:
            junction.rmdir()

    def test_exact_plan_and_drift(self):
        self.assertEqual(len(self.plan), 6)
        for row in self.plan:
            self.assertEqual(row["target"].read_bytes(), row["before"])
            if row["target"].suffix == ".py":
                compile(row["after"], str(row["target"]), "exec")
        with self.assertRaisesRegex(fence.GatePatchError, "admission is absent"):
            fence.verify_gate_files(self.root)
        self.install_hooks_in_fixture()
        fence.verify_gate_files(self.root)
        entry = self.plan[0]
        entry["target"].write_bytes(entry["after"] + b"\n// unexpected rebuild")
        with self.assertRaisesRegex(fence.GatePatchError, "Unreviewed launch file"):
            fence.verify_gate_files(self.root)
        entry["target"].write_bytes(entry["before"])
        with self.assertRaisesRegex(fence.GatePatchError, "admission is absent"):
            fence.verify_gate_files(self.root)

    def test_unchecked_python_cache_refuses_preflight(self):
        self.install_hooks_in_fixture()
        entry = self.root / "hermes-agent/hermes_cli/main.py"
        cache = Path(py_compile.compile(
            str(entry), doraise=True, invalidation_mode=py_compile.PycInvalidationMode.UNCHECKED_HASH,
        ))
        try:
            with self.assertRaisesRegex(fence.GatePatchError, "can skip guarded source"):
                fence.verify_gate_files(self.root)
        finally:
            cache.unlink()

    def test_actual_electron_after_marker_owner_death(self):
        asar = self.exe.parent / "resources/app.asar"
        archive_before = asar.read_bytes()
        self.assertEqual(self.electron_probe(), 0)
        self.install_hooks_in_fixture()
        self.assertEqual(self.electron_probe(), 0)
        writer_code = (
            "import os, sys, time\n"
            "with open(sys.argv[1], 'x') as stream:\n"
            "    stream.write(str(os.getpid()))\n"
            "    stream.flush()\n"
            "    os.fsync(stream.fileno())\n"
            "print('ready', flush=True)\n"
            "time.sleep(30)\n"
        )
        with subprocess.Popen(
            [sys.executable, "-B", "-c", writer_code, self.marker],
            cwd=self.sandbox, env=self.env, stdout=subprocess.PIPE,
        ) as writer:
            try:
                self.assertEqual(writer.stdout.readline(), b"ready\r\n")
            finally:
                writer.kill()
                writer.wait(timeout=5)
        self.assertEqual(self.electron_probe(), fence.BLOCKED_EXIT_CODE)
        self.assertEqual(self.marker.read_text(), str(writer.pid))
        self.marker.unlink()
        self.assertEqual(self.electron_probe(), 0)
        self.assertEqual(asar.read_bytes(), archive_before)
        seen = list(self.leases.glob("desktop.*.lease"))
        self.assertGreaterEqual(len(seen), 3)
        self.assertTrue(all(re.fullmatch(r"desktop\.\d+\.[0-9a-f]{32}\.lease", file.name) for file in seen))

    def test_dev_uses_the_same_guarded_entry_as_packaged(self):
        packaged, dev = [row for row in self.plan if row["target"].suffix == ".mjs"]
        self.assertEqual(packaged["before"], dev["before"])
        self.assertEqual(packaged["after"], dev["after"])

    def test_python_entries_admit_before_upstream_imports(self):
        self.install_hooks_in_fixture()
        for row in self.plan:
            target = row["target"]
            if target.suffix != ".py":
                continue
            with self.subTest(target=target.name):
                # Exercise the generated prefix, with a sentinel standing in for the upstream app.
                end = row["after"].index(b"del _hcv_windows_admit_runtime") + len(b"del _hcv_windows_admit_runtime")
                prefix = row["after"][:end].decode("utf-8")
                child = [sys.executable, "-B", "-c", prefix + "\nprint('upstream')"]
                outcome = subprocess.run(child, cwd=self.sandbox, env=self.env, capture_output=True, timeout=6)
                self.assertEqual(outcome.returncode, 0, outcome.stderr)
                self.assertEqual(outcome.stdout.strip(), b"upstream")
                self.marker.touch()
                try:
                    checkout = self.root / "hermes-agent"
                    name = ".".join(target.relative_to(checkout).with_suffix("").parts)
                    refused = subprocess.run(
                        [sys.executable, "-B", "-m", name], cwd=checkout, env=self.env,
                        capture_output=True, timeout=6,
                    )
                    self.assertEqual(refused.returncode, fence.BLOCKED_EXIT_CODE, refused.stderr)
                    self.assertEqual(refused.stdout, b"")
                finally:
                    self.marker.unlink()

    def test_admitted_process_has_visible_lease_at_marker_publication(self):
        self.install_hooks_in_fixture()
        row = next(item for item in self.plan if item["target"].name == "run_bootstrap.py")
        end = row["after"].index(b"del _hcv_windows_admit_runtime") + len(b"del _hcv_windows_admit_runtime")
        entry = row["after"][:end].decode("utf-8")
        child = [sys.executable, "-B", "-c", entry + "\nimport time; print('admitted', flush=True); time.sleep(30)"]
        with subprocess.Popen(child, cwd=self.sandbox, env=self.env, stdout=subprocess.PIPE) as process:
            try:
                self.assertEqual(process.stdout.readline().strip(), b"admitted")
                self.marker.touch()
                lease, = self.leases.glob(f"gateway.{process.pid}.*.lease")
                self.assertIsNone(process.poll())
                blocked = subprocess.run(
                    child, cwd=self.sandbox, env=self.env, capture_output=True, timeout=6,
                )
                self.assertEqual(blocked.returncode, fence.BLOCKED_EXIT_CODE)
            finally:
                process.kill()
                process.wait(timeout=5)
        self.assertTrue(lease.is_file())

    def test_failed_lease_publication_closes_both_entries(self):
        self.install_hooks_in_fixture()
        if self.leases.exists():
            for file in self.leases.glob("*.lease"):
                file.unlink()
            self.leases.rmdir()
        self.leases.touch()
        try:
            self.assertEqual(self.electron_probe(), fence.BLOCKED_EXIT_CODE)
            cli = self.root / "hermes-agent/hermes_cli/main.py"
            outcome = subprocess.run(
                [sys.executable, "-B", cli], cwd=self.sandbox, env=self.env,
                capture_output=True, timeout=6,
            )
            self.assertEqual(outcome.returncode, fence.BLOCKED_EXIT_CODE, outcome.stderr)
        finally:
            self.leases.unlink()


if __name__ == "__main__":
    unittest.main()

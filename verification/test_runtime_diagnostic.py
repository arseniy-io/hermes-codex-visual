import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

SCRIPT = Path(__file__).absolute().parent.parent / "scripts" / "runtime_diagnostic.py"
SPEC = importlib.util.spec_from_file_location("runtime_diagnostic", SCRIPT)
diagnostic = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(diagnostic)


HERE = Path(__file__).absolute().parent
if os.name == "nt" and not str(HERE).startswith("\\\\?\\"):
    # The complete fake Hermes layout exceeds the legacy Windows 260-char limit.
    HERE = Path("\\\\?\\" + str(HERE))
OLD = "1" * 32
NEW = "2" * 32
OLD_CLIENT = "async def streamable_http_client(url, *, http_client=None):\n    pass\n"
GOOD_CLIENT = "async def streamable_http_client(url, *, max_sse_event_size=None):\n    pass\n"
HOST = "async def connect():\n    return _core.streamable_http_client('url', max_sse_event_size=10)\n"
# Explicitly reviewed synthetic bytes only.  No hash of a changed test input is
# automatically admitted to the source allowlists.
SYNTHETIC_MCP_SOURCES = {
    "e245aa3c45901582be79ad1d07e5c5a0ff349d13d6538928ef47a465abfa0344",
    "f44ba1ea672e834744ab5d552c82d626eeb191462f15ec36a948877980cc853f",
}
SYNTHETIC_HOST_SOURCES = {"f4dab364049fc0d5054f1e38572d9adc110b5d6850221a1e3d01eebc6224ab22"}


class DiagnosticTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="own-test-", dir=HERE)
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.project = self.root / "project"
        self.hermes = self.root / "hermes"
        self.agent = self.hermes / "hermes-agent"
        self.agent.mkdir(parents=True)
        self.key = hashlib.sha256(str(self.agent.resolve()).encode("utf-8")).hexdigest()[:16]
        self.install = self.hermes / "installs" / self.key
        self.environments = self.install / "environments"
        self.test_env = self.environments / OLD / "venv"
        self.selected = self.environments / NEW / "venv"
        self.site = self.test_env / "Lib" / "site-packages"
        self.facts = self.install / "facts.json"
        self.runner = self.project / "verification" / "run-local.ps1"
        self.client = self.site / "mcp" / "client" / "streamable_http.py"
        self.host = self.agent / "tools" / "mcp_tool_transport.py"
        self.pyproject = self.agent / "pyproject.toml"
        self.write(self.runner, f"$env:HERMES_VISUAL_PYTHON = Join-Path $hermesTestRoot 'installs/{self.key}/environments/{OLD}/venv/Scripts/python.exe'\n")
        self.allowed = {hashlib.sha256(self.runner.read_bytes()).hexdigest()}
        for env in (self.test_env, self.selected):
            self.write(env / "Scripts" / "python.exe", b"synthetic, never execute")
            self.write(env / "pyvenv.cfg", "version_info = 3.14.7\n")
        self.write(self.facts, json.dumps({"schema": 1, "packages": {"venv": {"environment": str(self.selected)}}}))
        self.write(self.site / "mcp-2.0.0.dist-info" / "METADATA", "Metadata-Version: 2.1\nName: mcp\nVersion: 2.0.0\n\n")
        self.write(self.pyproject, '[project]\nname="example"\n[project.optional-dependencies]\nmcp=["mcp==2.3.0"]\n')
        self.write(self.client, OLD_CLIENT)
        self.write(self.host, HOST)

    @staticmethod
    def write(path, data):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data if isinstance(data, bytes) else data.encode("utf-8"))

    def diagnose(self):
        return diagnostic.diagnose(self.project, self.hermes, allowed_runners=self.allowed,
                                   allowed_mcp_sources=SYNTHETIC_MCP_SOURCES,
                                   allowed_host_sources=SYNTHETIC_HOST_SOURCES)

    def set_fact(self, value):
        self.write(self.facts, json.dumps({"schema": 1, "packages": {"venv": {"environment": value}}}))

    def test_observed_conflict(self):
        result = self.diagnose()
        self.assertEqual(result["status"], "static_mismatch")
        self.assertEqual(result["runner_vs_recorded_selection"], "different")
        self.assertEqual(result["declared_version_comparison"], "different")
        self.assertEqual(result["test_env_source_keyword"], "absent")
        self.assertEqual(result["inspected_tree_call_keyword"], "present")
        self.assertTrue(result["static_source_keyword_difference"])
        self.assertFalse(result["inspected_tree_gateway_binding_verified"])
        self.assertFalse(result["test_env_gateway_binding_verified"])
        self.assertFalse(result["runtime_binding_verified"])
        self.assertFalse(result["loaded_gateway_verified"])
        self.assertFalse(result["external_runtime_verified"])
        self.assertNotIn(str(self.root), json.dumps(result))

    def test_no_detected_mismatch_is_not_runtime_proof(self):
        self.set_fact(str(self.test_env))
        self.write(self.pyproject, '[project]\nname="example"\ndependencies=["mcp==2.0.0"]\n')
        self.write(self.client, GOOD_CLIENT)
        result = self.diagnose()
        self.assertEqual(result["status"], "no_detected_static_mismatch")
        self.assertFalse(result["loaded_gateway_verified"])
        self.assertFalse(result["external_runtime_verified"])

    def test_unknown_runner_including_a_harmless_edit(self):
        self.write(self.runner, self.runner.read_bytes() + b"# change\n")
        self.assertEqual(self.diagnose()["reason"], "runner_not_reviewed")

    def test_any_changed_client_source_is_unknown_even_when_ast_is_similar(self):
        self.set_fact(str(self.test_env))
        self.write(self.pyproject, '[project]\nname="example"\ndependencies=["mcp==2.0.0"]\n')
        self.write(self.client, GOOD_CLIENT)
        self.assertEqual(self.diagnose()["status"], "no_detected_static_mismatch")
        self.write(self.client, GOOD_CLIENT + "# unreviewed change\n")
        result = self.diagnose()
        self.assertEqual((result["status"], result["reason"]), ("unknown", "mcp_source_not_reviewed"))

    def test_any_changed_host_source_is_unknown_even_when_ast_is_similar(self):
        self.write(self.host, HOST + "# unreviewed change\n")
        result = self.diagnose()
        self.assertEqual((result["status"], result["reason"]), ("unknown", "host_source_not_reviewed"))

    def test_unsupported_runner_is_not_guessed(self):
        self.write(self.runner, "$env:HERMES_VISUAL_PYTHON = Get-AlternativePython\n")
        self.allowed = {hashlib.sha256(self.runner.read_bytes()).hexdigest()}
        self.assertEqual(self.diagnose()["reason"], "unsupported_runner")

    def test_runner_key_mismatch(self):
        self.write(self.runner, self.runner.read_bytes().replace(self.key.encode(), b"a" * 16))
        self.allowed = {hashlib.sha256(self.runner.read_bytes()).hexdigest()}
        self.assertEqual(self.diagnose()["reason"], "runner_install_key_mismatch")

    def test_invalid_facts_not_an_implicit_fallback(self):
        invalid_schemas = [json.dumps({"schema": schema, "packages": {"venv": {"environment": str(self.selected)}}}).encode()
                           for schema in (True, 1.0)]
        for value in (b"", b"{", b'{"schema":1,"schema":1}', b'{"schema":2}',
                      b'{"schema":1,"packages":{"venv":{"environment":12}}}', *invalid_schemas):
            with self.subTest(value=value):
                self.write(self.facts, value)
                self.assertEqual(self.diagnose()["status"], "unknown")

    def test_missing_facts(self):
        self.facts.unlink()
        self.assertEqual(self.diagnose()["reason"], "unavailable_path")

    def test_outside_nested_relative_and_parent_traversal_facts_rejected(self):
        values = [str(self.root / "outside" / "venv"), str(self.environments / NEW / "child" / "venv"),
                  "relative/venv", str(self.environments / NEW / ".." / OLD / "venv")]
        for value in values:
            with self.subTest(value=value):
                self.set_fact(value)
                self.assertEqual(self.diagnose()["reason"], "unexpected_facts_path")

    def test_expected_directory_junction_is_rejected(self):
        if os.name != "nt":
            self.skipTest("Windows junction test")
        import _winapi
        moved = self.install / "outside-environments"
        self.environments.rename(moved)
        _winapi.CreateJunction(str(moved), str(self.environments))
        try:
            self.assertEqual(self.diagnose()["reason"], "redirected_path")
        finally:
            os.rmdir(self.environments)

    def test_missing_python_cfg_and_client_are_unknown(self):
        files = [self.test_env / "Scripts" / "python.exe", self.selected / "pyvenv.cfg", self.client]
        for path in files:
            with self.subTest(path=path.name):
                content = path.read_bytes()
                path.unlink()
                self.assertEqual(self.diagnose()["status"], "unknown")
                self.write(path, content)

    def test_ambiguous_or_invalid_metadata(self):
        metadata = self.site / "mcp-2.0.0.dist-info" / "METADATA"
        self.write(metadata, "Name: mcp\nVersion: 2.0.0\nVersion: 2.0.0\n\n")
        self.assertEqual(self.diagnose()["reason"], "invalid_mcp_metadata")
        self.write(metadata, "Name: mcp\nVersion: 2.0.0\n\n")
        self.write(self.site / "mcp-2.3.0.dist-info" / "METADATA", "Name: mcp\nVersion: 2.3.0\n\n")
        self.assertEqual(self.diagnose()["reason"], "ambiguous_mcp_metadata")

    def test_requirement_must_be_unique_exact_pin(self):
        for requirement in ('mcp>=2.0', 'mcp==2.0.0; python_version > "3.12"', 'mcp==2.0.0", "mcp==2.3.0'):
            with self.subTest(requirement=requirement):
                text = '[project]\nname="example"\ndependencies=[' + json.dumps(requirement) + ']\n'
                self.write(self.pyproject, text)
                self.assertEqual(self.diagnose()["reason"], "ambiguous_mcp_requirement")

    def test_python_source_does_not_execute_and_conflicting_definitions_are_unknown(self):
        self.write(self.client, 'raise RuntimeError("not executed")\nasync def streamable_http_client(url): pass\n')
        self.assertEqual(self.diagnose()["reason"], "mcp_source_not_reviewed")
        self.write(self.client, 'async def streamable_http_client(url): pass\nasync def streamable_http_client(url): pass\n')
        self.assertEqual(self.diagnose()["reason"], "mcp_source_not_reviewed")
        self.write(self.client, 'from x import streamable_http_client\nasync def streamable_http_client(url): pass\n')
        self.assertEqual(self.diagnose()["reason"], "mcp_source_not_reviewed")
        self.write(self.client, 'def invalid(:\n')
        self.assertEqual(self.diagnose()["reason"], "mcp_source_not_reviewed")

    def test_keyword_acceptance_and_positional_only_are_distinguished(self):
        self.assertEqual(diagnostic._signature(b'def streamable_http_client(max_sse_event_size, /): pass\n'), "absent")
        self.assertEqual(diagnostic._signature(b'def streamable_http_client(url, **kwargs): pass\n'), "present")

    def test_multiple_host_calls_and_dynamic_kwargs_are_unknown(self):
        self.write(self.host, '_core.streamable_http_client("u", **kwargs)\n')
        self.assertEqual(self.diagnose()["reason"], "host_source_not_reviewed")
        self.write(self.host, '_core.streamable_http_client("u")\n_core.streamable_http_client("v")\n')
        self.assertEqual(self.diagnose()["reason"], "host_source_not_reviewed")

    def test_permission_error_is_unknown_and_does_not_print_error_text(self):
        with mock.patch.object(diagnostic.os, "open", side_effect=PermissionError("secret-example")):
            result = self.diagnose()
        self.assertEqual(result["status"], "unknown")
        self.assertEqual(result["reason"], "unreadable_input")
        self.assertNotIn("secret-example", json.dumps(result))

    def test_changed_input_is_unknown(self):
        original = diagnostic._inspect_path
        count = 0
        def changing(path, *, leaf_directory):
            nonlocal count
            observed = original(path, leaf_directory=leaf_directory)
            if path == self.runner and not leaf_directory:
                count += 1
                if count == 2:
                    last = list(observed[-1])
                    last[4] += 1
                    return (*observed[:-1], tuple(last))
            return observed
        with mock.patch.object(diagnostic, "_inspect_path", side_effect=changing):
            self.assertEqual(self.diagnose()["reason"], "input_changed")

    def test_cli_unknown_is_sanitized_and_nonzero(self):
        # The CLI never accepts the synthetic runner hash as trusted.
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            exit_code = diagnostic.main(["--project", str(self.project), "--hermes-root", str(self.hermes)])
        self.assertEqual(exit_code, 2)
        parsed = json.loads(output.getvalue())
        self.assertEqual(parsed["status"], "unknown")
        self.assertNotIn(str(self.root), output.getvalue())


if __name__ == "__main__":
    unittest.main(verbosity=2)

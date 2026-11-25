"""Load the package through the real Hermes plugin manager in disposable profiles."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
HERMES = Path(os.environ["LOCALAPPDATA"]) / "hermes" / "hermes-agent"
BACKEND = Path(os.environ.get("HCV_USAGE_BACKEND_SOURCE", ROOT / "source" / "usage-backend"))


class HostIntegrationTest(unittest.TestCase):
    def test_agent_plugin_registers_tool_and_separates_profiles(self):
        with tempfile.TemporaryDirectory(prefix="hcv-usage-host-") as temp:
            sandbox = Path(temp).resolve()
            home = sandbox / "home"
            plugin = home / "plugins" / "hermes-codex-visual"
            plugin.parent.mkdir(parents=True)
            shutil.copytree(BACKEND, plugin, ignore=shutil.ignore_patterns("__pycache__"))
            (home / "config.yaml").write_text("plugins:\n  enabled:\n    - hermes-codex-visual\n", encoding="utf-8")
            env = os.environ.copy()
            env.update({"HERMES_HOME": str(home), "PYTHONPATH": str(HERMES),
                        "LOCALAPPDATA": str(sandbox / "local"), "APPDATA": str(sandbox / "roaming"),
                        "USERPROFILE": str(sandbox), "HERMES_DISABLE_LAZY_INSTALLS": "1",
                        "PYTHONDONTWRITEBYTECODE": "1"})
            program = r'''
from pathlib import Path
from hermes_constants import get_hermes_home
from hermes_cli.plugins import PluginManager
from tools.registry import registry
from fastapi import FastAPI
from fastapi.testclient import TestClient
from hermes_cli.web_server_dashboard import _discover_dashboard_plugins, _mount_one_plugin_api
import sys
import json
home = Path(sys.argv[1]).resolve()
assert get_hermes_home().resolve() == home
manager = PluginManager()
manager.discover_and_load()
plugin = manager._plugins.get("hermes-codex-visual")
assert plugin and plugin.enabled and not plugin.error, (plugin and plugin.error)
entry = registry.get_entry("request_codex_limit_reset", scope=manager.scope_key)
assert entry is not None
assert "request_codex_limit_reset" in manager._plugin_tool_names
discovered = _discover_dashboard_plugins(search_dirs=[(home / "plugins", "user")])
dashboard = next(item for item in discovered if item["name"] == "hermes-codex-visual")
app = FastAPI()
assert not _mount_one_plugin_api(app, dashboard, set(), set())
assert _mount_one_plugin_api(app, dashboard, {"hermes-codex-visual"}, set())
response = TestClient(app).get("/api/plugins/hermes-codex-visual/health")
assert response.status_code == 200 and response.json()["backend"] == "usage", response.text
result = registry.dispatch("request_codex_limit_reset", {}, scope=manager.scope_key)
assert isinstance(result, str)
value = json.loads(result)
assert value.get("ok") is False and "error" in value and "tool_result_contract" not in result, value
manager.unload()
print("registered in isolated profile")
'''
            completed = subprocess.run([sys.executable, "-B", "-c", program, str(home)], cwd=HERMES,
                                       env=env, text=True, capture_output=True, timeout=60)
            self.assertEqual(completed.returncode, 0, completed.stderr[-4000:])
            self.assertIn("registered in isolated profile", completed.stdout)


if __name__ == "__main__":
    unittest.main()

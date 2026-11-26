"""Test staged modules over the installed dependency tree, with an isolated HOME."""
import os
from pathlib import Path
import sys
import tempfile
import time
import hashlib
import json
import importlib.abc
import importlib.util

HERE = Path(__file__).resolve().parent
CANDIDATE = HERE.parents[1] / ".local/hermes-turn-control-check/candidate"
TMP = HERE.parents[1] / ".local/stop-core-tests"
TMP.mkdir(exist_ok=True)
RUNTIME = Path(os.environ["LOCALAPPDATA"]) / "hermes/hermes-agent"
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
os.environ["PYTEST_DISABLE_PLUGIN_AUTOLOAD"] = "1"
home = tempfile.TemporaryDirectory(prefix="home-", dir=TMP)
os.environ["HERMES_HOME"] = home.name
os.environ["HERMES_SKIP_ENV_FILE"] = "1"
os.environ["HERMES_DISABLE_LAZY_INSTALLS"] = "1"
os.environ["HERMES_SKIP_UPDATE_CHECK"] = "1"
os.environ["HERMES_TEST_ISOLATION"] = "1"
os.environ["HCV_CHILD_RESULT_FILE"] = str(CANDIDATE / "tools/delegate_tool_child_run.py")
os.environ["HCV_CHILD_RESULT_BASELINE"] = str(RUNTIME / "tools/delegate_tool_child_run.py")
sys.dont_write_bytecode = True
sys.path.insert(0, str(RUNTIME))
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(CANDIDATE))
sys.path.insert(0, str(HERE / "tests"))
class Overlay(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        candidate = CANDIDATE / (fullname.replace(".", "/") + ".py")
        return importlib.util.spec_from_file_location(fullname, candidate) if candidate.is_file() else None
sys.meta_path.insert(0, Overlay())
for name in ("tools", "agent", "gateway", "tui_gateway"):
    package = __import__(name)
    package.__path__.insert(0, str(HERE.parents[1] / ".local/hermes-turn-control-check/candidate" / name))
import contextlib
import importlib.util
import inspect
import unittest
from unittest.mock import patch

def invoke(function):
    supplied = os.environ.get('HCV_CASE_HOME')
    if supplied and not Path(supplied).resolve().is_relative_to(TMP):
        raise ValueError('Test case must stay inside the isolated candidate')
    case_context = contextlib.nullcontext(supplied) if supplied else tempfile.TemporaryDirectory(prefix="case-", dir=TMP)
    with case_context as case, contextlib.ExitStack() as stack:
        class Patches:
            def setattr(self, target, name, value):
                stack.enter_context(patch.object(target, name, value))
        fixtures = {"tmp_path": Path(case), "monkeypatch": Patches()}
        function(**{key: fixtures[key] for key in inspect.signature(function).parameters})

suite = unittest.TestSuite()
selected = sys.argv[1:]
for path in sorted((HERE / "tests").glob("test_*.py")):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if not selected:
        suite.addTests(unittest.defaultTestLoader.loadTestsFromModule(module))
    for name, function in vars(module).items():
        if name.startswith("test_") and callable(function) and (not selected or any(x in name for x in selected)):
            suite.addTest(unittest.FunctionTestCase(lambda function=function: invoke(function), description=path.stem + "." + name))
try:
    started = time.monotonic()
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    (HERE / "test-result.json").write_text(json.dumps({
        "manifest_sha256": hashlib.sha256((HERE / "manifest.json").read_bytes()).hexdigest(),
        "passed": result.testsRun - len(result.failures) - len(result.errors),
        "failed": len(result.failures) + len(result.errors), "elapsed_seconds": round(time.monotonic() - started, 3),
        "selected": selected,
    }, indent=2), encoding="utf-8")
finally:
    home.cleanup()
raise SystemExit(0 if result.wasSuccessful() else 1)

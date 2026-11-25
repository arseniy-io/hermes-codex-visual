"""Run staged producer and regression checks in an isolated, temporary Hermes profile."""

from __future__ import annotations

import importlib
import importlib.util
import logging
import os
from pathlib import Path
import shutil
import sys
import tempfile
import types


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("hcv_stage_agent_names", ROOT / "scripts/stage-hermes-agent-names.py")
stage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage)


def main() -> int:
    _, candidates = stage.candidates()
    for name, expected in candidates.items():
        if (stage.OUT / name).read_bytes() != expected:
            raise RuntimeError("Staged agent identity source differs from the checked patch: " + name)
    # Keep the caller's working profile, credentials and Git redirects outside the test process's state.
    for key in list(os.environ):
        upper = key.upper()
        if (upper in {"GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_OBJECT_DIRECTORY",
                      "GIT_ALTERNATE_OBJECT_DIRECTORIES", "HERMES_STATE_DB"}
                or upper.startswith(("GIT_CONFIG", "HERMES_SESSION_"))
                or upper.endswith(("_API_KEY", "_TOKEN", "_SECRET", "_PASSWORD", "_CREDENTIALS"))):
            os.environ.pop(key, None)
    with tempfile.TemporaryDirectory(prefix="hcv-agent-names-") as temporary:
        os.environ["HERMES_HOME"] = str(Path(temporary) / "home")
        os.environ["HERMES_TEST_GATEWAY_ROOT"] = str(Path(temporary) / "gateway")
        # The tests borrow installed libraries; importing a CLI must not run its dependency manager.
        bootstrap = types.ModuleType("hermes_bootstrap")
        def no_network(*args, **kwargs):
            raise AssertionError("Agent identity checks do not open external connections")
        bootstrap._happy_eyeballs_create_connection = no_network
        sys.modules["hermes_bootstrap"] = bootstrap
        recovery = types.ModuleType("hermes_cli._early_recovery")
        recovery.restore_interrupted_pull = lambda: False
        recovery._should_skip_external_secret_sources = lambda: True
        sys.modules["hermes_cli._early_recovery"] = recovery
        sys.path.insert(0, str(stage.CORE))
        sys.path.insert(0, str(stage.OUT))
        # Overlay owning modules without copying or importing the user's running backend.
        for name in ("agent", "tools", "gateway", "tui_gateway"):
            package = importlib.import_module(name)
            package.__path__.insert(0, str(stage.OUT / name))
        import pytest
        contract = Path(temporary) / "hermes_agent_names_contract_test.py"
        contract.write_bytes((ROOT / "verification/hermes_agent_names_contract_test.py").read_bytes())
        suites = [str(contract)]
        if "--cleanup-check" in sys.argv:
            suites.append(str(stage.CORE / "tests/tools/test_delegate.py") +
                          "::TestSubagentCostRollup::test_batch_children_costs_sum_into_parent")
        if "--contract-only" not in sys.argv:
            suites += [str(stage.CORE / name) for name in (
                "tests/tools/test_delegate.py", "tests/tools/test_delegate_batch_validation.py",
                "tests/tools/test_async_delegation.py", "tests/tools/test_async_delegation_worker.py",
                "tests/tools/test_delegation_route_fields.py", "tests/tools/test_delegation_backends.py",
                "tests/agent/test_subagent_progress.py", "tests/agent/test_subagent_lifecycle.py",
                "tests/gateway/test_session_subagent_live.py",
            )]
        original_symlink = Path.symlink_to
        def fixture_symlink(path, target, target_is_directory=False):
            source = Path(target).resolve()
            # This upstream fixture uses a link only to expose bundled plugin contents. Windows
            # need not grant link privileges to run it; copy that one trusted directory instead.
            if (os.name == "nt" and target_is_directory and source == (stage.CORE / "plugins/delegation").resolve()
                    and path.resolve().is_relative_to(Path(temporary).resolve())):
                return shutil.copytree(source, path)
            return original_symlink(path, target, target_is_directory=target_is_directory)
        Path.symlink_to = fixture_symlink
        try:
            code = pytest.main(["-q", "--tb=short", "--maxfail=4", "--import-mode=importlib", "--rootdir", temporary,
                                "--basetemp", str(Path(temporary) / "pytest"), "-p", "no:cacheprovider", *suites])
        finally:
            Path.symlink_to = original_symlink
            logging.shutdown()
            # Imported Hermes modules can retain a per-test FileHandler until interpreter exit.
            # Detach only this runner's temporary-profile logs before Windows removes that tree.
            loggers = [logging.getLogger(), *[logger for logger in logging.Logger.manager.loggerDict.values()
                                             if isinstance(logger, logging.Logger)]]
            for logger in loggers:
                for handler in list(logger.handlers):
                    filename = getattr(handler, "baseFilename", None)
                    if filename and Path(filename).resolve().is_relative_to(Path(temporary).resolve()):
                        logger.removeHandler(handler)
                        handler.close()
        for name in stage.TRANSFORMS:
            module = sys.modules.get(name[:-3].replace("/", "."))
            if module is not None and Path(module.__file__).resolve() != (stage.OUT / name).resolve():
                raise RuntimeError("A regression check loaded unstaged source: " + name)
        return code


if __name__ == "__main__":
    raise SystemExit(main())

"""Install the previously tested, version-pinned Hermes approval companion.

The caller must first stage and test the exact files and ensure the Hermes
gateway can be restarted without interrupting active work. Backups are kept
inside this project until the installed version has been verified.
"""

from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import importlib.util
import os
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("hcv_stage_core", ROOT / "scripts/stage-hermes-approval-core.py")
stage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage)


def digest(data):
    return sha256(data).hexdigest()


def replace_file(path, data):
    temporary = path.with_name(path.name + ".hcv-" + uuid.uuid4().hex + ".tmp")
    try:
        with temporary.open("xb") as out:
            out.write(data)
            out.flush()
            os.fsync(out.fileno())
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def main():
    if sys.argv[1:] != ["--install"]:
        raise SystemExit("Pass --install only after the staged core and ZIP have passed isolated tests.")
    core = stage.CORE.resolve(strict=True)
    if core != (Path(os.environ["LOCALAPPDATA"]) / "hermes" / "hermes-agent").resolve(strict=True):
        raise RuntimeError("The Hermes core path is not the expected installation.")
    transformations = {"tools/file_tools.py": stage.file_tools,
                       "tools/file_tools_write_guards.py": stage.guards,
                       "tools/approval_gateway_wait.py": stage.gateway,
                       "tools/approval.py": stage.approval,
                       "gateway/session_ancillary.py": stage.ancillary}
    originals, candidates = {}, {}
    for name, expected in stage.EXPECTED.items():
        target = core / name
        if target.is_symlink() or not target.is_file():
            raise RuntimeError(f"Unexpected Hermes source target: {name}")
        original = target.read_bytes()
        if digest(original) != expected:
            raise RuntimeError(f"Hermes source changed; no files installed: {name}")
        candidate = transformations[name](original.decode("utf-8")).encode("utf-8")
        if candidate != (stage.OUT / name).read_bytes():
            raise RuntimeError(f"The staged candidate differs from the current source: {name}")
        originals[name], candidates[name] = original, candidate
    name = "tools/hcv_approval_preview.py"
    target = core / name
    if target.exists() or target.is_symlink():
        raise RuntimeError("The companion module already exists; refusing to overwrite it.")
    candidate = (ROOT / "source/hermes-approval/preview.py").read_bytes()
    if candidate != (stage.OUT / name).read_bytes():
        raise RuntimeError("The staged preview module differs from its source.")
    candidates[name] = candidate

    backup = ROOT / ".local" / ("approval-core-rollback-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8])
    backup.mkdir(parents=True, exist_ok=False)
    for name, data in originals.items():
        file = backup / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(data)
    written = []
    try:
        for name, data in candidates.items():
            target = core / name
            if name in originals and digest(target.read_bytes()) != stage.EXPECTED[name]:
                raise RuntimeError(f"Hermes source changed during installation: {name}")
            if name not in originals and (target.exists() or target.is_symlink()):
                raise RuntimeError(f"Companion appeared during installation: {name}")
            replace_file(target, data)
            written.append(name)
        for name, data in candidates.items():
            if digest((core / name).read_bytes()) != digest(data):
                raise RuntimeError(f"Installed content did not verify: {name}")
    except Exception:
        for name in reversed(written):
            target = core / name
            if target.is_file() and digest(target.read_bytes()) == digest(candidates[name]):
                if name in originals:
                    replace_file(target, originals[name])
                else:
                    target.unlink()
        raise
    print(f"Backups: {backup}")
    for name, data in candidates.items():
        print(f"{name} {digest(data)}")
    print("Restart the Hermes gateway safely, then verify the loaded plugin and protected-edit scenario.")


if __name__ == "__main__":
    main()

"""Install only the exact staged MCP display companion, with backup and rollback."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import uuid

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("hcv_stage_tool_display", ROOT / "scripts/stage-hermes-tool-display.py")
stage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage)


def publish(path, data, *, new=False):
    temporary = path.with_name(path.name + ".hcv-" + uuid.uuid4().hex + ".tmp")
    try:
        with temporary.open("xb") as output:
            output.write(data); output.flush(); os.fsync(output.fileno())
        if new:
            os.link(temporary, path)
        else:
            os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def install(core, candidate, backup_root):
    core = core.resolve(strict=True)
    candidate = candidate.resolve(strict=True)
    originals, output = stage.candidates(core)
    for name, data in output.items():
        if stage.checked_path(candidate, name).read_bytes() != data:
            raise RuntimeError("Staged source differs from the verified candidate: " + name)
    changed = [name for name, data in output.items() if originals.get(name) != data]
    if not changed:
        return None, output
    backup = backup_root / ("tool-display-core-rollback-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8])
    backup.mkdir(parents=True, exist_ok=False)
    manifest = {}
    for name in changed:
        if name in originals:
            target = backup / stage.safe_relative(name)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(originals[name])
        manifest[name] = {"original": stage.digest(originals[name]) if name in originals else None,
                          "candidate": stage.digest(output[name])}
    (backup / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    written = []
    # Publish the companion before the owning modules that import it.
    try:
        for name in sorted(changed, key=lambda name: name in originals):
            target = stage.checked_path(core, name, exists=name in originals)
            if name in originals and target.read_bytes() != originals[name]:
                raise RuntimeError("Hermes changed during installation: " + name)
            if name not in originals and target.exists():
                raise RuntimeError("A new helper appeared during installation: " + name)
            publish(target, output[name], new=name not in originals)
            written.append(name)
        for name, data in output.items():
            if stage.checked_path(core, name).read_bytes() != data:
                raise RuntimeError("Installed content did not verify: " + name)
    except Exception:
        for name in reversed(written):
            target = stage.checked_path(core, name)
            if target.read_bytes() == output[name]:
                if name in originals:
                    publish(target, originals[name])
                else:
                    target.unlink()
        raise
    return backup, output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--install", action="store_true", required=True)
    parser.add_argument("--candidate", type=Path, default=stage.OUT)
    args = parser.parse_args()
    core = stage.CORE.resolve(strict=True)
    expected = (Path(os.environ["LOCALAPPDATA"]) / "hermes/hermes-agent").resolve(strict=True)
    if core != expected:
        raise RuntimeError("Unexpected Hermes installation path")
    backup, output = install(core, args.candidate, ROOT / ".local")
    print("Backup:", backup if backup is not None else "already installed")
    print("Installed and verified MCP display metadata:", len(output), "files.")
    print("Restart the idle gateway safely, then verify live and reopened tool calls.")


if __name__ == "__main__":
    main()

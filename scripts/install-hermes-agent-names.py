"""Install the exact staged Hermes agent-name contract after isolated verification."""

from datetime import datetime, timezone
from hashlib import sha256
import importlib.util
import json
import os
from pathlib import Path
import sys
import uuid


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("hcv_stage_agent_names", ROOT / "scripts/stage-hermes-agent-names.py")
stage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage)


def digest(data):
    return sha256(data).hexdigest()


def publish(path, data, *, new=False, on_published=None):
    temporary = path.with_name(path.name + ".hcv-" + uuid.uuid4().hex + ".tmp")
    try:
        with temporary.open("xb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        if new:
            os.link(temporary, path)
        else:
            os.replace(temporary, path)
        if on_published is not None:
            on_published(temporary)
    finally:
        if temporary.exists():
            temporary.unlink()


def main():
    if sys.argv[1:] != ["--install"]:
        raise SystemExit("Pass --install after checking the staged candidate in isolation.")
    core = stage.CORE.resolve(strict=True)
    if core != (Path(os.environ["LOCALAPPDATA"]) / "hermes/hermes-agent").resolve(strict=True):
        raise RuntimeError("Unexpected Hermes installation path.")
    originals, candidates = stage.candidates(core)
    for name, data in candidates.items():
        target = core / name
        if target.is_symlink() or not target.parent.resolve(strict=True).is_relative_to(core):
            raise RuntimeError("Unexpected Hermes source path: " + name)
        if name not in originals and target.exists():
            raise RuntimeError("The agent-name companion already exists: " + name)
        if (stage.OUT / name).read_bytes() != data:
            raise RuntimeError("The staged source differs from the tested candidate: " + name)

    backup = ROOT / ".local" / ("agent-names-core-rollback-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
                                + "-" + uuid.uuid4().hex[:8])
    backup.mkdir(parents=True, exist_ok=False)
    manifest = {}
    for name, data in candidates.items():
        if name in originals:
            original = backup / name
            original.parent.mkdir(parents=True, exist_ok=True)
            original.write_bytes(originals[name])
        manifest[name] = {"original": digest(originals[name]) if name in originals else None,
                          "candidate": digest(data)}
    (backup / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    written = []
    # Publish the shared helper before the owning modules that import it.
    order = sorted(candidates, key=lambda name: name in originals)
    try:
        for name in order:
            target = core / name
            if name in originals and (not target.is_file() or digest(target.read_bytes()) != stage.EXPECTED[name]):
                raise RuntimeError("Hermes changed during installation: " + name)
            publish(target, candidates[name], new=name not in originals,
                    on_published=lambda temporary: written.append((name, temporary)))
        for name, data in candidates.items():
            if digest((core / name).read_bytes()) != digest(data):
                raise RuntimeError("Installed content did not verify: " + name)
    except Exception as error:
        for name, temporary in reversed(written):
            target = core / name
            try:
                if target.is_file() and digest(target.read_bytes()) == digest(candidates[name]):
                    if name in originals:
                        publish(target, originals[name])
                    else:
                        target.unlink()
            except OSError as rollback_error:
                error.add_note(f"Could not restore {name}: {rollback_error}")
            try:
                temporary.unlink(missing_ok=True)
            except OSError as cleanup_error:
                error.add_note(f"Could not remove {temporary.name}: {cleanup_error}")
        raise
    print("Backup:", backup)
    print("Installed and verified agent-name contract:", len(candidates), "files.")
    print("Restart the idle gateway safely, then verify a new agent's producer metadata.")


if __name__ == "__main__":
    main()

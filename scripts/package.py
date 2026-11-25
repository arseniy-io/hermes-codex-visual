"""Pack the built plugin and write a SHA-256 file for the release assets."""

from argparse import ArgumentParser
from hashlib import sha256
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo
from release_lock import require_owner, OwnershipError


args = ArgumentParser(description=__doc__)
args.add_argument("--local", action="store_true", help="Package the private local build")
local = args.parse_args().local
root = Path(__file__).resolve().parent.parent
def require_shared_owner():
    try:
        require_owner(root, if_enabled=True)
    except (OwnershipError, OSError) as error:
        raise SystemExit(str(error)) from None


require_shared_owner()
manifest = json.loads((root / "package.json").read_text(encoding="utf-8"))
plugin_id, version = manifest["name"], manifest["version"]
dist = root / "dist"
dist.mkdir(exist_ok=True)
archive = dist / f"{plugin_id}-v{version}{'-local' if local else ''}.zip"
module = root / (".local/plugin.js" if local else "plugin.js")
backend = root / "source" / "usage-backend"
files = {
    "plugin.js": module,
    "LICENSE": root / "LICENSE",
    "THIRD_PARTY_NOTICES.txt": root / "THIRD_PARTY_NOTICES.txt",
}
if manifest.get("hermesAgentPackage") is True:
    files.update({
        "plugin.yaml": backend / "plugin.yaml",
        "__init__.py": backend / "__init__.py",
        "assistant.py": backend / "assistant.py",
        "activity.py": backend / "activity.py",
        "turn_changes.py": backend / "turn_changes.py",
        "timeline.py": backend / "timeline.py",
        "agent_receipts.py": backend / "agent_receipts.py",
        "dashboard/manifest.json": backend / "dashboard" / "manifest.json",
        "dashboard/plugin_api.py": backend / "dashboard" / "plugin_api.py",
    })
if manifest.get("hermesApprovalCore") is True:
    # The preview needs a version-pinned Hermes core companion. The scripts
    # refuse incompatible versions and retain a rollback copy on installation.
    files.update({
        "scripts/stage-hermes-approval-core.py": root / "scripts" / "stage-hermes-approval-core.py",
        "scripts/install-hermes-approval-core.py": root / "scripts" / "install-hermes-approval-core.py",
        "source/hermes-approval/preview.py": root / "source" / "hermes-approval" / "preview.py",
    })
if manifest.get("hermesAgentNamesCore") is True:
    files.update({
        "scripts/stage-hermes-agent-names.py": root / "scripts" / "stage-hermes-agent-names.py",
        "scripts/install-hermes-agent-names.py": root / "scripts" / "install-hermes-agent-names.py",
        "source/hermes-agent-names/identity.py": root / "source" / "hermes-agent-names" / "identity.py",
    })

if manifest.get("hermesToolDisplayCore") is True:
    files.update({
        "scripts/stage-hermes-tool-display.py": root / "scripts/stage-hermes-tool-display.py",
        "scripts/install-hermes-tool-display.py": root / "scripts/install-hermes-tool-display.py",
        "source/hermes-tool-display/data.py": root / "source/hermes-tool-display/data.py",
        "source/hermes-tool-display/core.patch": root / "source/hermes-tool-display/core.patch",
        "source/hermes-tool-display/manifest.json": root / "source/hermes-tool-display/manifest.json",
        "source/hermes-tool-display/README.md": root / "source/hermes-tool-display/README.md",
    })

if manifest.get("hermesTimelineCore") is True:
    files.update({
        "scripts/stage-hermes-timeline.py": root / "scripts/stage-hermes-timeline.py",
        "scripts/install-hermes-timeline.py": root / "scripts/install-hermes-timeline.py",
        **{f"source/hermes-timeline/{name}": root / "source/hermes-timeline" / name
           for name in ("timing.py", "file_capture.py", "core.patch", "manifest.json", "README.md")},
    })

if manifest.get("hermesTurnControlCore") is True:
    files.update({
        "scripts/stage-hermes-turn-control.py": root / "scripts/stage-hermes-turn-control.py",
        "scripts/install-hermes-turn-control.py": root / "scripts/install-hermes-turn-control.py",
        **{f"source/hermes-turn-control/{name}": root / "source/hermes-turn-control" / name
           for name in ("hcv_stop_tree.py", "delegate_tree_resume.py", "delegate_tree_lineage.py", "hcv_managed_tree.py", "hcv_inproc_tree.py", "hcv_tree_owner.py", "hcv_queue_order.py", "core.patch", "queue-controls.patch", "manifest.json", "README.md")},
    })

if manifest.get("hermesModelSpeedCore") is True:
    files.update({
        "scripts/stage-hermes-model-speed.py": root / "scripts" / "stage-hermes-model-speed.py",
        "scripts/install-hermes-model-speed.py": root / "scripts" / "install-hermes-model-speed.py",
        **{f"source/hermes-model-speed/{name}": root / "source" / "hermes-model-speed" / name
           for name in ("hcv_model_speed.py", "hcv_codex_diff_bridge.py", "core.patch", "manifest.json")},
    })

# Package only the declared source files, never caches or profile data. Resolve
# every input before reading it so a symlink cannot smuggle an external file.
for name, source in files.items():
    if source.is_symlink() or not source.is_file() or not source.resolve().is_relative_to(root.resolve()):
        raise ValueError(f"Unsafe or missing package input: {name}")

require_shared_owner()
with ZipFile(archive, "w") as package:
    for name, source in files.items():
        entry = ZipInfo(f"{plugin_id}/{name}", (2026, 1, 1, 0, 0, 0))
        entry.external_attr = 0o644 << 16
        package.writestr(entry, source.read_bytes(), ZIP_DEFLATED, compresslevel=9)

with ZipFile(archive) as package:
    assert package.namelist() == [f"{plugin_id}/{name}" for name in files]
    for name, source in files.items():
        assert package.read(f"{plugin_id}/{name}") == source.read_bytes()

checksums = "".join(
    f"{sha256(path.read_bytes()).hexdigest()}  {path.name}\n"
    for path in (archive, module)
)
(dist / "SHA256SUMS.txt").write_text(checksums, encoding="utf-8", newline="\n")
print(f"Wrote {archive.name}\n{checksums}", end="")

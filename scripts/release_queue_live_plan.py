"""Build the read-only file plan consumed by release_queue.apply_ready.

The caller supplies roots and reviewed preimages. The installation engine owns
the journal, compare-and-swap under maintenance, and rollback.
"""

import ast
from dataclasses import dataclass
from io import BytesIO
import json
from pathlib import Path
import re
from typing import Mapping
from zipfile import BadZipFile, ZipFile

import release_queue_build as builder
import release_queue_install as installer
from release_queue_store import QueueError
import release_workflow as workflow


PLUGIN = "hermes-codex-visual"
ZIP_METADATA = {"LICENSE", "THIRD_PARTY_NOTICES.txt"}
SHARED_TYPES = {
    "approval-core": "approval",
    "agent-names": "agent-names",
    "tool-display": "tool-display",
    "timeline": "timeline",
    "turn-control": "turn-control",
    "model-speed": "model-speed",
}
LEGACY_HELPERS = {
    "approval-core": ("preview.py", "tools/hcv_approval_preview.py"),
    "agent-names": ("identity.py", "tools/hcv_agent_names.py"),
}
GENERATED_CORE = {
    "apps/shared/src/gateway-contract.generated.ts",
    "apps/shared/src/gateway-contract.openrpc.json",
}
CORE_ROOT_MODULES = {
    "hermes_state_runtime.py",
    "hermes_state_worker_compression.py",
    "hermes_state_worker_lifecycle.py",
    "run_agent.py",
}
HASH = re.compile(r"[0-9a-f]{64}\Z")
AGENT_VERSION = re.compile(
    r'''version\s*:\s*(?:([0-9A-Za-z.+-]+)|"([0-9A-Za-z.+-]+)"|'([0-9A-Za-z.+-]+)')\s*(?:#.*)?'''
)


class PlanError(QueueError):
    """An exact file plan cannot be established from the supplied evidence."""


@dataclass(frozen=True)
class ActiveCore:
    """Reviewed evidence that one active core supports both release bundles.

    The hashes cover every core target. This mode guards the same exact bytes
    before and after activation. A core rewrite needs an independently staged
    and verified transition and is outside this adapter's active-core mode.
    """

    old_bundle_sha256: str
    new_bundle_sha256: str
    files: Mapping[str, str]


@dataclass(frozen=True)
class _ReleaseFiles:
    tree: Path
    base_id: str
    manifest: dict
    members: dict
    agents: set
    archive_sha256: str


def _require_hash(value, label, *, missing=False):
    if (value is None and missing) or (isinstance(value, str) and HASH.fullmatch(value)):
        return value
    raise PlanError(f"Expected SHA-256 for {label}")


def _relative(root, name):
    return root / workflow.safe_name(name)


def _existing_root(path):
    path = Path(path)
    if not path.is_absolute() or ".." in path.parts:
        raise PlanError(f"An absolute lexical root is required: {path}")
    installer._plain(path, directory=True)
    return path


def _preimages(values):
    result = dict(values or {})
    for name, digest in result.items():
        workflow.safe_name(name)
        _require_hash(digest, name, missing=True)
    return result


def _distribution_name(version):
    return f"{PLUGIN}-v{version}-local.zip"


def _distribution_sums(version, archive_hash, module):
    return (
        f"{archive_hash}  {_distribution_name(version)}\n"
        f"{workflow.digest(module)}  plugin.js\n"
    ).encode("ascii")


def _base_archive(project, state, base, override):
    recorded = base.get("archive")
    if recorded is None:
        return override or project / "dist" / _distribution_name(base["version"])
    path = Path(recorded)
    if not path.is_absolute():
        path = state / path
    archive_root = state / "archives"
    if ".." in path.parts or path == archive_root or not path.is_relative_to(archive_root):
        raise PlanError("Recorded previous ZIP must be inside state/archives")
    if override is not None and path != override:
        raise PlanError("The explicit previous ZIP differs from the recorded archive")
    return path


def _old_archive(tree, base, path):
    manifest = workflow.read_json(tree / "package.json")
    if manifest.get("name") != PLUGIN or manifest.get("version") != base["version"]:
        raise PlanError("Previous archive identity does not match its frozen inputs")
    declared, agents = workflow.declared_files(tree, manifest)
    raw = workflow.regular(path)
    expected = _require_hash(base.get("archive_sha256"), "previous ZIP")
    if workflow.digest(raw) != expected:
        raise PlanError(f"Previous ZIP differs from the reconciled base: {path}")
    prefix = PLUGIN + "/"
    # The accepted archive SHA-256 certifies the module, which is a generated
    # file and is intentionally absent from load_base()'s input-only tree.
    with ZipFile(BytesIO(raw)) as archive:
        expected_names = {prefix + name for name in declared}
        if len(archive.namelist()) != len(expected_names) or set(archive.namelist()) != expected_names:
            raise PlanError("Previous ZIP differs from its frozen package declaration")
        members = {name: archive.read(prefix + name) for name in declared}
    for name, source in declared.items():
        if name != "plugin.js" and workflow.regular(source) != members[name]:
            raise PlanError(f"Previous ZIP differs from its frozen package input: {name}")
    agent_version = base.get("agent_version", base["version"])
    if agent_version != base["version"] and (not agents or not base.get("archive")):
        raise PlanError("A split previous agent version requires a recorded legacy ZIP")
    if agents:
        lines = [line for line in members["plugin.yaml"].decode("utf-8").splitlines()
                 if re.match(r"^version\s*:", line)]
        match = AGENT_VERSION.fullmatch(lines[0]) if len(lines) == 1 else None
        if match is None or agent_version != next(value for value in match.groups() if value is not None):
            raise PlanError("Previous ZIP agent version differs from the accepted base")
    return _ReleaseFiles(tree, base["id"], manifest, members, agents, expected)


def _new_archive(state, tree, base, files, receipt):
    if (receipt.get("snapshot") != base or receipt.get("version") != base["version"]
            or receipt.get("test_only") is not False):
        raise PlanError("Ready receipt does not identify the candidate base")
    workspace = workflow.plain(Path(receipt["workspace"]))
    archive = workflow.plain(Path(receipt["archive"]))
    if not workspace.is_relative_to(state) or not archive.is_relative_to(workspace):
        raise PlanError("Ready workspace and ZIP must be in the isolated build storage")
    expected = _require_hash(receipt.get("archive_sha256"), "ready ZIP")
    manifest, members, agents, archive_hash = workflow.read_archive(workspace, archive, expected)
    if manifest["version"] != base["version"] or files != members:
        raise PlanError("Ready ZIP differs from the callback package or candidate version")
    if workflow.inputs_hash(workflow.project_inputs(workspace)) != base["id"]:
        raise PlanError("Tested workspace differs from the frozen candidate inputs")
    raw = workflow.regular(archive)
    if workflow.digest(raw) != archive_hash:
        raise PlanError("Ready ZIP changed during planning")
    return _ReleaseFiles(tree, base["id"], manifest, members, agents, archive_hash), workspace, raw


def _core_target(name):
    workflow.safe_name(name)
    if name in GENERATED_CORE:
        return name
    if name.endswith(".py") and (
        name in CORE_ROOT_MODULES
        or name.partition("/")[0] in {"agent", "gateway", "hermes_cli", "tools", "tui_gateway"}
    ):
        return name
    raise PlanError(f"Unreviewed core target: {name}")


def _legacy_targets(parts, family, source):
    stage = f"scripts/stage-hermes-{family}.py"
    parsed = ast.parse(parts[stage])
    assignments = [node.value for node in parsed.body if isinstance(node, ast.Assign) and any(
        isinstance(target, ast.Name) and target.id == "EXPECTED" for target in node.targets
    )]
    if len(assignments) != 1:
        raise PlanError(f"Unknown core effect list in {stage}")
    expected = ast.literal_eval(assignments[0])
    if not isinstance(expected, dict) or not expected:
        raise PlanError(f"Invalid core effect list in {stage}")
    targets = {}
    for name, digest in expected.items():
        _require_hash(digest, name)
        targets[_core_target(name)] = None
    helper_source, helper_target = LEGACY_HELPERS[family]
    if helper_target in targets:
        raise PlanError(f"Duplicate core helper target: {helper_target}")
    targets[helper_target] = {workflow.digest(parts[source + helper_source])}
    return targets


def _manifest_targets(parts, source):
    manifest = json.loads(parts[source + "manifest.json"])
    if not isinstance(manifest, dict) or manifest.get("version") != 1 or not manifest.get("files"):
        raise PlanError(f"Unknown core manifest: {source}manifest.json")
    targets = {}
    for name, entry in manifest["files"].items():
        candidates = [
            _require_hash(digest, name) for digest in (entry["candidate"], *entry.get("successors", ()))
        ]
        targets[_core_target(name)] = set(candidates)
    helpers = list(manifest.get("helpers", [])) + list(manifest.get("additional_helpers", []))
    if "helper" in manifest:
        helpers.append(manifest["helper"])
    if not helpers:
        raise PlanError(f"Missing helper effects in {source}manifest.json")
    for helper in helpers:
        name = _core_target(helper["target"])
        asset = source + workflow.safe_name(helper["source"])
        expected = _require_hash(helper["candidate"], name)
        if name in targets or workflow.digest(parts[asset]) != expected:
            raise PlanError(f"Unverified core helper: {name}")
        targets[name] = {expected}
    return targets


def _core_contract(members, agents):
    parts = {name: data for name, data in members.items() if name not in agents | ZIP_METADATA | {"plugin.js"}}
    covered = set()
    targets = {}
    for family, asset_family in SHARED_TYPES.items():
        source = f"source/hermes-{asset_family}/"
        stage = f"scripts/stage-hermes-{family}.py"
        install = f"scripts/install-hermes-{family}.py"
        names = {name for name in parts if name.startswith(source) or name in {stage, install}}
        if not names:
            continue
        if not {stage, install} <= names:
            raise PlanError(f"Incomplete core package: {family}")
        effects = (_legacy_targets(parts, family, source) if family in LEGACY_HELPERS
                   else _manifest_targets(parts, source))
        for name, accepted in effects.items():
            previous = targets.get(name)
            if accepted is not None:
                targets[name] = accepted if previous is None else accepted & previous
            elif name not in targets:
                targets[name] = None
        covered.update(names)
    if covered != parts.keys():
        raise PlanError("Unknown core package members: " + ", ".join(sorted(parts.keys() - covered)))
    return workflow.inputs_hash({name: workflow.digest(data) for name, data in parts.items()}), targets


def describe_core(members, agents):
    """Identify bundled core material and its required targets for review."""
    digest, targets = _core_contract(members, set(agents))
    return digest, frozenset(targets)


def _target_bytes(path):
    installer._plain(path, missing=True)
    return workflow.regular(path, missing=True)


def _hash_or_missing(data):
    return None if data is None else workflow.digest(data)


def _add(changes, target, after, expected):
    desired = _hash_or_missing(after)
    # Existing backups can share a link with an unchanged installed file. A
    # read-only comparison can keep that file outside the replacement plan.
    if desired in expected and _hash_or_missing(workflow.regular(target, missing=True)) == desired:
        return
    before = _hash_or_missing(_target_bytes(target))
    if before not in expected:
        raise PlanError(f"Unreviewed file at {target}: expected {expected}, found {before}")
    if before != desired:
        changes.append({"target": target, "before": before, "after": after})


def _add_core(changes, root, old, new, evidence):
    old_digest, old_targets = _core_contract(old.members, old.agents)
    new_digest, new_targets = _core_contract(new.members, new.agents)
    if not old_targets and not new_targets:
        if evidence is not None:
            raise PlanError("Core evidence was supplied for a release without core companions")
        return
    if not isinstance(evidence, ActiveCore):
        raise PlanError("The packaged core companions need reviewed active-core evidence")
    if (evidence.old_bundle_sha256, evidence.new_bundle_sha256) != (old_digest, new_digest):
        raise PlanError("Core bundle differs from the reviewed active-core evidence")
    if old_targets.keys() != new_targets.keys() or evidence.files.keys() != new_targets.keys():
        raise PlanError("Active core coverage differs from the declared old or new core targets")
    for name, allowed in sorted(new_targets.items()):
        expected = _require_hash(evidence.files[name], name)
        if allowed is not None and expected not in allowed:
            raise PlanError(f"Active core hash is not a candidate or approved successor: {name}")
        target = _relative(root, name)
        data = _target_bytes(target)
        if _hash_or_missing(data) != expected:
            raise PlanError(f"Active core changed or is missing: {target}")
        changes.append({"target": target, "before": expected, "after": data})


def _add_installed(changes, desktop, agent, old, new, preimages):
    names = old.agents | new.agents | {"plugin.js"}
    if preimages.keys() - names:
        raise PlanError("Unknown installed preimages: " + ", ".join(sorted(preimages.keys() - names)))
    for name in sorted(names):
        root = desktop if name == "plugin.js" else agent
        before = old.members.get(name) if name == "plugin.js" or name in old.agents else None
        after = new.members.get(name) if name == "plugin.js" or name in new.agents else None
        expected = preimages.get(name, _hash_or_missing(before))
        _add(changes, _relative(root, name), after, (expected,))


def _add_project(changes, project, old, new, workspace, raw_zip, recorded_outputs, preimages):
    old_inputs = workflow.project_inputs(old.tree)
    new_inputs = workflow.project_inputs(new.tree)
    if (workflow.inputs_hash(old_inputs), workflow.inputs_hash(new_inputs)) != (old.base_id, new.base_id):
        raise PlanError("Frozen source inputs changed during planning")
    desired = {}
    for name in workflow.input_changes(old_inputs, new_inputs):
        data = workflow.regular(_relative(new.tree, name)) if name in new_inputs else None
        if _hash_or_missing(data) != new_inputs.get(name):
            raise PlanError(f"Frozen candidate input changed: {name}")
        desired[name] = (data, old_inputs.get(name))

    previous_outputs = set(workflow.build_outputs(old.tree, old.manifest, old.agents)) | {".local/plugin.js"}
    outputs = set(workflow.build_outputs(new.tree, new.manifest, new.agents)) | {".local/plugin.js"}
    if recorded_outputs.keys() != outputs:
        raise PlanError("Ready build outputs differ from the declared writer contract")
    for name in sorted(outputs | previous_outputs):
        member = "plugin.js" if name == ".local/plugin.js" else name
        data = new.members[member] if name in outputs else None
        if name in outputs:
            recorded = recorded_outputs[name]
            path = _relative(workspace, name)
            if (Path(recorded["path"]) != path or recorded["sha256"] != workflow.digest(data)
                    or workflow.regular(path) != data):
                raise PlanError(f"Ready build output differs from the ZIP: {name}")
        previous = old.members[member] if name in previous_outputs else None
        if name in desired:
            raise PlanError(f"Source and generated output collide: {name}")
        desired[name] = (data, _hash_or_missing(previous))

    version = new.manifest["version"]
    desired["dist/" + _distribution_name(version)] = (raw_zip, None)
    desired["dist/SHA256SUMS.txt"] = (
        _distribution_sums(version, new.archive_sha256, new.members["plugin.js"]),
        workflow.digest(_distribution_sums(old.manifest["version"], old.archive_sha256, old.members["plugin.js"])),
    )
    if preimages.keys() - desired.keys():
        raise PlanError("Unused project preimages: " + ", ".join(sorted(preimages.keys() - desired.keys())))
    for name, (data, previous) in sorted(desired.items()):
        wanted = _hash_or_missing(data)
        # Source submissions may already be present in the shared tree. Both
        # accepted states are exact and become the transaction's actual CAS.
        allowed = (preimages[name],) if name in preimages else (previous, wanted)
        if name == "dist/SHA256SUMS.txt" and name not in preimages:
            allowed += (None,)  # Successful release cleanup may remove this file.
        _add(changes, _relative(project, name), data, allowed)


def make_plan(project, state, desktop_root, agent_root, core_root, *, old_archive=None,
              installed_before=None, project_before=None, active_core=None):
    """Create plan(old_base, new_base, files, receipt) for apply_ready().

    Roots are exact directories, desktop_root and agent_root include the
    plugin ID. The previous ZIP is read from the recorded state/archives path
    for a reconciled base, or from project/dist if no other path was supplied.
    Overrides are explicit SHA-256 preimages (or None for known absence).
    Installed keys are package member names, project keys are relative paths.
    """
    try:
        project, state, desktop, agent, core = roots = tuple(
            _existing_root(path) for path in (project, state, desktop_root, agent_root, core_root)
        )
        for index, root in enumerate(roots):
            if any(root.is_relative_to(other) or other.is_relative_to(root) for other in roots[:index]):
                raise PlanError(f"Overlapping file-plan roots: {root}")
        if old_archive is not None:
            old_archive = Path(old_archive)
            if not old_archive.is_absolute() or ".." in old_archive.parts:
                raise PlanError("The accepted previous ZIP requires an absolute lexical path")
        live_pins = _preimages(installed_before)
        project_pins = _preimages(project_before)
        if isinstance(active_core, ActiveCore):
            active_core = ActiveCore(active_core.old_bundle_sha256, active_core.new_bundle_sha256,
                                     dict(active_core.files))
    except PlanError:
        raise
    except (RuntimeError, OSError, TypeError, ValueError) as error:
        raise PlanError(str(error)) from error

    def plan(old_base, new_base, files, receipt):
        try:
            old_tree = builder.load_base(state / "bases", old_base["id"])
            new_tree = builder.load_base(state / "bases", new_base["id"])
            previous = _base_archive(project, state, old_base, old_archive)
            old = _old_archive(old_tree, old_base, previous)
            new, workspace, raw_zip = _new_archive(state, new_tree, new_base, files, receipt)
            changes = []
            _add_core(changes, core, old, new, active_core)
            _add_installed(changes, desktop, agent, old, new, live_pins)
            _add_project(changes, project, old, new, workspace, raw_zip, receipt["outputs"], project_pins)
            records, _ = installer._normalize(changes)
            installer._plan(state / "installation", records)
            return changes
        except PlanError:
            raise
        except (RuntimeError, OSError, KeyError, TypeError, ValueError, AttributeError, SyntaxError, BadZipFile) as error:
            raise PlanError(str(error)) from error

    return plan


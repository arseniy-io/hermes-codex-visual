"""Accumulate reviewed changes and prepare one exact local release."""

from argparse import ArgumentParser
from base64 import b64encode
from contextlib import contextmanager
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

import release_batch as batches
import release_queue_build as builder
import release_queue_install as installer
import release_workflow as workflow
from release_queue_store import QueueError, QueueStore


TASK_ID = re.compile(r"[a-z0-9][a-z0-9_-]{0,95}\Z")
VERSION = re.compile(r"([0-9]+)\.([0-9]+)\.([0-9]+)\Z")
MECHANISM_FILES = {
    "scripts/release_batch.py",
    "scripts/release_lock.py",
    "scripts/release_workflow.py",
    "scripts/release_queue.py",
    "scripts/release_queue_build.py",
    "scripts/release_queue_store.py",
    "scripts/release_queue_install.py",
    "scripts/release_queue_live.py",
    "scripts/release_queue_live_fence.py",
    "scripts/release_queue_live_host.py",
    "scripts/release_queue_live_job.py",
    "scripts/release_queue_live_plan.py",
    "verification/release-queue-live-probe.mjs",
    "verification/release-queue-live-probe.py",
}


def state_path(project, override=None):
    if override is not None:
        return workflow.plain(override)
    local = os.environ.get("LOCALAPPDATA")
    if not local:
        raise QueueError("LOCALAPPDATA is required for the local release registry")
    project_key = sha256(os.path.normcase(str(project)).encode("utf-8")).hexdigest()[:24]
    return workflow.plain(Path(local) / "HermesCodexVisual" / "releases" / project_key)


def task_name(value):
    if not isinstance(value, str) or not TASK_ID.fullmatch(value):
        raise QueueError("Use a stable lowercase task ID (letters, digits, hyphens, underscores)")
    # The text can also become a Windows directory name.
    batches._relative("source/" + value)
    return value


def input_path(value):
    path = batches._relative(value)
    parts = path.split("/")
    if (parts[0] not in {"source", "verification", "scripts"}
            and path not in {"THIRD_PARTY_NOTICES.txt"}):
        raise QueueError(f"Not a plugin build input: {path}")
    if (path.casefold() in MECHANISM_FILES
            or any(part in {"__pycache__", ".pytest_cache", ".pytest-cache"} for part in parts)
            or path.endswith((".pyc", ".pyo"))
            or parts[0] == "verification" and parts[1].startswith(("synthetic-", "capture-"))):
        raise QueueError(f"Reserved release input: {path}")
    return path


def unique_paths(values):
    result = {}
    for value in values:
        path = input_path(value)
        if path.casefold() in result:
            raise QueueError(f"Repeated or case-colliding path: {path}")
        result[path.casefold()] = path
    return list(result.values())


def encoded(data):
    return None if data is None else b64encode(data).decode("ascii")


def digest_value(value):
    return sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
                  .encode("utf-8")).hexdigest()


def read_base_directory(state, base_id):
    return builder.load_base(state / "bases", base_id)


def existing_store(state):
    path = workflow.plain(state / "registry.sqlite3")
    if not path.is_file():
        raise QueueError("Release queue needs a reconciled starting release")
    return QueueStore(path)


def keep_archive(state, archive, archive_hash):
    target = workflow.plain(state / "archives" / (archive_hash + ".zip"))
    raw = workflow.regular(archive)
    if workflow.digest(raw) != archive_hash:
        raise QueueError("Archive changed before saving the release baseline")
    try:
        workflow.put_new(target, raw)
    except FileExistsError:
        if workflow.regular(target) != raw:
            raise QueueError("Saved release archive does not match its checksum") from None
    return str(target)


def confirmed_installation(installed_root, receipt, manifest, members, agents):
    installed_root = workflow.plain(installed_root)
    plugin_id = manifest["name"]
    desktop = installed_root / "desktop-plugins" / plugin_id / "plugin.js"
    agent = installed_root / "plugins" / plugin_id
    if workflow.regular(desktop) != members["plugin.js"]:
        raise QueueError("Working Desktop does not match the starting archive")
    for name in agents:
        if workflow.regular(agent / name) != members[name]:
            raise QueueError(f"Working agent file differs from the starting archive: {name}")
    core = receipt.get("core_files")
    if not isinstance(core, dict) or not core:
        raise QueueError("Working installation needs a verified runtime file inventory")
    for name, digest in core.items():
        path = workflow.safe_name(name)
        if (path.split("/", 1)[0] not in {"agent", "gateway", "hermes_cli", "tui_gateway", "tools"}
                and path not in {"hermes_state_runtime.py", "hermes_state_worker_compression.py",
                                 "hermes_state_worker_lifecycle.py", "run_agent.py",
                                 "apps/shared/src/gateway-contract.generated.ts",
                                 "apps/shared/src/gateway-contract.openrpc.json"}):
            raise QueueError(f"Unsupported runtime inventory path: {path}")
        if not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest):
            raise QueueError(f"Missing runtime checksum: {path}")
        if workflow.digest(workflow.regular(installed_root / "hermes-agent" / path)) != digest:
            raise QueueError(f"Working runtime file differs from its installation receipt: {path}")
    return core


def init_queue(project, state, source, reviewed_sha256, archive, receipt_file, *, installed_root=None):
    receipt = workflow.read_json(receipt_file)
    if (not isinstance(receipt, dict) or receipt.get("schema") != 1
            or receipt.get("inputs_sha256") != reviewed_sha256
            or any(receipt.get(key) is not True for key in (
                "desktop_loaded", "gateway_ready", "installed_components_verified"))):
        raise QueueError("Starting release requires a reconciled installation receipt")
    raw_hash = workflow.digest(workflow.regular(archive))
    if raw_hash != receipt.get("archive_sha256"):
        raise QueueError("Starting archive differs from the installation receipt")
    agent_version = receipt.get("installed_agent_version")
    if agent_version is not None and (
            installed_root is None or not isinstance(agent_version, str) or version_numbers(agent_version) is None):
        raise QueueError("Historical component version requires an exact working installation check")
    manifest, members, agents, _ = workflow.read_archive(
        source, archive, raw_hash, installed_agent_version=agent_version)
    if manifest["version"] != receipt.get("version"):
        raise QueueError("Starting release version differs from the installation receipt")
    state.mkdir(parents=True, exist_ok=True)
    base = builder.snapshot(source, state / "bases", reviewed_sha256)
    if base["version"] != receipt["version"]:
        raise QueueError("Source snapshot version differs from the installation receipt")
    store = QueueStore(workflow.plain(state / "registry.sqlite3"))
    previous = store.current_base()
    if previous:
        if previous["id"] != base["id"] or previous["archive_sha256"] != raw_hash:
            raise QueueError("A different starting release is already recorded")
        return previous
    builder.prove_base(project, state, base, raw_hash, installed_agent_version=agent_version)
    installed = {}
    if installed_root is not None:
        installed = {"agent_version": agent_version or manifest["version"],
                     "core_files": confirmed_installation(installed_root, receipt, manifest, members, agents)}
    saved_archive = keep_archive(state, archive, raw_hash)
    return store.set_base({**base, **installed, "archive_sha256": raw_hash, "archive": saved_archive,
                           "version_floor": version_floor(project, base["version"])})


@contextmanager
def process_guard(path):
    path = workflow.plain(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as stream:
        if stream.tell() == 0:
            stream.write(b"\0")
            stream.flush()
        stream.seek(0)
        if os.name == "nt":
            import msvcrt

            try:
                msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError as error:
                if error.errno not in (13, 36):
                    raise
                yield False
                return
            try:
                yield True
            finally:
                stream.seek(0)
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            try:
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                yield False
                return
            try:
                yield True
            finally:
                fcntl.flock(stream, fcntl.LOCK_UN)


def begin_task(store, state, task_id, title, paths):
    task_id = task_name(task_id)
    paths = unique_paths(paths)
    task = store.task(task_id)
    if task is None:
        base = store.current_base()
        if base is None:
            raise QueueError("Release queue needs a reconciled starting release")
        task = store.register_task(task_id, title, base["id"])
    if task["title"] != title:
        raise QueueError(f"Task ID is already used by a different title: {task_id}")
    base_dir = read_base_directory(state, task["base_id"])
    folder = workflow.plain(state / "tasks" / task_id)
    candidate = workflow.plain(folder / "candidate")
    record_path = workflow.plain(folder / "files.json")
    with process_guard(folder / "checkout.guard") as acquired:
        if not acquired:
            raise QueueError(f"Task checkout is already being prepared: {task_id}")
        candidate.mkdir(parents=True, exist_ok=True)
        previous = workflow.read_json(record_path) if record_path.is_file() else []
        spellings = {path.casefold(): path for path in previous}
        for path in paths:
            existing = spellings.get(path.casefold())
            if existing is not None:
                if existing != path:
                    raise QueueError(f"Path casing differs from task checkout: {path}")
                continue
            source = workflow.regular(base_dir / path, missing=True)
            target = workflow.plain(candidate / path)
            if source is not None and not target.exists():
                workflow.put_new(target, source)
            spellings[path.casefold()] = path
        workflow.write_json(record_path, sorted(spellings.values()))
    return {"task": task, "candidate": str(candidate), "files": sorted(spellings.values())}


def collect_files(state, task, files, deletions):
    paths = unique_paths(files + deletions)
    if not paths:
        raise QueueError("Select the exact changed files or explicit deletions")
    base = read_base_directory(state, task["base_id"])
    folder = workflow.plain(state / "tasks" / task["task_id"])
    registered = set(workflow.read_json(folder / "files.json"))
    if not set(paths) <= registered:
        raise QueueError("Register all changed paths with begin before submitting them")
    candidate = workflow.plain(folder / "candidate")
    result = []
    for path in sorted(paths, key=str.casefold):
        before = batches._file_bytes(base / path, missing=True)
        after = None if path in deletions else batches._file_bytes(candidate / path)
        if before == after:
            raise QueueError(f"No change in selected file: {path}")
        result.append({"path": path, "before": encoded(before), "after": encoded(after)})
    return result


def collect_bundle(project, state, task, bundle, checksum):
    package = batches._read_bundle(project, bundle, checksum)
    base = read_base_directory(state, task["base_id"])
    files = []
    for entry in package["files"]:
        path = input_path(entry["path"])
        if batches._file_bytes(base / path, missing=True) != entry["before"]:
            raise QueueError(f"Bundle was prepared from a different base: {path}")
        files.append({"path": path, "before": encoded(entry["before"]), "after": encoded(entry["after"])})
    return files, package["checks"]


def confirmed_focuses(checks, base=None):
    if base is not None:
        workflow.unique_focus(base, checks)
    supported = workflow.BRANCH_JSON.keys() | workflow.BRANCH_IMAGES.keys()
    missing = set(checks) - supported
    if missing:
        raise QueueError("Focused scenario needs a registered result before submission: " + ", ".join(sorted(missing)))


def submit_task(project, state, store, options):
    task = store.task(task_name(options.task))
    if task is None:
        raise QueueError("Register the task with begin before submitting it")
    if not 1 <= len(options.evidence.strip()) <= 4000:
        raise QueueError("Record the focused check and its result in --evidence")
    if options.bundle is not None:
        if options.files or options.deletions or options.check or not options.sha256:
            raise QueueError("Use a reviewed bundle and its SHA-256, or select files and checks")
        files, checks = collect_bundle(project, state, task, options.bundle, options.sha256)
    else:
        if options.sha256:
            raise QueueError("--sha256 is used with --bundle")
        files = collect_files(state, task, options.files, options.deletions)
        checks = batches._checks(options.check)
    if not checks:
        raise QueueError("At least one focused verification scenario is required")
    base = read_base_directory(state, task["base_id"])
    confirmed_focuses(checks, base)
    payload = {"files": files, "evidence": options.evidence.strip()}
    checksum = digest_value({"payload": payload, "checks": checks, "base_id": task["base_id"]})
    receipt = store.submit(task["task_id"], options.revision, task["base_id"], checksum, payload, checks)
    return {"status": "submitted", "task_id": task["task_id"],
            "revision": receipt["revision"], "digest": checksum}


def short_selection(selection):
    return [{"task": item["task_id"], "title": item["title"], "revision": item["revision"]}
            for item in selection["items"]]


def version_numbers(version):
    match = VERSION.fullmatch(version)
    return tuple(map(int, match.groups())) if match else None


def version_floor(project, current):
    manifest = workflow.read_json(project / "package.json")
    candidates = [current, manifest["version"]]
    dist = workflow.plain(project / "dist")
    if dist.is_dir():
        for archive in dist.glob("hermes-codex-visual-v*.zip"):
            match = re.fullmatch(r"hermes-codex-visual-v([0-9.]+)(?:-local)?\.zip", archive.name)
            if match:
                candidates.append(match[1])
    return max((version for version in candidates if version_numbers(version)), key=version_numbers)


def next_version(base):
    version = version_numbers(base["version"])
    floor = version_numbers(base.get("version_floor", base["version"]))
    if version is None or floor is None:
        raise QueueError("Starting release needs a numeric major.minor.patch version")
    major, minor, patch = max(version, floor)
    return f"{major}.{minor}.{patch + 1}"


def requested_candidates(store):
    intent = store.pending_install()
    active = store.selection()
    if intent is None or intent["selection"]["key"] == active["key"]:
        return [active]
    return [intent["selection"], active]


def checked_archive(state, record, selection):
    details = record["details"]
    if (record["key"] != selection["key"] or record["state"] != "ready"
            or details.get("selection_key") != selection["key"]
            or details.get("test_only") is not False
            or details.get("version") != next_version(selection["base"])):
        raise QueueError("Ready archive does not belong to the selected release")
    archive = workflow.plain(Path(details["archive"]))
    if not archive.is_relative_to(state):
        raise QueueError("Ready archive is outside the local release storage")
    if workflow.digest(workflow.regular(archive)) != details["archive_sha256"]:
        raise QueueError("Ready archive changed after the focused checks")
    journal = workflow.plain(Path(details["journal"]))
    if not journal.is_relative_to(state) or workflow.digest(workflow.regular(journal)) != details["journal_sha256"]:
        raise QueueError("Focused verification receipt changed after the build")
    workspace = workflow.plain(Path(details["workspace"]))
    if not workspace.is_relative_to(state):
        raise QueueError("Tested workspace is outside the local release storage")
    workflow.read_archive(workspace, archive, details["archive_sha256"])
    for name, output in details.get("outputs", {}).items():
        path = workflow.plain(Path(output["path"]))
        if (not path.is_relative_to(workspace) or path != workflow.plain(workspace / name)
                or workflow.digest(workflow.regular(path)) != output["sha256"]):
            raise QueueError(f"Verified build output changed: {name}")
    snapshot = details["snapshot"]
    if snapshot["version"] != details["version"]:
        raise QueueError("Candidate base version differs from the tested archive")
    read_base_directory(state, snapshot["id"])
    return details


def prepare_pending(project, state, store, retry=False, *, selection_key=None,
                    reviewed_inputs=None, integration_checks=None):
    confirmed_focuses(integration_checks or [])
    results = []
    attempted = set()
    while True:
        with process_guard(state / "worker.guard") as acquired:
            if not acquired:
                return {"status": "worker_running", "processed": results}
            while True:
                selected = pending_build(store, attempted, retry, selection_key)
                if selected is None:
                    break
                key = selected["key"]
                attempted.add(key)
                current = store.candidate(key)
                build_request = {} if current is None else dict(current["details"].get("build_request", {}))
                if reviewed_inputs is not None:
                    build_request["reviewed_inputs_sha256"] = reviewed_inputs
                if integration_checks:
                    build_request["integration_checks"] = sorted(set(
                        build_request.get("integration_checks", []) + integration_checks))
                reason = readiness_issue(state, current, selected, build_request)
                if current is not None and current["state"] == "ready" and reason is None:
                    continue
                if reason is not None or reviewed_inputs is not None or integration_checks:
                    with process_guard(state / "activation.guard") as activation_available:
                        if not activation_available:
                            return {"status": "installation_in_progress", "processed": results}
                        store.requeue_candidate(selected, current, reason or "Reviewed build requested", build_request)
                build_input = dict(selected)
                for field in ("reviewed_inputs_sha256", "integration_checks"):
                    if field in build_request:
                        build_input[field] = build_request[field]
                try:
                    version = next_version(selected["base"])
                    details = builder.recover_prepared(state, build_input, version)
                    if details is None:
                        details = builder.prepare(project, state, build_input, version)
                    checked_archive(state, {"key": key, "state": "ready", "details": details}, selected)
                    expected_zip = build_request.get("expected_archive_sha256")
                    if expected_zip and details["archive_sha256"] != expected_zip:
                        raise QueueError("Replacement build does not reproduce the verified ZIP")
                    if not set(build_request.get("integration_checks", [])) <= set(details["checks"]):
                        raise QueueError("Build did not prove the required combined scenarios")
                except (builder.BuildError, QueueError, workflow.WorkflowError, OSError, ValueError) as error:
                    status, details = "blocked", {"reason": str(error)}
                else:
                    status = "ready"
                if build_request:
                    details = {**details, "build_request": build_request}
                if store.current_base()["id"] == selected["base"]["id"]:
                    store.save_candidate(selected, status, details)
                    results.append({"key": key, "status": status,
                                    **{field: details[field] for field in ("version", "reason") if field in details}})
        # A submission can land between the final read and releasing the worker lock.
        if pending_build(store, attempted, retry, selection_key) is None:
            return {"status": "worker_idle", "processed": results}


def pending_build(store, attempted, retry, selected_key=None):
    for selection in requested_candidates(store):
        if not selection["items"] or selection["key"] in attempted:
            continue
        if selected_key is not None and selection["key"] != selected_key:
            continue
        existing = store.candidate(selection["key"])
        if existing is None or retry or existing["details"].get("retry_pending") is True:
            return selection
    return None


def readiness_issue(state, current, selected, build_request):
    if current is None or current["state"] != "ready":
        return None
    try:
        ready = checked_archive(state, current, selected)
    except (QueueError, builder.BuildError, workflow.WorkflowError, OSError) as error:
        issue = str(error)
    else:
        if set(build_request.get("integration_checks", [])) <= set(ready["checks"]):
            return None
        issue = "The ready ZIP needs the newly requested combined scenarios"
    build_request["expected_archive_sha256"] = current["details"]["archive_sha256"]
    return issue


def launch_worker(project, state):
    log = workflow.plain(state / "worker.log")
    options = {"creationflags": subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP
               } if os.name == "nt" else {"start_new_session": True}
    try:
        with log.open("ab") as output:
            subprocess.Popen([sys.executable, "-B", str(Path(__file__).resolve()), "--root", str(project),
                              "--state", str(state), "work", "--background"], cwd=project, stdin=subprocess.DEVNULL,
                             stdout=output, stderr=output, **options)
    except OSError as error:
        return {"worker": "launch_failed", "reason": str(error)}
    return {"worker": "notified"}


def gather_submissions(store):
    """Give closely spaced submissions a single combined build."""
    start = changed = time.monotonic()
    current = store.selection()["key"]
    while time.monotonic() - start < 6 and time.monotonic() - changed < 1.25:
        time.sleep(0.25)
        latest = store.selection()["key"]
        if latest != current:
            current, changed = latest, time.monotonic()


def apply_ready(state, store, intent, receipt, maintenance, plan):
    """Connect the exact ready archive to a separately proven installation adapter."""
    selection = intent["selection"]
    target_base = receipt["snapshot"]
    if target_base["version"] != receipt["version"]:
        raise QueueError("Candidate base version differs from the tested archive")
    read_base_directory(state, target_base["id"])
    workspace = workflow.plain(Path(receipt["workspace"]))
    if not workspace.is_relative_to(state):
        raise QueueError("Tested workspace is outside the local release storage")
    _, files, _, _ = workflow.read_archive(workspace, Path(receipt["archive"]), receipt["archive_sha256"])
    changes = plan(selection["base"], target_base, files, receipt)
    new_base = {**target_base, "archive_sha256": receipt["archive_sha256"],
                "archive": keep_archive(state, Path(receipt["archive"]), receipt["archive_sha256"]),
                "agent_version": receipt["version"]}
    if "core_files" in selection["base"]:
        new_base["core_files"] = selection["base"]["core_files"]

    def commit(probe):
        evidence = probe.get("evidence")
        if (not isinstance(evidence, dict)
                or evidence.get("release_version") != receipt["version"]
                or evidence.get("archive_sha256") != receipt["archive_sha256"]
                or any(evidence.get(key) is not True for key in (
                    "desktop_loaded", "gateway_ready", "installed_components_verified"))):
            raise QueueError("The working Desktop and server did not confirm the exact release")
        confirmation = {"intent_id": intent["id"], "verified": True, "version": receipt["version"],
                        "archive_sha256": receipt["archive_sha256"], "new_base_id": new_base["id"],
                        "activation": evidence}
        store.complete_install(intent["id"], selection["key"], new_base, confirmation)

    return installer.apply_release(state / "installation", intent["id"], changes, maintenance,
                                   commit, lambda request: store.installed(request) is not None)


def request_install(project, state, store, *, maintenance=None, plan=None, request=None):
    if (maintenance is None) != (plan is None):
        raise QueueError("Installation needs both a verified maintenance adapter and a file plan")
    with process_guard(state / "activation.guard") as acquired:
        if not acquired:
            return {"status": "installation_in_progress"}
        previous = None
        if request is not None:
            previous = store.installed(request)
            pending = store.pending_install()
            if previous is None and (pending is None or pending["id"] != request):
                raise QueueError("That installation request is no longer open")
        try:
            recovery = installer.recover_release(state / "installation", maintenance,
                                                 lambda intent: store.installed(intent) is not None,
                                                 request=request)
        except installer.InstallError as error:
            if maintenance is not None:
                raise
            return {"status": "installation_recovery_required", "reason": str(error)}
        if recovery.get("recovered"):
            return {**recovery, "request": recovery["intent_id"]}
        if previous is not None:
            return {"status": "committed", "request": request, "version": previous["new_base"]["version"]}
        if recovery["status"] == "other_request_active":
            return {"status": "installation_recovery_required",
                    "reason": "Settle the earlier installation before proceeding with this request"}
        return install_selection(project, state, store, maintenance, plan)


def install_selection(project, state, store, maintenance, plan):
    intent = store.freeze()
    if intent is None:
        return {"status": "no_submitted_changes"}
    selected = intent["selection"]
    result = {"request": intent["id"], "items": short_selection(selected)}
    record = store.candidate(selected["key"])
    if record is None or record["details"].get("retry_pending") is True:
        return {**result, "status": "preparing", **launch_worker(project, state)}
    if record["state"] != "ready":
        return {**result, "status": "blocked", **record["details"]}
    build_request = dict(record["details"].get("build_request", {}))
    reason = readiness_issue(state, record, selected, build_request)
    if reason is not None:
        store.requeue_candidate(selected, record, reason, build_request)
        return {**result, "status": "preparing", "reason": reason, **launch_worker(project, state)}
    receipt = record["details"]
    if maintenance is not None:
        return {**result, **apply_ready(state, store, intent, receipt, maintenance, plan)}
    return {**result, "status": "waiting_for_maintenance", "version": receipt["version"],
            "archive": receipt["archive"], "archive_sha256": receipt["archive_sha256"],
            "reason": "The shared Desktop and gateway maintenance barrier is not verified"}


def command_status(state):
    if not workflow.plain(state / "registry.sqlite3").is_file():
        return {"enabled": False, "status": "needs_baseline"}
    store = existing_store(state)
    status = store.status()
    status["enabled"] = status["base"] is not None
    status["live_installer_connected"] = workflow.plain(state / "live.json").is_file()
    if status["pending_install"] is not None:
        pending = status["pending_install"]
        candidate = store.candidate(pending["key"])
        if candidate is not None:
            pending.update({key: candidate["details"][key] for key in ("version", "reason")
                            if key in candidate["details"]})
    return status


def cancel_request(state, store, request):
    with process_guard(state / "activation.guard") as acquired:
        if not acquired:
            raise QueueError("An installation journal must be settled before cancelling its request")
        installer.recover_release(state / "installation", None,
                                  lambda intent: store.installed(intent) is not None)
        return store.cancel(request)


def run_live_install(project, state, store, install, request):
    result = install(project, state, store, request_install, request=request)
    if result["status"] != "preparing" or result["worker"] != "notified":
        return result
    request = result["request"]
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        pending = store.pending_install()
        if pending is None or pending["id"] != request:
            if store.installed(request) is not None:
                return request_install(project, state, store, request=request)
            return {"status": "request_closed", "request": request}
        candidate = store.candidate(pending["selection"]["key"])
        if candidate is not None and candidate["details"].get("retry_pending") is not True:
            return install(project, state, store, request_install, request=request)
        time.sleep(0.5)
    return result


def parser():
    top = ArgumentParser(description=__doc__)
    top.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    top.add_argument("--state", type=Path, help="Use separate local storage for isolated verification")
    sub = top.add_subparsers(dest="command", required=True)
    sub.add_parser("status")
    install = sub.add_parser("install")
    install.add_argument("--request", help="Resume or query this exact prior installation")
    connect = sub.add_parser("connect-live", help="Register the verified local Windows Hermes installation")
    connect.add_argument("--proof", required=True, type=Path)
    cancel = sub.add_parser("cancel-request")
    cancel.add_argument("--request", required=True)
    inspect = sub.add_parser("inspect")
    inspect.add_argument("--from", dest="source", type=Path)
    init = sub.add_parser("init")
    init.add_argument("--from", dest="source", type=Path)
    init.add_argument("--reviewed-inputs-sha256", required=True)
    init.add_argument("--archive", type=Path, required=True)
    init.add_argument("--receipt", type=Path, required=True)
    init.add_argument("--installed-root", type=Path, help="Cross-check the approved baseline against installed files")
    begin = sub.add_parser("begin")
    begin.add_argument("--task", required=True)
    begin.add_argument("--title", required=True)
    begin.add_argument("--file", dest="files", action="append", default=[])
    submit = sub.add_parser("submit")
    submit.add_argument("--task", required=True)
    submit.add_argument("--revision", required=True, type=int)
    submit.add_argument("--file", dest="files", action="append", default=[])
    submit.add_argument("--delete", dest="deletions", action="append", default=[])
    submit.add_argument("--check", action="append", default=[])
    submit.add_argument("--bundle", type=Path)
    submit.add_argument("--sha256")
    submit.add_argument("--evidence", required=True)
    work = sub.add_parser("work")
    work.add_argument("--retry", action="store_true")
    work.add_argument("--background", action="store_true", help="Group closely spaced submissions")
    work.add_argument("--selection", help="Limit a reviewed build to this exact queue selection")
    work.add_argument("--reviewed-inputs-sha256")
    work.add_argument("--integration-check", action="append", default=[])
    return top


def main(argv=None):
    args = parser().parse_args(argv)
    try:
        project = workflow.plain(args.root)
        state = state_path(project, args.state)
        if args.command == "status":
            result = command_status(state)
        elif args.command == "inspect":
            result = builder.fingerprint(workflow.plain(args.source or project))
        elif args.command == "init":
            result = init_queue(project, state, workflow.plain(args.source or project),
                                args.reviewed_inputs_sha256, args.archive, args.receipt,
                                installed_root=args.installed_root)
        else:
            store = existing_store(state)
            if args.command == "begin":
                result = begin_task(store, state, args.task, args.title, args.files)
            elif args.command == "submit":
                result = submit_task(project, state, store, args)
                result.update(launch_worker(project, state))
            elif args.command == "work":
                if (args.reviewed_inputs_sha256 or args.integration_check) and (
                        args.selection is None or not re.fullmatch(r"[a-f0-9]{64}", args.selection)):
                    raise QueueError("Pass the exact --selection with reviewed inputs or combined checks")
                if args.background:
                    gather_submissions(store)
                result = prepare_pending(project, state, store,
                                         args.retry or bool(args.reviewed_inputs_sha256 or args.integration_check),
                                         selection_key=args.selection, reviewed_inputs=args.reviewed_inputs_sha256,
                                         integration_checks=args.integration_check)
            elif args.command == "cancel-request":
                result = cancel_request(state, store, args.request)
            elif args.command == "connect-live" or workflow.plain(state / "live.json").is_file():
                from release_queue_live import configure, install
                from release_queue_live_fence import GatePatchError

                if state != state_path(project):
                    raise QueueError("Working installation requires the project's normal release storage")
                try:
                    if args.command == "connect-live":
                        if not store.current_base().get("core_files"):
                            raise QueueError("First confirm the exact installed baseline")
                        result = configure(project, state, workflow.read_json(args.proof))
                    else:
                        result = run_live_install(project, state, store, install, args.request)
                except GatePatchError as error:
                    raise QueueError(str(error)) from error
            else:
                result = request_install(project, state, store, request=args.request)
        print(json.dumps(result, ensure_ascii=True, indent=2))
        return 0
    except (QueueError, builder.BuildError, batches.BatchError, installer.InstallError,
            workflow.WorkflowError, OSError) as error:
        print(json.dumps({"status": "error", "reason": str(error)}, ensure_ascii=True), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

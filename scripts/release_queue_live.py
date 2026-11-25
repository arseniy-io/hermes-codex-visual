"""Windows Hermes maintenance for a frozen, already verified queue release."""

from contextlib import contextmanager
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from secrets import token_hex
import subprocess
import time
from uuid import uuid4

import release_lock as shared
import release_queue_install as installer
import release_queue_live_fence as fence
import release_queue_live_plan as plans
import release_workflow as workflow
from release_queue_store import QueueError


DESKTOP = "hermes-agent/apps/desktop/release/win-unpacked/Hermes.exe"
PLUGIN_ID = "hermes-codex-visual"
ROOT = "hermes"


class LiveError(QueueError):
    pass


def local_root():
    if os.name != "nt" or not os.environ.get("LOCALAPPDATA"):
        raise LiveError("Working Hermes maintenance is available on its registered Windows installation")
    return workflow.plain(Path(os.environ["LOCALAPPDATA"]) / ROOT)


def quiet_options():
    startup = subprocess.STARTUPINFO()
    startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startup.wShowWindow = subprocess.SW_HIDE
    return {"startupinfo": startup, "creationflags": subprocess.CREATE_NO_WINDOW}


class HostControl:
    def __init__(self, project, root, state):
        self.project = project
        self.root = root
        self.state = state
        runtime_id = workflow.pinned_test_runtime(project)["runtime_id"]
        location = Path(os.environ["LOCALAPPDATA"]) / "hermes-codex-visual-test/runtimes"
        self.python = workflow.plain(location / runtime_id / "venv/Scripts/python.exe")
        if not self.python.is_file():
            raise LiveError("The verified Hermes control interpreter is missing")

    def command(self, operation):
        return [str(self.python), "-I", "-B", "-X", "utf8",
                str(Path(__file__).with_name("release_queue_live_host.py")),
                "--hermes-root", str(self.root), operation]

    def read(self, operation, timeout=25):
        try:
            result = subprocess.run(self.command(operation), cwd=self.project, timeout=timeout,
                                    capture_output=True, text=True, encoding="utf-8", **quiet_options())
        except subprocess.TimeoutExpired as error:
            raise LiveError(f"Hermes did not complete the {operation} check") from error
        if result.returncode:
            try:
                problem = json.loads(result.stderr).get("error")
            except ValueError:
                problem = None
            raise LiveError(problem or f"Hermes control check failed: {operation}")
        return json.loads(result.stdout)

    @contextmanager
    def native_update(self):
        path = workflow.plain(self.state / "maintenance-log" / (uuid4().hex + ".json"))
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("xb") as output:
            handle = subprocess.Popen(self.command("lock"), cwd=self.project, stdin=subprocess.PIPE,
                                      stdout=output, stderr=subprocess.DEVNULL, **quiet_options())
            try:
                deadline = time.monotonic() + 12
                while True:
                    if handle.poll() is not None:
                        raise LiveError("The normal Hermes updater is busy or its lock could not be acquired")
                    if path.stat().st_size:
                        if workflow.read_json(path) != {"locked": True}:
                            raise LiveError("The native Hermes update lock returned an unknown receipt")
                        break
                    if time.monotonic() >= deadline:
                        raise LiveError("The native Hermes update lock did not answer")
                    time.sleep(0.1)
                yield handle
                if handle.poll() is not None:
                    raise LiveError("The native Hermes update owner exited during maintenance")
            finally:
                handle.stdin.close()
                try:
                    handle.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    handle.terminate()
                    handle.wait(timeout=5)


@contextmanager
def project_owner(project, state):
    from release_queue import process_guard

    with process_guard(state / "live-activation.guard") as acquired:
        if not acquired:
            raise LiveError("Another accumulated release process is running")
        owner = "accumulated-release-live-" + state.name
        try:
            shared.change(project, "acquire", owner, task="Apply verified accumulated release")
        except shared.OwnershipError as error:
            raise LiveError(str(error)) from error
        try:
            shared.change(project, "phase", owner, phase="install")
            yield
        finally:
            shared.change(project, "release", owner, note="Accumulated release phase finished; see its journal")


def target_metadata(path):
    return installer._read_target(path)


def configure(project, state, passes):
    """Install reviewed passive admission checks. Each replacement is atomic."""
    if not all(passes.get(key) is True for key in ("packaged_start_gate", "python_start_gate", "owner_death")):
        raise LiveError("The Windows startup checks have not been confirmed")
    root = local_root()
    assert_setup_not_staged(root)
    if workflow.plain(root / fence.MARKER_NAME).exists():
        raise LiveError("Recover the outstanding maintenance journal before changing launch hooks")
    host = HostControl(project, root, state)
    workflow.check_test_runtime(project)
    proposed = fence.patch_gate_files(root)
    changes = [item for item in proposed if item["before"] != item["after"]]
    saved = workflow.plain(state / "launch-hooks" / uuid4().hex)
    saved.mkdir(parents=True)
    for index, item in enumerate(changes):
        path = item["target"]
        workflow.put_new(saved / f"{index}-before{path.suffix}", item["before"])
        workflow.put_new(saved / f"{index}-after{path.suffix}", item["after"])
        if path.suffix == ".py":
            compile(item["after"], str(path), "exec")
        else:
            subprocess.run([workflow.tool("node"), "--check", str(saved / f"{index}-after{path.suffix}")],
                           check=True, capture_output=True, **quiet_options())
    workflow.write_json(saved / "targets.json", {"files": [
        {"path": str(item["target"]), "before_sha256": workflow.digest(item["before"]),
         "after_sha256": workflow.digest(item["after"])} for item in changes]})
    with project_owner(project, state), host.native_update():
        assert_setup_not_staged(root)
        assert_desktop_closed(host)
        for item in changes:
            path = item["target"]
            current, metadata = target_metadata(path)
            if current != item["before"]:
                raise LiveError(f"Hermes launch file changed during setup: {path.name}")
            with installer._stage(path, item["after"], metadata) as (pending, _):
                if target_metadata(path) != (current, metadata):
                    raise LiveError(f"Hermes launch file changed before replacement: {path.name}")
                installer._move(pending, path, replace=True)
    fence.verify_gate_files(root)
    config = {"schema": 1, "root": str(root), "hook_proof": passes, "backup": str(saved),
              "registeredAt": datetime.now(timezone.utc).isoformat()}
    workflow.write_json(state / "live.json", config)
    return config


def installed_package_roots(root):
    return root / "desktop-plugins" / PLUGIN_ID, root / "plugins" / PLUGIN_ID


def assert_setup_not_staged(root):
    profiles = workflow.plain(root / "profiles")
    homes = [root, *(item for item in profiles.iterdir() if item.is_dir())] if profiles.is_dir() else [root]
    for home in homes:
        if workflow.plain(home / "hermes-setup.exe").exists():
            raise LiveError("Finish the staged native Hermes update before installing the plugin")


def assert_desktop_closed(host):
    if any(process["role"] == "desktop" for process in host.read("processes")):
        raise LiveError("Close the working Hermes window through its normal Exit action to continue")


class Maintenance:
    """Engine callbacks. Restore through the same persisted startup barrier."""

    def __init__(self, project, state, config, store, probe):
        self.project = project
        self.state = state
        self.root = local_root()
        if config["schema"] != 1 or workflow.plain(Path(config["root"])) != self.root:
            raise LiveError("The working Hermes installation differs from its registration")
        fence.verify_gate_files(self.root)
        self.host = HostControl(project, self.root, state)
        self.store = store
        self.probe_package = probe
        self.marker = workflow.plain(self.root / fence.MARKER_NAME)
        self.permit = workflow.plain(self.root / fence.PROBE_NAME)
        self.proven = True

    def validate_targets(self, intent_id, targets):
        desktop, agent = installed_package_roots(self.root)
        for target in targets:
            if not (target == desktop / "plugin.js" or target.is_relative_to(agent)
                    or target.is_relative_to(self.project)):
                raise LiveError(f"Release tried to replace a file outside its registered scope: {target.name}")

    def _marker_content(self, intent_id):
        return {"schema": 1, "intent_id": intent_id, "project": str(self.project)}

    def marker_owner(self, intent_id):
        if not self.marker.exists():
            return False
        if workflow.read_json(self.marker) != self._marker_content(intent_id):
            raise LiveError("Another maintenance request owns the persistent Hermes startup barrier")
        return True

    def revoke_probe(self, intent_id):
        if self.permit.exists():
            permit = workflow.read_json(self.permit)
            if permit.get("schema") != 1 or permit.get("intent_id") != intent_id:
                raise LiveError("An unknown probe owns the isolated startup permission")
            self.permit.unlink()

    def enter(self, intent_id):
        fence.verify_gate_files(self.root)
        assert_setup_not_staged(self.root)
        assert_desktop_closed(self.host)
        if not self.marker_owner(intent_id):
            if self.permit.exists():
                raise LiveError("An isolated startup permission exists outside its maintenance window")
            text = json.dumps(self._marker_content(intent_id), ensure_ascii=True).encode("ascii")
            workflow.put_new(self.marker, text + b"\n")
        self.revoke_probe(intent_id)
        # Two-sided admission: any launch accepted before the durable marker
        # owns a lease published before it read the marker.
        assert_desktop_closed(self.host)
        self.host.read("pause", timeout=45)
        deadline = time.monotonic() + 8
        while self.host.read("processes"):
            if time.monotonic() >= deadline:
                raise LiveError("Hermes still has a local process inside the installation")
            time.sleep(0.25)
        self.marker_owner(intent_id)

    def verify_base(self, intent_id, expected):
        if not self.marker_owner(intent_id):
            raise LiveError("The durable Hermes startup barrier was lost")
        self._verify_core(self.store.current_base())

    def _verify_core(self, base):
        pins = base.get("core_files", {})
        if not pins:
            raise LiveError("The release has no verified working runtime inventory")
        for name, checksum in pins.items():
            target = workflow.plain(self.root / "hermes-agent" / workflow.safe_name(name))
            if workflow.digest(workflow.regular(target)) != checksum:
                raise LiveError(f"Working Hermes runtime differs from the verified release: {name}")

    def probe(self, intent_id, version, expected):
        fence.verify_gate_files(self.root)
        if not self.marker_owner(intent_id):
            raise LiveError("Hermes startup barrier disappeared before activation")
        self._verify_core(self.store.current_base())
        intent = self.store.pending_install()
        base = self.store.current_base()
        if version == "new":
            record = self.store.candidate(intent["selection"]["key"]) if intent else None
            if not record or record["state"] != "ready":
                raise LiveError("The frozen candidate disappeared during activation")
            release = record["details"]
            desktop_version = release["version"]
            agent_version = desktop_version
            checksum = release["archive_sha256"]
            archive = Path(release["archive"])
        else:
            desktop_version = base["version"]
            agent_version = base["agent_version"]
            checksum = base["archive_sha256"]
            archive = Path(base["archive"])
        if workflow.digest(workflow.regular(archive)) != checksum:
            raise LiveError("The prepared activation archive changed")
        sandbox = workflow.plain(self.state / "runtime-probes" / uuid4().hex)
        sandbox.mkdir(parents=True)
        token = token_hex(32)
        permit = {"schema": 1, "intent_id": intent_id, "token_sha256": workflow.digest(token.encode("ascii")),
                  "probe_root": str(sandbox)}
        workflow.put_new(self.permit, json.dumps(permit, ensure_ascii=True).encode("ascii") + b"\n")
        try:
            evidence = self.probe_package(self.project, archive, desktop_version, agent_version,
                                          token=token, sandbox=sandbox)
        finally:
            self.revoke_probe(intent_id)
        if not isinstance(evidence, dict) or any(evidence.get(key) is not True for key in (
                "desktop_loaded", "gateway_ready", "installed_components_verified")):
            raise LiveError("The guarded isolated activation did not confirm both components")
        return {"intent_id": intent_id, "version": version, "evidence": {
            **evidence, "release_version": desktop_version, "archive_sha256": checksum}}

    def leave(self, intent_id):
        fence.verify_gate_files(self.root)
        assert_setup_not_staged(self.root)
        if self.marker_owner(intent_id):
            self.revoke_probe(intent_id)
            self.marker.unlink()


def file_plan(project, state, root, base):
    desktop, agent = installed_package_roots(root)
    core = root / "hermes-agent"

    def create(old, new, files, receipt):
        workspace = workflow.plain(Path(receipt["workspace"]))
        _, _, agents, _ = workflow.read_archive(workspace, Path(receipt["archive"]), receipt["archive_sha256"])
        new_digest, _ = plans.describe_core(files, agents)
        evidence = plans.ActiveCore(new_digest, new_digest, dict(old["core_files"]))
        verified = plans.make_plan(project, state, desktop, agent, core, active_core=evidence)(
            old, new, files, receipt)
        return [item for item in verified if not item["target"].is_relative_to(core)]

    return create


def probe_isolated(project, archive, desktop_version, agent_version, *, token, sandbox):
    from release_queue_live_job import run

    entry = workflow.plain(project / "verification/release-queue-live-probe.mjs")
    env = {key: value for key, value in os.environ.items()
           if not key.upper().startswith(("GIT_", "HCV_", "NODE_", "PYTHON", "ELECTRON_"))}
    env.update(HCV_RELEASE_PROBE_ROOT=str(sandbox), HCV_RELEASE_PROBE_TOKEN=token)
    options = quiet_options()
    try:
        result = run([workflow.tool("node"), str(entry), str(project), str(archive),
                      desktop_version, agent_version], cwd=project, env=env,
                     startupinfo=options["startupinfo"], timeout=85)
    except subprocess.TimeoutExpired as error:
        raise LiveError("The isolated Hermes activation timed out") from error
    try:
        summary = json.loads(result.stdout)
    except ValueError as error:
        raise LiveError("The isolated activation returned no readable proof") from error
    if result.returncode or summary.get("passed") is not True:
        raise LiveError("The isolated Hermes could not confirm activation. See " +
                        str(summary.get("evidenceFile", sandbox)))
    evidence_path = workflow.plain(Path(summary["evidenceFile"]))
    if not evidence_path.is_relative_to(sandbox):
        raise LiveError("The activation proof is outside its private profile")
    evidence = workflow.read_json(evidence_path)
    observed = evidence["desktop"]["activation"]["version"]
    agents = evidence["gateway"]["plugins_list"]["plugins"]
    loaded = [item for item in agents if item.get("name") == PLUGIN_ID
              and item.get("enabled") is True and not item.get("load_error")]
    if (observed != desktop_version or len(loaded) != 1 or loaded[0]["version"] != agent_version
            or evidence["gateway"]["state"] != "ready"
            or evidence["gateway_stop"]["status"] != "planned_stop"):
        raise LiveError("Activation proof does not match the exact release or did not stop cleanly")
    return {"desktop_loaded": True, "gateway_ready": True, "installed_components_verified": True,
            "desktop_version": observed, "agent_version": agent_version, "scope": "isolated",
            "evidence": str(evidence_path), "evidence_sha256": workflow.digest(workflow.regular(evidence_path))}


def verify_working_launch(host, expected, began, old_ids):
    marker = workflow.plain(Path(os.environ["APPDATA"]) / "Hermes/plugin-files/data" / PLUGIN_ID / "loaded-version.json")
    deadline = time.monotonic() + 72
    last = "Hermes has not yet reported activation"
    while time.monotonic() < deadline:
        try:
            report = workflow.read_json(marker)
            stamp = datetime.fromisoformat(report["loadedAt"].replace("Z", "+00:00"))
            if report["version"] == expected["version"] and stamp >= began:
                agent = host.read("loaded", timeout=10)
                if agent["version"] == expected["agent_version"] and agent["instance_id"] not in old_ids:
                    return {"version": report["version"], "loaded_at": report["loadedAt"],
                            "agent": agent["version"], "gateway": "ready"}
            last = "The working window or gateway has not yet reported the exact new version"
        except (LiveError, workflow.WorkflowError, OSError, ValueError, KeyError) as error:
            last = str(error)
        time.sleep(0.75)
    raise LiveError(last)


def install(project, state, store, request_install, *, request=None):
    config = workflow.read_json(state / "live.json")
    maintenance = Maintenance(project, state, config, store, probe_isolated)
    host = maintenance.host
    plan = file_plan(project, state, maintenance.root, store.current_base())
    with project_owner(project, state):
        if not maintenance.marker.exists():
            pending = store.pending_install()
            if request is not None and (pending is None or pending["id"] != request):
                return request_install(project, state, store, request=request)
            intent = pending or store.freeze()
            if intent is None:
                return {"status": "no_submitted_changes"}
            request = intent["id"]
            ready = store.candidate(intent["selection"]["key"])
            if ready is None or ready["state"] != "ready" or ready["details"].get("retry_pending") is True:
                return request_install(project, state, store, request=request)
            try:
                assert_desktop_closed(host)
            except LiveError as error:
                return {"status": "waiting_for_exit", "request": request, "reason": str(error)}
        assert_setup_not_staged(maintenance.root)
        snapshot = host.read("inspect")
        if snapshot["unavailable"] or any(owner["active_agents"] or owner["active_items"]
                                          for owner in snapshot["owners"]):
            raise LiveError("A working Hermes profile is active or could not be checked")
        old_ids = {owner["instance_id"] for owner in snapshot["owners"]}
        with host.native_update():
            try:
                result = request_install(project, state, store, maintenance=maintenance, plan=plan, request=request)
            except installer.InstallError as error:
                if error.status != "rolled_back":
                    raise
                result = {"status": "rolled_back", "reason": str(error)}
        if result["status"] not in {"committed", "rolled_back"}:
            return result
        if maintenance.marker.exists() or maintenance.permit.exists():
            raise LiveError("The working launch is still protected by an open maintenance journal")
        expected = store.current_base()
        began = datetime.now(timezone.utc)
        try:
            exe = workflow.plain(maintenance.root / DESKTOP)
            if not exe.is_file():
                raise LiveError("The registered Hermes desktop application is missing")
            subprocess.Popen([str(exe)], cwd=exe.parent, stdin=subprocess.DEVNULL,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            observed = verify_working_launch(host, expected, began, old_ids)
        except (OSError, LiveError) as error:
            return {**result, "status": "activation_pending", "version": expected["version"],
                    "reason": str(error)}
        report = {**result, "status": "installed" if result["status"] == "committed" else "rolled_back",
                  "working": observed}
        workflow.write_json(state / "last-working-activation.json", report)
        return report

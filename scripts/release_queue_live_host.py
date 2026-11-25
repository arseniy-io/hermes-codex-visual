"""Inspect or gracefully pause the Windows Hermes processes in one local installation."""

import argparse
import asyncio
import json
import os
from pathlib import Path
import re
import sys
import time
from urllib.parse import urlsplit


class HostError(RuntimeError):
    pass


LEASE_NAME = re.compile(r"(desktop|cli|gateway)\.([1-9][0-9]*)\.[0-9a-f]{32}\.lease\Z")
LEASE_DIRECTORY = ".hcv-codex-visual-starts"


def scopes(root):
    parent = root / "profiles"
    result = [root]
    if parent.is_dir():
        for item in sorted(parent.iterdir()):
            if item.is_dir():
                if item.resolve() != item:
                    raise HostError("A Hermes profile is outside the expected local launch scope")
                result.append(item)
    return result


def snapshot(root):
    from hermes_cli.gateway_lifecycle_guards import live_work
    from hermes_cli.gateway_runtime import discover_gateway_endpoint

    owners = {}
    unavailable = []
    for scope in scopes(root):
        gateway = discover_gateway_endpoint(scope, timeout=1.5)
        endpoint = gateway.endpoint
        if gateway.state == "absent":
            continue
        if not endpoint or gateway.state not in {"ready", "draining", "restart_wait"}:
            unavailable.append(str(scope))
            continue
        owner = Path(endpoint.control_home or scope).resolve()
        origin = urlsplit(endpoint.api_origin)
        if not owner.is_relative_to(root) or origin.scheme != "http" or origin.hostname not in {
                "127.0.0.1", "::1", "localhost"}:
            unavailable.append(str(scope))
            continue
        if owner in owners and owners[owner]["instance_id"] != endpoint.instance_id:
            raise HostError("A local gateway restarted during the maintenance check")
        if owner not in owners:
            work = live_work(owner)
            count = work.get("active_agents") if work is not None else None
            active = work.get("active_work") if work is not None else None
            if type(count) is not int or not isinstance(active, list):
                unavailable.append(str(owner))
                continue
            owners[owner] = {"home": str(owner), "instance_id": endpoint.instance_id,
                             "state": gateway.state, "active_agents": count, "active_items": len(active)}
    return {"owners": list(owners.values()), "unavailable": sorted(set(unavailable))}


def pause_idle(root, timeout):
    from gateway.control_socket import identify_gateway, query_gateway_control

    current = snapshot(root)
    if current["unavailable"] or any(owner["active_agents"] or owner["active_items"]
                                      for owner in current["owners"]):
        raise HostError("Some Hermes profiles are active or their work could not be checked")
    for owner in current["owners"]:
        target = Path(owner["home"])
        identity = identify_gateway(target, timeout=1.5)
        if not identity or identity.get("instance_id") != owner["instance_id"]:
            raise HostError("The gateway changed before graceful pause")
        live = query_gateway_control(target, "active-work", timeout=2)
        if not live or live.get("active_agents") != 0 or live.get("active_work") != []:
            raise HostError("The gateway accepted work before it could pause")
        result = query_gateway_control(target, "pause-for-update", timeout=3)
        if not result or result.get("pausing") is not True:
            raise HostError("Hermes did not accept a graceful gateway pause")
    deadline = time.monotonic() + timeout
    while True:
        remaining = snapshot(root)
        if not remaining["owners"] and not remaining["unavailable"]:
            return {"paused": True, "before": current["owners"]}
        if time.monotonic() >= deadline:
            raise HostError("The gateway has not stopped yet")
        time.sleep(0.25)


def inspect_processes(root):
    import psutil

    checkout = root / "hermes-agent"
    desktop = checkout / "apps/desktop"
    found = {}
    for process in psutil.process_iter(["pid", "name", "exe", "cwd", "cmdline"]):
        info = process.info
        name = (info["name"] or "").lower()
        if info["pid"] == os.getpid() or name not in {
                "hermes.exe", "electron.exe", "python.exe", "pythonw.exe", "uv.exe"}:
            continue
        executable = info["exe"]
        args = info["cmdline"] or []
        cwd = info["cwd"]
        in_checkout = any(
            value and os.path.isabs(value) and Path(value).is_relative_to(checkout)
            for value in (executable, cwd, *args[1:])
        )
        if in_checkout or name == "hermes.exe" and not executable:
            is_window = (name == "electron.exe" or executable is None
                         or Path(executable).is_relative_to(desktop))
            found[info["pid"]] = {"pid": info["pid"], "role": "desktop" if is_window else "worker"}
    folder = root / LEASE_DIRECTORY
    if folder.exists():
        if folder.resolve() != folder or not folder.is_dir():
            raise HostError("The Hermes startup lease directory changed")
        for ticket in folder.iterdir():
            match = LEASE_NAME.fullmatch(ticket.name)
            if not match or ticket.is_symlink() or not ticket.is_file():
                raise HostError("An unknown entry is present in the Hermes startup lease directory")
            pid = int(match[2])
            try:
                owner = psutil.Process(pid)
                # A reused PID started after the earlier lease was published.
                if owner.create_time() > ticket.stat().st_mtime + 0.02:
                    continue
            except (psutil.NoSuchProcess, FileNotFoundError):
                continue
            except psutil.AccessDenied:
                pass
            if pid not in found:
                found[pid] = {"pid": pid, "role": "desktop" if match[1] == "desktop" else "worker"}
    return list(found.values())


def hold_update_lock(root):
    from hermes_cli.update_lock import UpdateLock

    lock = UpdateLock(path=root / ".hermes-update-in-progress", install_root=root / "hermes-agent")
    if not lock.acquire():
        raise HostError("A native Hermes update owns the checkout")
    try:
        print(json.dumps({"locked": True}), flush=True)
        sys.stdin.buffer.read()
    finally:
        lock.release()


async def loaded_plugin(root):
    from hermes_cli.gateway_client import connect_gateway
    from hermes_cli.gateway_runtime import discover_gateway_endpoint

    discovery = discover_gateway_endpoint(root, timeout=2)
    endpoint = discovery.endpoint
    if discovery.state != "ready" or endpoint is None:
        raise HostError("The working Hermes gateway has not reached ready state")
    origin = urlsplit(endpoint.api_origin)
    if (origin.scheme != "http" or origin.hostname not in {"127.0.0.1", "::1", "localhost"}
            or Path(endpoint.control_home or endpoint.profile_id).resolve() != root):
        raise HostError("The reported working gateway is outside the local installation")
    async with connect_gateway(endpoint=endpoint) as client:
        result = await client.rpc("plugins.list", _timeout=6)
    verified = discover_gateway_endpoint(root, timeout=2)
    if not verified.endpoint or verified.endpoint.instance_id != endpoint.instance_id:
        raise HostError("The gateway restarted while checking the loaded plugin")
    for item in result.get("plugins", []):
        if item.get("name") == "hermes-codex-visual" and item.get("enabled") is True and not item.get("load_error"):
            return {"ready": True, "version": item["version"], "instance_id": endpoint.instance_id}
    raise HostError("The working gateway did not report the agent plugin as loaded")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--hermes-root", required=True, type=Path)
    parser.add_argument("operation", choices=("inspect", "pause", "processes", "lock", "loaded"))
    args = parser.parse_args()
    root = args.hermes_root
    if not root.is_absolute() or root.resolve() != root or not (root / "hermes-agent").is_dir():
        raise HostError("Unverified Hermes installation root")
    sys.path.insert(0, str(root / "hermes-agent"))
    if args.operation == "lock":
        hold_update_lock(root)
        return
    if args.operation == "inspect":
        result = snapshot(root)
    elif args.operation == "processes":
        result = inspect_processes(root)
    elif args.operation == "loaded":
        result = asyncio.run(loaded_plugin(root))
    else:
        result = pause_idle(root, 25)
    print(json.dumps(result, ensure_ascii=True), flush=True)


if __name__ == "__main__":
    try:
        main()
    except (HostError, OSError, RuntimeError, ValueError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=True), file=sys.stderr, flush=True)
        sys.exit(1)

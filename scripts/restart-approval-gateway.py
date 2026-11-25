"""Gracefully reload the local Hermes gateway after the approval-core update."""

import os
from pathlib import Path
import sys
import time

from gateway.control_socket import identify_gateway, query_gateway_control
from hermes_cli.gateway_lifecycle_guards import live_work
from hermes_cli.gateway_runtime import discover_gateway_endpoint, ensure_gateway_runtime


def main():
    if sys.argv[1:] != ["--restart"]:
        raise SystemExit("Pass --restart only after installing the verified approval core.")
    home = (Path(os.environ["LOCALAPPDATA"]) / "hermes").resolve()
    work = live_work(home)
    if work is None or work.get("active_agents") or work.get("active_work"):
        raise SystemExit("Hermes has active work or did not report its status; no restart was requested.")
    before = identify_gateway(home)
    if not before or not before.get("instance_id"):
        raise SystemExit("The local gateway identity could not be confirmed.")
    old_instance = before["instance_id"]
    answer = query_gateway_control(home, "pause-for-update")
    if not answer or not answer.get("pausing"):
        raise SystemExit("The gateway did not accept a graceful pause.")
    deadline = time.monotonic() + 35
    while time.monotonic() < deadline:
        current = discover_gateway_endpoint(home)
        if current.endpoint and current.endpoint.instance_id != old_instance and current.state == "ready":
            print("Gateway restarted and is ready.")
            return
        if current.state == "absent":
            break
        time.sleep(1)
    result = ensure_gateway_runtime(home, timeout=50, idle_exit=False)
    if result.state != "ready" or result.endpoint is None or result.endpoint.instance_id == old_instance:
        raise SystemExit(f"The gateway did not return ready after the graceful pause: {result.state} {result.reason_code}")
    print("Gateway restarted and is ready.")


if __name__ == "__main__":
    main()

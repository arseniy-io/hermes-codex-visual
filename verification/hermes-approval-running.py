"""Read-only probe of the running local gateway's approval-review support.

The random request id cannot name a real approval, so this never approves or
marks any request. No chat text, credentials or identifiers are printed.
"""

import asyncio
import json
import sys
import uuid
from pathlib import Path

from hermes_cli.gateway_client import connect_gateway, outside_restart_wait
from hermes_cli.gateway_runtime import discover_gateway_endpoint
from hermes_constants import get_hermes_home


async def main(session):
    home = Path(get_hermes_home()).resolve()
    found = discover_gateway_endpoint(home)
    if found.state != "ready" or found.endpoint is None:
        raise SystemExit("Local Hermes gateway is not ready.")
    with outside_restart_wait():
        async with connect_gateway(found.endpoint) as client:
            result = await client.rpc("approval.pending", session_id=session,
                                      hcv_seen_request_id="hcv-probe-" + uuid.uuid4().hex)
    if result.get("hcv_review_seen") is not False:
        raise SystemExit("The running gateway did not confirm the approval-review protocol.")
    print(json.dumps({"gateway_ready": True, "approval_review_protocol": True}))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Pass the id of the already-open local session.")
    asyncio.run(main(sys.argv[1]))

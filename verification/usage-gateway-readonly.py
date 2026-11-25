"""Check the installed Usage backend via Hermes's one-use local HTTP grants.

Only GET requests are sent. No reset is consumed and no credentials, account
identifiers, chat names, or individual balances are printed.
"""
import json
from urllib.parse import urlparse

import httpx
from gateway.control_socket import identify_gateway, query_gateway_control
from hermes_constants import get_hermes_home

home = get_hermes_home().resolve()
gateway = identify_gateway(home)
if not gateway:
    raise SystemExit("Local Hermes gateway was not found")
origin = gateway.get("api_origin") or ""
parsed = urlparse(origin)
if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "::1", "localhost"}:
    raise SystemExit("Refusing a non-local gateway")


def get(path):
    grant = query_gateway_control(home, "session-ticket", params={
        "profile_id": str(home), "instance_id": gateway["instance_id"], "purpose": "native-http",
    })
    if not grant or not grant.get("ticket"):
        raise SystemExit("Hermes did not issue a local read grant")
    try:
        with httpx.Client(timeout=75, trust_env=False, follow_redirects=False) as client:
            response = client.get(origin.rstrip("/") + path, headers={"X-Hermes-Gateway-Ticket": grant["ticket"]})
            if response.status_code != 200:
                raise SystemExit(f"Hermes endpoint returned HTTP {response.status_code}")
            return response.json()
    except httpx.HTTPError:
        raise SystemExit("Local Hermes endpoint did not respond") from None


base = "/api/plugins/hermes-codex-visual"
health = get(base + "/health?profile=default")
overview = get(base + "/overview?profile=default")
chats = get(base + "/chats?profile=default")
history = get(base + "/history?days=7&offset=0&profile=default")
plan = get(base + "/plan-history?profile=default")
same_scope = len({overview.get("scope"), chats.get("scope"), history.get("scope"), plan.get("scope")}) == 1
if health.get("backend") != "usage" or not same_scope:
    raise SystemExit("Usage backend returned an unexpected identity or profile")
print(json.dumps({
    "health": "ok", "same_scope": same_scope,
    "windows": len(overview.get("account", {}).get("windows") or []),
    "resets": len(overview["resets"]) if isinstance(overview.get("resets"), list) else None,
    "balance_available": overview.get("account", {}).get("credits_balance") is not None,
    "chats": len(chats.get("rows") or []),
    "chats_with_percent": sum(isinstance((row.get("usage") or {}).get("weekly_limit_percent"), (int, float))
                              for row in chats.get("rows") or []),
    "history_units": history.get("units"),
    "history_days": len(history.get("data") or []),
    "weekly_periods": sum(item.get("window_minutes") == 10080 for item in plan.get("periods") or []),
    "plan_approximate": plan.get("approximate"),
}))

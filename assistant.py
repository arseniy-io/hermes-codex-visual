"""Human-confirmed requests for Codex limit resets.

The agent-facing tool can only queue a short-lived request. It never receives a
confirmation nonce and cannot redeem a reset. The Desktop backend is responsible
for showing the request and requiring a separate human action to confirm it.
State is scoped to the current Hermes profile and a hash of the account identity.
"""
from __future__ import annotations

import hashlib
import math
import json
import re
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_PLUGIN_ID = "hermes-codex-visual"
_STATE_FILE = "assistant-reset.sqlite3"
_PENDING_TTL_SECONDS = 600
_SCOPE = re.compile(r"^[0-9a-f]{64}$")
_MAX_CREDIT_ID = 256
_TOOL_NAME = "request_codex_limit_reset"
_INVENTORY_URL = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits"

_TOOL_SCHEMA = {
    "name": _TOOL_NAME,
    "description": (
        "Only when the user explicitly asks in the current conversation to reset "
        "their OpenAI Codex usage limit, request one available reset for human review. "
        "Never call automatically, for a background task, or merely because a limit "
        "is low. This tool does not redeem anything. The user must independently "
        "open Settings > Usage, review the account and selected reset, and confirm. "
        "The user must have enabled this feature, and at least one account limit "
        "must have at most 10 percent remaining."
    ),
    "parameters": {
        "type": "object",
        "properties": {},
        "additionalProperties": False,
    },
}


def _profile_home() -> Path:
    from hermes_constants import get_hermes_home

    return Path(get_hermes_home()).resolve()


def scope_for_identity(identity: str) -> str:
    """Match the Dashboard's profile + account/user hash without exposing identity."""
    if not isinstance(identity, str) or not identity.strip():
        raise ValueError("Account identity is required")
    material = str(_profile_home()) + "\0" + identity
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _valid_scope(scope: str) -> str:
    if not isinstance(scope, str) or not _SCOPE.fullmatch(scope):
        raise ValueError("Invalid profile/account scope")
    return scope


def _state_path() -> Path:
    root = _profile_home()
    path = root / "plugin-data" / _PLUGIN_ID / _STATE_FILE
    if not path.resolve().is_relative_to(root):
        raise ValueError("Plugin data must be within the active profile")
    if path.is_symlink():
        raise ValueError("Plugin state cannot be a symlink")
    return path


def _connection(*, create: bool) -> sqlite3.Connection | None:
    path = _state_path()
    if not create and not path.is_file():
        return None
    if create:
        path.parent.mkdir(parents=True, exist_ok=True)
        # Check again after directory creation, including any symlinked parents.
        if path.is_symlink() or not path.resolve().is_relative_to(_profile_home()):
            raise ValueError("Plugin data must be within the active profile")
    connection = sqlite3.connect(path, timeout=5, isolation_level=None)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout=5000")
    connection.execute(
        "CREATE TABLE IF NOT EXISTS permissions (scope TEXT PRIMARY KEY, enabled INTEGER NOT NULL)"
    )
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pending (scope TEXT PRIMARY KEY, id TEXT NOT NULL, "
        "credit_id TEXT NOT NULL, title TEXT NOT NULL, credit_expires_at TEXT, expires_at REAL NOT NULL)"
    )
    return connection


def _pending_row(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    return {key: row[key] for key in ("id", "credit_id", "title", "credit_expires_at", "expires_at")}


def get_status(scope: str) -> dict:
    """Return setting and live request for this exact profile/account scope."""
    scope = _valid_scope(scope)
    connection = _connection(create=False)
    if connection is None:
        return {"enabled": False, "pending": None}
    try:
        connection.execute("BEGIN")
        permission = connection.execute("SELECT enabled FROM permissions WHERE scope=?", (scope,)).fetchone()
        enabled = bool(permission and permission["enabled"] == 1)
        row = connection.execute(
            "SELECT id,credit_id,title,credit_expires_at,expires_at FROM pending "
            "WHERE scope=? AND expires_at>?", (scope, time.time()),
        ).fetchone() if enabled else None
        connection.execute("COMMIT")
        return {"enabled": enabled, "pending": _pending_row(row)}
    finally:
        connection.close()


def set_enabled(scope: str, enabled: bool) -> dict:
    """Persist an explicit setting; disabling atomically invalidates pending requests."""
    scope = _valid_scope(scope)
    if type(enabled) is not bool:
        raise ValueError("enabled must be a boolean")
    connection = _connection(create=True)
    try:
        connection.execute("BEGIN IMMEDIATE")
        connection.execute(
            "INSERT INTO permissions(scope,enabled) VALUES(?,?) "
            "ON CONFLICT(scope) DO UPDATE SET enabled=excluded.enabled", (scope, int(enabled)),
        )
        if not enabled:
            connection.execute("DELETE FROM pending WHERE scope=?", (scope,))
        connection.execute("COMMIT")
    finally:
        connection.close()
    return get_status(scope)


def _credit_expiry(value: Any) -> float | None:
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip() or len(value) > 80:
        raise ValueError("Invalid reset expiry")
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError("Missing time zone")
        return parsed.timestamp()
    except (ValueError, OverflowError, OSError):
        raise ValueError("Invalid reset expiry") from None


def create_pending(scope: str, credit_id: str, title: str, credit_expires_at: str | None = None) -> dict:
    """Queue one request, never overwriting another live request or redeeming it."""
    scope = _valid_scope(scope)
    if not isinstance(credit_id, str) or not credit_id.strip() or len(credit_id) > _MAX_CREDIT_ID:
        raise ValueError("Invalid reset identifier")
    if not isinstance(title, str):
        raise ValueError("Invalid reset title")
    title = " ".join(title.split())[:160] or "Сброс лимита"
    now = time.time()
    credit_expiry = _credit_expiry(credit_expires_at)
    expiry = min(now + _PENDING_TTL_SECONDS, credit_expiry) if credit_expiry is not None else now + _PENDING_TTL_SECONDS
    if expiry <= now:
        raise ValueError("Reset has expired")
    connection = _connection(create=False)
    if connection is None:
        raise PermissionError("Assistant reset requests are disabled")
    try:
        connection.execute("BEGIN IMMEDIATE")
        permission = connection.execute("SELECT enabled FROM permissions WHERE scope=?", (scope,)).fetchone()
        if not permission or permission["enabled"] != 1:
            raise PermissionError("Assistant reset requests are disabled")
        existing = connection.execute(
            "SELECT id,credit_id,title,credit_expires_at,expires_at FROM pending "
            "WHERE scope=? AND expires_at>?", (scope, now),
        ).fetchone()
        if existing:
            # Keep the user's earlier review request; do not replace its selection.
            if existing["credit_id"] != credit_id:
                raise RuntimeError("A reset request is already waiting for review")
            result = _pending_row(existing)
        else:
            connection.execute("DELETE FROM pending WHERE scope=?", (scope,))
            pending_id = str(uuid.uuid4())
            connection.execute(
                "INSERT INTO pending(scope,id,credit_id,title,credit_expires_at,expires_at) VALUES(?,?,?,?,?,?)",
                (scope, pending_id, credit_id, title, credit_expires_at, expiry),
            )
            result = {"id": pending_id, "credit_id": credit_id, "title": title,
                      "credit_expires_at": credit_expires_at, "expires_at": expiry}
        connection.execute("COMMIT")
        return result
    finally:
        connection.close()


def get_pending(scope: str, pending_id: str) -> dict | None:
    if not isinstance(pending_id, str) or not pending_id:
        return None
    status = get_status(scope)
    pending = status["pending"]
    return pending if pending and pending["id"] == pending_id else None


def consume_pending(scope: str, pending_id: str) -> dict | None:
    """Atomically claim a request once, only while enabled and unexpired.

    This only removes the pending request. It does not call OpenAI or authorize
    a reset; the Desktop backend separately verifies its confirmation nonce.
    """
    scope = _valid_scope(scope)
    if not isinstance(pending_id, str) or not pending_id:
        return None
    connection = _connection(create=False)
    if connection is None:
        return None
    try:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute(
            "SELECT p.id,p.credit_id,p.title,p.credit_expires_at,p.expires_at FROM pending p "
            "JOIN permissions a ON a.scope=p.scope AND a.enabled=1 "
            "WHERE p.scope=? AND p.id=? AND p.expires_at>?", (scope, pending_id, time.time()),
        ).fetchone()
        if row:
            connection.execute("DELETE FROM pending WHERE scope=? AND id=?", (scope, pending_id))
        connection.execute("COMMIT")
        return _pending_row(row)
    finally:
        connection.close()


def _interactive_viewer(ctx: Any) -> bool:
    try:
        from tools.approval_context import is_local_interactive_session, is_viewer_turn_with_approver

        return (ctx.current_cron_execution() is None and is_local_interactive_session()
                and is_viewer_turn_with_approver())
    except Exception:
        return False


def _snapshot():
    from agent.account_usage import fetch_account_usage

    value = fetch_account_usage("openai-codex", read_only=True)
    if value is None or not value.available or not isinstance(value.identity, str) or not value.identity.strip():
        raise RuntimeError("Codex account identity is unavailable")
    return value


def _quota_allows(snapshot: Any) -> bool:
    for window in getattr(snapshot, "windows", ()) or ():
        used = getattr(window, "used_percent", None)
        if (getattr(window, "scope", "account") == "account" and not isinstance(used, bool)
                and isinstance(used, (int, float)) and math.isfinite(used) and used >= 90):
            return True
    return False


def _inventory() -> list[dict]:
    from hermes_cli.plugin_provider_requests import credentialed_provider_request

    response = credentialed_provider_request("openai-codex", "GET", _INVENTORY_URL, timeout=15)
    if response.status != 200:
        raise RuntimeError("Reset inventory is unavailable")
    payload = response.json()
    if not isinstance(payload, dict) or not isinstance(payload.get("credits"), list):
        raise RuntimeError("Reset inventory is unavailable")
    now = time.time()
    items = []
    for credit in payload["credits"]:
        if not isinstance(credit, dict) or credit.get("status") != "available" or credit.get("is_supported_by_plan") is not True:
            continue
        ident = credit.get("id")
        if not isinstance(ident, str) or not ident.strip() or len(ident) > _MAX_CREDIT_ID:
            continue
        try:
            expiry = _credit_expiry(credit.get("expires_at"))
        except ValueError:
            continue
        if expiry is not None and expiry <= now:
            continue
        items.append({"id": ident, "title": str(credit.get("title") or "Сброс лимита")[:160],
                      "expires_at": credit.get("expires_at"), "expiry": expiry})
    return sorted(items, key=lambda item: (item["expiry"] is None, item["expiry"] or 0, item["id"]))


def request_reset(ctx: Any, args: dict | None = None) -> dict:
    """Ask for human review only; never submit a reset or expose a nonce."""
    if not isinstance(args, (dict, type(None))) or (args and len(args)):
        return {"ok": False, "error": "Не удалось принять запрос на сброс"}
    if not _interactive_viewer(ctx):
        return {"ok": False, "error": "Запрос доступен только в открытом диалоге с пользователем"}
    try:
        before = _snapshot()
        scope = scope_for_identity(before.identity)
        if not get_status(scope)["enabled"]:
            return {"ok": False, "error": "Разрешение на запросы сброса выключено"}
        if not _quota_allows(before):
            return {"ok": False, "error": "Сброс доступен ассистенту, когда осталось не более 10% лимита"}
        inventory = _inventory()
        if not inventory:
            return {"ok": False, "error": "Доступных сбросов нет"}
        after = _snapshot()
        if (after.identity != before.identity or scope_for_identity(after.identity) != scope
                or not _quota_allows(after) or not _interactive_viewer(ctx)):
            return {"ok": False, "error": "Аккаунт или лимит изменился. Запросите сброс заново"}
        credit = inventory[0]
        create_pending(scope, credit["id"], credit["title"], credit["expires_at"])
        return {"ok": True, "status": "pending_confirmation",
                "message": "Запрос подготовлен. Откройте Настройки → Использование, проверьте аккаунт "
                           "и сброс и подтвердите действие. Сброс ещё не применён."}
    except PermissionError:
        return {"ok": False, "error": "Разрешение на запросы сброса выключено"}
    except Exception:
        # Never surface underlying provider response, credentials, or internal paths.
        return {"ok": False, "error": "Не удалось подготовить запрос на сброс"}


def register(ctx: Any) -> None:
    def handler(args: dict, **_kwargs: Any) -> str:
        return json.dumps(request_reset(ctx, args), ensure_ascii=False)

    ctx.register_tool(name=_TOOL_NAME, toolset="hermes_codex_visual", schema=_TOOL_SCHEMA, handler=handler)

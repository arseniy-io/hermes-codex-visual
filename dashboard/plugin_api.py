"""Profile-scoped, signed-in Codex usage data for the Desktop settings page.

The UI never receives credentials. Reset confirmation uses a selected credit
id and a one-time, profile/account-bound request. Hermes's signer resolves the
credential again at send time; the selected id is required in every POST.
"""
from __future__ import annotations

import hashlib
import importlib.util
import math
import secrets
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Query

router = APIRouter()
_ORIGIN = "https://chatgpt.com/backend-api/wham"
_CATEGORIES = {"x-openai-codex-usage-categories": "1"}
_MAX_CHAT_COUNT = 100
_MAX_IDS = 1000
_SEARCH_LIMIT = 500
_RESET_PENDING: dict[str, dict] = {}
_RESET_INFLIGHT: set[tuple[str, str]] = set()
_RESET_LOCK = threading.Lock()
_RESET_TTL = 120

# Dashboard routes are loaded as a standalone module by Hermes. Load the same
# package-owned assistant implementation as the agent, with shared durable
# profile state; neither side reads or exposes an OAuth credential.
_assistant_spec = importlib.util.spec_from_file_location(
    "hermes_codex_visual_usage_assistant", Path(__file__).resolve().parent.parent / "assistant.py")
if _assistant_spec is None or _assistant_spec.loader is None:
    raise ImportError("Usage assistant module is unavailable")
assistant = importlib.util.module_from_spec(_assistant_spec)
_assistant_spec.loader.exec_module(assistant)

_activity_spec = importlib.util.spec_from_file_location(
    "hermes_codex_visual_activity", Path(__file__).resolve().parent.parent / "activity.py")
if _activity_spec is None or _activity_spec.loader is None:
    raise ImportError("Activity module is unavailable")
activity = importlib.util.module_from_spec(_activity_spec)
_activity_spec.loader.exec_module(activity)
router.include_router(activity.router)

# Timeline routes stay in this same authenticated profile-owned router.
def _timeline_module(name):
    spec = importlib.util.spec_from_file_location(
        "hermes_codex_visual_" + name, Path(__file__).resolve().parent.parent / (name + ".py"))
    if spec is None or spec.loader is None:
        raise ImportError("Chat timeline module unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


turn_changes = _timeline_module("turn_changes")
timeline = _timeline_module("timeline")
agent_receipts = _timeline_module("agent_receipts")
timeline.receipt_projector = agent_receipts.project_receipts
router.include_router(turn_changes.router)
router.include_router(timeline.router)



def _snapshot():
    """Use Hermes's read-only quota view; unknown identity is never a scope."""
    from agent.account_usage import fetch_account_usage

    snapshot = fetch_account_usage("openai-codex", read_only=True)
    if snapshot is None or not snapshot.available or not snapshot.identity:
        raise HTTPException(status_code=503, detail="Не удалось получить лимиты и проверить аккаунт Codex")
    return snapshot


def _scope(identity: str) -> str:
    from hermes_constants import get_hermes_home

    # Do not send the account principal or profile path to the renderer.
    material = str(get_hermes_home().resolve()) + "\0" + identity
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _signed(method: str, path: str, *, body: Any = None, headers: dict | None = None) -> Any:
    from hermes_cli.plugin_provider_requests import credentialed_provider_request

    try:
        response = credentialed_provider_request(
            "openai-codex", method, _ORIGIN + path, json=body, headers=headers, timeout=15,
        )
        if response.status != 200:
            raise HTTPException(status_code=502, detail="OpenAI не предоставил данные использования")
        value = response.json()
        if not isinstance(value, dict):
            raise ValueError("unexpected provider response")
        return value
    except HTTPException:
        raise
    except Exception:
        # Do not expose a request, URL containing credentials, or exception chain.
        raise HTTPException(status_code=503, detail="Не удалось получить данные OpenAI") from None


def _finish(snapshot):
    newer = _snapshot()
    if newer.identity != snapshot.identity or _scope(newer.identity) != _scope(snapshot.identity):
        raise HTTPException(status_code=409, detail="Аккаунт изменился. Обновите данные")
    return _scope(snapshot.identity)


def _iso(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat()
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or value <= 0:
        return None
    try:
        return datetime.fromtimestamp(value, timezone.utc).isoformat().replace("+00:00", "Z")
    except (ValueError, OverflowError, OSError):
        return None


def _balance(raw: Any) -> str | None:
    if isinstance(raw, bool) or not isinstance(raw, (str, int, float)):
        return None
    try:
        from decimal import Decimal, InvalidOperation
        value = Decimal(str(raw))
        if not value.is_finite() or value < 0:
            return None
        return str(value)
    except (InvalidOperation, ValueError):
        return None


def _resets(payload: dict) -> list[dict]:
    values = payload.get("credits")
    if not isinstance(values, list):
        raise HTTPException(status_code=502, detail="OpenAI вернул неполный список сбросов")
    result = []
    for entry in values:
        if (not isinstance(entry, dict) or entry.get("status") != "available"
                or entry.get("is_supported_by_plan") is not True
                or not isinstance(entry.get("id"), str) or not entry["id"].strip()):
            continue
        try:
            expiry = assistant._credit_expiry(entry.get("expires_at"))
        except ValueError:
            continue
        if expiry is not None and expiry <= time.time():
            continue
        result.append({k: entry.get(k) for k in ("id", "reset_type", "title", "description", "expires_at")})
    return result


def _assistant_supported() -> bool:
    # A separate plugin host does not inherit the viewer-turn context needed
    # to distinguish a human request from automation. Refuse rather than show
    # an enabled switch that cannot work there.
    from hermes_cli.config import load_config_readonly

    config = load_config_readonly() or {}
    plugins = config.get("plugins") if isinstance(config, dict) else {}
    mode = plugins.get("isolation", "in_process") if isinstance(plugins, dict) else "in_process"
    return str(mode or "in_process").strip().lower().replace("-", "_") != "host"


@router.get("/health")
def health():
    return {"plugin": "hermes-codex-visual", "backend": "usage"}


@router.get("/overview")
def overview():
    before = _snapshot()
    raw = before.raw if isinstance(before.raw, dict) else {}
    credits = raw.get("credits") if isinstance(raw.get("credits"), dict) else {}
    windows = [
        {"label": w.label, "used_percent": w.used_percent, "reset_at": _iso(w.reset_at),
         "scope": w.scope, "detail": w.detail}
        for w in before.windows
    ]
    try:
        reset_data = _signed("GET", "/rate-limit-reset-credits")
        resets, reset_error = _resets(reset_data), None
    except HTTPException:
        resets, reset_error = None, "Список сбросов сейчас недоступен"
    scope = _finish(before)
    try:
        assistant_status = assistant.get_status(scope)
        assistant_available = _assistant_supported()
    except Exception:
        assistant_status = {"enabled": False, "pending": None}
        assistant_available = False
    return {
        "scope": scope,
        "account": {"plan": before.plan, "windows": windows, "credits_balance": _balance(credits.get("balance"))},
        "resets": resets,
        "reset_error": reset_error,
        "reset_available": resets is not None,
        "reset_unavailable_reason": reset_error,
        "assistant_available": assistant_available,
        "assistant_enabled": assistant_status["enabled"],
        "assistant_pending": assistant_status["pending"],
    }


@router.post("/assistant/setting")
def assistant_setting(body: dict):
    enabled = body.get("enabled") if isinstance(body, dict) else None
    expected = body.get("scope") if isinstance(body, dict) else None
    if type(enabled) is not bool or not isinstance(expected, str):
        raise HTTPException(status_code=400, detail="Не удалось проверить настройку")
    before = _snapshot()
    scope = _finish(before)
    if expected != scope:
        raise HTTPException(status_code=409, detail="Аккаунт изменился. Обновите данные")
    try:
        if enabled and not _assistant_supported():
            raise HTTPException(status_code=409, detail="Запросы ассистента недоступны для этого профиля")
        status = assistant.set_enabled(scope, enabled)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail="Не удалось сохранить настройку") from None
    return {"scope": scope, **status}


def _rows_for_profile():
    """Read listable desktop sessions from the authenticated profile only."""
    from hermes_constants import get_hermes_home
    from hermes_state import SessionDB

    path = get_hermes_home() / "state.db"
    if not path.is_file():
        return [], False
    with SessionDB(path, read_only=True) as db:
        sessions = db.list_sessions_rich(
            sources=["local", "desktop"], local_created_sources=["desktop"],
            limit=_SEARCH_LIMIT, include_archived=True, include_children=False,
            order_by_last_active=True, project_compression_tips=True,
        )
        candidate_ids = list(dict.fromkeys(
            sid for row in sessions for sid in (row.get("_lineage_ids") or [row.get("id")])
            if isinstance(sid, str) and sid
        ))
        if not candidate_ids:
            return [], len(sessions) >= _SEARCH_LIMIT
        # Queries use bounded placeholders and the profile's own read-only DB.
        codex_ids = set()
        children: dict[str, list[str]] = {}
        for start in range(0, len(candidate_ids), 300):
            part = candidate_ids[start:start + 300]
            marks = ",".join("?" for _ in part)
            for item in db._read_all(
                f"SELECT DISTINCT session_id FROM session_model_usage WHERE billing_provider=? AND session_id IN ({marks})",
                ["openai-codex", *part],
            ):
                codex_ids.add(item[0])
            for item in db._read_all(
                f"SELECT id FROM sessions WHERE billing_provider=? AND id IN ({marks})",
                ["openai-codex", *part],
            ):
                codex_ids.add(item[0])
            # Follow explicit subagent links recursively. A Codex subagent can
            # itself be delegated by a worker using another provider, so walk
            # those intermediate nodes too, while only attributing Codex IDs.
            # UNION prevents a malformed cycle from running indefinitely.
            for item in db._read_all(
                f"WITH RECURSIVE descendants(root_id,id) AS ("
                f"SELECT parent_session_id,id FROM sessions WHERE source='subagent' AND parent_session_id IN ({marks}) "
                "UNION SELECT d.root_id,s.id FROM descendants d JOIN sessions s ON s.parent_session_id=d.id "
                "WHERE s.source='subagent') "
                "SELECT d.root_id,s.id FROM descendants d JOIN sessions s ON s.id=d.id "
                "WHERE s.billing_provider='openai-codex' OR EXISTS "
                "(SELECT 1 FROM session_model_usage u WHERE u.session_id=s.id AND u.billing_provider='openai-codex')",
                part,
            ):
                children.setdefault(item[0], []).append(item[1])

        prepared = []
        claimed: set[str] = set()
        for row in sessions:
            ids = [sid for sid in (row.get("_lineage_ids") or [row.get("id")]) if isinstance(sid, str) and sid]
            if not ids:
                continue
            descendants = [child for sid in ids for child in children.get(sid, [])]
            if not descendants and not any(sid in codex_ids for sid in ids):
                continue
            ids = list(dict.fromkeys(ids + descendants))
            if any(sid in claimed for sid in ids):
                # Never attach a shared segment to two chats.
                continue
            if len(ids) > _MAX_IDS:
                continue
            claimed.update(ids)
            started = row.get("started_at")
            prepared.append({
                "id": row.get("id"), "title": row.get("title") or "Без названия",
                "created_at": _iso(started), "updated_at": _iso(row.get("last_active") or started),
                "query": {"thread_id": ids[0], "created_at": _iso(started), "descendant_thread_ids": ids[1:]},
            })
        return prepared[:_MAX_CHAT_COUNT], len(prepared) > _MAX_CHAT_COUNT or len(sessions) >= _SEARCH_LIMIT


def _thread_usage(value: Any) -> dict | None:
    if not isinstance(value, dict):
        return None
    allowed = ("data_status", "weekly_limit_percent", "five_hour_limit_percent", "balance_usage_credits", "groups")
    return {key: value.get(key) for key in allowed}


@router.get("/chats")
def chats():
    before = _snapshot()
    rows, truncated = _rows_for_profile()
    grouped: list[list[dict]] = []
    batch: list[dict] = []
    ids_count = 0
    for row in rows:
        size = 1 + len(row["query"]["descendant_thread_ids"])
        if batch and (len(batch) >= _MAX_CHAT_COUNT or ids_count + size > _MAX_IDS):
            grouped.append(batch)
            batch, ids_count = [], 0
        batch.append(row)
        ids_count += size
    if batch:
        grouped.append(batch)
    result: dict[str, dict] = {}
    stamps = []
    for batch in grouped:
        payload = _signed("POST", "/usage/thread_usage/query_v2", body={"threads": [x["query"] for x in batch]})
        entries = payload.get("threads")
        if not isinstance(entries, list):
            raise HTTPException(status_code=502, detail="OpenAI вернул неполные данные чатов")
        for item in entries:
            if isinstance(item, dict) and isinstance(item.get("thread_id"), str):
                result[item["thread_id"]] = item
        stamps.append(payload.get("data_as_of"))
    scope = _finish(before)
    out = []
    for row in rows:
        query = row.pop("query")
        out.append({**row, "usage": _thread_usage(result.get(query["thread_id"]))})
    return {"scope": scope, "rows": out, "truncated": truncated,
            "data_as_of": min(stamps) if stamps and all(isinstance(x, str) for x in stamps) else None}


@router.get("/history")
def history(days: int = Query(7), offset: int = Query(0)):
    if days not in (7, 30) or not 0 <= offset <= 520:
        raise HTTPException(status_code=400, detail="Неверный период")
    before = _snapshot()
    end = datetime.now(timezone.utc).date() - timedelta(days=days * offset)
    start = end - timedelta(days=days - 1)
    query = urlencode({"start_date": start.isoformat(), "end_date": end.isoformat(), "group_by": "day"})
    payload = _signed("GET", "/usage/daily-token-usage-breakdown?" + query, headers=_CATEGORIES)
    scope = _finish(before)
    return {"scope": scope, "data_scope": "account", "start_date": start.isoformat(), "end_date": end.isoformat(),
            "units": payload.get("units"), "data": payload.get("data"), "data_as_of": payload.get("data_as_of")}


@router.get("/plan-history")
def plan_history():
    before = _snapshot()
    payload = _signed("GET", "/usage/plan_limit_history?days=30")
    scope = _finish(before)
    allowed = ("data_as_of", "coverage_start", "coverage_complete", "approximate", "boundary_tolerance_seconds", "periods")
    return {"scope": scope, "data_scope": "account", **{key: payload.get(key) for key in allowed}}


@router.post("/reset/prepare")
def reset_prepare(body: dict):
    credit_id = body.get("credit_id") if isinstance(body, dict) else None
    expected = body.get("scope") if isinstance(body, dict) else None
    pending_id = body.get("pending_id") if isinstance(body, dict) else None
    if not isinstance(credit_id, str) or not credit_id or len(credit_id) > 160:
        raise HTTPException(status_code=400, detail="Не указан доступный сброс")
    if not isinstance(expected, str) or (pending_id is not None and not isinstance(pending_id, str)):
        raise HTTPException(status_code=400, detail="Не удалось проверить аккаунт или запрос")
    before = _snapshot()
    credits = _resets(_signed("GET", "/rate-limit-reset-credits"))
    scope = _finish(before)
    if expected != scope:
        raise HTTPException(status_code=409, detail="Аккаунт изменился. Обновите данные")
    selected = next((credit for credit in credits if credit["id"] == credit_id), None)
    if selected is None:
        raise HTTPException(status_code=409, detail="Этот сброс уже недоступен. Обновите список")
    if pending_id is not None:
        pending = assistant.get_pending(scope, pending_id)
        if not pending or pending["credit_id"] != credit_id or not assistant._quota_allows(before):
            raise HTTPException(status_code=409, detail="Запрос ассистента или лимит изменился")
    now = time.monotonic()
    nonce = secrets.token_urlsafe(32)
    with _RESET_LOCK:
        if (scope, credit_id) in _RESET_INFLIGHT:
            raise HTTPException(status_code=409, detail="Сброс уже проверяется. Дождитесь результата")
        for key, record in list(_RESET_PENDING.items()):
            if record["expires"] <= now or (record["scope"] == scope and record["credit_id"] == credit_id):
                _RESET_PENDING.pop(key, None)
        if len(_RESET_PENDING) >= 100:
            raise HTTPException(status_code=429, detail="Слишком много ожидающих подтверждений")
        _RESET_PENDING[nonce] = {
            "scope": scope, "credit_id": credit_id, "pending_id": pending_id, "expires": now + _RESET_TTL,
            "request_id": str(uuid.uuid4()),
        }
    return {"scope": scope, "nonce": nonce, "expires_in": _RESET_TTL, "credit": selected}


@router.post("/reset/confirm")
def reset_confirm(body: dict):
    nonce = body.get("nonce") if isinstance(body, dict) else None
    deadline = body.get("not_after") if isinstance(body, dict) else None
    if not isinstance(nonce, str) or len(nonce) > 200:
        raise HTTPException(status_code=400, detail="Нет подтверждения сброса")
    now = time.time()
    if (isinstance(deadline, bool) or not isinstance(deadline, (int, float)) or not math.isfinite(deadline)
            or deadline <= now or deadline > now + 30):
        raise HTTPException(status_code=408, detail="Время подтверждения истекло. Начните заново")
    # Take the record BEFORE any network operation. A double click, timeout or
    # worker exception can never automatically issue a second consume request.
    with _RESET_LOCK:
        pending = _RESET_PENDING.pop(nonce, None)
        if not pending or pending["expires"] <= time.monotonic():
            raise HTTPException(status_code=409, detail="Подтверждение истекло или уже использовано")
        key = (pending["scope"], pending["credit_id"])
        if key in _RESET_INFLIGHT:
            raise HTTPException(status_code=409, detail="Сброс уже проверяется. Дождитесь результата")
        _RESET_INFLIGHT.add(key)
    try:
        return _complete_reset(pending, deadline)
    finally:
        with _RESET_LOCK:
            _RESET_INFLIGHT.discard(key)


def _complete_reset(pending: dict, deadline: float):
    before = _snapshot()
    if _scope(before.identity) != pending["scope"]:
        raise HTTPException(status_code=409, detail="Аккаунт изменился. Начните подтверждение заново")
    credits = _resets(_signed("GET", "/rate-limit-reset-credits"))
    scope = _finish(before)
    if scope != pending["scope"]:
        raise HTTPException(status_code=409, detail="Аккаунт изменился. Начните подтверждение заново")
    if not any(credit["id"] == pending["credit_id"] for credit in credits):
        raise HTTPException(status_code=409, detail="Этот сброс уже недоступен. Обновите список")
    if time.time() >= deadline:
        raise HTTPException(status_code=408, detail="Время подтверждения истекло. Сброс не отправлен")
    if pending["pending_id"] is not None:
        # Revocation, expiry or restored quota invalidates an assistant request,
        # even if its dialog was opened while the request was still valid.
        current = _snapshot()
        if (_scope(current.identity) != scope or not assistant._quota_allows(current)
                or not assistant.consume_pending(scope, pending["pending_id"])):
            raise HTTPException(status_code=409, detail="Запрос ассистента или лимит изменился")
    # A delayed network/read operation must never initiate spending after the
    # human-facing confirmation has timed out.
    if time.time() >= deadline:
        raise HTTPException(status_code=408, detail="Время подтверждения истекло. Сброс не отправлен")
    try:
        result = _signed("POST", "/rate-limit-reset-credits/consume", body={
            "credit_id": pending["credit_id"], "redeem_request_id": pending["request_id"],
        })
    except HTTPException:
        return {"scope": scope, "status": "unknown", "message": "Результат неизвестен. Проверьте список сбросов и лимит."}
    code = result.get("code")
    credit = result.get("credit")
    if isinstance(credit, dict) and credit.get("id") not in (None, pending["credit_id"]):
        code = "unknown"
    if code not in {"reset", "already_redeemed", "nothing_to_reset", "no_credit"}:
        code = "unknown"
    try:
        if _scope(_snapshot().identity) != scope:
            code = "unknown"
    except HTTPException:
        code = "unknown"
    if code in {"reset", "already_redeemed"} and pending["pending_id"] is None:
        # A manually confirmed reset can fulfill an earlier assistant request.
        # Claim only the matching request; never clear a request for another reset.
        try:
            queued = assistant.get_status(scope).get("pending")
            if queued and queued.get("credit_id") == pending["credit_id"]:
                assistant.consume_pending(scope, queued["id"])
        except Exception:
            pass  # The provider result remains valid even if local cleanup fails.
    return {"scope": scope, "status": code, "windows_reset": result.get("windows_reset") if code == "reset" else None}

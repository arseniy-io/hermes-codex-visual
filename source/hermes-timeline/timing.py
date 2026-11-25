"""Producer-owned display timestamps, stored only in the native display sidecar.

Message.timestamp is a persistence time for assistant rows. It is deliberately
never used to reconstruct a missing first visible output time.
"""
from __future__ import annotations

import math
import os
import time

KEY = "hcv_timeline"


def _finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _metadata(message, value):
    existing = message.get("display_metadata")
    message["display_metadata"] = {**(existing if isinstance(existing, dict) else {}), KEY: value}


def _with_owning_cwd(agent, value):
    """Snapshot the same task-qualified anchor used by native local file tools.

    No process-cwd fallback, environment creation or remote/host path remapping.
    A missing anchor stays missing rather than borrowing a later session cwd.
    """
    try:
        from tools.file_tools_paths import _authoritative_workspace_root, _terminal_env_type_for_task
        task = getattr(agent, "_current_task_id", None)
        if isinstance(task, str) and task and _terminal_env_type_for_task(task) == "local":
            cwd = _authoritative_workspace_root(task)
            if isinstance(cwd, str) and os.path.isabs(cwd):
                return {**value, "cwd": cwd, "cwdBackend": "local"}
    except Exception:
        pass
    return value


def _turn(agent):
    value = getattr(agent, "_hcv_timeline_turn", None)
    return value if (isinstance(value, dict) and value.get("turnId") ==
        getattr(agent, "_current_turn_id", None)) else None


def begin_turn(agent, message):
    """Bind the admitted native turn, separately from a queued platform timestamp."""
    turn_id = getattr(agent, "_current_turn_id", None)
    started = getattr(agent, "_current_turn_timestamp", None)
    agent._hcv_timeline_first_visible_at_ms = None
    if not isinstance(turn_id, str) or not turn_id or not _finite(started):
        agent._hcv_timeline_turn = None
        return
    value = {"version": 1, "turnId": turn_id, "turnStartedAtMs": started * 1000,
        # Synthesized follow-up input never opens a new exchange in Codex.
        "opensExchange": message.get("display_kind") not in (
            "auto_continue", "async_delegation_complete", "process_complete", "hidden")}
    agent._hcv_timeline_turn = value
    _metadata(message, _with_owning_cwd(agent, {**value, "phase": "input"}))


def reset_response(agent):
    """Each API response has its own first-visible clock (not reasoning/tool time)."""
    agent._hcv_timeline_first_visible_at_ms = None


def visible_text(agent, text):
    """Called only after a current stream writer actually delivered public text."""
    if (not isinstance(text, str) or not text.strip() or not _turn(agent)
        or getattr(agent, "_hold_stream", False)):
        return
    if getattr(agent, "_hcv_timeline_first_visible_at_ms", None) is None:
        agent._hcv_timeline_first_visible_at_ms = time.time() * 1000


def response_message(agent, message):
    """Response builders can produce work/commentary/retries, never mark final here."""
    if value := _turn(agent):
        started = getattr(agent, "_hcv_timeline_first_visible_at_ms", None)
        _metadata(message, _with_owning_cwd(agent, {**value, "phase": "work",
            **({"assistantStartedAtMs": started} if _finite(started) else {})}))


def tool_message(agent, message):
    if value := _turn(agent):
        _metadata(message, _with_owning_cwd(agent, {**value, "phase": "tool"}))


def final_message(agent, message, *, started_at_ms=None):
    """Mark only the accepted final, after transforms/held output are resolved.

    A nonstreamed or held reply starts being visible at this producer boundary;
    that instant is measured now, never guessed from the stored row timestamp.
    """
    if not (value := _turn(agent)):
        return
    now = time.time() * 1000
    started = started_at_ms if _finite(started_at_ms) else getattr(agent, "_hcv_timeline_first_visible_at_ms", None)
    if not _finite(started) or getattr(agent, "_hold_stream", False):
        started = now
    _metadata(message, _with_owning_cwd(agent, {**value, "phase": "final",
        "finalAssistantStartedAtMs": started, "completedAtMs": now}))


def recovered_final_tail(agent, messages, final_response, *, recovered_from_stream=False):
    """Cover the native recovery chokepoint without re-dating old/rejected rows."""
    turn = _turn(agent)
    tail = messages[-1] if messages else None
    if (not turn or not isinstance(tail, dict) or not final_response or
        tail.get("role") != "assistant" or tail.get("display_kind") == "hidden" or
        tail.get("content") != final_response or tail.get("tool_calls")):
        return False
    metadata = tail.get("display_metadata")
    prior = metadata.get(KEY) if isinstance(metadata, dict) else None
    same_turn = isinstance(prior, dict) and prior.get("turnId") == turn["turnId"]
    if same_turn and prior.get("phase") == "final":
        return False  # normal accepted response was already timestamped before its flush
    stamp = tail.get("timestamp")
    if not _finite(stamp) or stamp * 1000 < turn["turnStartedAtMs"]:
        return False  # a recovered prior-turn answer is not a new producer occurrence
    started = prior.get("assistantStartedAtMs") if same_turn else None
    if not _finite(started):
        started = getattr(agent, "_hcv_timeline_first_visible_at_ms", None) if recovered_from_stream else None
    if not _finite(started):
        started = time.time() * 1000  # this newly materialized accepted output starts now
    final_message(agent, tail, started_at_ms=started)
    return True

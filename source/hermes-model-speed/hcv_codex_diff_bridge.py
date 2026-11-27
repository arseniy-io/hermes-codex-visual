"""Forward the Codex app-server's full turn diff to the owning Hermes chat."""
from __future__ import annotations

from contextlib import contextmanager


MAX_DIFF_BYTES = 2 * 1024 * 1024


def _identity(value):
    return isinstance(value, str) and 0 < len(value) <= 512


class AppServerTurnBridge:
    def __init__(self, agent, session, hermes_turn_id):
        self.agent = agent
        self.session = session
        self.hermes_turn_id = hermes_turn_id
        self.thread_id = getattr(session, "_thread_id", None)
        self.session_id = getattr(agent, "session_id", None)
        self.native_turn_id = None
        self.last_diff = None
        self.revision = 0
        self.closed = False

    def route_current(self):
        return (
            not self.closed
            and _identity(self.hermes_turn_id)
            and _identity(self.thread_id)
            and _identity(self.session_id)
            and getattr(self.agent, "_current_turn_id", None) == self.hermes_turn_id
            and getattr(self.agent, "_codex_session", None) is self.session
            and getattr(self.session, "_thread_id", None) == self.thread_id
        )

    def publish(self, diff):
        callback = getattr(self.agent, "tool_progress_callback", None)
        if not callable(callback):
            return
        self.revision += 1
        payload = {
            "version": 2,
            "source": "codex_app_server",
            "agentSessionId": self.session_id,
            "hermesTurnId": self.hermes_turn_id,
            "threadId": self.thread_id,
            "codexTurnId": self.native_turn_id,
            "revision": self.revision,
            "diff": diff,
        }
        callback("hcv.turn_diff", None, None, None, hcv_diff=payload)

    def clear(self):
        if self.last_diff:
            self.last_diff = None
            self.publish("")

    def observe(self, note):
        if not self.route_current():
            return
        if getattr(self.agent, "session_id", None) != self.session_id:
            self.clear()
            self.closed = True
            return
        active = getattr(self.session, "_active_turn_id", None)
        if self.native_turn_id is not None and _identity(active) and self.native_turn_id != active:
            self.clear()
            self.closed = True
            return
        if not isinstance(note, dict) or note.get("method") != "turn/diff/updated":
            return
        params = note.get("params")
        if (not isinstance(params, dict) or not _identity(active)
                or params.get("threadId") != self.thread_id or params.get("turnId") != active):
            return
        self.native_turn_id = active
        diff = params.get("diff")
        if (not isinstance(diff, str) or "\0" in diff or len(diff) > MAX_DIFF_BYTES
                or len(diff.encode("utf-8", errors="replace")) > MAX_DIFF_BYTES):
            self.clear()
            return
        if diff != self.last_diff:
            self.last_diff = diff
            self.publish(diff)


@contextmanager
def install_live_bridge(agent, hermes_turn_id):
    """Leave the original event hook and transport in control of the turn."""
    session = getattr(agent, "_codex_session", None)
    bridge = AppServerTurnBridge(agent, session, hermes_turn_id)
    if session is None or not bridge.route_current():
        yield None
        return
    previous = getattr(session, "_on_event", None)

    def wrapped(note):
        try:
            if callable(previous):
                previous(note)
        finally:
            try:
                bridge.observe(note)
            except Exception:
                # Display telemetry must not interrupt the underlying response.
                pass

    session._on_event = wrapped
    try:
        yield bridge
    finally:
        if session._on_event is wrapped:
            session._on_event = previous
        if bridge.route_current():
            try:
                bridge.clear()
            except Exception:
                pass
        bridge.closed = True

"""Bounded Codex app-server live patch snapshots for the Hermes composer.

One plain-text, single-file add or update is accepted after the item and turn
snapshots match exactly. Commands, MCP calls, further patches, unknown formats,
missing identity or mismatches permanently invalidate the current turn. This
is an observed patch, not a complete inventory of every filesystem change.
"""
from __future__ import annotations
from contextlib import contextmanager
import os
import re

MAX_DIFF_BYTES = 2 * 1024 * 1024
SAFE_ITEMS = {'userMessage', 'agentMessage', 'reasoning'}

def _text(v):
    return isinstance(v, str) and bool(v) and len(v) <= 512

def _diff_matches_path(diff, expected, cwd, kind):
    """Trust one plain-text file only when both wire records name the same path."""
    if not (_text(expected) and isinstance(cwd, str) and os.path.isabs(cwd)):
        return False
    lines = diff.splitlines()
    git = [line for line in lines if line.startswith('diff --git ')]
    old = [line[4:].split('\t', 1)[0] for line in lines if line.startswith('--- ')]
    new = [line[4:].split('\t', 1)[0] for line in lines if line.startswith('+++ ')]
    if len(git) != 1 or len(old) != 1 or len(new) != 1:
        return False
    # Quoted, whitespace-bearing or backslash paths need git's full escaping
    # grammar. Refuse them here rather than guessing which file was changed.
    header = re.fullmatch(r'diff --git a/([^\s"\\]+) b/([^\s"\\]+)', git[0])
    if not header or header.group(1) != header.group(2):
        return False
    relative = header.group(1)
    if new[0] != 'b/' + relative or old[0] != ('/dev/null' if kind == 'add' else 'a/' + relative):
        return False
    # Do not case-fold: Windows can have per-directory case-sensitive mode.
    # Refusing a harmless casing difference is safer than merging two files.
    want = os.path.normpath(os.path.abspath(os.path.join(cwd, expected)))
    actual = os.path.normpath(os.path.abspath(os.path.join(cwd, relative)))
    return actual == want

def _added_diff_matches(hunks, expected):
    """A complete ordinary added-file hunk must reconstruct the exact text."""
    if not isinstance(hunks, str) or not isinstance(expected, str) or not expected:
        return False
    rows = hunks.splitlines(keepends=True)
    if not rows:
        return False
    header = re.fullmatch(r'@@ -0,0 \+1(?:,(\d+))? @@[^\r\n]*\n', rows[0])
    if not header:
        return False
    count = int(header.group(1) or 1)
    lines = rows[1:]
    if count < 1 or len(lines) != count or any(not line.startswith('+') or not line.endswith('\n') for line in lines):
        return False
    return ''.join(line[1:] for line in lines) == expected

class AppServerTurnBridge:
    def __init__(self, agent, session, hermes_turn_id):
        self.agent, self.session = agent, session
        self.hermes_turn_id = hermes_turn_id
        self.thread_id = getattr(session, '_thread_id', None)
        self.session_id = getattr(agent, 'session_id', None)
        self.native_turn_id = None
        self.seen_patch_id = None
        self.completed_patch = False
        self.file_path = None
        self.patch_hunks = None
        self.change_kind = None
        self.last_diff = None
        self.incomplete = False
        self.revision = 0
        self.closed = False

    def route_current(self):
        return (not self.closed and _text(self.hermes_turn_id) and _text(self.thread_id)
            and _text(self.session_id) and getattr(self.agent, '_current_turn_id', None) == self.hermes_turn_id
            and getattr(self.agent, '_codex_session', None) is self.session
            and getattr(self.session, '_thread_id', None) == self.thread_id)

    def current(self):
        return self.route_current() and getattr(self.agent, 'session_id', None) == self.session_id

    def publish(self, state, diff=None):
        # A session-id change can revoke an earlier snapshot through the same
        # fenced turn, but can never publish new content as the previous owner.
        if not self.route_current() or (state != 'unavailable' and not self.current()):
            return
        callback = getattr(self.agent, 'tool_progress_callback', None)
        if not callable(callback):
            self.incomplete = True
            return
        self.revision += 1
        payload = {'version': 1, 'source': 'codex_app_server',
            'agentSessionId': self.session_id, 'hermesTurnId': self.hermes_turn_id,
            'threadId': self.thread_id, 'codexTurnId': self.native_turn_id,
            'revision': self.revision, 'state': state}
        if diff is not None:
            payload['diff'] = diff
        try:
            callback('hcv.turn_diff', None, None, None, hcv_diff=payload)
        except Exception:
            # Never let optional display telemetry break the underlying turn.
            self.incomplete = True

    def fail(self):
        if self.incomplete:
            return
        self.incomplete = True
        self.publish('unavailable')

    def observe(self, note):
        if not self.current():
            if self.route_current() and getattr(self.agent, 'session_id', None) != self.session_id:
                self.fail()
            return
        if not isinstance(note, dict):
            return
        method, params = note.get('method'), note.get('params')
        if method not in {'item/started', 'item/completed', 'turn/diff/updated'}:
            return
        if not isinstance(params, dict):
            return self.fail()
        active = getattr(self.session, '_active_turn_id', None)
        if not (_text(active) and params.get('threadId') == self.thread_id and params.get('turnId') == active):
            return self.fail()
        if self.native_turn_id is None:
            self.native_turn_id = active
        elif self.native_turn_id != active:
            return self.fail()
        if self.incomplete:
            return
        if method == 'turn/diff/updated':
            diff = params.get('diff')
            if (not self.seen_patch_id or not self.completed_patch or not isinstance(diff, str)
                    or len(diff.encode('utf-8', errors='replace')) > MAX_DIFF_BYTES):
                return self.fail()
            if not _diff_matches_path(diff, self.file_path, getattr(self.session, '_cwd', None), self.change_kind.get('type')):
                return self.fail()
            # Codex publishes only hunks in FileUpdateChange.diff and file
            # headers plus those hunks in the turn-wide diff. Require exact
            # content equality; never infer a patch from matching paths alone.
            marker = diff.find('\n@@ ')
            if marker < 0:
                return self.fail()
            turn_hunks = diff[marker + 1:]
            matches = (turn_hunks == self.patch_hunks if self.change_kind.get('type') == 'update'
                       else _added_diff_matches(turn_hunks, self.patch_hunks))
            if not matches:
                return self.fail()
            if diff == self.last_diff:
                return
            self.last_diff = diff
            # This is one verified patch snapshot, never the whole turn.
            return self.publish('observed', diff)
        item = params.get('item')
        if not isinstance(item, dict):
            return self.fail()
        kind, item_id = item.get('type'), item.get('id')
        if kind in SAFE_ITEMS:
            return
        if kind != 'fileChange' or not _text(item_id):
            return self.fail()
        if method == 'item/started':
            if self.seen_patch_id is not None:
                return self.fail()
            changes = item.get('changes')
            # One text file, no repeated patch, rename or ambiguous metadata.
            if not isinstance(changes, list) or len(changes) != 1 or not isinstance(changes[0], dict):
                return self.fail()
            path = changes[0].get('path')
            if not _text(path) or any(c in path for c in '\r\n\0'):
                return self.fail()
            change_kind = changes[0].get('kind')
            if not isinstance(change_kind, dict) or change_kind.get('type') not in ('add', 'update'):
                return self.fail()
            if change_kind.get('movePath') is not None or change_kind.get('move_path') is not None:
                return self.fail()
            hunks = changes[0].get('diff')
            if (not isinstance(hunks, str) or not hunks or '\0' in hunks
                    or len(hunks.encode('utf-8', errors='replace')) > MAX_DIFF_BYTES
                    or change_kind['type'] == 'update' and not hunks.startswith('@@ ')):
                return self.fail()
            self.file_path = path
            self.change_kind = change_kind
            self.patch_hunks = hunks
            self.seen_patch_id = item_id
            return self.publish('pending')
        if item_id != self.seen_patch_id or self.completed_patch or item.get('status') != 'completed':
            return self.fail()
        changes = item.get('changes')
        if (not isinstance(changes, list) or len(changes) != 1 or not isinstance(changes[0], dict)
                or changes[0].get('path') != self.file_path or changes[0].get('diff') != self.patch_hunks
                or changes[0].get('kind') != self.change_kind):
            return self.fail()
        self.completed_patch = True

@contextmanager
def install_live_bridge(agent, hermes_turn_id):
    """Wrap only this run_turn. Do not swallow exceptions from Hermes' old hook."""
    session = getattr(agent, '_codex_session', None)
    bridge = AppServerTurnBridge(agent, session, hermes_turn_id)
    if session is None or not bridge.current():
        yield None
        return
    previous = getattr(session, '_on_event', None)
    def wrapped(note):
        try:
            if callable(previous):
                previous(note)
        finally:
            try:
                bridge.observe(note)
            except Exception:
                bridge.fail()
    session._on_event = wrapped
    try:
        yield bridge
    finally:
        bridge.closed = True
        if getattr(session, '_on_event', None) is wrapped:
            session._on_event = previous








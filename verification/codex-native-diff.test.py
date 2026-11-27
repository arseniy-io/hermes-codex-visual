"""Replay update/add formats captured from the installed offline Codex app-server."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
from types import SimpleNamespace

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent / 'source/hermes-model-speed'
target = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else SOURCE / 'hcv_codex_diff_bridge.py'
manifest = json.loads((target.parent / 'manifest.json').read_text(encoding='utf8'))
assert hashlib.sha256(target.read_bytes()).hexdigest() == manifest['additional_helpers'][0]['candidate']
spec = importlib.util.spec_from_file_location('hcv_verified_bridge', target)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
fixture = json.loads((HERE / 'codex-native-diff-fixture.json').read_text(encoding='utf8'))

session = SimpleNamespace(_thread_id='thread', _active_turn_id='turn', _on_event=None)
events = []
agent = SimpleNamespace(session_id='session', _current_turn_id='hermes', _codex_session=session,
    tool_progress_callback=lambda kind, *args, **kw: events.append(kw['hcv_diff']))

def notification(diff):
    return {'method': 'turn/diff/updated', 'params': {'threadId': 'thread', 'turnId': 'turn', 'diff': diff}}

first = fixture['update']['diff']
both = first + fixture['add']['diff']
with module.install_live_bridge(agent, 'hermes'):
    for diff in (first, both, both, ''):
        session._on_event(notification(diff))
assert [event['diff'] for event in events] == [first, both, '']
print('PASS offline Codex formats: CRLF update, add, replacement snapshot, deduplication and empty reset')

"""Use sanitized events captured from the installed offline Codex app-server."""
import copy
import hashlib
import importlib.util
import json
import pathlib
import sys
import tempfile
from types import SimpleNamespace

HERE = pathlib.Path(__file__).resolve().parent
TARGET = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else HERE.parent / 'source/hermes-model-speed/hcv_codex_diff_bridge.py').resolve()
assert hashlib.sha256(TARGET.read_bytes()).hexdigest() == 'a7031a614c4743890059b774cfcf6b95de4f69d32ff65145cbae3ef5e14d57bf'
spec = importlib.util.spec_from_file_location('hcv_verified_bridge', TARGET)
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
fixture = json.loads((HERE / 'codex-native-diff-fixture.json').read_text(encoding='utf8'))
cwd = pathlib.Path(tempfile.gettempdir()) / 'hcv-synthetic-workspace'

def observe(kind):
    actual = fixture[kind]
    path = 'a.txt' if kind == 'update' else 'newfile.txt'
    change_kind = {'type': kind, **({'move_path': None} if kind == 'update' else {})}
    change = {'path': str(cwd / path), 'kind': change_kind, 'diff': actual['item_diff']}
    item = {'type':'fileChange','id':'patch-one','status':'inProgress','changes':[change]}
    session = SimpleNamespace(_thread_id='thread',_active_turn_id='turn',_cwd=str(cwd),_on_event=None)
    outputs = []
    agent = SimpleNamespace(session_id='session',_current_turn_id='hermes',_codex_session=session,
        tool_progress_callback=lambda _type,*args,**kw: outputs.append(kw['hcv_diff']))
    def note(method, **params): return {'method':method,'params':{'threadId':'thread','turnId':'turn',**params}}
    with module.install_live_bridge(agent,'hermes'):
        session._on_event(note('item/started', item=copy.deepcopy(item)))
        session._on_event(note('item/completed', item={**copy.deepcopy(item),'status':'completed'}))
        event = note('turn/diff/updated', diff=actual['diff'])
        session._on_event(event)
        session._on_event(copy.deepcopy(event))
        assert [x['state'] for x in outputs] == ['pending','observed']
        assert outputs[-1]['diff'] == actual['diff']
        session._on_event(note('turn/diff/updated', diff=actual['diff'] + '+foreign\n'))
        assert [x['state'] for x in outputs] == ['pending','observed','unavailable']

for kind in ('update','add'): observe(kind)
print('PASS actual offline Codex formats: update, add, duplicate, mismatch')

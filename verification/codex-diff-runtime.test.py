import copy
import hashlib
import inspect
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import importlib.util
HERE = Path(__file__).resolve().parent
expected = Path(sys.argv[1] if len(sys.argv) > 1 else HERE.parent / 'source/hermes-model-speed/hcv_codex_diff_bridge.py').resolve()
assert hashlib.sha256(expected.read_bytes()).hexdigest() == 'a7031a614c4743890059b774cfcf6b95de4f69d32ff65145cbae3ef5e14d57bf'
spec = importlib.util.spec_from_file_location('hcv_verified_bridge', expected)
verified_bridge = importlib.util.module_from_spec(spec); spec.loader.exec_module(verified_bridge)
assert Path(inspect.getfile(verified_bridge)).resolve() == expected
install_live_bridge = verified_bridge.install_live_bridge
HUNKS = '@@ -1 +1 @@\n-old\n+new\n'
DIFF = 'diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n' + HUNKS

def note(method, item=None, diff=None, thread='thread-a', turn='native-a'):
    params={'threadId':thread,'turnId':turn}
    if item is not None: params['item']=copy.deepcopy(item)
    if diff is not None: params['diff']=diff
    return {'method':method,'params':params}

def item(kind='fileChange', status='inProgress', item_id='patch-1'):
    return {'type':kind,'id':item_id,'status':status,'changes':[{'path':'a.txt','kind':{'type':'update'},'diff':HUNKS}]}

events=[]; prior=[]
session=SimpleNamespace(_thread_id='thread-a',_active_turn_id='native-a',_on_event=lambda n:prior.append(n),_cwd=str(HERE))
agent=SimpleNamespace(_current_turn_id='turn-a',session_id='chat-a',_codex_session=session,
    tool_progress_callback=lambda typ,*args,**kw:events.append((typ,kw['hcv_diff'])))
original=session._on_event
with install_live_bridge(agent,'turn-a') as bridge:
    assert bridge is not None
    session._on_event(note('item/started',item()))
    assert events[-1][1]['state']=='pending'
    session._on_event(note('item/completed',item(status='completed')))
    assert len(events)==1
    patch=DIFF
    session._on_event(note('turn/diff/updated',diff=patch))
    assert events[-1][1]['state']=='observed' and events[-1][1]['diff']==patch
    session._on_event(note('item/started',item(kind='commandExecution')))
    assert events[-1][1]['state']=='unavailable'
    session._on_event(note('turn/diff/updated',diff=patch))
    assert events[-1][1]['state']=='unavailable'
    event_count=len(events)
    agent._current_turn_id='next-turn'
    session._on_event(note('item/started',item(kind='commandExecution')))
    assert len(events)==event_count
assert session._on_event is original and len(prior)==6

def trial(sequence):
    out=[]
    ses=SimpleNamespace(_thread_id='thread-a',_active_turn_id='native-a',_on_event=None,_cwd=str(HERE))
    ag=SimpleNamespace(_current_turn_id='turn-a',session_id='chat-a',_codex_session=ses,
        tool_progress_callback=lambda typ,*args,**kw:out.append(kw['hcv_diff']))
    with install_live_bridge(ag,'turn-a'):
        for x in sequence: ses._on_event(x)
    return out
x=trial([note('item/started',item()),note('item/completed',item(status='completed')),note('turn/diff/updated',diff=DIFF),
         note('item/started',item(item_id='patch-2'))])
assert x[-1]['state']=='unavailable'
x=trial([note('item/started',item(),thread='other')])
assert x[-1]['state']=='unavailable'
x=trial([note('item/started',item()),note('turn/diff/updated',diff=DIFF)])
assert x[-1]['state']=='unavailable'
move=item();move['changes'][0]['kind']={'type':'update','move_path':'b.txt'}
x=trial([note('item/started',move)])
assert x[-1]['state']=='unavailable'
x=trial([note('item/started',item(kind='mcpToolCall'))])
assert x[-1]['state']=='unavailable'
print('PASS isolated bridge: owner fences, one patch, command/MCP/repeated patch invalidate, old callback restored')




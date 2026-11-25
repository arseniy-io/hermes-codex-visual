"""Synthetic regression checks for the exact file passed as argv[1]. No Hermes, network or project files."""
import importlib.util
import pathlib
import tempfile
import sys
import unittest
from types import SimpleNamespace

TARGET = pathlib.Path(sys.argv.pop(1) if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parents[1] / 'source/hermes-model-speed/hcv_codex_diff_bridge.py').resolve()
spec = importlib.util.spec_from_file_location('candidate_bridge_under_review', TARGET)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

CWD = str(pathlib.Path(tempfile.gettempdir()) / 'hcv-synthetic-workspace')
PATCH = '@@ -1 +1 @@\n-old\n+new\n'

def make_diff(git_old='a/a.txt', git_new='b/a.txt', old='a/a.txt', new='b/a.txt'):
    return f'diff --git {git_old} {git_new}\n--- {old}\n+++ {new}\n{PATCH}'

def make_bridge():
    out = []
    ses = SimpleNamespace(_thread_id='thread-one', _active_turn_id='turn-one', _cwd=CWD, _on_event=None)
    agent = SimpleNamespace(_current_turn_id='hermes-one', session_id='chat-one', _codex_session=ses,
        tool_progress_callback=lambda _type, *args, **kw: out.append(kw['hcv_diff']))
    b = m.AppServerTurnBridge(agent, ses, 'hermes-one')
    return b, ses, agent, out

def note(method, item=None, diff=None):
    params = {'threadId':'thread-one','turnId':'turn-one'}
    if item is not None: params['item']=item
    if diff is not None: params['diff']=diff
    return {'method':method,'params':params}

def started():
    return {'type':'fileChange','id':'patch-1','status':'inProgress',
            'changes':[{'path': str(pathlib.Path(CWD) / 'a.txt'), 'kind':{'type':'update'}, 'diff':PATCH}]}

def send_started(b):
    b.observe(note('item/started', started()))

def send_completed(b):
    b.observe(note('item/completed', {**started(), 'status':'completed'}))

def send_observed(b, diff=None):
    b.observe(note('turn/diff/updated', diff=diff or make_diff()))

def states(out):
    return [entry['state'] for entry in out]

class DiffBoundaryTest(unittest.TestCase):
    def test_baseline(self):
        b, _, _, out = make_bridge()
        send_started(b); send_completed(b); send_observed(b)
        self.assertEqual(states(out), ['pending', 'observed'])

    def test_conflicting_git_paths_refused(self):
        for label, diff in {
            'git old points to other file': make_diff(git_old='a/foreign.txt'),
            'git new points to other file': make_diff(git_new='b/foreign.txt'),
            'both git paths point to other file': make_diff(git_old='a/foreign.txt',git_new='b/foreign.txt'),
            'old file header points elsewhere': make_diff(old='a/foreign.txt'),
            'new file header points elsewhere': make_diff(new='b/foreign.txt'),
            'two contradictory git headers': 'diff --git a/foreign.txt b/foreign.txt\n' + make_diff(),
        }.items():
            with self.subTest(label=label):
                b, _, _, out = make_bridge()
                send_started(b); send_completed(b); send_observed(b, diff)
                self.assertNotIn('observed',states(out),f'{label}: {states(out)}')

    def test_case_distinct_paths_refused(self):
        # NTFS directories and network shares can be case-sensitive; no files are opened.
        for label, diff in {
            'both file headers differ only by case': make_diff(git_old='a/A.txt',git_new='b/A.txt',old='a/A.txt',new='b/A.txt'),
            'old file header differs only by case': make_diff(old='a/A.txt'),
            'new file header differs only by case': make_diff(new='b/A.txt'),
            'git old differs only by case': make_diff(git_old='a/A.txt'),
            'git new differs only by case': make_diff(git_new='b/A.txt'),
        }.items():
            with self.subTest(label=label):
                b, _, _, out = make_bridge()
                send_started(b); send_completed(b); send_observed(b, diff)
                self.assertNotIn('observed',states(out),f'{label}: {states(out)}')

    def test_session_rotates_before_observed(self):
        b, _, agent, out = make_bridge()
        send_started(b); agent.session_id='chat-two'; send_completed(b); send_observed(b)
        self.assertNotIn('observed',states(out),f'foreign session was accepted: {states(out)}')

    def test_session_rotates_after_observed_then_command(self):
        b, _, agent, out = make_bridge()
        send_started(b); send_completed(b); send_observed(b)
        agent.session_id='chat-two'
        b.observe(note('item/started', {'type':'commandExecution','id':'cmd-1'}))
        self.assertEqual(states(out)[-1],'unavailable',f'old confirmed display remains: {states(out)}')

    def test_session_rotates_after_observed_then_duplicate(self):
        b, _, agent, out = make_bridge()
        send_started(b); send_completed(b); send_observed(b)
        agent.session_id='chat-two'; send_observed(b)
        self.assertEqual(states(out)[-1],'unavailable',f'old confirmed display remains: {states(out)}')

if __name__ == '__main__':
    print('candidate:', TARGET, flush=True)
    unittest.main(verbosity=2)


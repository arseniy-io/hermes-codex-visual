"""The bridge forwards full, owner-bound turn snapshots from the installed protocol."""
import importlib.util
import pathlib
import sys
import unittest
from types import SimpleNamespace

HERE = pathlib.Path(__file__).resolve().parent
TARGET = pathlib.Path(sys.argv.pop(1) if len(sys.argv) > 1 else
                      HERE.parent / 'source/hermes-model-speed/hcv_codex_diff_bridge.py').resolve()
spec = importlib.util.spec_from_file_location('candidate_bridge_under_review', TARGET)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

DIFF = "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-old\n+new\n"


def make_bridge():
    out = []
    session = SimpleNamespace(_thread_id='thread-one', _active_turn_id='turn-one', _on_event=None)
    agent = SimpleNamespace(_current_turn_id='hermes-one', session_id='chat-one', _codex_session=session,
        tool_progress_callback=lambda kind, *args, **kw: out.append((kind, kw['hcv_diff'])))
    return m.AppServerTurnBridge(agent, session, 'hermes-one'), session, agent, out


def note(diff, method='turn/diff/updated', **scope):
    return {'method': method, 'params': {'threadId': 'thread-one', 'turnId': 'turn-one', 'diff': diff, **scope}}


class Boundaries(unittest.TestCase):
    def test_aggregate_replaces_previous_and_later_empty_clears(self):
        bridge, _, _, out = make_bridge()
        bridge.observe(note(DIFF))
        multi = DIFF + DIFF.replace('a.txt', 'b.txt')
        bridge.observe(note(multi))
        bridge.observe(note(multi))
        bridge.observe(note(None, method='item/started', item={'type': 'commandExecution'}))
        bridge.observe(note(''))
        self.assertEqual([payload['diff'] for _, payload in out], [DIFF, multi, ''])
        self.assertEqual([payload['revision'] for _, payload in out], [1, 2, 3])
        self.assertTrue(all(kind == 'hcv.turn_diff' and payload['version'] == 2 for kind, payload in out))

    def test_foreign_thread_turn_and_admission_cannot_publish(self):
        bridge, session, agent, out = make_bridge()
        bridge.observe(note(DIFF, threadId='foreign'))
        bridge.observe(note(DIFF, turnId='foreign'))
        self.assertFalse(out)
        bridge.observe(note(DIFF))
        agent._current_turn_id = 'new-execution'
        bridge.observe(note(''))
        self.assertEqual(len(out), 1)

    def test_active_native_turn_rotation_revokes_prior_data(self):
        bridge, session, _, out = make_bridge()
        bridge.observe(note(DIFF))
        session._active_turn_id = 'new-turn'
        bridge.observe(note(None, method='item/started', turnId='new-turn'))
        bridge.observe(note(DIFF, turnId='new-turn'))
        self.assertEqual([payload['diff'] for _, payload in out], [DIFF, ''])

    def test_session_rotation_revokes_prior_data(self):
        bridge, _, agent, out = make_bridge()
        bridge.observe(note(DIFF))
        agent.session_id = 'chat-two'
        bridge.observe(note(None, method='item/started', item={'type': 'commandExecution'}))
        self.assertEqual([payload['agentSessionId'] for _, payload in out], ['chat-one', 'chat-one'])
        self.assertEqual([payload['diff'] for _, payload in out], [DIFF, ''])
        agent.session_id = 'chat-one'
        bridge.observe(note(DIFF))
        self.assertEqual(len(out), 2)

    def test_bad_or_oversized_diff_clears_without_forwarding(self):
        for bad in (None, 'bad\0input', '\u0430' * (m.MAX_DIFF_BYTES // 2 + 1)):
            with self.subTest(kind=type(bad)):
                bridge, _, _, out = make_bridge()
                bridge.observe(note(DIFF))
                bridge.observe(note(bad))
                self.assertEqual([payload['diff'] for _, payload in out], [DIFF, ''])

    def test_restore_the_transport_hook_and_clear_on_exit(self):
        _, session, agent, out = make_bridge()
        original_calls = []
        session._on_event = original_calls.append
        original = session._on_event
        with m.install_live_bridge(agent, 'hermes-one'):
            session._on_event(note(DIFF))
        self.assertIs(session._on_event, original)
        self.assertEqual(original_calls, [note(DIFF)])
        self.assertEqual([payload['diff'] for _, payload in out], [DIFF, ''])


if __name__ == '__main__':
    unittest.main(verbosity=2)

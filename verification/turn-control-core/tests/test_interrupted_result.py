"""Run the actual reducer AST with inert transport/accounting dependencies."""
import ast
from contextlib import contextmanager
import json
import os
import runpy
from pathlib import Path
import sys
import types
import typing
import unittest

ROOT = Path(__file__).parent
BASE = Path(os.environ['HCV_CHILD_RESULT_BASELINE']) if os.environ.get('HCV_CHILD_RESULT_BASELINE') else None
CANDIDATE = Path(os.environ['HCV_CHILD_RESULT_FILE']) if os.environ.get('HCV_CHILD_RESULT_FILE') else ROOT / 'delegate_tool_child_run.py'
FAILED = 'Your request was not processed. Send it again if you still want me to carry it out.'
DIAGNOSTIC = 'Operation interrupted: waiting for model response (402.4s elapsed).'


def reducer(path, source=None):
    tree = ast.parse(path.read_bytes() if source is None else source)
    selected = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == '_build_result_entry')
    program = ast.Module(body=[ast.ImportFrom(module='__future__', names=[ast.alias(name='annotations')], level=0), selected], type_ignores=[])
    ast.fix_missing_locations(program)
    namespace = {'Any': typing.Any, '_hcv_agent_names': types.SimpleNamespace(child_identity=lambda _: {}),
                 '_str_or_none': lambda value: value if isinstance(value, str) and value else None,
                 '_num': lambda value: value if isinstance(value, (int, float)) else 0,
                 '_build_tool_trace': lambda _: [], '_route_report': lambda _: None}
    exec(compile(program, str(path), 'exec'), namespace)
    return namespace['_build_result_entry']


def baseline_reducer():
    root = ROOT.parents[2]
    stage = runpy.run_path(str(root / 'scripts/stage-hermes-turn-control.py'))
    assets = stage['ASSETS']
    relative = 'tools/delegate_tool_child_run.py'
    pins = json.loads((assets / 'manifest.json').read_bytes())['files'][relative]
    raw = BASE.read_bytes()
    if stage['digest'](raw) == pins['candidate']:
        hunks = stage['patches']((assets / 'core.patch').read_text(encoding='utf-8'))[relative]
        reverse = [(dest, sum(line[0] != '-' for line in body), start,
                    [('-' if line[0] == '+' else '+' if line[0] == '-' else ' ') + line[1:] for line in body])
                   for start, _, dest, body in hunks]
        raw = stage['apply'](raw, reverse, relative)
    if stage['digest'](raw) != pins['baseline']:
        raise AssertionError('The child result baseline does not match its pinned source')
    return reducer(BASE, raw)


@contextmanager
def message_content():
    name = 'agent.message_content'
    prior = sys.modules.get(name)
    module = types.ModuleType(name)
    module.flatten_message_text = lambda value: value if isinstance(value, str) else ''
    sys.modules[name] = module
    try:
        yield
    finally:
        if prior is None:
            sys.modules.pop(name, None)
        else:
            sys.modules[name] = prior


class InterruptedResultTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.before = staticmethod(baseline_reducer()) if BASE else None
        cls.after = staticmethod(reducer(CANDIDATE))

    def build(self, result, *, before=False):
        child = types.SimpleNamespace()
        schema = types.SimpleNamespace(schema=None, valid=None, retries=0, errors=[])
        with message_content():
            return (self.before if before else self.after)(child, result, 0, 1.0, schema)

    def test_actual_baseline_selects_the_failed_boundary_as_partial_output(self):
        result = {'interrupted': True, 'final_response': DIAGNOSTIC,
                  'messages': [{'role': 'user', 'content': 'Work'},
                               {'role': 'assistant', 'display_kind': 'failed_turn', 'content': FAILED}]}
        if self.before:
            self.assertEqual(self.build(result, before=True)['summary'], FAILED)
        entry = self.build(result)
        self.assertEqual(entry['status'], 'interrupted')
        self.assertEqual(entry['summary'], '')
        self.assertEqual(entry['error'], DIAGNOSTIC)

    def test_real_partial_output_survives_a_later_failed_boundary(self):
        result = {'interrupted': True, 'final_response': DIAGNOSTIC,
                  'messages': [{'role': 'user'}, {'role': 'assistant', 'content': 'Confirmed partial work.'},
                               {'role': 'assistant', 'display_kind': 'failed_turn', 'content': FAILED}]}
        self.assertEqual(self.build(result)['summary'], 'Confirmed partial work.')

    def test_no_output_never_returns_the_provider_wait_diagnostic_as_model_summary(self):
        entry = self.build({'interrupted': True, 'final_response': DIAGNOSTIC, 'messages': [{'role': 'user'}]})
        self.assertEqual(entry['summary'], '')
        self.assertEqual(entry['error'], DIAGNOSTIC)

    def test_proven_current_turn_boundary_excludes_an_older_real_answer(self):
        result = {'interrupted': True, 'final_response': DIAGNOSTIC, 'current_turn_user_idx': 2,
                  'messages': [{'role': 'user'}, {'role': 'assistant', 'content': 'Older completed answer.'},
                               {'role': 'user'}, {'role': 'assistant', 'display_kind': 'failed_turn', 'content': FAILED}]}
        self.assertEqual(self.build(result)['summary'], '')

    def test_a_real_model_quote_without_the_failure_type_remains_model_output(self):
        result = {'interrupted': True, 'final_response': DIAGNOSTIC,
                  'messages': [{'role': 'user'}, {'role': 'assistant', 'content': FAILED}]}
        self.assertEqual(self.build(result)['summary'], FAILED)

    def test_structured_failure_and_completion_statuses_are_not_changed(self):
        failure = self.build({'failed': True, 'error': 'quota', 'final_response': 'Provider refusal.'})
        self.assertEqual((failure['status'], failure['summary']), ('failed', 'Provider refusal.'))
        complete = self.build({'completed': True, 'final_response': FAILED})
        self.assertEqual((complete['status'], complete['summary']), ('completed', FAILED))

    def test_explicit_stale_timeout_retains_its_distinct_outcome(self):
        entry = self.build({'interrupted': True, 'final_response': DIAGNOSTIC,
                            '_stale_stop_seconds': 15, 'messages': []})
        self.assertEqual((entry['status'], entry['exit_reason']), ('timeout', 'timeout'))
        self.assertIn('no activity for 15s', entry['error'])
        self.assertEqual(entry['summary'], '')


if __name__ == '__main__':
    unittest.main()

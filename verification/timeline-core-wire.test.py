"""Native closed RPC validation and actual metadata/provider chokepoints."""
from __future__ import annotations
import ast
import contextlib
import copy
import importlib.util
import json
import logging
import os
from pathlib import Path
import shutil
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".local"
CORE = Path(os.environ['LOCALAPPDATA']) / 'hermes/hermes-agent'
sys.path.insert(0, str(CORE))
spec = importlib.util.spec_from_file_location('timeline_stage_wire_review', ROOT / 'scripts/stage-hermes-timeline.py')
stage = importlib.util.module_from_spec(spec); spec.loader.exec_module(stage)
_, CANDIDATE = stage.candidates(CORE)


def module(name, values):
    value = types.ModuleType(name); value.__dict__.update(values); return value


def functions(payload, names, env):
    tree = ast.parse(payload.decode('utf-8') if isinstance(payload, bytes) else payload)
    selected = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]
    assert len(selected) == len(names)
    prefix = ast.parse('from __future__ import annotations').body
    exec(compile(ast.Module(body=prefix + selected, type_ignores=[]), 'native-production-candidate', 'exec'), env)


class WireTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Import the actual pinned Python contract with only its new optional
        # fields overlaid. No live gateway or user profile is imported.
        cls.temporary = tempfile.TemporaryDirectory(prefix='wire-', dir=OUT)
        cls.overlay = Path(cls.temporary.name)
        (cls.overlay / 'tui_gateway').mkdir()
        shutil.copyfile(CORE / 'tui_gateway/__init__.py', cls.overlay / 'tui_gateway/__init__.py')
        shutil.copytree(CORE / 'tui_gateway/contracts', cls.overlay / 'tui_gateway/contracts',
                        ignore=shutil.ignore_patterns('__pycache__'))
        relative = 'tui_gateway/contracts/canonical_stored_reads.py'
        (cls.overlay / relative).write_bytes(CANDIDATE[relative])
        sys.path.insert(0, str(cls.overlay))
        from tui_gateway.contracts.canonical_stored_reads import StoredTranscriptResult
        cls.contract = StoredTranscriptResult

    @classmethod
    def tearDownClass(cls):
        sys.path.remove(str(cls.overlay)); cls.temporary.cleanup()

    def test_real_subagent_response_is_accepted_by_closed_wire_contract(self):
        config = {'_task_name': 'saved_task', '_agent_path': '/root/saved_task', 'goal': 'must not become a name'}
        reads = []
        db = types.SimpleNamespace(get_session=lambda child: reads.append(child) or {'model_config': json.dumps(config)},
                                   transcript_lineage_ids=lambda child: [child])
        authority = types.SimpleNamespace(db=db, profile_id='owned-profile')
        env = {'_child': lambda *args: ('owned-child', False)}
        functions(CANDIDATE['gateway/session_transcript_subagent.py'], {'_read', 'unavailable'}, env)
        owner = module('gateway.session_authorities', {'owner_scope': lambda authority: contextlib.nullcontext()})
        reader = module('gateway.session_stored_reads', {'read_transcript': lambda *args, **kwargs: {'rows': [], 'next_cursor': None, 'reset': True}})
        with patch.dict(sys.modules, {owner.__name__: owner, reader.__name__: reader}):
            result = env['_read'](authority, object(), types.SimpleNamespace(session_id='parent'), ('parent', 'worker', 'oldest'), None, 1, False)
        validated = self.contract.model_validate(result).model_dump()
        self.assertEqual(validated['task_name'], 'saved_task')
        self.assertEqual(validated['agent_path'], '/root/saved_task')
        self.assertEqual(reads, ['owned-child'])
        self.assertNotIn('goal', result)
        # The declaring model stays closed: arbitrary extra data still fails.
        with self.assertRaises(Exception):
            self.contract.model_validate({**result, 'untrusted_extra': 'forbidden'})

    def test_unowned_child_returns_no_identity_and_reads_no_child_metadata(self):
        db = types.SimpleNamespace(get_session=lambda child: self.fail('Unowned child metadata was read'))
        authority = types.SimpleNamespace(db=db, profile_id='owned-profile')
        env = {'_child': lambda *args: (None, False)}
        functions(CANDIDATE['gateway/session_transcript_subagent.py'], {'_read', 'unavailable'}, env)
        owner = module('gateway.session_authorities', {'owner_scope': lambda authority: contextlib.nullcontext()})
        reader = module('gateway.session_stored_reads', {'read_transcript': lambda *args, **kwargs: self.fail('Unowned transcript was read')})
        with patch.dict(sys.modules, {owner.__name__: owner, reader.__name__: reader}):
            result = env['_read'](authority, object(), types.SimpleNamespace(session_id='parent'), ('parent', 'worker', 'oldest'), None, 1, False)
        validated = self.contract.model_validate(result).model_dump()
        self.assertFalse(validated['available'])
        self.assertIsNone(validated['task_name'])
        self.assertIsNone(validated['agent_path'])

    def test_actual_tool_commit_preserves_mcp_timing_file_snapshot_and_model_bytes(self):
        def load(relative, name):
            candidate = ROOT / 'source/hermes-timeline' / relative
            spec = importlib.util.spec_from_file_location(name, candidate)
            value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value); return value
        timing = load('timing.py', 'agent.hcv_timeline')
        files = load('file_capture.py', 'tools.hcv_file_changes')
        text = '{"path":"fixture.txt","content":"unchanged model result"}'
        snapshot = {'version': 1, 'diff': 'PRIVATE DISPLAY DIFF', 'files': [{'path': 'fixture.txt'}]}
        result = files.decorate_result(text, snapshot)
        mcp = {'tool_result_metadata': {'hcv_tool_display': {'tools': [{'definition': {'title': 'Saved MCP title'}}]}}}
        agent = types.SimpleNamespace(
            _current_turn_id='turn-one', _hcv_timeline_turn={'version': 1, 'turnId': 'turn-one', 'turnStartedAtMs': 1000},
            _current_tool='write_file', _touch_activity=lambda text: None,
            _subdirectory_hints=types.SimpleNamespace(check_tool_call=lambda *args: ''),
            _tool_result_content_for_active_model=lambda name, value: str(value),
            tool_result_metadata_callback=lambda *args: copy.deepcopy(mcp), tool_progress_callback=lambda *args, **kwargs: None)
        env = {
            'logging': logging, 'logger': logging.getLogger('timeline-review'),
            # This normalizer deliberately drops the str-subclass attribute.
            # The production early snapshot reference must survive it.
            'observe_onboarding_result': lambda agent, name, args, result: str(result),
            '_is_multimodal_tool_result': lambda value: False,
            'maybe_persist_tool_result': lambda **kwargs: str(kwargs['content']),
            'get_active_env': lambda task: None,
            '_record_persisted_path_for_stub': lambda *args: None, 'note_tool_result': lambda *args: None,
            'make_tool_result_message': lambda name, content, call, **kwargs: {'role': 'tool', 'tool_call_id': call, 'tool_name': name, 'content': content},
            'lsp_deferred': types.SimpleNamespace(forward_to_agent=lambda *args: None),
            'plugin_live_notes': types.SimpleNamespace(attach_to_tool_message=lambda *args: None),
            '_redact_tool_args_for_display': lambda name, args: copy.deepcopy(args),
            'stamp_data_use': lambda *args: None, '_flush_session_db_after_tool_progress': lambda *args, **kwargs: True,
            '_safe_callback': lambda *args, **kwargs: None, '_LARGE_TOOL_RESULT_TRIM_CHARS': 1_000_000,
        }
        functions(CANDIDATE['agent/tool_executor.py'], {'_commit_tool_result'}, env)
        metrics = module('hermes_cli.observability.shared_metrics_harness', {'observe_tool_outcome': lambda *args: None})
        rows = []
        with patch.dict(sys.modules, {metrics.__name__: metrics, 'agent.hcv_timeline': timing, 'tools.hcv_file_changes': files}):
            committed = env['_commit_tool_result'](agent, rows,
                types.SimpleNamespace(name='write_file', args={'path': 'fixture.txt'}, call_id='call-one', task_id='task-one'),
                result, budget=None, tool_duration=0.1, is_error=False, blocked=False, effect_disposition=None)
        self.assertEqual(committed[0], text)
        self.assertEqual(rows[0]['content'], text)
        metadata = rows[0]['display_metadata']
        self.assertEqual(metadata['tool_result_metadata'], mcp['tool_result_metadata'])
        self.assertEqual(metadata['hcv_timeline']['phase'], 'tool')
        self.assertEqual(metadata['hcv_file_changes'], snapshot)

        source = CANDIDATE['agent/turn_context.py']
        metadata_ast = ast.parse((CORE / 'agent/message_metadata.py').read_text(encoding='utf-8'))
        declaration = next(node for node in metadata_ast.body if isinstance(node, ast.Assign) and
                           any(isinstance(target, ast.Name) and target.id == 'PERSISTENCE_ONLY_MESSAGE_FIELDS' for target in node.targets))
        persistence = {node.value for node in ast.walk(declaration) if isinstance(node, ast.Constant) and isinstance(node.value, str)}
        env = {'Any': object, 'PERSISTENCE_ONLY_MESSAGE_FIELDS': persistence, 'stamped_reasoning_tokens': lambda message: 0}
        functions(source, {'build_api_messages'}, env)
        modules = {}
        for name, values in {
            'agent.agent_runtime_helpers': {'fill_empty_non_final_wire_payload': lambda *args, **kwargs: None},
            'agent.conversation_loop': {'_clone_message_for_send': copy.deepcopy},
            'agent.replay_cleanup': {'canonicalize_replay_history': lambda rows, **kwargs: rows},
            'agent.image_replay': {'replay_for_agent': lambda *args: None},
            'agent.anthropic_thinking_replay': {'apply_rejected_thinking_suppression': lambda *args: None},
        }.items():
            modules[name] = module(name, values)
        canonical = [{'role': 'assistant', 'tool_calls': [{'id': 'call-one', 'type': 'function',
            'function': {'name': 'write_file', 'arguments': '{"path":"fixture.txt"}'}}]}, rows[0]]
        original = copy.deepcopy(canonical)
        provider = types.SimpleNamespace(_current_turn_timestamp=1, ephemeral_system_prompt='',
            _copy_reasoning_content_for_api=lambda *args: None, _should_sanitize_tool_calls=lambda: False)
        with patch.dict(sys.modules, modules):
            wire, _ = env['build_api_messages'](provider, canonical, current_turn_user_idx=None,
                ext_prefetch_cache=None, plugin_user_context=None, moa_config=None, active_system_prompt=None)
        self.assertEqual(canonical, original)
        self.assertEqual(wire[1]['content'], text)
        self.assertNotIn('display_metadata', wire[1])
        self.assertNotIn('hcv_', json.dumps(wire))
        self.assertNotIn('PRIVATE DISPLAY DIFF', json.dumps(wire))


if __name__ == '__main__':
    unittest.main(verbosity=2)

from __future__ import annotations
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

BASE = Path(__file__).resolve().parents[1] / '.local'
target = BASE.parent / 'source/usage-backend/turn_changes.py'
spec = importlib.util.spec_from_file_location('review_turn_changes', target)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
sys.path.insert(0, str(Path(os.environ['LOCALAPPDATA']) / 'hermes/hermes-agent'))
bootstrap = types.ModuleType('hermes_bootstrap')
bootstrap._happy_eyeballs_create_connection = lambda *a, **kw: (_ for _ in ()).throw(AssertionError('No network'))
sys.modules.setdefault('hermes_bootstrap', bootstrap)


class NamespaceGuardTest(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='fixture-', dir=BASE)).resolve()
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        self.home = self.root / 'profile'
        self.home.mkdir()
        subprocess.run(['git', 'init', '-q', str(self.repo)], check=True)
        self.local_file = self.repo / 'fixture.txt'
        self.local_file.write_bytes(b'after\n')
        self.local_patch = ('--- a/fixture.txt\n+++ b/fixture.txt\n@@ -1 +1 @@\n-before\n+after\n')
        absname = self.local_file.as_posix()
        self.absolute_patch = self.local_patch.replace('a/fixture.txt', 'a/' + absname).replace('b/fixture.txt', 'b/' + absname)
        self.home_override = patch.object(mod, '_home', return_value=self.home)
        self.home_override.start()
        self.addCleanup(self.home_override.stop)

    def rows(self, diff=None, tool_meta=None, assistant_meta=None):
        return [{'id': 1, 'message_uid': 'prompt-uid', 'role': 'user', 'content': 'Synthetic edit'},
                {'id': 2, 'role': 'assistant', 'content': '', 'display_metadata': assistant_meta or {},
                 'tool_calls': [{'id': 'provider-id', 'function': {'name': 'patch', 'arguments': '{}'}}]},
                {'id': 3, 'message_uid': 'tool-result-uid', 'role': 'tool', 'tool_call_id': 'provider-id',
                 'tool_name': 'patch', 'content': json.dumps({'success': True, 'diff': diff or self.local_patch}),
                 'display_metadata': tool_meta or {}}]

    def collect(self, rows):
        with patch.object(mod, '_is_human', side_effect=lambda row: row.get('role') == 'user'):
            return mod.collect_turns(rows, {'id': 'child', 'cwd': str(self.repo)})

    def timeline(self, backend='local', version=1, cwd=None):
        return {'hcv_timeline': {'version': version, 'turnId': 'native-turn', 'phase': 'tool',
                'turnStartedAtMs': 1000, 'cwdBackend': backend, 'cwd': cwd or str(self.repo)}}

    def test_legacy_absolute_path_stays_visible_without_probing_host_git(self):
        with patch.object(mod, '_git', side_effect=AssertionError('Unproven remote path must not probe host Git')) as git:
            turns = self.collect(self.rows(self.absolute_patch))
        self.assertEqual(len(turns), 1)
        value = mod._public(turns[0], 'child', 'parent')
        self.assertFalse(value['canApply'])
        self.assertEqual(value['unifiedDiff'], self.absolute_patch)
        self.assertEqual(value['files'][0]['added'], 1)
        git.assert_not_called()
        self.assertEqual(self.local_file.read_bytes(), b'after\n')

    def test_local_edit_outside_original_repository_is_visible_without_undo(self):
        path = (self.root / 'other' / 'fixture.txt').as_posix()
        diff = self.local_patch.replace('a/fixture.txt', 'a/' + path).replace('b/fixture.txt', 'b/' + path)
        turns = self.collect(self.rows(diff, tool_meta=self.timeline()))
        self.assertEqual(len(turns), 1)
        value = mod._public(turns[0], 'child', 'parent')
        self.assertEqual(len(value['files']), 1)
        self.assertEqual(value['unifiedDiff'], diff)
        self.assertFalse(value['canApply'])

    def test_explicit_remote_and_unknown_version_are_readonly(self):
        for metadata in [self.timeline('ssh'), self.timeline('container'), self.timeline(version=99)]:
            with self.subTest(metadata=metadata), patch.object(mod, '_git', side_effect=AssertionError('No host namespace proof')):
                turns = self.collect(self.rows(self.absolute_patch, tool_meta=metadata))
                self.assertFalse(mod._public(turns[0], 'child', 'parent')['canApply'])

    def test_assistant_local_cwd_does_not_override_actual_remote_tool_namespace(self):
        rows = self.rows(self.absolute_patch, tool_meta=self.timeline('ssh'), assistant_meta=self.timeline('local'))
        with patch.object(mod, '_git', side_effect=AssertionError('Assistant clock is not file-namespace authority')):
            turns = self.collect(rows)
        self.assertFalse(mod._public(turns[0], 'child', 'parent')['canApply'])

    def test_local_occurrence_proof_allows_actual_saved_patch_undo(self):
        turns = self.collect(self.rows(tool_meta=self.timeline()))
        self.assertTrue(mod._public(turns[0], 'child', 'parent')['canApply'])
        with patch.object(mod, '_read_turns', return_value=turns):
            value = mod.turn_changes('child', 'parent')['turns'][0]
            result = mod.apply_turn_changes({'scope': value['scope'], 'sessionId': 'child', 'parentId': 'parent',
                'snapshotId': value['snapshotId'], 'revision': value['revision'], 'action': 'undo'})
        self.assertEqual(result['status'], 'success')
        self.assertEqual(self.local_file.read_bytes(), b'before\n')

    def test_captured_raw_path_is_preserved_until_parent_guard(self):
        raw = str(self.repo / '..' / 'other')
        metadata = self.timeline(cwd=raw)
        captured = mod._cwd({'display_metadata': metadata}, {})
        self.assertEqual(captured, raw)
        with self.assertRaises(ValueError), patch.object(mod, '_git', side_effect=AssertionError('No redirected Git')):
            mod.normalized_batch(self.local_patch, captured)

    def test_changed_directory_link_cannot_retarget_saved_local_patch(self):
        target = self.root / 'elsewhere'
        target.mkdir()
        subprocess.run(['git', 'init', '-q', str(target)], check=True)
        (target / 'fixture.txt').write_bytes(b'after\n')
        alias = self.root / 'saved-cwd'
        try:
            alias.symlink_to(target, target_is_directory=True)
        except (OSError, NotImplementedError) as error:
            # A directory junction is the native Windows redirect and does not
            # require the symbolic-link privilege. Both paths stay inside this
            # one newly-created synthetic fixture; no delete/move is involved.
            quote = lambda value: "'" + str(value).replace("'", "''") + "'"
            script = ('New-Item -ItemType Junction -Path ' + quote(alias) +
                      ' -Target ' + quote(target) + ' | Out-Null')
            made = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script],
                capture_output=True, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            if made.returncode or not getattr(alias, 'is_junction', lambda: False)():
                self.skipTest('Host does not grant directory redirects: ' + type(error).__name__)
        cwd = mod._cwd({'display_metadata': self.timeline(cwd=str(alias))}, {})
        with self.assertRaises(ValueError), patch.object(mod, '_git', side_effect=AssertionError('No redirected Git')):
            mod.normalized_batch(self.local_patch, cwd)
        self.assertEqual((target / 'fixture.txt').read_bytes(), b'after\n')

    def test_foreign_profile_scope_rejected_before_any_read_or_apply(self):
        with patch.object(mod, '_read_turns', side_effect=AssertionError('Foreign scope must be refused first')) as read:
            with self.assertRaises(mod.HTTPException) as error:
                mod.apply_turn_changes({'scope': 'other-profile', 'sessionId': 'child', 'parentId': 'parent',
                    'snapshotId': 'anything', 'revision': 0, 'action': 'undo'})
        self.assertEqual(error.exception.status_code, 409)
        read.assert_not_called()

    def test_actual_native_compression_lineage_stays_inside_child_and_blocks_foreign_parent(self):
        from hermes_state import SessionDB
        with SessionDB(self.home / 'state.db') as db:
            db.create_session('parent', 'cli', profile_name='default', cwd=str(self.repo))
            db.create_session('foreign-parent', 'cli', profile_name='default', cwd=str(self.repo))
            db.create_session('child-old', 'cli', parent_session_id='parent',
                model_config={'_delegate_from': 'parent'}, profile_name='default', cwd=str(self.repo))
            db.append_message('parent', 'user', 'Parent synthetic prompt')
            db.append_message('parent', 'assistant', 'Parent text must not be read as child patch')
            def append_turn(sid, label):
                for row in self.rows(tool_meta=self.timeline()):
                    db.append_message(sid, row['role'], row['content'],
                        tool_calls=row.get('tool_calls'), tool_name=row.get('tool_name'), tool_call_id=row.get('tool_call_id'),
                        display_metadata=row.get('display_metadata'),
                        message_uid=f'{label}-{row["id"]}')
                db.append_message(sid, 'assistant', f'Synthetic final {label}')
            append_turn('child-old', 'before-compression')
            db.end_session('child-old', 'compression')
            db.create_session('child-tip', 'cli', parent_session_id='child-old',
                model_config={}, profile_name='default', cwd=str(self.repo))
            append_turn('child-tip', 'after-compression')
            db.create_session('branch', 'cli', parent_session_id='child-tip',
                model_config={'_branched_from': 'child-tip'}, profile_name='default', cwd=str(self.repo))
            append_turn('branch', 'branch-only')
            self.assertEqual(db.resolve_resume_session_id('child-old'), 'child-tip')
        values = mod.turn_changes('child-old', 'parent')['turns']
        self.assertEqual([turn['userMessageUid'] for turn in values], ['before-compression-1', 'after-compression-1'])
        branch = mod.turn_changes('branch', 'parent')['turns']
        self.assertEqual([turn['userMessageUid'] for turn in branch], ['branch-only-1'])
        with self.assertRaises(mod.HTTPException) as error:
            mod.turn_changes('child-old', 'foreign-parent')
        self.assertEqual(error.exception.status_code, 404)


if __name__ == '__main__':
    unittest.main(verbosity=2)

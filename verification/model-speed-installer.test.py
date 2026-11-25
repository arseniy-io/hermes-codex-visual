"""Verify exact staging, installation, rollback and drift on disposable files."""
from pathlib import Path
import difflib
import hashlib
import importlib.util
import json
import tempfile
import subprocess
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('hcv_speed_installer', ROOT / 'scripts/install-hermes-model-speed.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class ModelSpeedInstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='hcv-model-speed-install-test-')
        root = Path(self.temp.name)
        assert root.resolve().parent == Path(tempfile.gettempdir()).resolve()
        assert root.name.startswith('hcv-model-speed-install-test-')
        self.fake, self.candidate, self.backups = root / 'fake-core', root / 'candidate', root / 'backups'
        self.assets = root / 'assets'
        self.assets.mkdir()
        self.original_assets = installer.stage.ASSETS
        installer.stage.ASSETS = self.assets
        self.originals = {'agent/fast_mode.py': b'VALUE = 1\n', 'agent/other.py': b'VALUE = 2\n'}
        self.expected = {'agent/fast_mode.py': b'VALUE = 11\n', 'agent/other.py': b'VALUE = 22\n',
                         'agent/hcv_model_speed.py': b'HELPER = True\n',
                         'agent/hcv_codex_diff_bridge.py': b'BRIDGE = True\n'}
        files, chunks = {}, []
        for name, original in self.originals.items():
            target = self.fake / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(original)
            with open(str(target) + ':hcv_fixture', 'wb') as stream:
                stream.write(('extra data for ' + name).encode('utf8'))
            acl = subprocess.run(['icacls', str(target), '/grant:r', '*S-1-5-32-545:(R)'], capture_output=True)
            if acl.returncode:
                raise RuntimeError('Could not set synthetic explicit ACL')
            candidate = self.expected[name]
            files[name] = {'baseline': hashlib.sha256(original).hexdigest(),
                           'candidate': hashlib.sha256(candidate).hexdigest()}
            chunks.extend(difflib.unified_diff(original.decode().splitlines(keepends=True),
                                               candidate.decode().splitlines(keepends=True),
                                               fromfile='a/' + name, tofile='b/' + name))
        helper = self.expected['agent/hcv_model_speed.py']
        (self.assets / 'hcv_model_speed.py').write_bytes(helper)
        bridge = self.expected['agent/hcv_codex_diff_bridge.py']
        (self.assets / 'hcv_codex_diff_bridge.py').write_bytes(bridge)
        (self.assets / 'core.patch').write_text(''.join(chunks), encoding='utf8', newline='\n')
        (self.assets / 'manifest.json').write_text(json.dumps({'version': 1, 'files': files, 'helper': {
            'source': 'hcv_model_speed.py', 'target': 'agent/hcv_model_speed.py',
            'baseline': hashlib.sha256(b'HELPER = False\n').hexdigest(),
            'candidate': hashlib.sha256(helper).hexdigest()}, 'additional_helpers': [{
            'source': 'hcv_codex_diff_bridge.py', 'target': 'agent/hcv_codex_diff_bridge.py',
            'candidate': hashlib.sha256(bridge).hexdigest()}]}), encoding='utf8')
        installer.stage.write_candidate(self.candidate, self.fake)

    def test_existing_pinned_helper_upgrades_but_unrecognized_helper_is_rejected(self):
        helper = self.fake / 'agent/hcv_model_speed.py'
        helper.write_bytes(b'UNRECOGNIZED = True\n')
        with self.assertRaisesRegex(RuntimeError, 'different'):
            installer.stage.write_candidate(self.candidate, self.fake)
        helper.write_bytes(b'HELPER = False\n')
        original = installer.snapshot(helper)
        installer.stage.write_candidate(self.candidate, self.fake)
        backup, _ = installer.install(self.fake, self.candidate, self.backups)
        self.assertEqual(helper.read_bytes(), self.expected['agent/hcv_model_speed.py'])
        self.assertEqual(installer.snapshot(backup / 'previous-full/agent/hcv_model_speed.py'), original)

    def test_failure_to_restore_inherited_security_rolls_back_helper(self):
        helper = self.fake / 'agent/hcv_model_speed.py'
        helper.write_bytes(b'HELPER = False\n')
        original = installer.snapshot(helper)
        installer.stage.write_candidate(self.candidate, self.fake)
        with mock.patch.object(installer, 'restore_security', side_effect=PermissionError('simulated security failure')) as restore:
            with self.assertRaisesRegex(PermissionError, 'simulated security failure'):
                installer.install(self.fake, self.candidate, self.backups)
        self.assertTrue(restore.called)
        self.assertEqual(installer.snapshot(helper), original)

    def tearDown(self):
        installer.stage.ASSETS = self.original_assets
        path = Path(self.temp.name).resolve()
        assert path.parent == Path(tempfile.gettempdir()).resolve() and path.name.startswith('hcv-model-speed-install-test-')
        self.temp.cleanup()

    def test_install_is_exact_idempotent_and_refuses_drift(self):
        original = {name: installer.snapshot(self.fake / name) for name in self.originals}
        backup, output = installer.install(self.fake, self.candidate, self.backups)
        self.assertTrue(backup.is_dir())
        for name, expected in self.expected.items():
            self.assertEqual((self.fake / name).read_bytes(), expected)
            self.assertEqual(output[name], expected)
        for name, before in original.items():
            self.assertEqual(installer.snapshot(backup / 'previous-full' / name), before)
            self.assertEqual(installer.snapshot(backup / 'native-previous' / name), before)
            self.assertEqual(installer.ancillary(installer.metadata(self.fake / name)), installer.ancillary(before['metadata']))
        again, _ = installer.install(self.fake, self.candidate, self.backups)
        self.assertIsNone(again)
        (self.fake / 'agent/fast_mode.py').write_bytes(b'UNEXPECTED = True\n')
        with self.assertRaisesRegex(RuntimeError, 'changed'):
            installer.install(self.fake, self.candidate, self.backups)

    def test_post_publication_failure_rolls_back_new_and_replaced_files(self):
        for index, (failed_name, method) in enumerate([('hcv_model_speed.py', 'unlink'), ('hcv_codex_diff_bridge.py', 'unlink'), ('fast_mode.py', 'exists')]):
            if index:
                self.tearDown()
                self.setUp()
            with self.subTest(failed_name=failed_name):
                failed = False
                real_method = getattr(Path, method)
                def fail_after_publish(path, *args, **kwargs):
                    nonlocal failed
                    if not failed and path.name.startswith(failed_name + '.hcv-') and path.name.endswith('.tmp'):
                        failed = True
                        raise OSError('simulated post-publication failure')
                    return real_method(path, *args, **kwargs)
                with mock.patch.object(Path, method, fail_after_publish):
                    with self.assertRaisesRegex(OSError, 'simulated post-publication failure'):
                        installer.install(self.fake, self.candidate, self.backups)
                self.assertTrue(failed)
                for name, original in self.originals.items():
                    self.assertEqual((self.fake / name).read_bytes(), original)
                for helper in ('hcv_model_speed.py', 'hcv_codex_diff_bridge.py'):
                    self.assertFalse((self.fake / 'agent' / helper).exists())


    def test_rollback_continues_and_lists_multiple_failures(self):
        real_publish = installer.publish
        failed = False

        def fail_during_install_and_two_restores(target, data, **kwargs):
            nonlocal failed
            name = target.relative_to(self.fake).as_posix()
            result = real_publish(target, data, **kwargs)
            if not failed and name == 'agent/other.py':
                failed = True
                raise OSError('simulated initial failure')
            return result

        with mock.patch.object(installer, 'publish', side_effect=fail_during_install_and_two_restores), \
             mock.patch.object(installer, 'restore_old', side_effect=PermissionError('simulated rollback denial')):
            with self.assertRaises(RuntimeError) as caught:
                installer.install(self.fake, self.candidate, self.backups)
        self.assertIsInstance(caught.exception.__cause__, OSError)
        for name in self.originals:
            self.assertIn(name, str(caught.exception))
            self.assertEqual((self.fake / name).read_bytes(), self.expected[name])
        self.assertEqual(str(caught.exception).count('simulated rollback denial'), 2)
        self.assertIn(str(self.backups), str(caught.exception))
        for helper in ('hcv_model_speed.py', 'hcv_codex_diff_bridge.py'):
            self.assertFalse((self.fake / 'agent' / helper).exists())

    def test_external_edits_are_left_intact_and_reported(self):
        real_publish = installer.publish
        failed = False

        def edit_then_fail(target, data, **kwargs):
            nonlocal failed
            result = real_publish(target, data, **kwargs)
            if not failed and target.name == 'other.py':
                failed = True
                (self.fake / 'agent/fast_mode.py').write_bytes(b'EXTERNAL = True\n')
                (self.fake / 'agent/hcv_codex_diff_bridge.py').write_bytes(b'OTHER_HELPER = True\n')
                raise OSError('simulated initial failure')
            return result

        with mock.patch.object(installer, 'publish', side_effect=edit_then_fail):
            with self.assertRaises(RuntimeError) as caught:
                installer.install(self.fake, self.candidate, self.backups)
        self.assertIn('agent/fast_mode.py', str(caught.exception))
        self.assertIn('agent/hcv_codex_diff_bridge.py', str(caught.exception))
        self.assertEqual((self.fake / 'agent/fast_mode.py').read_bytes(), b'EXTERNAL = True\n')
        self.assertEqual((self.fake / 'agent/hcv_codex_diff_bridge.py').read_bytes(), b'OTHER_HELPER = True\n')
        self.assertEqual((self.fake / 'agent/other.py').read_bytes(), self.originals['agent/other.py'])
        self.assertFalse((self.fake / 'agent/hcv_model_speed.py').exists())


    def test_failed_temporary_cleanup_reports_exact_path_and_still_rolls_back(self):
        original_unlink = Path.unlink
        failed = False
        def fail_once(path, *args, **kwargs):
            nonlocal failed
            if not failed and path.name.startswith('hcv_model_speed.py.hcv-') and path.name.endswith('.tmp'):
                failed = True
                raise OSError('simulated temporary unlink failure')
            return original_unlink(path, *args, **kwargs)
        with mock.patch.object(Path, 'unlink', fail_once):
            with self.assertRaises(OSError) as caught:
                installer.install(self.fake, self.candidate, self.backups)
        leftovers = list((self.fake / 'agent').glob('hcv_model_speed.py.hcv-*.tmp'))
        self.assertEqual(len(leftovers), 1)
        self.assertIn(str(leftovers[0]), str(caught.exception))
        self.assertIn('simulated temporary unlink failure', str(caught.exception))
        for helper in ('hcv_model_speed.py', 'hcv_codex_diff_bridge.py'):
            self.assertFalse((self.fake / 'agent' / helper).exists())
        for name, original in self.originals.items():
            self.assertEqual((self.fake / name).read_bytes(), original)


    def test_inherited_metadata_mismatch_rolls_back_original_inode_and_streams(self):
        target = self.fake / 'agent/fast_mode.py'
        target.unlink()
        target.write_bytes(self.originals['agent/fast_mode.py'])
        with open(str(target) + ':hcv_fixture', 'wb') as stream:
            stream.write(b'keep inherited named stream')
        original = installer.snapshot(target)
        real_replace = installer.replace_file
        def change_after_replace(path, temporary, backup):
            real_replace(path, temporary, backup)
            if path == target:
                result = subprocess.run(['icacls', str(target), '/grant:r', '*S-1-5-32-545:(R)'], capture_output=True)
                if result.returncode:
                    raise RuntimeError('Could not set synthetic post-replacement ACL')
        with mock.patch.object(installer, 'replace_file', side_effect=change_after_replace):
            with self.assertRaisesRegex(RuntimeError, 'Published metadata differs'):
                installer.install(self.fake, self.candidate, self.backups)
        self.assertEqual(installer.snapshot(target), original)
        self.assertFalse((self.fake / 'agent/hcv_model_speed.py').exists())
        backup = next(self.backups.glob('model-speed-core-rollback-*'))
        self.assertEqual(installer.snapshot(backup / 'previous-full/agent/fast_mode.py'), original)
        failure = json.loads((backup / 'journal/998-failed.json').read_text(encoding='utf8'))
        self.assertEqual(failure['rollback_failures'], [])

    def test_uncertain_win32_failure_preserves_backup_and_does_not_guess(self):
        missing = self.fake / 'agent/other.py'
        original = installer.snapshot(missing)
        real_replace = installer.replace_file
        def move_then_fail(path, temporary, backup):
            if path == missing:
                path.replace(backup)
                raise OSError('simulated partial native replacement')
            return real_replace(path, temporary, backup)
        with mock.patch.object(installer, 'replace_file', side_effect=move_then_fail):
            with self.assertRaisesRegex(RuntimeError, 'outcome is uncertain'):
                installer.install(self.fake, self.candidate, self.backups)
        self.assertFalse(missing.exists())
        pending = list(missing.parent.glob('other.py.hcv-*.tmp'))
        self.assertEqual(len(pending), 1)
        self.assertEqual(pending[0].read_bytes(), self.expected['agent/other.py'])
        backup = next(self.backups.glob('model-speed-core-rollback-*'))
        self.assertEqual(installer.snapshot(backup / 'previous-full/agent/other.py'), original)
        self.assertEqual(installer.snapshot(backup / 'native-previous/agent/other.py'), original)
        before_records = [json.loads(path.read_text(encoding='utf8')) for path in (backup / 'journal').glob('write-*-before.json')]
        interrupted = next(record for record in before_records if record['name'] == 'agent/other.py')
        self.assertEqual(Path(interrupted['pending']), pending[0])
        self.assertEqual(Path(interrupted['native_backup']), backup / 'native-previous/agent/other.py')
        self.assertEqual((self.fake / 'agent/fast_mode.py').read_bytes(), self.originals['agent/fast_mode.py'])
        self.assertFalse((self.fake / 'agent/hcv_model_speed.py').exists())

    def test_interruption_during_native_call_keeps_prepublication_journal_and_pending(self):
        missing = self.fake / 'agent/other.py'
        original = installer.snapshot(missing)
        real_replace = installer.replace_file
        def interrupt_after_move(path, temporary, backup):
            if path == missing:
                path.replace(backup)
                raise KeyboardInterrupt('synthetic interruption')
            return real_replace(path, temporary, backup)
        with mock.patch.object(installer, 'replace_file', side_effect=interrupt_after_move):
            with self.assertRaises(KeyboardInterrupt):
                installer.install(self.fake, self.candidate, self.backups)
        backup = next(self.backups.glob('model-speed-core-rollback-*'))
        records = [json.loads(path.read_text(encoding='utf8')) for path in (backup / 'journal').glob('write-*-before.json')]
        record = next(item for item in records if item['name'] == 'agent/other.py')
        pending = Path(record['pending'])
        self.assertEqual(pending.read_bytes(), self.expected['agent/other.py'])
        self.assertEqual(Path(record['native_backup']), backup / 'native-previous/agent/other.py')
        self.assertEqual(installer.snapshot(Path(record['native_backup'])), original)
        self.assertEqual(installer.snapshot(backup / 'previous-full/agent/other.py'), original)
        self.assertFalse(missing.exists())
        self.assertFalse((backup / 'journal/999-complete.json').exists())

    def test_equal_bytes_with_new_identity_are_not_overwritten_during_rollback(self):
        real_publish = installer.publish
        changed = self.fake / 'agent/fast_mode.py'
        def replace_identity_then_fail(target, data, **kwargs):
            result = real_publish(target, data, **kwargs)
            if target.name == 'other.py':
                external = changed.with_name('same-content-external')
                external.write_bytes(self.expected['agent/fast_mode.py'])
                external.replace(changed)
                raise OSError('simulated failure after external replacement')
            return result
        with mock.patch.object(installer, 'publish', side_effect=replace_identity_then_fail):
            with self.assertRaisesRegex(RuntimeError, 'agent/fast_mode.py'):
                installer.install(self.fake, self.candidate, self.backups)
        self.assertEqual(changed.read_bytes(), self.expected['agent/fast_mode.py'])
        self.assertEqual((self.fake / 'agent/other.py').read_bytes(), self.originals['agent/other.py'])
        self.assertFalse((self.fake / 'agent/hcv_model_speed.py').exists())

if __name__ == '__main__':
    unittest.main()

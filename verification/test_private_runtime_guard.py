"""Synthetic, read-only checks for the private runtime guard."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

SCRIPT = Path(__file__).parent.parent / 'scripts/test_runtime_guard.py'
spec = importlib.util.spec_from_file_location('test_runtime_guard', SCRIPT)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


def digest(data):
    return hashlib.sha256(data).hexdigest()


class GuardTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='hcv-c5-guard-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.project = self.root / 'project'
        (self.project / 'verification').mkdir(parents=True)
        self.store = self.root / 'store'
        self.store.mkdir()
        (self.root / 'owner.json').write_text(json.dumps(guard.OWNER), encoding='utf8')
        self.base = self.root / 'base/python.exe'
        self.base.parent.mkdir()
        self.base.write_bytes(b'fake base python')
        self.source = self.root / 'hermes-agent'
        self.source.mkdir()
        (self.source / 'pyproject.toml').write_bytes(b'fake project')
        (self.source / 'uv.lock').write_bytes(b'fake lock')
        for name, value in (('PROJECT_SHA', digest(b'fake project')), ('LOCK_SHA', digest(b'fake lock'))):
            patch = mock.patch.object(guard, name, value)
            patch.start()
            self.addCleanup(patch.stop)
        self.runtime_id = '1' * 32
        self.runtime = self.store / self.runtime_id
        self.venv = self.runtime / 'venv'
        (self.venv / 'Scripts').mkdir(parents=True)
        (self.venv / 'Lib/site-packages').mkdir(parents=True)
        (self.venv / 'Scripts/python.exe').write_bytes(b'fake private python')
        (self.venv / 'Lib/site-packages/pkg.py').write_bytes(b'old code')
        (self.venv / 'pyvenv.cfg').write_text(
            f'home = {self.base.parent}\ninclude-system-site-packages = false\n', encoding='utf8')
        self.base_sha = digest(self.base.read_bytes())
        self.repin()

    def repin(self):
        tree = guard.tree_digest(self.venv, workers=2)
        ri, vi = self.runtime.lstat(), self.venv.lstat()
        self.manifest = {'schema':1, 'runtime_id':self.runtime_id, 'tree_sha256':tree['sha256'],
                         'lock_sha256':guard.LOCK_SHA, 'project_sha256':guard.PROJECT_SHA,
                         'uv_sha256':guard.UV_SHA, 'base_python_sha256':self.base_sha,
                         'packages_sha256':guard.PACKAGES_SHA, 'tree':tree,
                         'runtime_device':ri.st_dev, 'runtime_inode':ri.st_ino,
                         'venv_device':vi.st_dev, 'venv_inode':vi.st_ino}
        data = (json.dumps(self.manifest, sort_keys=True) + '\n').encode()
        (self.runtime / 'manifest.json').write_bytes(data)
        self.pin = {'schema':1, 'runtime_id':self.runtime_id,
                    'manifest_sha256':digest(data), 'tree_sha256':tree['sha256']}
        self.pinfile = self.project / 'verification/test-runtime-pin.json'
        self.pinfile.write_text(json.dumps(self.pin), encoding='utf8')

    def check(self):
        return guard.verify_runtime(self.project, self.store, self.base, expected_base_sha=self.base_sha,
                                    source_root=self.source)

    def test_changed_hermes_project_or_lock_refused(self):
        (self.source/'uv.lock').write_bytes(b'new lock')
        with self.assertRaisesRegex(guard.RuntimeErrorSafe, 'dependency inputs changed'):
            self.check()
        (self.source/'uv.lock').write_bytes(b'fake lock')
        (self.source/'pyproject.toml').write_bytes(b'new project')
        with self.assertRaisesRegex(guard.RuntimeErrorSafe, 'dependency inputs changed'):
            self.check()

    def test_missing_or_changed_store_owner_refused(self):
        marker = self.store.parent/'owner.json'
        marker.unlink()
        with self.assertRaises(OSError):
            self.check()
        marker.write_text(json.dumps({'schema':True, 'purpose':guard.OWNER['purpose']}), encoding='utf8')
        with self.assertRaisesRegex(guard.RuntimeErrorSafe, 'owner is unknown'):
            self.check()

    def test_valid_private_tree_and_external_runtime_unknown(self):
        result = self.check()
        self.assertEqual(result['runtime_id'], self.runtime_id)
        self.assertEqual(result['tree_sha256'], self.pin['tree_sha256'])
        self.assertFalse(result['external_runtime_verified'])

    def test_bad_pin_ids_do_not_escape(self):
        for bad in ('../evil', str(self.root), 'A' * 32, '', None):
            with self.subTest(bad=bad):
                self.pin['runtime_id'] = bad
                self.pinfile.write_text(json.dumps(self.pin), encoding='utf8')
                with self.assertRaises((OSError, guard.RuntimeErrorSafe)):
                    self.check()

    def test_duplicate_pin_key_and_boolean_schema_refused(self):
        self.pinfile.write_text('{"schema":1,"schema":1}', encoding='utf8')
        with self.assertRaises(guard.RuntimeErrorSafe):
            self.check()
        self.pin['schema'] = True
        self.pinfile.write_text(json.dumps(self.pin), encoding='utf8')
        with self.assertRaises(guard.RuntimeErrorSafe):
            self.check()

    def test_missing_pin_manifest_and_python_refused(self):
        self.pinfile.unlink()
        with self.assertRaises(OSError):
            self.check()
        self.repin()
        (self.runtime / 'manifest.json').unlink()
        with self.assertRaises(OSError):
            self.check()
        self.repin()
        (self.venv / 'Scripts/python.exe').unlink()
        with self.assertRaises((OSError, guard.RuntimeErrorSafe)):
            self.check()

    def test_manifest_tampering_refused(self):
        with (self.runtime / 'manifest.json').open('ab') as stream:
            stream.write(b' ')
        with self.assertRaises(guard.RuntimeErrorSafe):
            self.check()

    def test_replaced_runtime_or_venv_directory_identity_refused(self):
        self.manifest['venv_inode'] += 1
        data = (json.dumps(self.manifest, sort_keys=True) + '\n').encode()
        (self.runtime/'manifest.json').write_bytes(data)
        self.pin['manifest_sha256'] = digest(data)
        self.pinfile.write_text(json.dumps(self.pin), encoding='utf8')
        with self.assertRaisesRegex(guard.RuntimeErrorSafe, 'venv directory was replaced'):
            self.check()

    def test_same_size_and_timestamp_file_tampering_refused(self):
        path = self.venv / 'Lib/site-packages/pkg.py'
        original = path.stat()
        path.write_bytes(b'bad code')
        os.utime(path, ns=(original.st_atime_ns, original.st_mtime_ns))
        with self.assertRaisesRegex(guard.RuntimeErrorSafe, 'tree changed'):
            self.check()

    def test_added_or_removed_file_refused(self):
        path = self.venv / 'Lib/site-packages/new.py'
        path.write_bytes(b'extra')
        with self.assertRaisesRegex(guard.RuntimeErrorSafe, 'tree changed'):
            self.check()
        path.unlink()
        (self.venv / 'Lib/site-packages/pkg.py').unlink()
        with self.assertRaisesRegex(guard.RuntimeErrorSafe, 'tree changed'):
            self.check()

    def test_base_and_cfg_changes_refused(self):
        self.base.write_bytes(b'other base python')
        with self.assertRaisesRegex(guard.RuntimeErrorSafe, 'base Python changed'):
            self.check()
        self.base.write_bytes(b'fake base python')
        cfg = self.venv / 'pyvenv.cfg'
        cfg.write_text(f'home = {self.root}\ninclude-system-site-packages = false\n', encoding='utf8')
        self.repin()
        with self.assertRaisesRegex(guard.RuntimeErrorSafe, 'another base'):
            self.check()
        cfg.write_text(f'home = {self.base.parent}\ninclude-system-site-packages = true\n', encoding='utf8')
        self.repin()
        with self.assertRaisesRegex(guard.RuntimeErrorSafe, 'system packages'):
            self.check()

    def test_hardlinks_refused(self):
        path = self.venv / 'Lib/site-packages/pkg.py'
        twin = self.root / 'own-hardlink'
        try:
            os.link(path, twin)
        except OSError as exc:
            self.skipTest('hardlinks unavailable: ' + str(exc))
        self.addCleanup(lambda: twin.unlink(missing_ok=True))
        with self.assertRaisesRegex(guard.RuntimeErrorSafe, 'file identity'):
            self.check()

    def test_interrupted_walk_does_not_accept_changed_directory(self):
        original = guard.file_hash
        changed = False
        def inject(path, **kwargs):
            nonlocal changed
            if not changed and str(path).endswith('pkg.py'):
                changed = True
                (self.venv / 'Lib/site-packages/new.py').write_bytes(b'new')
            return original(path, **kwargs)
        with mock.patch.object(guard, 'file_hash', side_effect=inject):
            with self.assertRaises((OSError, guard.RuntimeErrorSafe)):
                self.check()


if __name__ == '__main__':
    unittest.main(verbosity=2)

"""Synthetic preparation tests: no network, no real Hermes and no real venv."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

SCRIPT = Path(__file__).parent.parent / 'scripts/prepare_test_runtime.py'
spec = importlib.util.spec_from_file_location('prepare_test_runtime', SCRIPT)
prep = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prep)
guard = prep.guard


def sha(data):
    return hashlib.sha256(data).hexdigest()


class Result:
    def __init__(self, code=0, stdout='', stderr=''):
        self.returncode, self.stdout, self.stderr = code, stdout, stderr


class PrepareTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='hcv-c5-build-')
        self.addCleanup(self.tmp.cleanup)
        self.local = Path(self.tmp.name)
        self.source = self.local/'hermes/hermes-agent'
        self.source.mkdir(parents=True)
        self.uv = self.local/'hermes/tools/uv-0.13.5-win32-x64/uv.exe'
        self.base = self.local/'hermes/tools/python-3.14.9+20261021-win32-x64/python.exe'
        self.uv.parent.mkdir(parents=True)
        self.base.parent.mkdir(parents=True)
        self.uv.write_bytes(b'fake uv; never executed')
        self.base.write_bytes(b'fake base; never executed')
        (self.source/'pyproject.toml').write_bytes(b'fake project')
        (self.source/'uv.lock').write_bytes(b'fake lock')
        self.sentinel = self.local/'unrelated-user-file'
        self.sentinel.write_bytes(b'do not touch')
        self.plan = {f'pkg-{i:03d}':'1.0' for i in range(113)}
        data = json.dumps(self.plan, sort_keys=True, separators=(',', ':')).encode()
        patches = {'PROJECT_SHA':sha(b'fake project'), 'LOCK_SHA':sha(b'fake lock'),
                   'UV_SHA':sha(b'fake uv; never executed'),
                   'BASE_SHA':sha(b'fake base; never executed'), 'PACKAGES_SHA':sha(data)}
        for key, value in patches.items():
            p = mock.patch.object(guard, key, value)
            p.start()
            self.addCleanup(p.stop)
        for key, value in {'PYTHON_SHIM_SHA':sha(b'fake private python'),
                           'BOOTSTRAP_SHA':sha(b'fixture bootstrap, never executed')}.items():
            p = mock.patch.object(prep, key, value)
            p.start()
            self.addCleanup(p.stop)
        self.calls = []
        self.fail_sync = False
        self.change_source = False
        self.inject_hook = False
        self.inject_hardlink = False
        self.inject_reparse = False

    def runner(self, args, **kw):
        self.calls.append((args, kw))
        runtime = Path(kw['cwd'])
        if '--dry-run' in args:
            return Result(stderr='\n'.join(f' + {k}=={v}' for k,v in self.plan.items()))
        if args[1] == 'sync':
            if self.fail_sync:
                return Result(1, stderr='fixture sync error')
            venv = runtime/'venv'
            (venv/'Scripts').mkdir(parents=True)
            (venv/'Lib/site-packages/mcp/client').mkdir(parents=True)
            (venv/'Lib/site-packages/win32/lib').mkdir(parents=True)
            (venv/'Lib/site-packages/Pythonwin').mkdir()
            (venv/'Lib/site-packages/pywin32_system32').mkdir()
            (venv/'Lib/site-packages/win32/lib/pywin32_bootstrap.py').write_bytes(b'fixture bootstrap, never executed')
            (venv/'Scripts/python.exe').write_bytes(b'fake private python')
            (venv/'pyvenv.cfg').write_text(
                f'home = {self.base.parent}\ninclude-system-site-packages = false\n', encoding='utf8')
            # This is the actual reviewed file's bytes.  Unlike a mock hash,
            # the fixture detects even a one-character typo in its SHA.
            (venv/'Lib/site-packages/pywin32.pth').write_bytes(
                b"# .pth file for the PyWin32 extensions\r\nwin32\r\nwin32\\lib\r\nPythonwin\r\n"
                b"# And some hackery to deal with environments where the post_install script\r\n"
                b"# isn't run.\r\nimport pywin32_bootstrap\r\n")
            (venv/'Lib/site-packages/mcp/client/streamable_http.py').write_text('fake')
            if self.inject_hook:
                (venv/'Lib/site-packages/sitecustomize.py').write_text('fake')
            if self.inject_hardlink:
                os.link(self.sentinel, venv/'Lib/site-packages/hardlink-fixture')
            if self.inject_reparse:
                own_target = self.local/'own-empty-junction-target'
                own_target.mkdir()
                result = subprocess.run(['cmd', '/c', 'mklink', '/J',
                    str(venv/'Lib/site-packages/reparse-fixture'), str(own_target)],
                    capture_output=True, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                if result.returncode:
                    raise OSError('Could not create own test junction')
            if self.change_source:
                (self.source/'uv.lock').write_bytes(b'changed lock')
            return Result(stderr='\n'.join(f' + {k}=={v}' for k,v in self.plan.items()))
        mcp = runtime/'venv/Lib/site-packages/mcp/client/streamable_http.py'
        value = {'versions':self.plan, 'mcp_path':str(mcp), 'mcp_version':'2.3.0',
                 'mcp_types':'2.3.0', 'mcp_signature':'(url, *, max_sse_event_size=None)',
                 'hermes_cli':None, 'prefix':str(runtime/'venv')}
        return Result(stdout=json.dumps(value))

    def execute(self):
        return prep.execute(self.local, run=self.runner, runtime_id='a'*32)

    def test_new_runtime_is_published_after_success_and_only_in_own_store(self):
        result = self.execute()
        runtime = self.local/'hermes-codex-visual-test/runtimes'/('a'*32)
        self.assertEqual(result['runtime'], str(runtime))
        self.assertTrue((runtime/'manifest.json').is_file())
        self.assertTrue((runtime/'pin-candidate.json').is_file())
        self.assertEqual(self.sentinel.read_bytes(), b'do not touch')
        project = self.local/'project'
        (project/'verification').mkdir(parents=True)
        (project/'verification/test-runtime-pin.json').write_bytes((runtime/'pin-candidate.json').read_bytes())
        checked = guard.verify_runtime(project, runtime.parent, self.base, expected_base_sha=guard.BASE_SHA)
        self.assertEqual(checked['runtime_id'], 'a'*32)
        self.assertFalse(checked['external_runtime_verified'])

    def test_failed_sync_leaves_no_manifest_or_pointer_and_preserves_neighbor(self):
        self.fail_sync = True
        with self.assertRaisesRegex(guard.RuntimeErrorSafe, 'installation failed'):
            self.execute()
        runtime = self.local/'hermes-codex-visual-test/runtimes'/('a'*32)
        self.assertFalse((runtime/'manifest.json').exists())
        self.assertFalse((runtime/'pin-candidate.json').exists())
        self.assertEqual(self.sentinel.read_bytes(), b'do not touch')

    def test_duplicate_package_plan_is_refused(self):
        output = '\n'.join(f' + {k}=={v}' for k, v in self.plan.items())
        with self.assertRaisesRegex(guard.RuntimeErrorSafe, 'reviewed 113-package plan'):
            prep.reviewed_plan(output + '\n + pkg-000==1.0')

    def test_same_id_is_never_overwritten(self):
        self.execute()
        before = (self.local/'hermes-codex-visual-test/runtimes'/('a'*32)/'manifest.json').read_bytes()
        with self.assertRaises(FileExistsError):
            self.execute()
        self.assertEqual((self.local/'hermes-codex-visual-test/runtimes'/('a'*32)/'manifest.json').read_bytes(), before)

    def test_unowned_existing_store_is_not_touched(self):
        store = self.local/'hermes-codex-visual-test'
        store.mkdir()
        (store/'foreign').write_bytes(b'untouched')
        with self.assertRaises((OSError, guard.RuntimeErrorSafe)):
            self.execute()
        self.assertEqual((store/'foreign').read_bytes(), b'untouched')
        self.assertFalse((store/'runtimes').exists())

    def test_boolean_owner_schema_is_not_accepted(self):
        store = self.local/'hermes-codex-visual-test'
        store.mkdir()
        (store/'owner.json').write_text(json.dumps({'schema':True, 'purpose':prep.OWNER['purpose']}), encoding='utf8')
        with self.assertRaisesRegex(guard.RuntimeErrorSafe, 'not owned'):
            self.execute()
        self.assertFalse((store/'runtimes').exists())

    def test_changed_lock_or_unexpected_startup_hook_never_publishes(self):
        self.change_source = True
        with self.assertRaisesRegex(guard.RuntimeErrorSafe, 'external inputs changed'):
            self.execute()
        runtime = self.local/'hermes-codex-visual-test/runtimes'/('a'*32)
        self.assertFalse((runtime/'manifest.json').exists())

    def test_user_path_and_python_overrides_not_inherited(self):
        with mock.patch.dict(os.environ, {'UV_PROJECT_ENVIRONMENT':'C:\\user', 'PYTHONPATH':'C:\\secret',
                                          'UV_CACHE_DIR':'C:\\usercache', 'HTTP_PROXY':'http://example.invalid'}):
            self.execute()
        for _, kwargs in self.calls:
            env = kwargs['env']
            self.assertNotEqual(env['UV_PROJECT_ENVIRONMENT'], 'C:\\user')
            self.assertNotEqual(env['UV_CACHE_DIR'], 'C:\\usercache')
            self.assertNotIn('PYTHONPATH', env)
            self.assertNotIn('HTTP_PROXY', env)

    def test_unexpected_sitecustomize_refused_before_probe(self):
        self.inject_hook = True
        with self.assertRaisesRegex(guard.RuntimeErrorSafe, 'startup hook'):
            self.execute()
        self.assertEqual(len(self.calls), 2)
        runtime = self.local/'hermes-codex-visual-test/runtimes'/('a'*32)
        self.assertFalse((runtime/'manifest.json').exists())

    def test_startup_hooks_and_bootstrap_shadow_in_all_import_paths(self):
        self.execute()
        site = self.local/'hermes-codex-visual-test/runtimes'/('a'*32)/'venv/Lib/site-packages'
        for folder in (site, site/'win32', site/'win32/lib', site/'Pythonwin'):
            for name in ('sitecustomize.py', 'usercustomize.pyc', 'sitecustomize.cp314-win_amd64.pyd',
                         'usercustomize', 'pywin32_bootstrap'):
                with self.subTest(folder=str(folder.relative_to(site)), name=name):
                    item = folder/name
                    if name in ('usercustomize', 'pywin32_bootstrap'):
                        item.mkdir()
                        (item/'__init__.py').write_text('# synthetic, never run')
                    else:
                        item.write_bytes(b'synthetic, never run')
                    try:
                        with self.assertRaisesRegex(guard.RuntimeErrorSafe, 'startup hook or bootstrap shadow'):
                            prep.validate_startup(site.parent.parent.parent, self.base, prep.BOOTSTRAP_SHA)
                    finally:
                        if item.is_dir():
                            (item/'__init__.py').unlink()
                            item.rmdir()
                        else:
                            item.unlink()

    def test_hardlink_is_refused_before_private_python_runs(self):
        self.inject_hardlink = True
        with self.assertRaisesRegex(guard.RuntimeErrorSafe, 'unexpected file identity'):
            self.execute()
        self.assertEqual(len(self.calls), 2)
        self.assertEqual(self.sentinel.read_bytes(), b'do not touch')

    def test_reparse_point_is_refused_before_private_python_runs(self):
        self.inject_reparse = True
        try:
            with self.assertRaisesRegex(guard.RuntimeErrorSafe, 'unexpected directory entry|link or junction'):
                self.execute()
        except OSError as error:
            self.skipTest('junction creation unavailable: ' + str(error))
        self.assertEqual(len(self.calls), 2)



if __name__ == '__main__':
    unittest.main(verbosity=2)

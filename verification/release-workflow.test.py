"""Isolated release-helper checks. Never touches the real Hermes or dist."""
from hashlib import sha256
import importlib.util
import contextlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import warnings
from zipfile import ZipFile
from unittest import mock

PROJECT = Path.cwd()
HERE = Path(__file__).absolute().parent
TOOL = HERE / 'release_workflow.py'
if not TOOL.exists():
    TOOL = HERE.parent / 'scripts/release_workflow.py'
if not TOOL.exists():
    TOOL = PROJECT / 'scripts/release_workflow.py'
spec = importlib.util.spec_from_file_location('release_workflow', TOOL)
wf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wf)
REVIEWED_REFERENCE_HASHES = frozenset(wf.TRUSTED_EXECUTABLE_INPUTS['source/codex-reference.js'])
REVIEWED_RUNTIME_GUARD_HASHES = frozenset(wf.TRUSTED_EXECUTABLE_INPUTS['scripts/test_runtime_guard.py'])
REVIEWED_ROUTING_HASHES = frozenset(wf.TRUSTED_EXECUTABLE_INPUTS['verification/isolated-routing.mjs'])


class Result:
    def __init__(self, code=0, stdout='', stderr=''):
        self.returncode, self.stdout, self.stderr = code, stdout, stderr


def gateway_log(args):
    sidebar = args[args.index('-Focus') + 1] == 'sidebar-activity'
    value = {'pid':4200, 'start_time':123456, 'isolated_home':True,
             'expected_command_python':True, 'expected_base_exe':True, 'hermes_entry_path_verified':True,
             'private_gateway_rendezvous':True,
             'named_mcp_initial_registration':True if sidebar else None, 'loaded_module_paths_verified':False,
             'continuous_mcp_connection_verified':False}
    if sidebar:
        value.update(initial_mcp_initialize_count=2, initial_mcp_tools_count=2)
    return 'HCV_ISOLATED_GATEWAY_AUDIT ' + json.dumps(value) + '\n'


def fake_branch_output(root, args, plugin):
    focus = args[args.index('-Focus') + 1]
    version = args[args.index('-EvidenceVersion') + 1]
    evidence = root / 'evidence'
    evidence.mkdir(exist_ok=True)
    if focus == 'activity-center':
        (evidence / (version + '-activity-center.json')).write_text(json.dumps({
            'moduleSha256': sha256(plugin.read_bytes()).hexdigest(),
            'backendSha256': sha256((plugin.parent / 'activity.py').read_bytes()).hexdigest(),
            'failureUi': True,
        }), encoding='utf-8')
    for name in wf.BRANCH_IMAGES.get(focus, ()):
        (evidence / (version + '-' + name)).write_bytes(b'\x89PNG\r\n\x1a\nfixture')


class ReleaseWorkflowTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='hcv-workflow-')
        self.parent = Path(self.temp.name) / 'Проект'
        self.root = self.parent / '.local' / 'preview' / 'workspace'
        self.root.mkdir(parents=True)
        for name in ('scripts', 'source/usage-backend/dashboard', 'verification', '.local', 'dist'):
            (self.root / name).mkdir(parents=True)
        (self.root / '.local/preview-identity.json').write_text(json.dumps(
            {'schema': 1, 'project': str(self.parent), 'workspace': str(self.root)}), encoding='utf-8')
        for name in ('release_lock.py', 'package.py'):
            shutil.copyfile(PROJECT / 'scripts' / name, self.root / 'scripts' / name)
        shutil.copyfile(PROJECT / 'scripts/build.mjs', self.root / 'scripts/build.mjs')
        for name in ('verification/visual-assets.mjs', 'verification/run-local.ps1',
                     'verification/audit_isolated_gateway.py', 'verification/runtime-audit-mode.mjs',
                     'verification/isolated-routing.mjs',
                     'scripts/test_runtime_guard.py', 'source/codex-reference.js', 'source/agent-avatars.js'):
            (self.root / name).write_text('// isolated trusted fixture\n', encoding='utf-8')
        self.runtime = {'runtime_id':'a'*32, 'manifest_sha256':'b'*64, 'tree_sha256':'c'*64}
        (self.root / 'verification/test-runtime-pin.json').write_text(json.dumps({'schema':1, **self.runtime}), encoding='utf-8')
        self.runtime_patch = mock.patch.object(wf, 'check_test_runtime', return_value=dict(self.runtime))
        self.runtime_patch.start()
        self.addCleanup(self.runtime_patch.stop)
        (self.root / 'verification/sandbox.spec.mjs').write_text(
            "const a = process.env.HERMES_VISUAL_FOCUS === 'activity-center'\n"
            "const b = process.env.HERMES_VISUAL_FOCUS === 'sidebar-activity'\n"
            "const c = ['sidebar-more', 'sidebar-more-all'].includes(process.env.HERMES_VISUAL_FOCUS)\n", encoding='utf-8')
        self.manifest = {'name': 'hermes-codex-visual', 'version': '1.2.3', 'hermesAgentPackage': True,
                         'scripts': {'build': 'node scripts/build.mjs',
                                     'check': 'node scripts/build.mjs --check && node --check plugin.js'}}
        (self.root / 'package.json').write_text(json.dumps(self.manifest), encoding='utf-8')
        (self.root / 'package-lock.json').write_text('{}', encoding='utf-8')
        (self.root / 'LICENSE').write_text('license', encoding='utf-8')
        (self.root / 'THIRD_PARTY_NOTICES.txt').write_text('notices', encoding='utf-8')
        self.files, self.agents = wf.declared_files(self.root, self.manifest)
        for name in self.agents:
            target = self.files[name]
            target.parent.mkdir(parents=True, exist_ok=True)
            data = b'name: hermes-codex-visual\nversion: 1.2.3\n' if name == 'plugin.yaml' else ('agent ' + name).encode('utf-8')
            target.write_bytes(data)
            root_agent = self.root / name
            root_agent.parent.mkdir(parents=True, exist_ok=True)
            root_agent.write_bytes(('existing root ' + name).encode('utf-8'))
        (self.root / 'plugin.js').write_bytes(b'old public bytes')
        (self.root / '.local/plugin.js').write_bytes(b'old local bytes')
        (self.root / 'dist/SHA256SUMS.txt').write_bytes(b'old checksums')
        (self.root / 'untouched-user-file.txt').write_bytes(b'dirty user data')
        trusted = {name: {wf.digest((self.root / name).read_bytes())} for name in wf.TRUSTED_EXECUTABLE_INPUTS}
        self.trusted_patch = mock.patch.object(wf, 'TRUSTED_EXECUTABLE_INPUTS', trusted)
        self.trusted_patch.start()
        self.addCleanup(self.trusted_patch.stop)
        self.lock = wf.lock_module(self.root)
        self.lock.change(self.root, 'acquire', 'owner', 'isolated test')
        self.calls = []
        self.fail_at = None
        self.archive = self.root / 'dist/hermes-codex-visual-v1.2.3-local.zip'
        self.tools = {'npm':'fake-npm', 'node':'fake-node', 'python':'fake-python', 'pwsh':'fake-pwsh'}
        self.out = self.root / '.local/результат'

    def tearDown(self):
        self.temp.cleanup()

    def package(self):
        files, _ = wf.declared_files(self.root, self.manifest)
        with ZipFile(self.archive, 'w') as out:
            for name, source in files.items():
                out.writestr('hermes-codex-visual/' + name, source.read_bytes())
        (self.root / 'dist/SHA256SUMS.txt').write_bytes(b'new checksums')

    def runner(self, args, root, env):
        self.calls.append((list(args), dict(env)))
        command = ' '.join(args)
        if self.fail_at and self.fail_at in command:
            return Result(1, stderr='fixture failure')
        if args[:3] == ['fake-npm', 'run', 'build']:
            (root / 'plugin.js').write_bytes(b'tested module')
            for name in self.agents:
                (root / name).write_bytes(self.files[name].read_bytes())
        if args[:3] == ['fake-node', 'scripts/build.mjs', '--local']:
            (root / '.local/plugin.js').write_bytes(b'tested module')
        if 'scripts/package.py' in args:
            self.package()
        if args[0] == 'fake-pwsh':
            plugin = Path(args[args.index('-Plugin') + 1])
            self.assertEqual(plugin.read_bytes(), b'tested module')
            self.assertEqual(env['HERMES_VISUAL_ACTIVITY_PACKAGE'], str(plugin.parent))
            self.assertEqual((plugin.parent / 'activity.py').read_bytes(), b'agent activity.py')
            fake_branch_output(root, args, plugin)
            return Result(stdout='Fixture module SHA-256 ' + sha256(plugin.read_bytes()).hexdigest() + '\n'
                          + gateway_log(args) + 'HCV_PRIVATE_RUNTIME ' + ' '.join(self.runtime.values()) + '\n')
        return Result()

    def run_candidate(self, focuses=None):
        return wf.build_and_check(self.root, 'owner', self.out,
                                  focuses or ['activity-center', 'sidebar-activity', 'activity-center'], True,
                                  runner=self.runner, tools=self.tools)

    def test_run_deduplicates_and_keeps_scoped_output_snapshots(self):
        report = self.run_candidate()
        self.assertEqual(report['status'], 'selected_scenarios_passed')
        self.assertEqual(report['focus_requested'], ['activity-center', 'sidebar-activity'])
        self.assertEqual(sum(args[0] == 'fake-pwsh' for args, _ in self.calls), 2)
        self.assertFalse(report['installed'])
        self.assertEqual((self.out / 'previous-outputs/plugin.js').read_bytes(), b'old public bytes')
        self.assertEqual((self.out / 'previous-outputs/dashboard/plugin_api.py').read_bytes(), b'existing root dashboard/plugin_api.py')
        self.assertEqual((self.out / 'previous-outputs/.local/plugin.js').read_bytes(), b'old local bytes')
        self.assertEqual((self.out / 'previous-outputs/dist/SHA256SUMS.txt').read_bytes(), b'old checksums')
        self.assertEqual((self.root / 'untouched-user-file.txt').read_bytes(), b'dirty user data')

    def test_unknown_focus_and_existing_zip_stop_before_build(self):
        with self.assertRaisesRegex(wf.WorkflowError, 'Unknown Focus'):
            self.run_candidate(['activty-center'])
        self.assertFalse(self.out.exists())
        self.archive.write_bytes(b'existing user archive')
        with self.assertRaisesRegex(wf.WorkflowError, 'ZIP already exists'):
            self.run_candidate()
        self.assertEqual(self.archive.read_bytes(), b'existing user archive')
        self.assertFalse(self.calls)

    def test_scope_and_wrong_owner_stop_before_build(self):
        with self.assertRaisesRegex(wf.WorkflowError, 'review'):
            wf.build_and_check(self.root, 'owner', self.out, ['activity-center'], False, runner=self.runner, tools=self.tools)
        with self.assertRaises(Exception):
            wf.build_and_check(self.root, 'intruder', self.out, ['activity-center'], True, runner=self.runner, tools=self.tools)
        self.assertFalse(self.out.exists())

    def test_failed_build_and_failed_scenario_are_not_success(self):
        self.fail_at = 'run build'
        with self.assertRaisesRegex(wf.WorkflowError, 'Step failed'):
            self.run_candidate()
        self.assertEqual(json.loads((self.out / 'run.json').read_text(encoding='utf-8'))['status'], 'stopped')
        self.assertFalse(self.archive.exists())
        self.assertEqual((self.root / 'plugin.js').read_bytes(), b'old public bytes')

    def test_failed_scenario_blocks_install_preparation(self):
        self.fail_at = '-Focus sidebar-activity'
        with self.assertRaisesRegex(wf.WorkflowError, 'Step failed'):
            self.run_candidate()
        self.assertEqual(json.loads((self.out / 'run.json').read_text(encoding='utf-8'))['status'], 'stopped')

    def test_bad_zip_hash_and_changed_inputs_stop_staging(self):
        report = self.run_candidate()
        self.archive.write_bytes(self.archive.read_bytes() + b'changed')
        with self.assertRaisesRegex(wf.WorkflowError, 'ZIP SHA-256 changed'):
            wf.read_archive(self.root, self.archive, report['archive_sha256'])
        self.assertNotEqual(wf.digest(self.archive.read_bytes()), report['archive_sha256'])

    def test_unsafe_duplicate_and_missing_zip_members_rejected(self):
        (self.root / '.local/plugin.js').write_bytes(b'tested module')
        self.package()
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', UserWarning)
            with ZipFile(self.archive, 'a') as out:
                out.writestr('hermes-codex-visual/plugin.js', b'duplicate')
        with self.assertRaisesRegex(wf.WorkflowError, 'duplicate'):
            wf.read_archive(self.root, self.archive)
        with ZipFile(self.archive, 'w') as out:
            out.writestr('hermes-codex-visual/../escape', b'bad')
        with self.assertRaisesRegex(wf.WorkflowError, 'Unsafe'):
            wf.read_archive(self.root, self.archive)
        with ZipFile(self.archive, 'w') as out:
            out.writestr('hermes-codex-visual/plugin.js', b'tested module')
        with self.assertRaisesRegex(wf.WorkflowError, 'differs from package declaration'):
            wf.read_archive(self.root, self.archive)

    def test_missing_module_hash_is_not_a_pass(self):
        original = self.runner
        def bad_runner(args, root, env):
            if args[0] == 'fake-pwsh':
                return Result(stdout='1 passed')
            return original(args, root, env)
        with self.assertRaisesRegex(wf.WorkflowError, 'fixture module hash'):
            wf.build_and_check(self.root, 'owner', self.out, ['activity-center'], True, runner=bad_runner, tools=self.tools)

    def test_wait_never_acquires_lock(self):
        self.lock.change(self.root, 'release', 'owner', note='fixture')
        result = wf.wait_available(self.root, 1)
        self.assertTrue(result['available'])
        self.assertIsNone(self.lock._read(self.root)['owner'])
        with self.assertRaisesRegex(wf.WorkflowError, 'timeout'):
            wf.wait_available(self.root, float('nan'))

    def test_draft_setup_evidence_requires_matching_draft_edges_and_full_scenario(self):
        version = 'release-' + 'a' * 32 + '-0'
        module = 'b' * 64
        folder = self.root / 'evidence'
        folder.mkdir()
        path = folder / (version + '-draft-setup.json')
        state = {'bar': {'left': 10, 'right': 110}, 'card': {'left': 10, 'right': 110},
                 'radii': ['22px', '0px', '0px'], 'fits': True, 'barButtonsAccessible': True}
        draft = {'baseline': False, **{key: dict(state) for key in ('dark', 'withProject', 'narrow', 'light')}}
        evidence = {'moduleSha256': module, 'draftConsent': draft, 'normalSetup': True}
        def save():
            path.write_text(json.dumps(evidence), encoding='utf-8')
        save()
        self.assertTrue(wf.branch_evidence(self.root, 'draft-setup', version, module, None)['confirmed'])
        for missing in ('draftConsent', 'normalSetup'):
            item = evidence.pop(missing)
            save()
            with self.assertRaises(wf.WorkflowError):
                wf.branch_evidence(self.root, 'draft-setup', version, module, None)
            evidence[missing] = item
        draft['dark'] = dict(state, bar={'left': 23, 'right': 110})
        save()
        with self.assertRaises(wf.WorkflowError):
            wf.branch_evidence(self.root, 'draft-setup', version, module, None)
        draft['dark'] = dict(state)
        save()
        with self.assertRaises(wf.WorkflowError):
            wf.branch_evidence(self.root, 'draft-setup', version, 'c' * 64, None)

    def test_focus_guard_in_powershell_before_plugin_lookup(self):
        powershell = shutil.which('pwsh')
        if not powershell:
            self.skipTest('pwsh not installed')
        candidate = HERE / 'run-local.ps1'
        if not candidate.exists():
            candidate = PROJECT / 'verification/run-local.ps1'
        shutil.copyfile(candidate, self.root / 'verification/run-local.ps1')
        env = dict(os.environ, LOCALAPPDATA=str(self.root))
        def invoke(focus):
            return subprocess.run([powershell, '-NoProfile', '-File', 'verification/run-local.ps1', '-Focus', focus,
                                   '-Plugin', '.local/missing.js', '-EvidenceVersion', 'test'], cwd=self.root,
                                  env=env, capture_output=True, text=True, encoding='utf-8', errors='replace')
        bad = invoke('activty-center')
        self.assertNotEqual(bad.returncode, 0)
        self.assertIn('Unknown Focus', bad.stderr)
        for name in ('activity-center', 'sidebar-more', 'sidebar-more-all'):
            good = invoke(name)
            self.assertNotEqual(good.returncode, 0)
            self.assertNotIn('Unknown Focus', good.stderr)
            self.assertIn('Cannot find path', good.stderr)

    def test_run_local_enforces_pinned_mode_and_restores_caller_environment(self):
        powershell = shutil.which('pwsh')
        if not powershell or not shutil.which('node') or not shutil.which('python'):
            self.skipTest('pwsh, node or Python is unavailable')
        shutil.copyfile(HERE/'run-local.ps1', self.root/'verification/run-local.ps1')
        localapp = self.root/'fake-localapp'
        desktop = localapp/'hermes/hermes-agent/apps/desktop'
        electron = desktop/'node_modules/electron/dist/electron.exe'
        main = desktop/'dist/electron-main.mjs'
        cli = localapp/'hermes/source-archive/hermes-agent-main/node_modules/@playwright/test/cli.js'
        fake_python = self.root/'private/python.exe'
        fake_base = self.root/'base/python.exe'
        for item in (electron, main, fake_python, fake_base):
            item.parent.mkdir(parents=True, exist_ok=True)
            item.write_bytes(b'synthetic fixture; never executed')
        cli.parent.mkdir(parents=True)
        cli.write_text("console.log('FAKE_AUDIT_MODE='+process.env.HCV_TEST_RUNTIME_AUDIT_MODE);\n"
                       "console.log('FAKE_AUDIT_BASE_MATCH='+"
                       "(process.env.HCV_TEST_RUNTIME_BASE_PYTHON===process.env.HCV_EXPECTED_RUNTIME_BASE?'yes':'no'));\n"
                       "process.exit(Number(process.env.FAKE_TEST_EXIT || '0'));\n", encoding='utf8')
        payload = dict(self.runtime, python=str(fake_python), base_python=str(fake_base))
        (self.root/'scripts/test_runtime_guard.py').write_text('print('+repr(json.dumps(payload))+')\n', encoding='utf8')
        env = dict(os.environ, LOCALAPPDATA=str(localapp), HCV_EXPECTED_RUNTIME_BASE=str(fake_base))
        for name in ('HCV_TEST_RUNTIME_AUDIT_MODE', 'HCV_TEST_RUNTIME_BASE_PYTHON'):
            env.pop(name, None)
        def setter(name, value):
            if value is None:
                return "Remove-Item -LiteralPath 'Env:"+name+"' -ErrorAction SilentlyContinue\n"
            return "Set-Item -LiteralPath 'Env:"+name+"' -Value '"+value+"'\n"
        state = ("@{mode_exists=(Test-Path -LiteralPath 'Env:HCV_TEST_RUNTIME_AUDIT_MODE'); "
                 "mode=[Environment]::GetEnvironmentVariable('HCV_TEST_RUNTIME_AUDIT_MODE','Process'); "
                 "base_exists=(Test-Path -LiteralPath 'Env:HCV_TEST_RUNTIME_BASE_PYTHON'); "
                 "base=[Environment]::GetEnvironmentVariable('HCV_TEST_RUNTIME_BASE_PYTHON','Process')} | ConvertTo-Json -Compress")
        cases = [('absent', None, None), ('empty', '', ''), ('value', 'caller-mode', 'caller-base'),
                 ('mixed-absent-value', None, 'caller-base'), ('mixed-empty-absent', '', None)]
        for label, mode, base in cases:
            for outcome in ('success', 'nonzero', 'exception'):
                with self.subTest(state=label, outcome=outcome):
                    prefix = setter('HCV_TEST_RUNTIME_AUDIT_MODE', mode) + setter('HCV_TEST_RUNTIME_BASE_PYTHON', base)
                    fake_throw = ("function node { Write-Output ('FAKE_AUDIT_MODE=' + $env:HCV_TEST_RUNTIME_AUDIT_MODE); "
                                  "if ($env:HCV_TEST_RUNTIME_BASE_PYTHON -eq $env:HCV_EXPECTED_RUNTIME_BASE) "
                                  "{ Write-Output 'FAKE_AUDIT_BASE_MATCH=yes' } else { Write-Output 'FAKE_AUDIT_BASE_MATCH=no' }; "
                                  "throw 'synthetic node startup exception' }\n") if outcome == 'exception' else ''
                    command = (prefix + "Write-Output ('BEFORE=' + ("+state+"))\n" + fake_throw +
                               "try { & '.\\verification\\run-local.ps1' -Focus activity-center -Plugin 'plugin.js' "
                               "-EvidenceVersion test; Write-Output ('OUTCOME=exit:' + $LASTEXITCODE) } "
                               "catch { Write-Output ('OUTCOME=caught:' + $_.Exception.Message) }\n"
                               "Write-Output ('AFTER=' + ("+state+"))\nexit 0")
                    result = subprocess.run([powershell, '-NoProfile', '-Command', command], cwd=self.root,
                                            env=dict(env, FAKE_TEST_EXIT='9' if outcome == 'nonzero' else '0'),
                                            capture_output=True, text=True, encoding='utf8', errors='replace', timeout=30,
                                            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                    self.assertEqual(result.returncode, 0, result.stderr)
                    before = next(line.removeprefix('BEFORE=') for line in result.stdout.splitlines() if line.startswith('BEFORE='))
                    after = next(line.removeprefix('AFTER=') for line in result.stdout.splitlines() if line.startswith('AFTER='))
                    before, after = json.loads(before), json.loads(after)
                    for field, original in (('mode', mode), ('base', base)):
                        exists = before[field+'_exists']
                        if original is None:
                            self.assertFalse(exists)
                            self.assertIsNone(before[field])
                        elif original == '' and not exists:
                            self.skipTest('This PowerShell does not represent empty environment variables')
                        else:
                            self.assertTrue(exists)
                            self.assertEqual(before[field], original)
                    self.assertEqual(before, after, result.stdout)
                    self.assertIn('FAKE_AUDIT_MODE=pinned', result.stdout)
                    self.assertIn('FAKE_AUDIT_BASE_MATCH=yes', result.stdout)
                    marker = 'HCV_PRIVATE_RUNTIME ' + ' '.join(self.runtime.values())
                    if outcome == 'success':
                        self.assertIn('OUTCOME=exit:0', result.stdout)
                        self.assertIn(marker, result.stdout)
                    elif outcome == 'nonzero':
                        self.assertIn('OUTCOME=exit:9', result.stdout)
                        self.assertNotIn(marker, result.stdout)
                    else:
                        self.assertIn('OUTCOME=caught:synthetic node startup exception', result.stdout)
                        self.assertNotIn(marker, result.stdout)

    def isolated_runner(self, args, root, env):
        self.assertNotEqual(root, self.root)
        self.calls.append((list(args), dict(env)))
        manifest = json.loads((root / 'package.json').read_text(encoding='utf-8'))
        files, agents = wf.declared_files(root, manifest)
        if args[:3] == ['fake-npm', 'run', 'build']:
            (root / 'plugin.js').write_bytes(b'tested isolated module')
            for name in agents:
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(files[name].read_bytes())
        if args[:3] == ['fake-node', 'scripts/build.mjs', '--local']:
            (root / '.local/plugin.js').write_bytes(b'tested isolated module')
        if 'scripts/package.py' in args:
            (root / 'dist').mkdir(exist_ok=True)
            archive = root / 'dist' / f"{manifest['name']}-v{manifest['version']}-local.zip"
            with ZipFile(archive, 'w') as out:
                for name, source in files.items():
                    out.writestr(manifest['name'] + '/' + name, source.read_bytes())
            (root / 'dist/SHA256SUMS.txt').write_bytes(b'isolated checksums')
        if args[0] == 'fake-pwsh':
            plugin = Path(args[args.index('-Plugin') + 1])
            self.assertEqual(plugin.read_bytes(), b'tested isolated module')
            self.assertEqual(env['HERMES_VISUAL_ACTIVITY_PACKAGE'], str(plugin.parent))
            self.assertEqual((plugin.parent / 'activity.py').read_bytes(), b'agent activity.py')
            fake_branch_output(root, args, plugin)
            return Result(stdout='Fixture module SHA-256 ' + sha256(plugin.read_bytes()).hexdigest() + '\n'
                          + gateway_log(args) + 'HCV_PRIVATE_RUNTIME ' + ' '.join(self.runtime.values()) + '\n')
        return Result()

    def make_preview(self):
        path = self.root / '.local' / 'separate-preview'
        result = wf.preview(self.root, path, ['activity-center', 'sidebar-activity', 'activity-center'],
                            wf.inputs_hash(wf.project_inputs(self.root)), runner=self.isolated_runner, tools=self.tools)
        return path, result

    def make_verified_official_archive(self):
        path, result = self.make_preview()
        preview_archive = path / 'workspace/dist' / self.archive.name
        (self.root / '.local/plugin.js').write_bytes(b'tested isolated module')
        self.archive.write_bytes(preview_archive.read_bytes())
        self.assertTrue(wf.check_promotion(self.root, path, 'owner', self.archive)['release_zip_matches'])
        return path, result

    def test_preview_builds_and_checks_separately_without_touching_project(self):
        before = {name: (self.root / name).read_bytes() for name in
                  ('plugin.js', '.local/plugin.js', 'dist/SHA256SUMS.txt', 'activity.py')}
        path, result = self.make_preview()
        self.assertEqual(result['status'], 'selected_scenarios_passed')
        self.assertFalse(result['project_changed_during_preview'])
        self.assertEqual(result['checks'], ['activity-center', 'sidebar-activity'])
        self.assertEqual(len([args for args, _ in self.calls if args[0] == 'fake-pwsh']), 2)
        for name, original in before.items():
            self.assertEqual((self.root / name).read_bytes(), original)
        self.assertFalse(self.archive.exists())
        checked = wf.check_promotion(self.root, path, 'owner')
        self.assertTrue(checked['project_inputs_match'])
        self.assertNotIn('test_runtime_guard_seconds', checked)
        self.assertFalse(checked['external_runtime_verified'])
        self.assertFalse(checked['installed'])

    def test_preview_binds_runtime_and_refuses_changed_runtime_at_verify(self):
        path, _ = self.make_preview()
        recorded = json.loads((path / 'preview.json').read_text(encoding='utf-8'))
        self.assertEqual(recorded['test_runtime'], self.runtime)
        changed = dict(self.runtime, tree_sha256='d'*64)
        with mock.patch.object(wf, 'check_test_runtime', return_value=changed):
            with self.assertRaisesRegex(wf.WorkflowError, 'runtime changed'):
                wf.check_promotion(self.root, path, 'owner')

    def test_verify_reports_guard_timing_separately_from_stable_result(self):
        path, _ = self.make_preview()
        argv = ['tool', '--root', str(self.root), '--owner', 'owner', 'verify', '--preview', str(path)]
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.object(sys, 'argv', argv), mock.patch.object(wf.time, 'monotonic', side_effect=[1.0, 1.125]), \
             contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = wf.main()
        self.assertEqual(code, 0)
        self.assertTrue(json.loads(out.getvalue())['project_inputs_match'])
        self.assertNotIn('test_runtime_guard_seconds', json.loads(out.getvalue()))
        self.assertEqual(err.getvalue(), 'HCV_RUNTIME_GUARD_VERIFY_SECONDS 0.125\n')

    def test_missing_runtime_marker_cannot_pass(self):
        original = self.isolated_runner
        def missing_marker(args, root, env):
            result = original(args, root, env)
            if args[0] == 'fake-pwsh':
                result.stdout = result.stdout.split('HCV_PRIVATE_RUNTIME')[0]
            return result
        with self.assertRaisesRegex(wf.WorkflowError, 'did not prove the private runtime'):
            wf.preview(self.root, self.root/'.local/no-marker', ['sidebar-activity'],
                       wf.inputs_hash(wf.project_inputs(self.root)), runner=missing_marker, tools=self.tools)

    def test_gateway_audit_requires_two_connections_and_true_process_checks(self):
        line = gateway_log(['fake-pwsh', '-Focus', 'sidebar-activity'])
        self.assertTrue(wf.check_gateway_audit(line)['isolated_home'])
        for bad in ('', line + line, line.replace('"initial_mcp_tools_count": 2', '"initial_mcp_tools_count": 1'),
                    line.replace('"expected_command_python": true', '"expected_command_python": false'),
                    line.replace('"private_gateway_rendezvous": true', '"private_gateway_rendezvous": false'),
                    line.replace('"private_gateway_rendezvous": true', '"private_gateway_rendezvous": null')):
            with self.subTest(bad=bad):
                with self.assertRaises(wf.WorkflowError):
                    wf.check_gateway_audit(bad)
        generic = gateway_log(['fake-pwsh', '-Focus', 'activity-center'])
        self.assertTrue(wf.check_gateway_audit(generic, require_mcp=False)['isolated_home'])
        for bad in ('', generic.replace('"expected_command_python": true', '"expected_command_python": false')):
            with self.assertRaises(wf.WorkflowError):
                wf.check_gateway_audit(bad, require_mcp=False)

    def test_other_focus_without_process_audit_cannot_pass(self):
        original = self.isolated_runner
        def missing_process_audit(args, root, env):
            result = original(args, root, env)
            if args[0] == 'fake-pwsh':
                result.stdout = ''.join(line for line in result.stdout.splitlines(keepends=True)
                                        if not line.startswith('HCV_ISOLATED_GATEWAY_AUDIT '))
            return result
        with self.assertRaisesRegex(wf.WorkflowError, 'gateway audit is missing'):
            wf.preview(self.root, self.root/'.local/no-gateway-audit', ['activity-center'],
                       wf.inputs_hash(wf.project_inputs(self.root)), runner=missing_process_audit, tools=self.tools)

    def test_preview_drift_refuses_promotion_and_preserves_foreign_work(self):
        path, _ = self.make_preview()
        changed = self.root / 'verification/sandbox.spec.mjs'
        changed.write_text(changed.read_text(encoding='utf-8') + '\n// change by another task\n', encoding='utf-8')
        with self.assertRaisesRegex(wf.WorkflowError, 'inputs changed'):
            wf.check_promotion(self.root, path, 'owner')
        self.assertIn('change by another task', changed.read_text(encoding='utf-8'))
        self.assertFalse(self.archive.exists())

    def test_new_project_input_and_test_flag_changes_are_not_reused(self):
        with mock.patch.dict(os.environ, {'HERMES_VISUAL_TYPOGRAPHY': 'verify'}):
            path, _ = self.make_preview()
            self.assertTrue(wf.check_promotion(self.root, path, 'owner')['project_inputs_match'])
        with mock.patch.dict(os.environ, {'HERMES_VISUAL_TYPOGRAPHY': '0'}):
            with self.assertRaisesRegex(wf.WorkflowError, 'environment flags changed'):
                wf.check_promotion(self.root, path, 'owner')
        with mock.patch.dict(os.environ, {'HERMES_VISUAL_TYPOGRAPHY': 'verify'}):
            (self.root / 'source/new-user-work.js').write_text('new work', encoding='utf-8')
            with self.assertRaisesRegex(wf.WorkflowError, 'inputs changed'):
                wf.check_promotion(self.root, path, 'owner')

    def test_preview_does_not_inherit_unsafe_git_node_or_python_redirects(self):
        with mock.patch.dict(os.environ, {'GIT_DIR': 'bad', 'NODE_OPTIONS': '--require=bad',
                                          'PYTHONPATH': 'bad', 'HERMES_VISUAL_TYPOGRAPHY': 'verify',
                                          'HCV_TEST_RUNTIME_AUDIT_MODE':'direct',
                                          'HCV_TEST_RUNTIME_BASE_PYTHON':'untrusted'}):
            self.make_preview()
        for _, env in self.calls:
            self.assertNotIn('GIT_DIR', env)
            self.assertNotIn('NODE_OPTIONS', env)
            self.assertNotIn('PYTHONPATH', env)
            self.assertNotIn('HCV_TEST_RUNTIME_AUDIT_MODE', env)
            self.assertNotIn('HCV_TEST_RUNTIME_BASE_PYTHON', env)
            self.assertEqual(env['HERMES_VISUAL_TYPOGRAPHY'], 'verify')

    def test_preview_does_not_mix_inherited_foreign_package_paths(self):
        foreign = str(self.root / 'foreign-package')
        with mock.patch.dict(os.environ, {'HERMES_VISUAL_TIMELINE_PACKAGE': foreign,
                                          'HERMES_VISUAL_ACTIVITY_PACKAGE': foreign,
                                          'HERMES_VISUAL_APPROVAL_REPLACEMENT': foreign}):
            self.make_preview()
        for args, env in self.calls:
            self.assertNotIn('HERMES_VISUAL_APPROVAL_REPLACEMENT', env)
            if args[0] == 'fake-pwsh':
                self.assertNotIn('HERMES_VISUAL_TIMELINE_PACKAGE', env)
                self.assertNotEqual(env['HERMES_VISUAL_ACTIVITY_PACKAGE'], foreign)

    def test_timeline_option_uses_only_the_same_unpacked_zip(self):
        with mock.patch.dict(os.environ, {'HERMES_VISUAL_TIMELINE_PARITY': '1',
                                          'HERMES_VISUAL_TIMELINE_PACKAGE': 'foreign'}):
            self.make_preview()
        for args, env in self.calls:
            if args[0] == 'fake-pwsh':
                self.assertEqual(env['HERMES_VISUAL_TIMELINE_PACKAGE'], env['HERMES_VISUAL_ACTIVITY_PACKAGE'])
                self.assertNotEqual(env['HERMES_VISUAL_TIMELINE_PACKAGE'], 'foreign')

    def test_only_two_reviewed_codex_reference_hashes_are_accepted(self):
        reviewed = {'9985311c8204c4a42c27a9875a7d7754fddaf32e2c1e7753a901d148ae64d1fb',
                    '00e0887642a131338e1c0465d9728cd7846948b5142d5d40ad4fffb03e8924e5'}
        self.assertEqual(REVIEWED_REFERENCE_HASHES, reviewed)
        allowlist = dict(wf.TRUSTED_EXECUTABLE_INPUTS)
        allowlist['source/codex-reference.js'] = set(REVIEWED_REFERENCE_HASHES)
        inputs = wf.project_inputs(self.root)
        with mock.patch.object(wf, 'TRUSTED_EXECUTABLE_INPUTS', allowlist):
            for digest in sorted(reviewed):
                with self.subTest(reviewed_hash=digest):
                    inputs['source/codex-reference.js'] = digest
                    wf.trusted_project_inputs(inputs, self.manifest)
            unknown = sha256(b'unreviewed reference bytes').hexdigest()
            self.assertNotIn(unknown, reviewed)
            inputs['source/codex-reference.js'] = unknown
            with self.assertRaisesRegex(wf.WorkflowError, 'Executable input changed.*codex-reference'):
                wf.trusted_project_inputs(inputs, self.manifest)

    def test_unreviewed_or_missing_routing_helper_stops_preview(self):
        reviewed = {'3e3a76d0f21ef03b6ec79f29eebfc163c76901069daff54eda4c8549db0112b3'}
        self.assertEqual(REVIEWED_ROUTING_HASHES, reviewed)
        inputs = wf.project_inputs(self.root)
        trusted = dict(wf.TRUSTED_EXECUTABLE_INPUTS)
        trusted['verification/isolated-routing.mjs'] = reviewed
        with mock.patch.object(wf, 'TRUSTED_EXECUTABLE_INPUTS', trusted):
            inputs['verification/isolated-routing.mjs'] = next(iter(reviewed))
            wf.trusted_project_inputs(inputs, self.manifest)
            for value in (None, sha256(b'unreviewed routing code').hexdigest()):
                inputs['verification/isolated-routing.mjs'] = value
                with self.assertRaisesRegex(wf.WorkflowError, 'Executable input changed.*isolated-routing'):
                    wf.trusted_project_inputs(inputs, self.manifest)

    def test_only_reviewed_runtime_guard_hash_is_accepted(self):
        reviewed = {'df91a2578d999f38d67c2a44db04057ca362d797c28b54d1787f527fde0d7a97'}
        self.assertEqual(REVIEWED_RUNTIME_GUARD_HASHES, reviewed)
        guard_source = PROJECT / 'scripts/test_runtime_guard.py'
        guard_data = guard_source.read_bytes()
        self.assertEqual(sha256(guard_data).hexdigest(), next(iter(reviewed)))
        guard_path = self.root / 'scripts/test_runtime_guard.py'
        guard_path.write_bytes(guard_data)
        inputs = wf.project_inputs(self.root)
        trusted = dict(wf.TRUSTED_EXECUTABLE_INPUTS)
        trusted['scripts/test_runtime_guard.py'] = reviewed
        fake_guard = mock.Mock()
        fake_guard.local_paths.return_value = ('synthetic-store', 'synthetic-base')
        fake_guard.verify_runtime.return_value = dict(self.runtime)
        fake_spec = mock.Mock()
        self.runtime_patch.stop()
        with mock.patch.object(wf, 'TRUSTED_EXECUTABLE_INPUTS', trusted), \
                mock.patch.dict(os.environ, {}, clear=True), \
                mock.patch.object(wf.importlib.util, 'spec_from_file_location', return_value=fake_spec), \
                mock.patch.object(wf.importlib.util, 'module_from_spec', return_value=fake_guard):
            wf.trusted_project_inputs(inputs, self.manifest)
            self.assertEqual(wf.check_test_runtime(self.root), self.runtime)
            fake_guard.verify_runtime.assert_called_once_with(self.root, 'synthetic-store', 'synthetic-base')
            fake_spec.loader.exec_module.assert_called_once_with(fake_guard)
            previous = guard_path.stat()
            guard_path.write_bytes(guard_data[:-1] + bytes([guard_data[-1] ^ 1]))
            os.utime(guard_path, ns=(previous.st_atime_ns, previous.st_mtime_ns))
            self.assertEqual(guard_path.stat().st_size, previous.st_size)
            self.assertEqual(guard_path.stat().st_mtime_ns, previous.st_mtime_ns)
            inputs['scripts/test_runtime_guard.py'] = sha256(guard_path.read_bytes()).hexdigest()
            with self.assertRaisesRegex(wf.WorkflowError, 'Executable input changed.*test_runtime_guard'):
                wf.trusted_project_inputs(inputs, self.manifest)
            with self.assertRaisesRegex(wf.WorkflowError, 'Private runtime guard changed'):
                wf.check_test_runtime(self.root)
            fake_spec.loader.exec_module.assert_called_once_with(fake_guard)

    def test_changed_executable_or_npm_hook_stops_before_preview(self):
        out = self.root / '.local/separate-preview'
        builder = self.root / 'scripts/build.mjs'
        previous = builder.read_bytes()
        builder.write_bytes(previous + b'\nwriteFileSync("C:/unexpected.txt", "x")\n')
        with self.assertRaisesRegex(wf.WorkflowError, 'Executable input changed'):
            wf.preview(self.root, out, ['sidebar-activity'], wf.inputs_hash(wf.project_inputs(self.root)), runner=self.isolated_runner, tools=self.tools)
        self.assertFalse(out.exists())
        builder.write_bytes(previous)
        changed = dict(self.manifest)
        changed['scripts'] = dict(self.manifest['scripts'], prebuild='danger')
        (self.root / 'package.json').write_text(json.dumps(changed), encoding='utf-8')
        with self.assertRaisesRegex(wf.WorkflowError, 'lifecycle hook'):
            wf.preview(self.root, out, ['sidebar-activity'], wf.inputs_hash(wf.project_inputs(self.root)), runner=self.isolated_runner, tools=self.tools)
        self.assertFalse(out.exists())

    def test_baseline_mode_cannot_be_recorded_as_final_candidate(self):
        with mock.patch.dict(os.environ, {'HERMES_VISUAL_AUDIT_BASELINE': '1'}):
            with self.assertRaisesRegex(wf.WorkflowError, 'Baseline'):
                self.make_preview()
        with mock.patch.dict(os.environ, {'HERMES_VISUAL_WELCOME_OBSERVE': '1'}):
            with self.assertRaisesRegex(wf.WorkflowError, 'partial'):
                self.make_preview()

    def test_preview_compares_exact_official_zip_and_detects_tampering(self):
        path, result = self.make_preview()
        preview_archive = path / 'workspace/dist' / self.archive.name
        # The ordinary official build updates the local module before packaging.
        (self.root / '.local/plugin.js').write_bytes(b'tested isolated module')
        self.archive.write_bytes(preview_archive.read_bytes())
        checked = wf.check_promotion(self.root, path, 'owner', self.archive)
        self.assertTrue(checked['release_zip_matches'])
        self.assertEqual(checked['preview_zip_sha256'], result['archive_sha256'])
        self.archive.write_bytes(self.archive.read_bytes() + b'changed')
        with self.assertRaisesRegex(wf.WorkflowError, 'ZIP SHA-256 changed'):
            wf.check_promotion(self.root, path, 'owner', self.archive)

    def test_preview_rejects_unknown_focus_and_no_direct_real_build(self):
        path = self.root / '.local' / 'separate-preview'
        with self.assertRaisesRegex(wf.WorkflowError, 'Unknown Focus'):
            wf.preview(self.root, path, ['activty-center'], wf.inputs_hash(wf.project_inputs(self.root)), runner=self.isolated_runner, tools=self.tools)
        self.assertFalse(path.exists())
        (self.root / '.local/preview-identity.json').unlink()
        with self.assertRaises(Exception):
            self.run_candidate()
        self.assertFalse(self.calls)

    def test_preview_requires_exact_explicitly_reviewed_input_digest(self):
        manifest_path = self.root / '.local/review/input-manifest.json'
        reviewed = wf.inspect_inputs(self.root, manifest_path)
        self.assertEqual(reviewed['inputs_sha256'], wf.inputs_hash(wf.project_inputs(self.root)))
        (self.root / 'source/new-user-work.js').write_text('new work', encoding='utf-8')
        out = self.root / '.local/separate-preview'
        with self.assertRaisesRegex(wf.WorkflowError, 'Review the current input manifest'):
            wf.preview(self.root, out, ['sidebar-activity'], reviewed['inputs_sha256'],
                       runner=self.isolated_runner, tools=self.tools)
        self.assertFalse(out.exists())

    def test_generic_exit_cannot_prove_unregistered_scenario_branch(self):
        spec = self.root / 'verification/sandbox.spec.mjs'
        spec.write_text(spec.read_text(encoding='utf-8') + "\n// HERMES_VISUAL_FOCUS === 'not-a-real-branch'\n", encoding='utf-8')
        path = self.root / '.local' / 'separate-preview'
        result = wf.preview(self.root, path, ['not-a-real-branch'], wf.inputs_hash(wf.project_inputs(self.root)), runner=self.isolated_runner, tools=self.tools)
        self.assertEqual(result['status'], 'completed_with_unconfirmed_branches')
        with self.assertRaisesRegex(wf.WorkflowError, 'not complete'):
            wf.check_promotion(self.root, path, 'owner')
        with mock.patch.object(sys, 'argv', ['tool', '--root', str(self.root), 'preview', '--out', str(path), '--focus', 'x', '--reviewed-inputs-sha256', '0' * 64]), \
             mock.patch.object(wf, 'preview', return_value={'status': 'completed_with_unconfirmed_branches'}), \
             contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(wf.main(), 1)

    def test_tampered_scenario_evidence_or_logs_block_promotion(self):
        path, _ = self.make_preview()
        manifest = json.loads((path / 'preview.json').read_text(encoding='utf-8'))
        evidence_name = next(iter(manifest['branch_evidence']['activity-center']['files']))
        evidence = path / 'workspace' / evidence_name
        original = evidence.read_bytes()
        evidence.write_bytes(b'corrupted evidence')
        with self.assertRaises(wf.WorkflowError):
            wf.check_promotion(self.root, path, 'owner')
        evidence.write_bytes(original)
        log = path / 'workspace/.local/run/logs/07-focus-activity-center.log'
        log.write_bytes(log.read_bytes() + b'tampered')
        with self.assertRaisesRegex(wf.WorkflowError, 'step log changed'):
            wf.check_promotion(self.root, path, 'owner')

    def test_owner_loss_during_promotion_cannot_return_success(self):
        path, _ = self.make_preview()
        original = wf.require
        calls = 0
        def lose_owner(root, owner):
            nonlocal calls
            calls += 1
            if calls == 2:
                self.lock.change(self.root, 'release', 'owner', note='synthetic loss')
            return original(root, owner)
        with mock.patch.object(wf, 'require', side_effect=lose_owner):
            with self.assertRaises(Exception):
                wf.check_promotion(self.root, path, 'owner')

    def test_known_scenario_without_its_evidence_fails(self):
        original = self.isolated_runner
        def missing_evidence(args, root, env):
            if args[0] == 'fake-pwsh':
                plugin = Path(args[args.index('-Plugin') + 1])
                return Result(stdout='Fixture module SHA-256 ' + sha256(plugin.read_bytes()).hexdigest() + '\n'
                              + gateway_log(args) + 'HCV_PRIVATE_RUNTIME ' + ' '.join(self.runtime.values()) + '\n')
            return original(args, root, env)
        with self.assertRaisesRegex(wf.WorkflowError, 'Missing file'):
            wf.preview(self.root, self.root / '.local/separate-preview', ['sidebar-activity'], wf.inputs_hash(wf.project_inputs(self.root)),
                       runner=missing_evidence, tools=self.tools)

    def test_preview_stops_on_agent_version_mismatch(self):
        (self.root / 'source/usage-backend/plugin.yaml').write_text('name: hermes-codex-visual\nversion: 9.0.0\n', encoding='utf-8')
        with self.assertRaisesRegex(wf.WorkflowError, 'version differ'):
            self.make_preview()
        self.assertFalse(self.archive.exists())

    def test_invalid_windows_archive_paths_are_rejected(self):
        for name in ('CON .txt', 'folder/COM¹', 'folder/CONOUT$', 'folder/ bad', 'folder/a?.py'):
            with self.subTest(name=name), self.assertRaises(wf.WorkflowError):
                wf.safe_name(name)

    @unittest.skipUnless(os.name == 'nt', 'Full backup uses Windows hard links')
    def test_install_staging_preserves_streams_acl_and_never_installs(self):
        path, _ = self.make_verified_official_archive()
        hermes = self.root / 'Тестовый Hermes'
        target = hermes / 'desktop-plugins/hermes-codex-visual/plugin.js'
        target.parent.mkdir(parents=True)
        target.write_bytes(b'previous installed module')
        with open(str(target) + ':hcvproof', 'wb') as stream:
            stream.write(b'additional data')
        acl = subprocess.run(['icacls', str(target), '/deny', '*S-1-5-32-546:(R)'], capture_output=True)
        if acl.returncode:
            self.skipTest('Unable to create an isolated ACL fixture')
        def sddl(path):
            env = dict(os.environ, HCV_TEST_ACL_PATH=str(path))
            return subprocess.run(['pwsh', '-NoProfile', '-Command', '(Get-Acl -LiteralPath $env:HCV_TEST_ACL_PATH).Sddl'],
                                  env=env, capture_output=True, text=True, check=True).stdout.strip()
        original_acl = sddl(target)
        out = self.root / '.local/install-stage'
        plan = wf.stage_install(self.root, path, self.archive, out, 'owner', hermes)
        backup = out / 'previous-full/plugin.js'
        self.assertEqual(plan['status'], 'prepared_only')
        self.assertFalse(plan['installed'])
        self.assertFalse(plan['loaded'])
        self.assertFalse(plan['manual_rescan'])
        self.assertEqual(target.read_bytes(), b'previous installed module')
        self.assertEqual(backup.read_bytes(), b'previous installed module')
        with open(str(backup) + ':hcvproof', 'rb') as stream:
            self.assertEqual(stream.read(), b'additional data')
        self.assertEqual(sddl(backup), original_acl)
        self.assertEqual(sddl(target), original_acl)
        self.assertEqual((out / 'candidate/plugin.js').read_bytes(), b'tested isolated module')
        journal = json.loads((out / 'install-plan.json').read_text(encoding='utf-8'))
        self.assertFalse(journal['core_dependencies_checked'])
        self.assertFalse(journal['external_runtime_verified'])
        self.assertIsNone(journal['files']['turn_changes.py']['before'])
        self.assertEqual(wf.check_stage(self.root, out, 'owner', hermes)['status'], 'prepared_files_still_match')
        changed_runtime = dict(self.runtime, tree_sha256='d'*64)
        with mock.patch.object(wf, 'check_test_runtime', return_value=changed_runtime):
            with self.assertRaisesRegex(wf.WorkflowError, 'Private test runtime changed'):
                wf.check_stage(self.root, out, 'owner', hermes)
        with open(str(target) + ':hcvproof', 'wb') as stream:
            stream.write(b'changed stream only')
        with self.assertRaisesRegex(wf.WorkflowError, 'backup changed'):
            wf.check_stage(self.root, out, 'owner', hermes)
        with open(str(target) + ':hcvproof', 'wb') as stream:
            stream.write(b'additional data')
        self.assertEqual(wf.check_stage(self.root, out, 'owner', hermes)['status'], 'prepared_files_still_match')
        subprocess.run(['icacls', str(target), '/remove:d', '*S-1-5-32-546'], capture_output=True, check=True)
        with self.assertRaisesRegex(wf.WorkflowError, 'backup changed'):
            wf.check_stage(self.root, out, 'owner', hermes)
        subprocess.run(['icacls', str(target), '/deny', '*S-1-5-32-546:(R)'], capture_output=True, check=True)
        target.write_bytes(b'changed after preparation')
        with self.assertRaisesRegex(wf.WorkflowError, 'backup changed'):
            wf.check_stage(self.root, out, 'owner', hermes)

    @unittest.skipUnless(os.name == 'nt', 'Full backup uses Windows hard links')
    def test_install_staging_refuses_changed_target_without_overwriting(self):
        path, _ = self.make_verified_official_archive()
        hermes = self.root / 'Hermes'
        target = hermes / 'desktop-plugins/hermes-codex-visual/plugin.js'
        target.parent.mkdir(parents=True)
        target.write_bytes(b'old desktop')
        out = self.root / '.local/install-stage'
        original = wf.regular
        reads = 0
        def changed(path, **kwargs):
            nonlocal reads
            if Path(path) == target:
                reads += 1
                if reads == 3:
                    target.write_bytes(b'user changed desktop')
            return original(path, **kwargs)
        with mock.patch.object(wf, 'regular', side_effect=changed):
            with self.assertRaisesRegex(wf.WorkflowError, 'changed'):
                wf.stage_install(self.root, path, self.archive, out, 'owner', hermes)
        self.assertEqual(target.read_bytes(), b'user changed desktop')
        if out.exists():
            journal = json.loads((out / 'install-plan.json').read_text(encoding='utf-8'))
            self.assertEqual(journal['status'], 'interrupted')
            self.assertFalse(journal['installed'])

    @unittest.skipUnless(os.name == 'nt', 'Full backup uses Windows hard links')
    def test_install_staging_refuses_runtime_change_before_final_check(self):
        path, _ = self.make_verified_official_archive()
        hermes = self.root/'Hermes'
        target = hermes/'desktop-plugins/hermes-codex-visual/plugin.js'
        target.parent.mkdir(parents=True)
        target.write_bytes(b'untouched previous module')
        out = self.root/'.local/install-stage-runtime-change'
        changed = dict(self.runtime, tree_sha256='d'*64)
        with mock.patch.object(wf, 'check_test_runtime', side_effect=[dict(self.runtime), changed]):
            with self.assertRaisesRegex(wf.WorkflowError, 'Private test runtime changed'):
                wf.stage_install(self.root, path, self.archive, out, 'owner', hermes)
        self.assertEqual(target.read_bytes(), b'untouched previous module')
        journal = json.loads((out/'install-plan.json').read_text(encoding='utf8'))
        self.assertEqual(journal['status'], 'interrupted')
        self.assertFalse(journal['installed'])

    def test_install_staging_requires_tested_zip_and_owner(self):
        path, _ = self.make_verified_official_archive()
        hermes = self.root / 'Hermes'
        out = self.root / '.local/install-stage'
        with self.assertRaises(Exception):
            wf.stage_install(self.root, path, self.archive, out, 'intruder', hermes)
        self.assertFalse(out.exists())
        self.archive.write_bytes(self.archive.read_bytes() + b'changed')
        with self.assertRaisesRegex(wf.WorkflowError, 'ZIP SHA-256 changed'):
            wf.stage_install(self.root, path, self.archive, out, 'owner', hermes)
        self.assertFalse(out.exists())

    def make_matched_installed_files(self):
        path, _ = self.make_verified_official_archive()
        hermes = self.root / 'localapp/hermes'
        manifest, members, agents, _ = wf.read_archive(self.root, self.archive)
        targets = {'plugin.js': hermes / 'desktop-plugins' / manifest['name'] / 'plugin.js'}
        targets.update({name: hermes / 'plugins' / manifest['name'] / Path(*name.split('/')) for name in agents})
        for name, target in targets.items():
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(members[name])
        return path, hermes, targets

    def check_installed_cli(self, preview, *, owner='owner'):
        argv = ['tool', '--root', str(self.root), '--owner', owner, 'check-installed',
                '--preview', str(preview), '--archive', str(self.archive)]
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.object(sys, 'argv', argv), mock.patch.dict(os.environ, {'LOCALAPPDATA': str(self.root / 'localapp')}), \
             contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = wf.main()
        return code, json.loads(out.getvalue()) if out.getvalue() else None, err.getvalue()

    def test_check_installed_matches_all_declared_files_without_changes(self):
        preview, hermes, targets = self.make_matched_installed_files()
        before = {str(p.relative_to(hermes)): (p.read_bytes(), p.stat().st_mtime_ns) for p in hermes.rglob('*') if p.is_file()}
        code, result, err = self.check_installed_cli(preview)
        after = {str(p.relative_to(hermes)): (p.read_bytes(), p.stat().st_mtime_ns) for p in hermes.rglob('*') if p.is_file()}
        self.assertEqual((code, err), (0, ''))
        self.assertEqual(before, after)
        self.assertEqual(set(result['files']), set(targets))
        self.assertTrue(all(record['status'] == 'match' for record in result['files'].values()))
        self.assertTrue(result['disk_files_match'])
        self.assertFalse(result['install_performed'])
        self.assertIsNone(result['installed'])
        self.assertIsNone(result['loaded'])
        self.assertFalse(result['safe_to_install'])
        self.assertFalse(result['core_dependencies_checked'])

    def test_check_installed_accepts_different_guard_durations_when_data_match(self):
        preview, hermes, targets = self.make_matched_installed_files()
        before = {name: path.read_bytes() for name, path in targets.items()}
        with mock.patch.object(wf.time, 'monotonic', side_effect=[1.0, 1.01, 2.0, 2.02]) as clock:
            code, result, err = self.check_installed_cli(preview)
        self.assertEqual(clock.call_count, 4)  # Guard durations 0.010 s and 0.020 s.
        self.assertEqual((code, err), (0, ''))
        self.assertTrue(result['disk_files_match'])
        self.assertEqual(before, {name: path.read_bytes() for name, path in targets.items()})

    def test_check_installed_refuses_changed_runtime_even_with_different_durations(self):
        preview, hermes, targets = self.make_matched_installed_files()
        before = {name: path.read_bytes() for name, path in targets.items()}
        changed = dict(self.runtime, tree_sha256='d'*64)
        with mock.patch.object(wf.time, 'monotonic', side_effect=[1.0, 1.01, 2.0, 2.02]) as clock, \
             mock.patch.object(wf, 'check_test_runtime', side_effect=[dict(self.runtime), changed]):
            code, result, err = self.check_installed_cli(preview)
        self.assertEqual(clock.call_count, 4)
        self.assertEqual(code, 2)
        self.assertIsNone(result)
        self.assertIn('Private test runtime changed', err)
        self.assertEqual(before, {name: path.read_bytes() for name, path in targets.items()})

    def test_check_installed_reports_changed_and_missing_files_as_exit_one(self):
        preview, _, targets = self.make_matched_installed_files()
        targets['plugin.js'].write_bytes(b'user has a different module')
        targets['activity.py'].write_bytes(b'different agent')
        targets['plugin.yaml'].unlink()
        code, result, err = self.check_installed_cli(preview)
        self.assertEqual((code, err), (1, ''))
        self.assertEqual(result['files']['plugin.js']['status'], 'different')
        self.assertEqual(result['files']['activity.py']['status'], 'different')
        self.assertEqual(result['files']['plugin.yaml']['status'], 'missing')
        self.assertFalse(result['disk_files_match'])
        self.assertIsNone(result['loaded'])

    def test_check_installed_rejects_unowned_tampered_or_stale_inputs(self):
        preview, hermes, targets = self.make_matched_installed_files()
        before = {name: path.read_bytes() for name, path in targets.items()}
        self.assertEqual(self.check_installed_cli(preview, owner='intruder')[0], 2)
        original_archive = self.archive.read_bytes()
        self.archive.write_bytes(original_archive + b'tampered')
        self.assertEqual(self.check_installed_cli(preview)[0], 2)
        self.archive.write_bytes(original_archive)
        source = self.root / 'verification/sandbox.spec.mjs'
        source.write_text(source.read_text(encoding='utf-8') + '\n// changed\n', encoding='utf-8')
        self.assertEqual(self.check_installed_cli(preview)[0], 2)
        self.assertEqual(before, {name: path.read_bytes() for name, path in targets.items()})

    def test_check_installed_rejects_unreadable_file_and_directory(self):
        preview, hermes, targets = self.make_matched_installed_files()
        target = targets['activity.py']
        original_open = wf.os.open
        def denied(path, *args, **kwargs):
            if Path(path) == target:
                raise PermissionError('synthetic access denied')
            return original_open(path, *args, **kwargs)
        with mock.patch.object(wf.os, 'open', side_effect=denied):
            code, _, err = self.check_installed_cli(preview)
        self.assertEqual(code, 2)
        self.assertIn('access denied', err)
        target.unlink()
        target.mkdir()
        self.assertEqual(self.check_installed_cli(preview)[0], 2)

    def test_check_installed_rejects_a_file_changed_between_scans(self):
        preview, _, targets = self.make_matched_installed_files()
        target = targets['plugin.js']
        original = wf.installed_file_snapshot
        reads = 0
        def changed(path, expected):
            nonlocal reads
            state = original(path, expected)
            if path == target:
                reads += 1
                if reads == 1:
                    target.write_bytes(b'changed during comparison')
            return state
        with mock.patch.object(wf, 'installed_file_snapshot', side_effect=changed):
            code, _, err = self.check_installed_cli(preview)
        self.assertEqual(code, 2)
        self.assertIn('changed during comparison', err)
        self.assertEqual(target.read_bytes(), b'changed during comparison')

    def test_installed_snapshot_rejects_a_file_changed_during_read(self):
        target = self.root / 'ordinary-synthetic-file'
        target.write_bytes(b'original content')
        original_fstat = wf.os.fstat
        calls = 0
        def changed(fd):
            nonlocal calls
            calls += 1
            if calls == 2:
                target.write_bytes(b'changed while read')
            return original_fstat(fd)
        with mock.patch.object(wf.os, 'fstat', side_effect=changed):
            with self.assertRaisesRegex(wf.WorkflowError, 'changed during reading'):
                wf.installed_file_snapshot(target, b'original content')
        self.assertEqual(target.read_bytes(), b'changed while read')

    def test_check_installed_rejects_archive_changed_between_scans(self):
        preview, _, targets = self.make_matched_installed_files()
        original = wf.installed_file_snapshot
        changed = False
        def alter_archive(path, expected):
            nonlocal changed
            result = original(path, expected)
            if path == targets['plugin.js'] and not changed:
                self.archive.write_bytes(self.archive.read_bytes() + b'changed while checking')
                changed = True
            return result
        with mock.patch.object(wf, 'installed_file_snapshot', side_effect=alter_archive):
            code, _, err = self.check_installed_cli(preview)
        self.assertEqual(code, 2)
        self.assertIn('ZIP SHA-256 changed', err)

    def test_check_installed_rejects_directory_junction(self):
        preview, hermes, targets = self.make_matched_installed_files()
        # Move this synthetic plugin directory aside, then put a junction at its old path.
        plugin_dir = targets['plugin.js'].parent
        real_dir = plugin_dir.with_name('real-synthetic-plugin')
        plugin_dir.rename(real_dir)
        try:
            os.symlink(real_dir, plugin_dir, target_is_directory=True)
        except OSError:
            if os.name != 'nt':
                self.skipTest('Synthetic symlink unavailable')
            result = subprocess.run(['cmd', '/c', 'mklink', '/J', str(plugin_dir), str(real_dir)],
                                    capture_output=True, text=True)
            if result.returncode:
                self.skipTest('Synthetic NTFS junction unavailable')
        code, _, err = self.check_installed_cli(preview)
        self.assertEqual(code, 2)
        self.assertRegex(err, 'Link or junction refused')
        self.assertTrue((real_dir / 'plugin.js').is_file())


if __name__ == '__main__':
    unittest.main(verbosity=2)

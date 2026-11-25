"""Queue builder tests. Synthetic Focus results never run or touch Hermes."""

import base64
from copy import deepcopy
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
from zipfile import ZipFile


HERE = Path(__file__).absolute().parent
PROJECT = next(parent for parent in HERE.parents if (parent / 'scripts/release_workflow.py').is_file())
sys.path.insert(0, str(PROJECT / 'scripts'))
sys.path.insert(0, str(HERE))
import release_queue_build as build

wf = build.workflow
TEXT = b'alpha\nkeep\nbeta\nend\n'
SOURCE = 'source/example.txt'


def change(path, before, after):
    def encode(value):
        return None if value is None else base64.b64encode(value).decode('ascii')
    return {'path': path, 'before': encode(before), 'after': encode(after)}


class QueueBuildTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='hcv-queue-build-')
        self.addCleanup(self.temporary.cleanup)
        root = Path(self.temporary.name)
        self.project, self.state = root / 'p', root / 's'
        self.storage = self.state / 'bases'
        for name in wf.TRUSTED_EXECUTABLE_INPUTS:
            if name in ('scripts/release_lock.py', 'scripts/build.mjs', 'scripts/package.py'):
                self.put(name, (PROJECT / name).read_bytes())
            else:
                self.put(name, b'controlled verification fixture\n')
        self.runtime = {'runtime_id': 'a' * 32, 'manifest_sha256': 'b' * 64, 'tree_sha256': 'c' * 64}
        self.put('verification/test-runtime-pin.json', {'schema': 1, **self.runtime})
        self.put('verification/sandbox.spec.mjs', b"a = process.env.HERMES_VISUAL_FOCUS === 'command-palette'\n"
                 b"b = process.env.HERMES_VISUAL_FOCUS === 'zoom-banner'\n"
                 b"c = process.env.HERMES_VISUAL_FOCUS === 'unconfirmed'\n"
                 b"d = process.env.HERMES_VISUAL_FOCUS === 'new-chat-welcome'\n")
        self.manifest = {'name': 'hermes-codex-visual', 'version': '1.2.3', 'hermesAgentPackage': True,
                         'scripts': {'build': 'node scripts/build.mjs',
                                     'check': 'node scripts/build.mjs --check && node --check plugin.js'}}
        self.put('package.json', self.manifest)
        self.put('package-lock.json', {'version': '1.2.3', 'packages': {'': {'version': '1.2.3'},
                  'node_modules/esbuild': {'version': '1.0.0'}, 'node_modules/@esbuild/win32-x64': {'version': '1.0.0'}}})
        _, agents = wf.declared_files(self.project, self.manifest)
        for name in agents:
            self.put('source/usage-backend/' + name, b'backend fixture\n')
        self.put('source/usage-backend/plugin.yaml', b'name: hermes-codex-visual\r\nversion: "1.0.0" # comment\r\n')
        self.put('LICENSE', b'license')
        self.put('THIRD_PARTY_NOTICES.txt', b'notices')
        self.put(SOURCE, TEXT)
        self.put('source/deleted.txt', b'delete me')
        self.put('source/blob', b'\0base')
        self.put('plugin.js', b'untouched public output')
        trusted = {name: {wf.digest((self.project / name).read_bytes())} for name in wf.TRUSTED_EXECUTABLE_INPUTS}
        patch = mock.patch.object(wf, 'TRUSTED_EXECUTABLE_INPUTS', trusted)
        patch.start()
        self.addCleanup(patch.stop)
        self.base = self.capture()
        self.calls = []
        self.failure = None
        self.tools = {'npm': 'fake-npm', 'node': 'fake-node', 'python': 'fake-python', 'pwsh': 'fake-pwsh'}

    def put(self, name, data):
        path = self.project / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(json.dumps(data).encode() if isinstance(data, dict) else data)

    def capture(self):
        return build.snapshot(self.project, self.storage, build.fingerprint(self.project)['id'])

    def item(self, name, *files, revision=1, base=None, checks=None, installed=None):
        return {'task_id': name, 'title': name, 'revision': revision, 'base_id': (base or self.base)['id'],
                'digest': wf.digest(f'{name}/{revision}'.encode()), 'payload': {'files': list(files)},
                'checks': ['command-palette'] if checks is None else checks, 'installed_revision': installed}

    def select(self, *items, base=None):
        return {'base': dict(base or self.base, generation=7, archive_sha256='f' * 64, version_floor='1.2.3'),
                'key': '1' * 64, 'items': list(items)}

    def run_candidate(self, *items, base=None, selection=None):
        return build._prepare(self.project, self.state, selection or self.select(*items, base=base), '1.2.4',
                              runner=self.runner, tools=self.tools)

    def runner(self, args, workspace, env):
        self.assertTrue(workspace.is_relative_to(self.state / 'builds'))
        self.assertEqual(wf.require_isolated_workspace(workspace), workspace.parent.parent)
        self.calls.append(args)
        manifest = wf.read_json(workspace / 'package.json')
        files, agents = wf.declared_files(workspace, manifest)
        module = b'// fixture module ' + (workspace / SOURCE).read_bytes()
        if args == ['fake-npm', 'run', 'build']:
            (workspace / 'plugin.js').write_bytes(module)
            for name in agents:
                target = workspace / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(files[name].read_bytes())
        if args == ['fake-node', 'scripts/build.mjs', '--local']:
            (workspace / '.local/plugin.js').write_bytes(module if self.failure != 'unequal' else b'different')
        archive = workspace / 'dist/hermes-codex-visual-v1.2.4-local.zip'
        if 'scripts/package.py' in args:
            archive.parent.mkdir()
            with ZipFile(archive, 'w') as package:
                for name, path in files.items():
                    package.writestr(manifest['name'] + '/' + name, path.read_bytes())
        if args[0] == 'fake-pwsh':
            if self.failure == 'scenario':
                return subprocess.CompletedProcess(args, 9, '', 'fixture failed')
            if self.failure == 'archive':
                archive.write_bytes(b'replaced ZIP')
            focus = args[args.index('-Focus') + 1]
            evidence_version = args[args.index('-EvidenceVersion') + 1]
            package_module = Path(args[args.index('-Plugin') + 1])
            module_hash = wf.digest(package_module.read_bytes())
            if focus in wf.BRANCH_JSON and self.failure != 'no-evidence':
                output = workspace / 'evidence' / (evidence_version + '-' + wf.BRANCH_JSON[focus])
                output.parent.mkdir(exist_ok=True)
                output.write_text(json.dumps({'moduleSha256': module_hash}), encoding='utf-8')
            audit = {'pid': 10, 'start_time': 20, 'isolated_home': True, 'expected_command_python': True,
                     'expected_base_exe': True, 'hermes_entry_path_verified': True,
                     'private_gateway_rendezvous': True, 'loaded_module_paths_verified': False,
                     'continuous_mcp_connection_verified': False}
            output = (f'Fixture module SHA-256 {module_hash}\n'
                      + 'HCV_PRIVATE_RUNTIME ' + ' '.join(self.runtime.values()) + '\n'
                      + 'HCV_ISOLATED_GATEWAY_AUDIT ' + json.dumps(audit) + '\n')
            return subprocess.CompletedProcess(args, 0, output, '')
        return subprocess.CompletedProcess(args, 0, '', '')

    def test_base_is_canonical_idempotent_and_rejects_replacements(self):
        fingerprint = build.fingerprint(self.project)
        self.assertEqual(fingerprint['id'], wf.inputs_hash(wf.project_inputs(self.project)))
        self.assertEqual(self.capture(), self.base)
        self.assertFalse(any(path.name.startswith('.base-') for path in self.storage.iterdir()))
        self.put(SOURCE, b'changed after approval')
        with self.assertRaisesRegex(build.BuildError, 'reviewed SHA-256'):
            build.snapshot(self.project, self.storage, self.base['id'])
        tree = build.load_base(self.storage, self.base['id'])
        self.assertEqual((tree / SOURCE).read_bytes(), TEXT)
        (tree / SOURCE).write_bytes(b'replaced')
        with self.assertRaisesRegex(build.BuildError, 'Input changed'):
            build.load_base(self.storage, self.base['id'])

    def test_saved_base_rejects_extra_inventory_and_hardlink(self):
        tree = build.load_base(self.storage, self.base['id'])
        extra = tree / 'source/.foreign'
        extra.write_bytes(b'foreign')
        with self.assertRaisesRegex(build.BuildError, 'Unexpected path'):
            build.load_base(self.storage, self.base['id'])
        extra.unlink()
        os.link(tree / SOURCE, self.project / 'linked')
        with self.assertRaisesRegex(build.BuildError, 'Input changed'):
            build.load_base(self.storage, self.base['id'])

    @unittest.skipUnless(shutil.which('git'), 'requires Git merge-file')
    def test_combines_saved_text_add_delete_and_exact_proof(self):
        self.put(SOURCE, b'unfinished live edits')
        self.put('source/unsubmitted', b'private draft')
        one = self.item('one', change(SOURCE, TEXT, TEXT.replace(b'alpha', b'ONE')),
                        change('source/deleted.txt', b'delete me', None))
        two = self.item('two', change(SOURCE, TEXT, TEXT.replace(b'end', b'TWO')),
                        change('source/New/note', None, b'new'), checks=['command-palette', 'zoom-banner'])
        selection = self.select(one, two)
        selection['integration_checks'] = ['zoom-banner', 'new-chat-welcome']
        receipt = self.run_candidate(selection=selection)
        workspace = Path(receipt['workspace'])
        self.assertEqual((workspace / SOURCE).read_bytes(), b'ONE\nkeep\nbeta\nTWO\n')
        self.assertFalse((workspace / 'source/unsubmitted').exists())
        self.assertFalse((workspace / 'source/deleted.txt').exists())
        self.assertEqual((workspace / 'source/New/note').read_bytes(), b'new')
        self.assertEqual((self.project / 'plugin.js').read_bytes(), b'untouched public output')
        self.assertEqual((self.project / SOURCE).read_bytes(), b'unfinished live edits')
        self.assertEqual(wf.read_json(self.project / 'package.json')['version'], '1.2.3')
        lock = wf.read_json(workspace / 'package-lock.json')
        self.assertEqual((lock['version'], lock['packages']['']['version']), ('1.2.4', '1.2.4'))
        self.assertEqual((workspace / 'plugin.yaml').read_bytes(),
                         b'name: hermes-codex-visual\r\nversion: "1.2.4" # comment\r\n')
        self.assertEqual(receipt['checks'], ['command-palette', 'zoom-banner', 'new-chat-welcome'])
        self.assertTrue(receipt['test_only'])
        self.assertEqual(wf.read_json(Path(receipt['receipt'])), receipt)
        self.assertEqual(wf.digest(Path(receipt['archive']).read_bytes()), receipt['archive_sha256'])
        self.assertEqual(wf.digest(Path(receipt['journal']).read_bytes()), receipt['journal_sha256'])
        for entry in receipt['outputs'].values():
            self.assertEqual(wf.digest(Path(entry['path']).read_bytes()), entry['sha256'])
        tree = build.load_base(self.storage, receipt['snapshot']['id'])
        self.assertEqual(wf.project_inputs(workspace), wf.project_inputs(tree))

    @unittest.skipUnless(shutil.which('git'), 'requires Git merge-file')
    def test_installed_revision_uses_previous_after_and_reverts_omitted_paths(self):
        one = TEXT.replace(b'alpha', b'installed')
        current = one.replace(b'end', b'other')
        old = self.item('same', change(SOURCE, TEXT, one), change('source/first', None, b'added'),
                        change('source/deleted.txt', b'delete me', None))
        self.put(SOURCE, current)
        self.put('source/first', b'added')
        (self.project / 'source/deleted.txt').unlink()
        selected = self.capture()
        two = self.item('same', change(SOURCE, TEXT, TEXT.replace(b'alpha', b'new')),
                        revision=2, installed=old)
        result = self.run_candidate(two, base=selected)
        workspace = Path(result['workspace'])
        self.assertEqual((workspace / SOURCE).read_bytes(), b'new\nkeep\nbeta\nother\n')
        self.assertEqual((workspace / 'source/deleted.txt').read_bytes(), b'delete me')
        self.assertFalse((workspace / 'source/first').exists())
        all_reverted = self.item('same', revision=2, installed=old)
        result = self.run_candidate(all_reverted, base=selected)
        self.assertEqual((Path(result['workspace']) / SOURCE).read_bytes(), TEXT.replace(b'end', b'other'))

    @unittest.skipUnless(shutil.which('git'), 'requires Git merge-file')
    def test_rebased_revision_preserves_installed_paths_and_conflicting_rollback_stops(self):
        installed_text = TEXT.replace(b'alpha', b'installed')
        old = self.item('same', change(SOURCE, TEXT, installed_text), change('source/first', None, b'added'))
        self.put(SOURCE, installed_text)
        self.put('source/first', b'added')
        selected = self.capture()
        rebased = self.item('same', change(SOURCE, installed_text, b'rebased'), revision=2, base=selected, installed=old)
        self.assertEqual((Path(self.run_candidate(rebased, base=selected)['workspace']) / 'source/first').read_bytes(),
                         b'added')
        self.put('source/other', b'new shared state')
        later = self.capture()
        with self.assertRaisesRegex(build.BuildError, 'Cannot prove.*same@1.*same@2'):
            self.run_candidate(rebased, base=later)
        competitor = self.item('competing', change(SOURCE, installed_text, b'competing'), base=selected)
        rollback = self.item('same', revision=2, installed=old)
        with self.assertRaisesRegex(build.BuildError, 'competing@1.*same@2'):
            self.run_candidate(competitor, rollback, base=selected)

    def test_conflicts_preimages_and_path_safety(self):
        for path, before, left, right in [(SOURCE, TEXT, b'left\n', b'right\n'),
                                          ('source/blob', b'\0base', b'\0one', b'\0two')]:
            if path == SOURCE and not shutil.which('git'):
                continue
            with self.subTest(path=path), self.assertRaisesRegex(build.BuildError, 'first@1.*second@1'):
                self.run_candidate(self.item('first', change(path, before, left)),
                                   self.item('second', change(path, before, right)))
        with self.assertRaisesRegex(build.BuildError, 'first@1.*second@1'):
            self.run_candidate(self.item('first', change('source/New/a', None, b'a')),
                               self.item('second', change('source/new/b', None, b'b')))
        with self.assertRaisesRegex(build.BuildError, 'Preimage differs'):
            self.run_candidate(self.item('bad', change(SOURCE, b'false', b'new')))
        for path in ('source/../outside', 'source/CON.txt', 'source/file:stream', 'source/.git/config', 'dist/test'):
            with self.subTest(path=path), self.assertRaises(build.BuildError):
                self.run_candidate(self.item('bad', change(path, None, b'bad')))
        self.assertEqual(self.calls, [])

    def test_rejects_empty_unconfirmed_failed_and_tampered_proof(self):
        for focus, failure, message in [([], None, 'No usable Focus'), (['unknown'], None, 'Unknown Focus'),
                (['unconfirmed'], None, 'confirmed branch evidence'), (['command-palette'], 'scenario', 'Step failed'),
                (['command-palette'], 'archive', 'ZIP changed'), (['command-palette'], 'unequal', 'modules differ'),
                (['command-palette'], 'no-evidence', 'Missing file')]:
            self.failure = failure
            with self.subTest(focus=focus, failure=failure), self.assertRaisesRegex(build.BuildError, message):
                self.run_candidate(self.item('one', change(SOURCE, TEXT, b'new'), checks=focus))
        self.assertFalse(list((self.state / 'builds').glob('*/result.json')))
        self.assertEqual(len(list((self.state / 'builds').glob('*/failed.json'))), 7)

    def test_unreviewed_execution_stops_and_then_accepts_exact_digest(self):
        after = deepcopy(self.manifest)
        after['scripts']['prebuild'] = 'untrusted hook'
        before = (self.project / 'package.json').read_bytes()
        with self.assertRaisesRegex(build.BuildError, 'lifecycle hook'):
            self.run_candidate(self.item('hook', change('package.json', before, json.dumps(after).encode())))
        selection = self.select(self.item('test', change('verification/new.mjs', None, b'// test')))
        with self.assertRaisesRegex(build.BuildError, r'reviewed_inputs_sha256 must be ([0-9a-f]{64})') as denied:
            self.run_candidate(selection=selection)
        self.assertEqual(self.calls, [])
        selection['reviewed_inputs_sha256'] = str(denied.exception).split('must be ')[1].split()[0]
        self.assertEqual(self.run_candidate(selection=selection)['checks'], ['command-palette'])

    def put_fixture_esbuild(self):
        self.put('node_modules/esbuild/package.json', {'name': 'esbuild', 'version': '1.0.0', 'main': 'lib/main.js'})
        self.put('node_modules/esbuild/lib/main.js', b'esbuild fixture')
        self.put('node_modules/esbuild/install.js', b'never staged')
        self.put('node_modules/@esbuild/win32-x64/package.json', {'name': '@esbuild/win32-x64', 'version': '1.0.0'})
        self.put('node_modules/@esbuild/win32-x64/esbuild.exe', b'native fixture')

    def test_only_required_esbuild_files_are_copied_without_install_hooks(self):
        self.put_fixture_esbuild()
        workspace = self.state / 'deps-test'
        build._stage_esbuild(self.project, workspace, {'package-lock.json': (self.project / 'package-lock.json').read_bytes()})
        self.assertEqual((workspace / 'node_modules/esbuild/lib/main.js').read_bytes(), b'esbuild fixture')
        self.assertEqual((workspace / 'node_modules/@esbuild/win32-x64/esbuild.exe').read_bytes(), b'native fixture')
        self.assertFalse((workspace / 'node_modules/esbuild/install.js').exists())

    def real_source(self):
        self.put('source/visual-assets.json', {
            'icons': dict.fromkeys(('newChat', 'plugins', 'folder', 'folderOpen', 'edit', 'messageEdit',
                                    'laptop', 'chatPreviewComputer'), '<svg >'),
            'avatars': [['<svg >', '<svg >']],
            'install': dict.fromkeys(('pending', 'done', 'failed', 'disclosure'), '<svg >'),
        })
        self.put('source/plugin.js', b"import assets from './visual-assets.json';\n"
                 b'export const fixture = [assets, HCV_LOCAL_VERSION];\n')
        self.put('package-lock.json', (PROJECT / 'package-lock.json').read_bytes())

    @unittest.skipUnless(shutil.which('node') and (PROJECT / 'node_modules/esbuild/lib/main.js').is_file(),
                         'requires the controlled project Node and esbuild')
    def test_real_build_and_package_from_staged_esbuild_without_hermes(self):
        self.real_source()
        values = {name: (self.project / name).read_bytes() for name in wf.project_inputs(self.project)}
        build._set_version(values, '1.2.4')
        workspace = self.state / 'commands'
        build._mkdir_with_inputs(workspace, values, values.__getitem__)
        (workspace / '.local/tmp').mkdir(parents=True)
        deps = build._stage_esbuild(PROJECT, workspace, values)
        node = wf.tool('node')
        commands = [
            [node, '--input-type=module', '-e', "console.log(import.meta.resolve('esbuild'))"],
            ['queue-manifest-command', 'run', 'build'], ['queue-manifest-command', 'run', 'check'],
            [node, 'scripts/build.mjs', '--local'], [node, 'scripts/build.mjs', '--local', '--check'],
            [sys.executable, '-B', 'scripts/package.py', '--local'],
        ]
        env = {name: value for name, value in os.environ.items() if not name.upper().startswith('HCV_RELEASE_')}
        lock = wf.lock_module(workspace)
        lock.change(workspace, 'acquire', 'test', 'isolated test')
        env['HCV_RELEASE_OWNER'] = 'test'
        for index, args in enumerate(commands):
            with self.subTest(args=args):
                result = build._run_command(args, workspace, env)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                if index == 0:
                    self.assertEqual(result.stdout.strip(), (workspace / 'node_modules/esbuild/lib/main.js').as_uri())
        archive = workspace / 'dist/hermes-codex-visual-v1.2.4-local.zip'
        package, members, _, _ = wf.read_archive(workspace, archive)
        self.assertEqual(package['version'], '1.2.4')
        self.assertEqual(members['plugin.js'], (workspace / 'plugin.js').read_bytes())
        self.assertIn('node_modules/esbuild/lib/main.js', deps)

    @unittest.skipUnless(shutil.which('node') and (PROJECT / 'node_modules/esbuild/lib/main.js').is_file(),
                         'requires the controlled project Node and esbuild')
    def test_prove_base_rejects_changed_source_with_stale_official_zip_and_output(self):
        self.real_source()
        self.put('source/usage-backend/plugin.yaml', b'name: hermes-codex-visual\nversion: 1.2.3\n')
        original = self.capture()
        build._stage_esbuild(PROJECT, self.project, {
            'package-lock.json': (self.project / 'package-lock.json').read_bytes(),
        })
        (self.project / '.local/tmp').mkdir(parents=True)
        lock = wf.lock_module(self.project)
        lock.change(self.project, 'acquire', 'fixture', 'initial isolated release')
        node = wf.tool('node')
        home = {'HCV_RELEASE_OWNER': 'fixture'}
        env = dict(os.environ, **home)
        try:
            for args in ([node, 'scripts/build.mjs'], [node, 'scripts/build.mjs', '--local'],
                         [sys.executable, '-B', 'scripts/package.py', '--local']):
                result = build._run_command(args, self.project, env)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        finally:
            lock.change(self.project, 'release', 'fixture', note='fixture packaged')
        archive = self.project / 'dist/hermes-codex-visual-v1.2.3-local.zip'
        output = self.project / '.local/plugin.js'
        archive_bytes, output_bytes = archive.read_bytes(), output.read_bytes()
        expected = wf.digest(archive_bytes)
        source = self.project / 'source/plugin.js'
        source.write_bytes(source.read_bytes() + b'export const unpublished = true;\n')
        changed = self.capture()
        self.assertNotEqual(changed['id'], original['id'])
        self.assertIsNone(build.prove_base(PROJECT, self.state, original, expected))
        with self.assertRaisesRegex(build.BuildError, 'ZIP SHA-256 changed'):
            build.prove_base(PROJECT, self.state, changed, expected)
        self.assertEqual(archive.read_bytes(), archive_bytes)
        self.assertEqual(output.read_bytes(), output_bytes)

    def test_recover_prepared_requires_exact_selection_and_untampered_proof(self):
        self.put_fixture_esbuild()
        selection = self.select(self.item('released', change(SOURCE, TEXT, b'after')))
        tree = build.load_base(self.storage, self.base['id'])
        values = {name: (tree / name).read_bytes() for name in wf.project_inputs(tree)}
        values[SOURCE] = b'after'
        build._set_version(values, '1.2.4')
        selection['reviewed_inputs_sha256'] = wf.inputs_hash(build._file_hashes(values))

        def fixture_runner(args, workspace, env):
            if args[0] == 'queue-manifest-command':
                args = ['fake-npm', *args[1:]]
            return self.runner(args, workspace, env)

        with mock.patch.object(build, '_run_command', fixture_runner), \
                mock.patch.object(wf, 'tool', side_effect={'node': 'fake-node', 'pwsh': 'fake-pwsh'}.__getitem__):
            receipt = build.prepare(self.project, self.state, selection, '1.2.4')
        self.assertFalse(receipt['test_only'])

        def recover(request=selection, version='1.2.4'):
            return build.recover_prepared(self.state, request, version)

        with mock.patch.object(wf, 'command', side_effect=AssertionError('recovery must not run build tools')):
            self.assertEqual(recover(), receipt)
            different_review = dict(selection, reviewed_inputs_sha256='0' * 64)
            self.assertIsNone(recover(different_review))
            self.assertIsNone(recover(version='1.2.5'))
            different_payload = deepcopy(selection)
            different_payload['items'][0]['payload']['files'][0] = change(SOURCE, TEXT, b'other')
            self.assertIsNone(recover(different_payload))
            journal = Path(receipt['journal'])
            log = journal.parent / wf.read_json(journal)['steps'][-1]['log']
            new_tree = build.load_base(self.storage, receipt['snapshot']['id'])
            for path in (Path(receipt['archive']), journal, log, new_tree / SOURCE,
                         Path(receipt['outputs']['plugin.js']['path']), Path(receipt['receipt'])):
                with self.subTest(path=path):
                    original = path.read_bytes()
                    path.write_bytes(b'edited after build')
                    self.assertIsNone(recover())
                    path.write_bytes(original)
            self.assertEqual(recover(), receipt)

    @unittest.skipUnless(os.name == 'nt', 'Windows short temporary path')
    def test_command_uses_and_cleans_its_own_short_temporary_directory(self):
        seen = {}
        def command(args, root, env):
            seen.update(env)
            temporary = Path(env['TEMP'])
            self.assertEqual(temporary, Path(env['TMP']))
            self.assertEqual(temporary, Path(env['TMPDIR']))
            self.assertTrue(temporary.is_dir())
            self.assertEqual(temporary.parent, self.state / 'hcv')
            self.assertLess(len(str(temporary)), len(str(root / '.local' / 'tmp')))
            (temporary / 'fixture.txt').write_text('fixture', encoding='utf-8')
            return subprocess.CompletedProcess(args, 0, '', '')
        with mock.patch.dict(os.environ, {'LOCALAPPDATA': str(self.state)}), \
                mock.patch.object(wf, 'command', side_effect=command):
            result = build._run_command(['fixture'], self.project / ('deep-' * 20), {'PYTHONPATH': 'must-be-removed'})
        self.assertEqual(result.returncode, 0)
        self.assertNotIn('PYTHONPATH', seen)
        self.assertFalse(Path(seen['TEMP']).exists())

    @unittest.skipUnless(os.name == 'nt', 'Windows short temporary path')
    def test_failed_command_keeps_its_temporary_diagnostics(self):
        seen = {}
        def command(args, root, env):
            seen.update(env)
            (Path(env['TEMP']) / 'failure.txt').write_text('diagnostic', encoding='utf-8')
            return subprocess.CompletedProcess(args, 1, '', 'fixture failure')
        with mock.patch.dict(os.environ, {'LOCALAPPDATA': str(self.state)}), \
                mock.patch.object(wf, 'command', side_effect=command):
            result = build._run_command(['fixture'], self.project, {})
        self.assertEqual(result.returncode, 1)
        self.assertEqual((Path(seen['TEMP']) / 'failure.txt').read_text(encoding='utf-8'), 'diagnostic')
        self.assertIn(seen['TEMP'], result.stderr)


if __name__ == '__main__':
    unittest.main(verbosity=2)

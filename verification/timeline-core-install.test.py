"""Exercise the production stage/installer only in verified local temporary trees."""
from pathlib import Path
import contextlib
import hashlib
import importlib.util
import json
import os
import shutil
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".local"
CORE = Path(os.environ['LOCALAPPDATA']) / 'hermes/hermes-agent'
spec = importlib.util.spec_from_file_location('timeline_installer_review', ROOT / 'scripts/install-hermes-timeline.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)
stage = installer.stage


def snapshot(root):
    return {str(path.relative_to(root)).replace('\\', '/'): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in root.rglob('*') if path.is_file()} if root.exists() else {}


def reverse_hunks(hunks):
    return [(dest, sum(line[0] != '-' for line in body), start,
             [('+' if line[0] == '-' else '-' if line[0] == '+' else ' ') + line[1:] for line in body])
            for start, removed, dest, body in hunks]


class CompanionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((stage.ASSETS / 'manifest.json').read_text(encoding='utf-8'))
        transformations = stage.patches((stage.ASSETS / 'core.patch').read_text(encoding='utf-8'))
        cls.baselines = {}
        for name, hashes in cls.manifest['files'].items():
            raw = stage.checked_path(CORE, name).read_bytes()
            if stage.digest(raw) == hashes['candidate']:
                raw = stage.apply(raw, reverse_hunks(transformations[name]), name)
            if stage.digest(raw) != hashes['baseline']:
                raise AssertionError('The live source is neither pinned baseline nor candidate: ' + name)
            cls.baselines[name] = raw

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='run-', dir=OUT)
        self.root = Path(self.temporary.name).resolve(strict=True)
        self.assertTrue(self.root.is_relative_to(OUT.resolve(strict=True)))
        self.core, self.candidate, self.backup = (self.root / name for name in ('core', 'candidate', 'backups'))
        self.core.mkdir()
        for name, raw in self.baselines.items():
            target = self.core / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)

    def tearDown(self):
        # Only this test's verified child directory is cleaned by stdlib.
        self.assertTrue(self.root.is_relative_to(OUT.resolve(strict=True)))
        self.temporary.cleanup()

    def prepare(self):
        return stage.write_candidate(self.candidate, self.core)

    def test_stage_baseline_uses_exact_hashes_and_does_not_write_core(self):
        before = snapshot(self.core)
        originals, values = self.prepare()
        self.assertEqual(snapshot(self.core), before)
        self.assertEqual(len(values), len(self.manifest['files']) + len(self.manifest['helpers']))
        self.assertEqual(originals, self.baselines)
        for name, hashes in self.manifest['files'].items():
            self.assertEqual(stage.digest(values[name]), hashes['candidate'])
        for helper in self.manifest['helpers']:
            self.assertEqual(stage.digest(values[helper['target']]), helper['candidate'])

    def test_stage_accepts_exact_current_files_without_mutation(self):
        _, values = self.prepare()
        for name, value in values.items():
            path = self.core / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(value)
        before = snapshot(self.core)
        originals, current = stage.candidates(self.core)
        self.assertEqual(originals, values)
        self.assertEqual(current, values)
        self.assertEqual(snapshot(self.core), before)

    def test_stage_refuses_tampered_baseline_without_creating_outputs(self):
        path = self.core / next(iter(self.manifest['files']))
        path.write_bytes(path.read_bytes() + b'\n# unrelated local change\n')
        before = snapshot(self.core)
        with self.assertRaisesRegex(RuntimeError, 'Installed Hermes changed'):
            self.prepare()
        self.assertEqual(snapshot(self.core), before)
        self.assertFalse(self.candidate.exists())

    def test_stage_refuses_tampered_helper_source_without_mutation(self):
        assets = self.root / 'assets'
        shutil.copytree(stage.ASSETS, assets)
        helper = self.manifest['helpers'][0]
        path = assets / helper['source']; path.write_bytes(path.read_bytes() + b'\n# changed\n')
        before = snapshot(self.core)
        with patch.object(stage, 'ASSETS', assets):
            with self.assertRaisesRegex(RuntimeError, 'timeline helper changed'):
                self.prepare()
        self.assertEqual(snapshot(self.core), before)
        self.assertFalse(self.candidate.exists())

    def test_install_refuses_tampered_staged_content_before_backup_or_write(self):
        _, values = self.prepare()
        path = self.candidate / next(iter(values)); path.write_bytes(path.read_bytes() + b'\n')
        before = snapshot(self.core)
        with self.assertRaisesRegex(RuntimeError, 'Staged source differs'):
            installer.install(self.core, self.candidate, self.backup)
        self.assertEqual(snapshot(self.core), before)
        self.assertFalse(self.backup.exists())

    def test_foreign_existing_helper_is_never_overwritten(self):
        helper = self.manifest['helpers'][0]
        path = self.core / helper['target']; path.write_bytes(b'foreign_owner = True\n')
        before = snapshot(self.core)
        with self.assertRaisesRegex(RuntimeError, 'different timeline helper'):
            self.prepare()
        self.assertEqual(snapshot(self.core), before)

    def test_exact_install_has_complete_backup_and_second_install_is_noop(self):
        _, expected = self.prepare()
        backup, actual = installer.install(self.core, self.candidate, self.backup)
        self.assertEqual(expected, actual)
        manifest = json.loads((backup / 'manifest.json').read_text(encoding='utf-8'))
        for name, original in self.baselines.items():
            self.assertEqual((backup / name).read_bytes(), original)
            self.assertEqual(manifest[name]['original'], stage.digest(original))
        for helper in self.manifest['helpers']:
            self.assertIsNone(manifest[helper['target']]['original'])
        before = snapshot(self.core)
        again, current = installer.install(self.core, self.candidate, self.backup)
        self.assertIsNone(again)
        self.assertEqual(current, expected)
        self.assertEqual(snapshot(self.core), before)

    def test_failure_before_first_module_rolls_back_both_new_helpers(self):
        self.prepare(); before = snapshot(self.core)
        real = installer.publish
        helpers = {helper['target'] for helper in self.manifest['helpers']}
        def fail(path, data, **kwargs):
            relative = str(path.relative_to(self.core)).replace('\\', '/')
            if relative not in helpers:
                raise OSError('artificial module publication failure')
            return real(path, data, **kwargs)
        with patch.object(installer, 'publish', side_effect=fail):
            with self.assertRaisesRegex(OSError, 'artificial'):
                installer.install(self.core, self.candidate, self.backup)
        self.assertEqual(snapshot(self.core), before)

    def test_temp_unlink_failure_after_link_rolls_back_both_published_helpers(self):
        self.prepare(); before = snapshot(self.core)
        real_unlink = Path.unlink
        last_helper = self.manifest['helpers'][-1]['target']
        helper_path = self.core / last_helper
        failed = False
        residue = None
        def fail_temp_unlink(path, *args, **kwargs):
            nonlocal failed
            nonlocal residue
            if (not failed and path.parent == helper_path.parent and path.name.startswith(helper_path.name + '.hcv-')
                    and path.name.endswith('.tmp') and helper_path.exists()):
                failed = True
                residue = str(path.relative_to(self.core)).replace('\\', '/')
                raise OSError('artificial temp unlink failure after successful link')
            return real_unlink(path, *args, **kwargs)
        with patch.object(Path, 'unlink', new=fail_temp_unlink):
            with self.assertRaisesRegex(OSError, 'artificial'):
                installer.install(self.core, self.candidate, self.backup)
        self.assertTrue(failed)
        after = snapshot(self.core)
        # The deliberately refused temp unlink may leave precisely that temp
        # artifact. Every loadable source/helper must still be fully restored.
        after.pop(residue, None)
        self.assertEqual(after, before)

    def test_failure_preserves_preexisting_verified_helper_and_removes_new_helper(self):
        _, expected = stage.candidates(self.core)
        helper = self.manifest['helpers'][0]['target']
        (self.core / helper).write_bytes(expected[helper])
        self.prepare(); before = snapshot(self.core)
        real = installer.publish
        helpers = {value['target'] for value in self.manifest['helpers']}
        def fail(path, data, **kwargs):
            if str(path.relative_to(self.core)).replace('\\', '/') not in helpers:
                raise OSError('artificial module publication failure')
            return real(path, data, **kwargs)
        with patch.object(installer, 'publish', side_effect=fail):
            with self.assertRaisesRegex(OSError, 'artificial'):
                installer.install(self.core, self.candidate, self.backup)
        self.assertEqual(snapshot(self.core), before)

    def test_eexist_race_preserves_helper_published_by_another_writer(self):
        self.prepare(); before = snapshot(self.core)
        real = installer.publish
        foreign = self.manifest['helpers'][-1]['target']
        raced = False
        def race(path, data, **kwargs):
            nonlocal raced
            if str(path.relative_to(self.core)).replace('\\', '/') == foreign and not raced:
                raced = True
                path.write_bytes(data)  # external owner wins before our atomic link
            return real(path, data, **kwargs)
        with patch.object(installer, 'publish', side_effect=race):
            with self.assertRaises(FileExistsError):
                installer.install(self.core, self.candidate, self.backup)
        self.assertTrue(raced)
        after = snapshot(self.core)
        self.assertEqual(after.pop(foreign), self.manifest['helpers'][-1]['candidate'])
        self.assertEqual(after, before)

    def test_mcp_then_timeline_then_mcp_keeps_verified_successors_unchanged(self):
        spec = importlib.util.spec_from_file_location('mcp_companion_review', ROOT / 'scripts/install-hermes-tool-display.py')
        mcp_installer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mcp_installer)
        mcp = mcp_installer.stage
        manifest = json.loads((mcp.ASSETS / 'manifest.json').read_text(encoding='utf-8'))
        transforms = mcp.patches((mcp.ASSETS / 'core.patch').read_text(encoding='utf-8'))
        timeline_transforms = stage.patches((stage.ASSETS / 'core.patch').read_text(encoding='utf-8'))
        for name, hashes in manifest['files'].items():
            raw = self.baselines.get(name) or (CORE / name).read_bytes()
            if mcp.digest(raw) in hashes.get('successors', []):
                raw = stage.apply(raw, reverse_hunks(timeline_transforms[name]), name)
            if mcp.digest(raw) == hashes['candidate']:
                raw = mcp.apply(raw, reverse_hunks(transforms[name]), name)
            self.assertEqual(mcp.digest(raw), hashes['baseline'], name)
            target = self.core / name; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(raw)
        mcp_candidate = self.root / 'mcp-before'
        mcp.write_candidate(mcp_candidate, self.core)
        mcp_installer.install(self.core, mcp_candidate, self.root / 'mcp-backup')
        self.prepare()
        _, expected = installer.install(self.core, self.candidate, self.backup)
        before = snapshot(self.core)
        mcp_after = self.root / 'mcp-after'
        mcp.write_candidate(mcp_after, self.core)
        backup, output = mcp_installer.install(self.core, mcp_after, self.root / 'mcp-after-backup')
        self.assertIsNone(backup)
        self.assertEqual(snapshot(self.core), before)
        for name, raw in expected.items():
            self.assertEqual((self.core / name).read_bytes(), raw, name)


if __name__ == '__main__':
    unittest.main(verbosity=2)

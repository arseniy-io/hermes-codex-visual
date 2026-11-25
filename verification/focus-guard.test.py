"""Verify focus typo rejection without starting Hermes or using a real plugin."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

PROJECT = Path(__file__).absolute().parent.parent
SCRIPT = Path(os.environ.get('HCV_FOCUS_SCRIPT', PROJECT / 'verification/run-local.ps1'))
SPEC = Path(os.environ.get('HCV_FOCUS_SPEC', PROJECT / 'verification/sandbox.spec.mjs'))


@unittest.skipUnless(shutil.which('pwsh'), 'PowerShell is unavailable')
class FocusGuardChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='hcv-focus-check-')
        self.root = Path(self.temp.name) / 'Тестовый проект'
        (self.root / 'verification').mkdir(parents=True)
        shutil.copyfile(SCRIPT, self.root / 'verification/run-local.ps1')
        shutil.copyfile(SPEC, self.root / 'verification/sandbox.spec.mjs')

    def tearDown(self):
        self.temp.cleanup()

    def invoke(self, focus):
        env = dict(os.environ, LOCALAPPDATA=str(self.root))
        return subprocess.run(
            ['pwsh', '-NoProfile', '-File', 'verification/run-local.ps1',
             '-Focus', focus, '-Plugin', '.local/missing-plugin.js', '-EvidenceVersion', 'guardtest'],
            cwd=self.root, env=env, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=20,
        )

    def test_misspelled_scenario_stops_before_plugin_lookup(self):
        result = self.invoke('activty-center')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Unknown Focus', result.stderr)
        self.assertNotIn('Cannot find path', result.stderr)

    def test_actual_scenarios_pass_name_check_without_starting_hermes(self):
        for focus in ('activity-center', 'sidebar-more', 'sidebar-more-all', 'sidebar-activity',
                      'mcp-page', 'agent-lifecycle', 'settings-audit'):
            with self.subTest(focus=focus):
                result = self.invoke(focus)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn('Unknown Focus', result.stderr)
                self.assertIn('Cannot find path', result.stderr)


if __name__ == '__main__':
    unittest.main(verbosity=2)

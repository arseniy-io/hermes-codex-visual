"""Synthetic gateway identity checks. Never inspect or terminate real processes."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

HELPER = Path(__file__).with_name('stop-isolated-gateway.py')
spec = importlib.util.spec_from_file_location('isolated_gateway_cleanup_under_test', HELPER)
gateway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)

HOME = Path(tempfile.gettempdir()).resolve() / 'hermes-e2e-codex-visual-synthetic' / 'hermes-home'
START_SECONDS = 1700000000.25
START_CENTISECONDS = round(START_SECONDS * 100)


@unittest.skipUnless(os.name == 'nt', 'Windows process identity contract')
class GatewayIdentityTest(unittest.TestCase):
    def setUp(self):
        self.process = mock.Mock()
        self.process.environ.return_value = {
            'HERMES_HOME': str(HOME), 'HERMES_DESKTOP_ISOLATED_BACKEND': '1',
        }
        self.process.cmdline.return_value = ['synthetic-python', 'gateway', 'run']
        self.process.create_time.return_value = START_SECONDS
        self.record = {'kind': 'hermes-gateway', 'pid': 123456, 'hermes_home': str(HOME)}

    def invoke(self, *, process_side_effect=None):
        output = io.StringIO()
        with mock.patch.object(sys, 'argv', ['stop-isolated-gateway.py', str(HOME)]), \
             mock.patch.object(Path, 'is_file', return_value=True), \
             mock.patch.object(Path, 'read_text', return_value=json.dumps(self.record)), \
             mock.patch.object(gateway.psutil, 'Process', return_value=self.process,
                               side_effect=process_side_effect), \
             mock.patch.object(gateway.psutil, 'process_iter', return_value=[]), \
             contextlib.redirect_stdout(output):
            gateway.main()
        return output.getvalue()

    def test_missing_start_time_refuses_to_terminate(self):
        with self.assertRaisesRegex(ValueError, 'start time'):
            self.invoke()
        self.process.terminate.assert_not_called()

    def test_invalid_start_time_refuses_to_terminate(self):
        for value in (None, True, '170000000025', 0, -1):
            with self.subTest(value=value):
                self.record['start_time'] = value
                with self.assertRaisesRegex(ValueError, 'start time'):
                    self.invoke()
                self.process.terminate.assert_not_called()

    def test_mismatch_by_one_centisecond_refuses_to_terminate(self):
        self.record['start_time'] = START_CENTISECONDS + 1
        with self.assertRaisesRegex(ValueError, 'replaced'):
            self.invoke()
        self.process.terminate.assert_not_called()

    def test_exact_start_time_terminates_only_identified_test_gateway(self):
        self.record['start_time'] = START_CENTISECONDS
        output = self.invoke()
        self.assertIn('Stopped finished isolated gateway', output)
        self.process.terminate.assert_called_once_with()
        self.process.wait.assert_called_once_with(timeout=6)

    def test_missing_process_is_not_terminated_even_without_start_time(self):
        missing = gateway.psutil.NoSuchProcess(123456)
        output = self.invoke(process_side_effect=missing)
        self.assertIn('already stopped', output)
        self.process.terminate.assert_not_called()

    def test_process_disappears_while_checking_start_time(self):
        self.record['start_time'] = START_CENTISECONDS
        self.process.create_time.side_effect = gateway.psutil.NoSuchProcess(123456)
        output = self.invoke()
        self.assertIn('already stopped', output)
        self.process.terminate.assert_not_called()

    def test_unreadable_creation_time_refuses_to_terminate(self):
        self.record['start_time'] = START_CENTISECONDS
        self.process.create_time.side_effect = gateway.psutil.AccessDenied(123456)
        with self.assertRaises(gateway.psutil.AccessDenied):
            self.invoke()
        self.process.terminate.assert_not_called()


if __name__ == '__main__':
    unittest.main()

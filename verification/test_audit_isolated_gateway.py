"""Read-only synthetic checks for one isolated gateway's process identity."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).parent / 'audit_isolated_gateway.py'
spec = importlib.util.spec_from_file_location('audit_isolated_gateway', SCRIPT)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class FakeProcess:
    def __init__(self, pid, home, python, base):
        self.pid, self.home, self.python, self.base = pid, home, python, base
        self.start = 1234.56
        self.running = True
        self.env = {'HERMES_HOME':str(home), 'HERMES_DESKTOP_ISOLATED_BACKEND':'1', 'SECRET':'not logged',
                    'HERMES_GATEWAY_LOCK_DIR':str(home.parent/'gateway-locks'),
                    'XDG_STATE_HOME':str(home.parent/'xdg-state')}
        self.argv = [str(python), '-m', 'hermes_cli.main', 'gateway', 'run']
    def create_time(self): return self.start
    def is_running(self): return self.running
    def environ(self): return dict(self.env)
    def cmdline(self): return list(self.argv)
    def exe(self): return str(self.base)


class GatewayAuditTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='hcv-c5-audit-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.home = self.root/'hermes-e2e-codex-visual-own'/'hermes-home'
        (self.home/'logs').mkdir(parents=True)
        self.python = self.root/'private/venv/Scripts/python.exe'
        self.base = self.root/'base/python.exe'
        self.repository = self.root/'hermes-source'
        self.process = FakeProcess(4200, self.home, self.python, self.base)
        self.record = {'kind':'hermes-gateway', 'hermes_home':str(self.home), 'pid':4200, 'start_time':123456,
                       'argv':[str(self.repository/'hermes_cli/main.py'), 'gateway', 'run']}
        (self.home/'gateway.pid').write_text(json.dumps(self.record), encoding='utf8')
        self.log = self.home/'logs/agent.log'
        self.log.write_text("MCP server 'Тестовый поиск' (HTTP): registered 0 tool(s):\n"
                            "MCP server 'Тестовые документы' (HTTP): registered 0 tool(s):\n", encoding='utf8')

    def check(self):
        return audit.audit(self.home, self.python, self.base, self.repository,
                           process_factory=lambda pid:self.process, temp_root=self.root)

    def test_expected_own_gateway_and_no_secret_in_result(self):
        result = self.check()
        self.assertTrue(result['named_mcp_initial_registration'])
        self.assertTrue(result['hermes_entry_path_verified'])
        self.assertTrue(result['private_gateway_rendezvous'])
        self.assertFalse(result['loaded_module_paths_verified'])
        self.assertFalse(result['continuous_mcp_connection_verified'])
        self.assertNotIn('not logged', json.dumps(result))

    def test_pid_reuse_or_foreign_home_is_rejected(self):
        self.process.start = 1234.57
        with self.assertRaisesRegex(ValueError, 'PID was replaced'):
            self.check()
        self.process.start = 1234.56
        self.process.env['HERMES_HOME'] = str(self.root/'foreign')
        with self.assertRaisesRegex(ValueError, 'expected isolated'):
            self.check()

    def test_python_fallback_and_wrong_base_are_rejected(self):
        self.process.argv[0] = str(self.root/'other/python.exe')
        with self.assertRaisesRegex(ValueError, 'expected isolated'):
            self.check()
        self.process.argv[0] = str(self.python)
        self.process.base = self.root/'other-base/python.exe'
        with self.assertRaisesRegex(ValueError, 'expected isolated'):
            self.check()

    def test_missing_named_registration_or_isolation_is_rejected(self):
        self.log.write_text("MCP server 'Тестовый поиск' (HTTP): registered 0 tool(s):\n", encoding='utf8')
        with self.assertRaisesRegex(ValueError, 'did not register'):
            self.check()
        self.process.env['HERMES_DESKTOP_ISOLATED_BACKEND'] = '0'
        with self.assertRaisesRegex(ValueError, 'expected isolated'):
            self.check()

    def test_non_test_home_is_rejected_before_reading_pid(self):
        with self.assertRaisesRegex(ValueError, 'not an isolated'):
            audit.audit(self.root/'user'/'hermes-home', self.python, self.base, self.repository, temp_root=self.root)

    def test_missing_or_shared_rendezvous_is_rejected(self):
        for name in ('HERMES_GATEWAY_LOCK_DIR', 'XDG_STATE_HOME'):
            prior = self.process.env.pop(name)
            with self.assertRaisesRegex(ValueError, 'expected isolated'):
                self.check()
            self.process.env[name] = str(self.root/'foreign')
            with self.assertRaisesRegex(ValueError, 'expected isolated'):
                self.check()
            self.process.env[name] = prior

    def test_unexpected_or_missing_hermes_entry_path_is_rejected(self):
        for argv in ([], [str(self.root/'other/hermes_cli/main.py')]):
            self.record['argv'] = argv
            (self.home/'gateway.pid').write_text(json.dumps(self.record), encoding='utf8')
            with self.assertRaisesRegex(ValueError, 'record is invalid'):
                self.check()

    def test_process_only_still_checks_pid_without_claiming_mcp(self):
        self.log.unlink()
        result = audit.audit(self.home, self.python, self.base, self.repository,
                             process_factory=lambda pid:self.process, temp_root=self.root, require_mcp=False)
        self.assertTrue(result['expected_command_python'])
        self.assertIsNone(result['named_mcp_initial_registration'])
        self.process.argv[0] = str(self.root/'other/python.exe')
        with self.assertRaisesRegex(ValueError, 'expected isolated'):
            audit.audit(self.home, self.python, self.base, self.repository,
                        process_factory=lambda pid:self.process, temp_root=self.root, require_mcp=False)

    def test_delayed_owned_gateway_is_waited_for_and_checked(self):
        pid_file = self.home/'gateway.pid'
        pid_file.unlink()
        now, waits = [0.0], []
        def sleep(seconds):
            waits.append(seconds)
            now[0] += seconds
            if len(waits) == 2:
                pid_file.write_text(json.dumps(self.record), encoding='utf8')
        result = audit.wait_for_audit(self.home, self.python, self.base, self.repository,
                                     process_factory=lambda pid:self.process, temp_root=self.root,
                                     require_mcp=False, timeout=1, interval=0.1,
                                     monotonic=lambda:now[0], sleep=sleep)
        self.assertEqual(len(waits), 2)
        self.assertEqual(result['pid'], self.record['pid'])
        self.assertTrue(result['expected_command_python'])
        self.assertIsNone(result['named_mcp_initial_registration'])

    def test_missing_gateway_times_out_without_passing(self):
        (self.home/'gateway.pid').unlink()
        now = [0.0]
        def sleep(seconds): now[0] += seconds
        with self.assertRaisesRegex(TimeoutError, 'Timed out waiting for isolated gateway readiness'):
            audit.wait_for_audit(self.home, self.python, self.base, self.repository,
                                 process_factory=lambda pid:self.fail('a missing PID cannot be accepted'),
                                 temp_root=self.root, require_mcp=False, timeout=0.5, interval=0.2,
                                 monotonic=lambda:now[0], sleep=sleep)
        self.assertGreaterEqual(now[0], 0.5)

    def test_gateway_appearing_at_deadline_is_not_accepted(self):
        pid_file = self.home/'gateway.pid'
        pid_file.unlink()
        now = [0.0]
        def sleep(seconds):
            now[0] += seconds
            if now[0] >= 0.5:
                pid_file.write_text(json.dumps(self.record), encoding='utf8')
        with self.assertRaisesRegex(TimeoutError, 'Timed out waiting'):
            audit.wait_for_audit(self.home, self.python, self.base, self.repository,
                                 process_factory=lambda pid:self.fail('gateway appeared too late'),
                                 temp_root=self.root, require_mcp=False, timeout=0.5, interval=0.2,
                                 monotonic=lambda:now[0], sleep=sleep)

    def test_slow_identity_check_after_deadline_is_not_accepted(self):
        now = [0.0]
        def slow_process(pid):
            now[0] += 0.6
            return self.process
        with self.assertRaisesRegex(TimeoutError, 'Timed out while checking'):
            audit.wait_for_audit(self.home, self.python, self.base, self.repository,
                                 process_factory=slow_process, temp_root=self.root, require_mcp=False,
                                 timeout=0.5, interval=0.2, monotonic=lambda:now[0], sleep=lambda _:None)

    def test_foreign_gateway_and_bad_record_fail_immediately_without_waiting(self):
        self.record['pid'] = 9999
        (self.home/'gateway.pid').write_text(json.dumps(self.record), encoding='utf8')
        foreign = FakeProcess(9999, self.root/'foreign-home', self.python, self.base)
        def never_sleep(seconds): self.fail('identity failures must not be retried')
        with self.assertRaisesRegex(ValueError, 'expected isolated'):
            audit.wait_for_audit(self.home, self.python, self.base, self.repository,
                                 process_factory=lambda pid:foreign, temp_root=self.root,
                                 require_mcp=False, timeout=1, monotonic=lambda:0, sleep=never_sleep)
        (self.home/'gateway.pid').write_text('not valid json', encoding='utf8')
        with self.assertRaises(json.JSONDecodeError):
            audit.wait_for_audit(self.home, self.python, self.base, self.repository,
                                 process_factory=lambda pid:self.process, temp_root=self.root,
                                 require_mcp=False, timeout=1, monotonic=lambda:0, sleep=never_sleep)

    def test_delayed_mcp_log_is_waited_for_without_changing_profile(self):
        expected_log = self.log.read_text(encoding='utf8')
        self.log.unlink()
        now, waits = [0.0], []
        def sleep(seconds):
            waits.append(seconds)
            now[0] += seconds
            if len(waits) == 2:
                self.log.write_text(expected_log, encoding='utf8')
        result = audit.wait_for_audit(self.home, self.python, self.base, self.repository,
                                     process_factory=lambda pid:self.process, temp_root=self.root,
                                     require_mcp=True, timeout=1, interval=0.1,
                                     monotonic=lambda:now[0], sleep=sleep)
        self.assertEqual(len(waits), 2)
        self.assertTrue(result['named_mcp_initial_registration'])

    def test_exit_or_pid_reuse_after_read_cannot_pass(self):
        changed = FakeProcess(4200, self.home, self.python, self.base)
        changed.start = 2222.0
        reads = iter([self.process, changed])
        with self.assertRaisesRegex(ValueError, 'changed during audit'):
            audit.audit(self.home, self.python, self.base, self.repository,
                        process_factory=lambda pid:next(reads), temp_root=self.root)
        changed.start = self.process.start
        changed.running = False
        reads = iter([self.process, changed])
        with self.assertRaisesRegex(ValueError, 'changed during audit'):
            audit.audit(self.home, self.python, self.base, self.repository,
                        process_factory=lambda pid:next(reads), temp_root=self.root)


if __name__ == '__main__':
    unittest.main(verbosity=2)

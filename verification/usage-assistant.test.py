"""Safety checks use disposable profiles and never contact OpenAI."""
import importlib.util
import pathlib
import sys
import tempfile
import threading
import unittest
from types import SimpleNamespace
from unittest.mock import patch


FILE = pathlib.Path(__file__).resolve().parents[1] / "source" / "usage-backend" / "assistant.py"
spec = importlib.util.spec_from_file_location("usage_assistant_test", FILE)
assistant = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = assistant
spec.loader.exec_module(assistant)


def snapshot(identity="account-and-user-A", used=90, window_scope="account"):
    return SimpleNamespace(available=True, identity=identity, windows=[
        SimpleNamespace(used_percent=used, scope=window_scope),
    ])


class AssistantResetTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="hcv-assistant-test-")
        self.root = pathlib.Path(self.temporary.name).resolve()
        self.home = self.root / "profile-a"
        self.home.mkdir()
        self.home_patch = patch.object(assistant, "_profile_home", side_effect=lambda: self.home)
        self.home_patch.start()
        self.addCleanup(self.home_patch.stop)
        self.addCleanup(self.temporary.cleanup)
        self.scope = assistant.scope_for_identity("account-and-user-A")

    def test_disabled_by_default_and_scoped_by_account_and_profile(self):
        self.assertEqual(assistant.get_status(self.scope), {"enabled": False, "pending": None})
        assistant.set_enabled(self.scope, True)
        other_account = assistant.scope_for_identity("account-and-user-B")
        self.assertFalse(assistant.get_status(other_account)["enabled"])
        self.home = self.root / "profile-b"
        self.home.mkdir()
        same_account_other_profile = assistant.scope_for_identity("account-and-user-A")
        self.assertNotEqual(self.scope, same_account_other_profile)
        self.assertFalse(assistant.get_status(same_account_other_profile)["enabled"])

    def test_pending_requires_permission_disable_revokes_and_consumption_is_once(self):
        with self.assertRaises(PermissionError):
            assistant.create_pending(self.scope, "credit-A", "Полный сброс")
        assistant.set_enabled(self.scope, True)
        pending = assistant.create_pending(self.scope, "credit-A", "Полный сброс")
        self.assertEqual(assistant.get_pending(self.scope, pending["id"])["credit_id"], "credit-A")
        self.assertEqual(assistant.consume_pending(self.scope, pending["id"])["credit_id"], "credit-A")
        self.assertIsNone(assistant.consume_pending(self.scope, pending["id"]))
        pending = assistant.create_pending(self.scope, "credit-A", "Полный сброс")
        assistant.set_enabled(self.scope, False)
        self.assertIsNone(assistant.get_pending(self.scope, pending["id"]))
        assistant.set_enabled(self.scope, True)
        self.assertIsNone(assistant.get_pending(self.scope, pending["id"]))

    def test_expiry_and_an_existing_request_are_respected(self):
        assistant.set_enabled(self.scope, True)
        with patch.object(assistant.time, "time", return_value=1000):
            pending = assistant.create_pending(self.scope, "credit-A", "Первый")
            repeated = assistant.create_pending(self.scope, "credit-A", "Первый")
            self.assertEqual(pending["id"], repeated["id"])
            with self.assertRaises(RuntimeError):
                assistant.create_pending(self.scope, "credit-B", "Второй")
        with patch.object(assistant.time, "time", return_value=1600):
            self.assertIsNone(assistant.get_pending(self.scope, pending["id"]))
            self.assertIsNone(assistant.consume_pending(self.scope, pending["id"]))
            self.assertNotEqual(assistant.create_pending(self.scope, "credit-B", "Второй")["id"], pending["id"])

    def test_concurrent_claims_return_one_request(self):
        assistant.set_enabled(self.scope, True)
        pending = assistant.create_pending(self.scope, "credit-A", "Полный сброс")
        barrier = threading.Barrier(3)
        results = []

        def claim():
            barrier.wait()
            results.append(assistant.consume_pending(self.scope, pending["id"]))

        workers = [threading.Thread(target=claim) for _ in range(2)]
        for worker in workers:
            worker.start()
        barrier.wait()
        for worker in workers:
            worker.join(timeout=5)
        self.assertEqual(sum(result is not None for result in results), 1)

    def test_direct_request_denies_automation_before_network(self):
        with patch.object(assistant, "_interactive_viewer", return_value=False), \
             patch.object(assistant, "_snapshot") as account, \
             patch.object(assistant, "_inventory") as inventory:
            result = assistant.request_reset(object(), {})
        self.assertFalse(result["ok"])
        account.assert_not_called()
        inventory.assert_not_called()

    def test_direct_request_denies_disabled_and_low_or_unknown_quota(self):
        with patch.object(assistant, "_interactive_viewer", return_value=True), \
             patch.object(assistant, "_snapshot", return_value=snapshot()), \
             patch.object(assistant, "_inventory") as inventory:
            self.assertFalse(assistant.request_reset(object(), {})["ok"])
        inventory.assert_not_called()
        assistant.set_enabled(self.scope, True)
        for value in (89.999, None, float("nan"), True):
            with patch.object(assistant, "_interactive_viewer", return_value=True), \
                 patch.object(assistant, "_snapshot", return_value=snapshot(used=value)), \
                 patch.object(assistant, "_inventory") as inventory:
                self.assertFalse(assistant.request_reset(object(), {})["ok"])
            inventory.assert_not_called()
        with patch.object(assistant, "_interactive_viewer", return_value=True), \
             patch.object(assistant, "_snapshot", return_value=snapshot(used=99, window_scope="model")), \
             patch.object(assistant, "_inventory") as inventory:
            self.assertFalse(assistant.request_reset(object(), {})["ok"])
        inventory.assert_not_called()

    def test_exact_ten_percent_creates_request_without_redeeming(self):
        assistant.set_enabled(self.scope, True)
        credit = {"id": "credit-A", "title": "Полный сброс", "expires_at": None, "expiry": None}
        with patch.object(assistant, "_interactive_viewer", return_value=True), \
             patch.object(assistant, "_snapshot", side_effect=[snapshot(), snapshot()]), \
             patch.object(assistant, "_inventory", return_value=[credit]):
            result = assistant.request_reset(object(), {})
        self.assertTrue(result["ok"])
        self.assertEqual(result["status"], "pending_confirmation")
        self.assertNotIn("nonce", result)
        self.assertNotIn("credit_id", result)
        self.assertEqual(assistant.get_status(self.scope)["pending"]["credit_id"], "credit-A")

    def test_account_change_during_lookup_and_unknown_identity_fail_closed(self):
        assistant.set_enabled(self.scope, True)
        credit = {"id": "credit-A", "title": "Полный сброс", "expires_at": None, "expiry": None}
        for after in (snapshot("account-and-user-B"), snapshot(None)):
            with patch.object(assistant, "_interactive_viewer", return_value=True), \
                 patch.object(assistant, "_snapshot", side_effect=[snapshot(), after]), \
                 patch.object(assistant, "_inventory", return_value=[credit]):
                result = assistant.request_reset(object(), {})
            self.assertFalse(result["ok"])
            self.assertIsNone(assistant.get_status(self.scope)["pending"])

    def test_toggle_off_during_provider_lookup_blocks_pending_creation(self):
        assistant.set_enabled(self.scope, True)
        credit = {"id": "credit-A", "title": "Полный сброс", "expires_at": None, "expiry": None}

        def disable_then_list():
            assistant.set_enabled(self.scope, False)
            return [credit]

        with patch.object(assistant, "_interactive_viewer", return_value=True), \
             patch.object(assistant, "_snapshot", side_effect=[snapshot(), snapshot()]), \
             patch.object(assistant, "_inventory", side_effect=disable_then_list):
            result = assistant.request_reset(object(), {})
        self.assertFalse(result["ok"])
        self.assertIsNone(assistant.get_status(self.scope)["pending"])

    def test_inventory_filters_expired_unsupported_and_sorts_available(self):
        class Response:
            status = 200

            def json(self):
                return {"credits": [
                    {"id": "expired", "status": "available", "is_supported_by_plan": True,
                     "expires_at": "2000-01-01T00:00:00Z"},
                    {"id": "unsupported", "status": "available", "is_supported_by_plan": False},
                    {"id": "later", "status": "available", "is_supported_by_plan": True,
                     "expires_at": "2100-01-01T00:00:00Z"},
                    {"id": "sooner", "status": "available", "is_supported_by_plan": True,
                     "expires_at": "2099-01-01T00:00:00Z"},
                    {"id": "bad", "status": "available", "is_supported_by_plan": True,
                     "expires_at": "not a date"},
                ]}

        fake = SimpleNamespace(credentialed_provider_request=lambda *a, **k: Response())
        with patch.dict(sys.modules, {"hermes_cli.plugin_provider_requests": fake}):
            result = assistant._inventory()
        self.assertEqual([item["id"] for item in result], ["sooner", "later"])


if __name__ == "__main__":
    unittest.main()

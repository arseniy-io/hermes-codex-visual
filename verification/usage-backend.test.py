"""Offline tests for usage backend. No provider credentials or network are used."""
import importlib.util
import sqlite3
import sys
import tempfile
import time
import types
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch


class Router:
    def get(self, *args, **kwargs):
        return lambda fn: fn

    post = get

    def include_router(self, router):
        pass


class HTTPException(Exception):
    def __init__(self, status_code, detail):
        self.status_code, self.detail = status_code, detail
        super().__init__(detail)


fastapi = types.ModuleType("fastapi")
fastapi.APIRouter = Router
fastapi.HTTPException = HTTPException
fastapi.Query = lambda value: value
constants = types.ModuleType("hermes_constants")
constants.get_hermes_home = lambda: Path("profile-a")

with patch.dict(sys.modules, {"fastapi": fastapi, "hermes_constants": constants}):
    source = Path(__file__).resolve().parents[1] / "source/usage-backend/dashboard/plugin_api.py"
    spec = importlib.util.spec_from_file_location("usage_backend_test", source)
    backend = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(backend)


def snapshot(identity="account-a", balance="61567.1397127500", used=17):
    window = types.SimpleNamespace(label="Weekly", used_percent=used, reset_at=datetime(2026, 11, 25, tzinfo=timezone.utc),
                                   scope="account", detail=None)
    return types.SimpleNamespace(identity=identity, available=True, raw={"credits": {"balance": balance}},
                                 plan="Pro", windows=[window])


def inventory():
    return {"credits": [
        {"id": "credit-a", "status": "available", "is_supported_by_plan": True,
         "title": "Full reset", "expires_at": "2026-12-01T00:00:00Z"},
        {"id": "expired", "status": "expired", "is_supported_by_plan": True},
        {"id": "unsupported", "status": "available", "is_supported_by_plan": False},
    ]}


def prepare_body(credit_id="credit-a", identity="account-a"):
    return {"credit_id": credit_id, "scope": backend._scope(identity)}


def confirm_body(prepared):
    return {"nonce": prepared["nonce"], "not_after": time.time() + 25}


class UsageBackendTest(unittest.TestCase):
    def setUp(self):
        backend._RESET_PENDING.clear()
        backend._RESET_INFLIGHT.clear()
        self.modules = patch.dict(sys.modules, {"hermes_constants": constants})
        self.modules.start()
        self.addCleanup(self.modules.stop)
        self.supported = patch.object(backend, "_assistant_supported", return_value=True)
        self.supported.start()
        self.addCleanup(self.supported.stop)

    def test_overview_preserves_credit_precision_and_filters_resets(self):
        with patch.object(backend, "_snapshot", return_value=snapshot()), \
             patch.object(backend, "_signed", return_value=inventory()):
            value = backend.overview()
        self.assertEqual(value["account"]["credits_balance"], "61567.1397127500")
        self.assertEqual([r["id"] for r in value["resets"]], ["credit-a"])
        self.assertTrue(value["assistant_available"])
        self.assertEqual(value["account"]["windows"][0]["used_percent"], 17)
        self.assertNotIn("account-a", value["scope"])

    def test_every_available_reset_is_returned_and_individually_selectable(self):
        reset_types = ("codex_rate_limits", "weekly", "five_hour")
        credits = [{"id": "reset-" + str(i), "status": "available", "is_supported_by_plan": True,
                    "title": "Reset " + str(i), "reset_type": reset_type, "expires_at": None}
                   for i, reset_type in enumerate(reset_types)]
        with patch.object(backend, "_snapshot", return_value=snapshot()), \
             patch.object(backend, "_signed", return_value={"credits": credits}) as signed:
            value = backend.overview()
            self.assertEqual([item["id"] for item in value["resets"]], [item["id"] for item in credits])
            self.assertEqual([item["reset_type"] for item in value["resets"]], list(reset_types))
            self.assertEqual([item["title"] for item in value["resets"]], [item["title"] for item in credits])
            for item in credits:
                prepared = backend.reset_prepare(prepare_body(item["id"]))
                self.assertEqual(prepared["credit"]["id"], item["id"])
                self.assertEqual(prepared["credit"]["reset_type"], item["reset_type"])
            self.assertTrue(all(call.args[0] == "GET" for call in signed.call_args_list))

    def test_unavailable_is_not_zero_and_valid_zero_is_preserved(self):
        self.assertIsNone(backend._balance(None))
        self.assertIsNone(backend._balance("NaN"))
        self.assertEqual(backend._balance(0), "0")
        self.assertIsNone(backend._thread_usage(None))
        self.assertEqual(backend._thread_usage({"weekly_limit_percent": 0})["weekly_limit_percent"], 0)

    def test_incomplete_reset_inventory_is_not_an_empty_inventory(self):
        for payload in ({}, {"credits": None}):
            with patch.object(backend, "_snapshot", return_value=snapshot()), \
                 patch.object(backend, "_signed", return_value=payload):
                value = backend.overview()
                self.assertIsNone(value["resets"])
                self.assertFalse(value["reset_available"])
                with self.assertRaises(HTTPException):
                    backend.reset_prepare(prepare_body())

    def test_expired_credit_is_hidden_even_if_provider_status_is_stale(self):
        entry = {"credits": [{"id": "stale", "status": "available", "is_supported_by_plan": True,
                               "expires_at": "2001-01-01T00:00:00Z"}]}
        self.assertEqual(backend._resets(entry), [])

    def test_history_refuses_changed_account_and_bad_dates(self):
        with patch.object(backend, "_snapshot", side_effect=[snapshot("a"), snapshot("b")]), \
             patch.object(backend, "_signed", return_value={"units": "percent", "data": []}):
            with self.assertRaises(HTTPException) as error:
                backend.history(7, 0)
        self.assertEqual(error.exception.status_code, 409)
        with self.assertRaises(HTTPException):
            backend.history(8, 0)
        with self.assertRaises(HTTPException):
            backend.history(7, -1)

    def test_confirm_is_one_use_and_sends_the_selected_id(self):
        calls = []
        def signed(method, path, **kwargs):
            calls.append((method, path, kwargs.get("body")))
            return inventory() if method == "GET" else {"code": "reset", "credit": {"id": "credit-a"}, "windows_reset": 1}
        with patch.object(backend, "_snapshot", return_value=snapshot()), patch.object(backend, "_signed", side_effect=signed):
            prepared = backend.reset_prepare(prepare_body())
            self.assertEqual(backend.reset_confirm(confirm_body(prepared))["status"], "reset")
            with self.assertRaises(HTTPException):
                backend.reset_confirm(confirm_body(prepared))
        posts = [call for call in calls if call[0] == "POST"]
        self.assertEqual(len(posts), 1)
        self.assertEqual(posts[0][2]["credit_id"], "credit-a")
        self.assertTrue(posts[0][2]["redeem_request_id"])

    def test_confirm_after_account_switch_never_consumes(self):
        calls = []
        def signed(method, path, **kwargs):
            calls.append(method)
            return inventory()
        with patch.object(backend, "_snapshot", return_value=snapshot("a")), patch.object(backend, "_signed", side_effect=signed):
            prepared = backend.reset_prepare(prepare_body(identity="a"))
        with patch.object(backend, "_snapshot", return_value=snapshot("b")), patch.object(backend, "_signed", side_effect=signed):
            with self.assertRaises(HTTPException) as error:
                backend.reset_confirm(confirm_body(prepared))
        self.assertEqual(error.exception.status_code, 409)
        self.assertNotIn("POST", calls)

    def test_unknown_outcome_is_never_retried(self):
        calls = []
        def signed(method, path, **kwargs):
            calls.append(method)
            if method == "POST":
                raise HTTPException(503, "connection lost")
            return inventory()
        with patch.object(backend, "_snapshot", return_value=snapshot()), patch.object(backend, "_signed", side_effect=signed):
            prepared = backend.reset_prepare(prepare_body())
            self.assertEqual(backend.reset_confirm(confirm_body(prepared))["status"], "unknown")
            with self.assertRaises(HTTPException):
                backend.reset_confirm(confirm_body(prepared))
        self.assertEqual(calls.count("POST"), 1)

    def test_missing_credit_is_never_sent_to_openai(self):
        with patch.object(backend, "_snapshot", return_value=snapshot()), \
             patch.object(backend, "_signed", return_value=inventory()) as signed:
            with self.assertRaises(HTTPException):
                backend.reset_prepare(prepare_body("expired"))
            self.assertTrue(all(call.args[0] == "GET" for call in signed.call_args_list))

    def test_changed_credit_list_refuses_confirmation(self):
        with patch.object(backend, "_snapshot", return_value=snapshot()), \
             patch.object(backend, "_signed", side_effect=[inventory(), {"credits": []}]) as signed:
            prepared = backend.reset_prepare(prepare_body())
            with self.assertRaises(HTTPException) as error:
                backend.reset_confirm(confirm_body(prepared))
            self.assertEqual(error.exception.status_code, 409)
            self.assertTrue(all(call.args[0] == "GET" for call in signed.call_args_list))

    def test_confirm_returns_unknown_for_different_credit_in_response(self):
        def signed(method, path, **kwargs):
            return inventory() if method == "GET" else {"code": "reset", "credit": {"id": "unexpected"}}
        with patch.object(backend, "_snapshot", return_value=snapshot()), patch.object(backend, "_signed", side_effect=signed):
            prepared = backend.reset_prepare(prepare_body())
            self.assertEqual(backend.reset_confirm(confirm_body(prepared))["status"], "unknown")

    def test_history_is_account_scoped_and_uses_inclusive_utc_days(self):
        with patch.object(backend, "_snapshot", return_value=snapshot()), \
             patch.object(backend, "_signed", return_value={"units": "percent", "data": []}) as signed:
            value = backend.history(30, 1)
        self.assertEqual(value["data_scope"], "account")
        self.assertEqual((datetime.fromisoformat(value["end_date"]) - datetime.fromisoformat(value["start_date"])).days, 29)
        self.assertIn("group_by=day", signed.call_args.args[1])
        self.assertEqual(signed.call_args.kwargs["headers"]["x-openai-codex-usage-categories"], "1")

    def test_plan_history_requests_the_supported_30_day_window(self):
        with patch.object(backend, "_snapshot", return_value=snapshot()), \
             patch.object(backend, "_signed", return_value={"periods": []}) as signed:
            value = backend.plan_history()
        self.assertEqual(value["data_scope"], "account")
        self.assertEqual(signed.call_args.args[1], "/usage/plan_limit_history?days=30")

    def test_profile_change_invalidates_nonce(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            with patch.object(constants, "get_hermes_home", return_value=Path(a)), \
                 patch.object(backend, "_snapshot", return_value=snapshot()), \
                 patch.object(backend, "_signed", return_value=inventory()):
                prepared = backend.reset_prepare(prepare_body())
            with patch.object(constants, "get_hermes_home", return_value=Path(b)), \
                 patch.object(backend, "_snapshot", return_value=snapshot()), \
                 patch.object(backend, "_signed") as signed:
                with self.assertRaises(HTTPException):
                    backend.reset_confirm(confirm_body(prepared))
                signed.assert_not_called()

    def test_assistant_request_is_bound_to_setting_quota_and_one_confirmation(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(constants, "get_hermes_home", return_value=Path(temp)), \
             patch.object(backend, "_snapshot", return_value=snapshot(used=90)):
            scope = backend._scope("account-a")
            backend.assistant.set_enabled(scope, True)
            pending = backend.assistant.create_pending(scope, "credit-a", "Full reset")
            calls = []
            def signed(method, path, **kwargs):
                calls.append(method)
                return inventory() if method == "GET" else {"code": "reset", "credit": {"id": "credit-a"}}
            with patch.object(backend, "_signed", side_effect=signed):
                prepared = backend.reset_prepare({"credit_id": "credit-a", "pending_id": pending["id"], "scope": scope})
                backend.assistant.set_enabled(scope, False)
                with self.assertRaises(HTTPException):
                    backend.reset_confirm(confirm_body(prepared))
                self.assertNotIn("POST", calls)

            backend.assistant.set_enabled(scope, True)
            pending = backend.assistant.create_pending(scope, "credit-a", "Full reset")
            with patch.object(backend, "_signed", side_effect=signed):
                prepared = backend.reset_prepare({"credit_id": "credit-a", "pending_id": pending["id"], "scope": scope})
                with patch.object(backend, "_snapshot", return_value=snapshot(used=89)):
                    with self.assertRaises(HTTPException):
                        backend.reset_confirm(confirm_body(prepared))
                self.assertNotIn("POST", calls)

            pending = backend.assistant.get_status(scope)["pending"]
            with patch.object(backend, "_signed", side_effect=signed):
                prepared = backend.reset_prepare({"credit_id": "credit-a", "pending_id": pending["id"], "scope": scope})
                self.assertEqual(backend.reset_confirm(confirm_body(prepared))["status"], "reset")
                self.assertIsNone(backend.assistant.get_pending(scope, pending["id"]))
                with self.assertRaises(HTTPException):
                    backend.reset_confirm(confirm_body(prepared))
                self.assertEqual(calls.count("POST"), 1)

    def test_setting_cannot_target_an_unseen_account(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(constants, "get_hermes_home", return_value=Path(temp)), \
             patch.object(backend, "_snapshot", return_value=snapshot()):
            with self.assertRaises(HTTPException):
                backend.assistant_setting({"enabled": True, "scope": "wrong-account"})
            scope = backend._scope("account-a")
            self.assertFalse(backend.assistant.get_status(scope)["enabled"])
            self.assertTrue(backend.assistant_setting({"enabled": True, "scope": scope})["enabled"])

    def test_unsupported_assistant_cannot_be_enabled_but_can_be_disabled(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(constants, "get_hermes_home", return_value=Path(temp)), \
             patch.object(backend, "_snapshot", return_value=snapshot()), \
             patch.object(backend, "_assistant_supported", return_value=False):
            scope = backend._scope("account-a")
            backend.assistant.set_enabled(scope, True)
            with self.assertRaises(HTTPException):
                backend.assistant_setting({"enabled": True, "scope": scope})
            self.assertFalse(backend.assistant_setting({"enabled": False, "scope": scope})["enabled"])

    def test_manual_confirmation_clears_a_matching_assistant_request(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(constants, "get_hermes_home", return_value=Path(temp)), \
             patch.object(backend, "_snapshot", return_value=snapshot(used=90)):
            scope = backend._scope("account-a")
            backend.assistant.set_enabled(scope, True)
            backend.assistant.create_pending(scope, "credit-a", "Full reset")
            def signed(method, path, **kwargs):
                return inventory() if method == "GET" else {"code": "reset", "credit": {"id": "credit-a"}}
            with patch.object(backend, "_signed", side_effect=signed):
                prepared = backend.reset_prepare(prepare_body())
                self.assertEqual(backend.reset_confirm(confirm_body(prepared))["status"], "reset")
            self.assertIsNone(backend.assistant.get_status(scope)["pending"])

    def test_delayed_confirmation_never_sends_a_late_reset(self):
        calls = []
        def signed(method, path, **kwargs):
            calls.append(method)
            return inventory()
        with patch.object(backend, "_snapshot", return_value=snapshot()), patch.object(backend, "_signed", side_effect=signed):
            prepared = backend.reset_prepare(prepare_body())
            current = time.time()
            with patch.object(backend.time, "time", side_effect=[current, current, current + 26]):
                with self.assertRaises(HTTPException) as error:
                    backend.reset_confirm({"nonce": prepared["nonce"], "not_after": current + 25})
            self.assertEqual(error.exception.status_code, 408)
            self.assertNotIn("POST", calls)

    def test_reset_cannot_be_prepared_while_same_credit_is_in_flight(self):
        with patch.object(backend, "_snapshot", return_value=snapshot()), \
             patch.object(backend, "_signed", return_value=inventory()):
            scope = backend._scope("account-a")
            backend._RESET_INFLIGHT.add((scope, "credit-a"))
            with self.assertRaises(HTTPException) as error:
                backend.reset_prepare(prepare_body())
            self.assertEqual(error.exception.status_code, 409)

    def test_chats_joins_only_profile_sessions_and_explicit_codex_subagents(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "state.db"
            conn = sqlite3.connect(path)
            conn.executescript("""
                CREATE TABLE sessions (id TEXT, parent_session_id TEXT, source TEXT, billing_provider TEXT);
                CREATE TABLE session_model_usage (session_id TEXT, billing_provider TEXT);
                INSERT INTO sessions VALUES ('root',NULL,'local','openai-codex');
                INSERT INTO sessions VALUES ('tip','root','local','openai-codex');
                INSERT INTO sessions VALUES ('child','tip','subagent','openai-codex');
                INSERT INTO sessions VALUES ('grandchild','child','subagent','openai-codex');
                INSERT INTO sessions VALUES ('other-provider','tip','subagent','kimi-coding');
                INSERT INTO sessions VALUES ('codex-through-kimi','other-provider','subagent','openai-codex');
                INSERT INTO sessions VALUES ('branch','tip','local','openai-codex');
                INSERT INTO sessions VALUES ('other','', 'local','kimi-coding');
                INSERT INTO sessions VALUES ('other-child','other','subagent','openai-codex');
            """)
            conn.commit()
            class FakeDB:
                def __init__(self, db_path, read_only=False):
                    assert read_only and db_path == path
                def __enter__(self): return self
                def __exit__(self, *args): return False
                def list_sessions_rich(self, **kw):
                    return [
                        {"id": "tip", "title": "Session", "started_at": 1700000000,
                         "_lineage_ids": ["root", "tip"]},
                        {"id": "other", "title": "Kimi", "started_at": 1700000001},
                    ]
                def _read_all(self, query, args): return conn.execute(query, args).fetchall()
            state = types.ModuleType("hermes_state")
            state.SessionDB = FakeDB
            with patch.dict(sys.modules, {"hermes_state": state}), patch.object(constants, "get_hermes_home", return_value=Path(temp)):
                rows, truncated = backend._rows_for_profile()
            conn.close()
        self.assertFalse(truncated)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["query"]["thread_id"], "root")
        self.assertEqual(set(rows[0]["query"]["descendant_thread_ids"]),
                         {"tip", "child", "grandchild", "codex-through-kimi"})
        self.assertEqual(rows[1]["query"]["thread_id"], "other")
        self.assertEqual(rows[1]["query"]["descendant_thread_ids"], ["other-child"])


if __name__ == "__main__":
    unittest.main()

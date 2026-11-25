"""The Desktop approval replay must not mix reviews between routes or IDs."""

import asyncio
from types import SimpleNamespace
from threading import RLock
import unittest
from unittest.mock import patch

from gateway import session_ancillary
from tools import approval


class ApprovalRoutingTests(unittest.TestCase):
    def test_only_the_matching_route_and_request_get_their_review(self):
        pending = {
            "first": ("route-a", {"kind": "approval", "prompt_id": "request-1", "command": "a",
                                    "description": "Write to protected agent-instruction file(s): a", "choices": ["once", "deny"]}),
            "second": ("route-b", {"kind": "approval", "prompt_id": "request-2", "command": "b",
                                     "description": "Write to protected agent-instruction file(s): b", "choices": ["once", "deny"]}),
        }
        live = SimpleNamespace(event_stream=SimpleNamespace(lock=RLock()),
                               controls=SimpleNamespace(pending=pending))
        connection = SimpleNamespace(authority=SimpleNamespace(sessions={"session": live}))
        ref = SimpleNamespace(session_id="session")
        by_route = {
            "route-a": [{"request_id": "request-1", "hcv_review": {"reason": "first"}},
                        {"request_id": "request-2", "hcv_review": {"reason": "wrong route"}}],
            "route-b": [{"request_id": "request-2", "hcv_review": {"reason": "second"}}],
        }
        with patch.object(session_ancillary, "authorize"), \
             patch.object(approval, "list_gateway_approvals", side_effect=lambda route: by_route[route]):
            result = asyncio.run(session_ancillary.approvals(connection, ref, {"session_id": "session"}))
        self.assertEqual([item["hcv_review"]["reason"] for item in result["approvals"]], ["first", "second"])

    def test_missing_and_duplicate_queue_entries_do_not_return_a_review(self):
        pending = {"first": ("route", {"kind": "approval", "prompt_id": "id", "command": "a",
                                       "description": "Write to protected agent-instruction file(s): a", "choices": ["once", "deny"]})}
        live = SimpleNamespace(event_stream=SimpleNamespace(lock=RLock()),
                               controls=SimpleNamespace(pending=pending))
        connection = SimpleNamespace(authority=SimpleNamespace(sessions={"session": live}))
        ref = SimpleNamespace(session_id="session")
        entries = [{"request_id": "id", "hcv_review": {"reason": "first"}}] * 2
        with patch.object(session_ancillary, "authorize"), \
             patch.object(approval, "list_gateway_approvals", return_value=entries):
            result = asyncio.run(session_ancillary.approvals(connection, ref, {"session_id": "session"}))
        self.assertNotIn("hcv_review", result["approvals"][0])

    def test_seen_ack_is_scoped_to_the_pending_request_and_requires_approval_permission(self):
        pending = {"first": ("route", {"kind": "approval", "prompt_id": "id", "command": "a",
                                       "description": "Write to protected agent-instruction file(s): a", "choices": ["once", "deny"]})}
        live = SimpleNamespace(event_stream=SimpleNamespace(lock=RLock()),
                               controls=SimpleNamespace(pending=pending))
        connection = SimpleNamespace(authority=SimpleNamespace(sessions={"session": live}))
        ref = SimpleNamespace(session_id="session")
        with patch.object(session_ancillary, "authorize") as authorize, \
             patch.object(approval, "list_gateway_approvals", return_value=[]), \
             patch.object(approval, "mark_gateway_approval_review_seen", return_value=True) as mark:
            result = asyncio.run(session_ancillary.approvals(connection, ref,
                {"session_id": "session", "hcv_seen_request_id": "id"}))
        self.assertTrue(result["hcv_review_seen"])
        mark.assert_called_once_with("route", "id")
        self.assertEqual([call.args[-1] for call in authorize.call_args_list], ["session:read", "session:approve"])


if __name__ == "__main__":
    unittest.main()

"""A protected edit cannot be approved before its exact review is shown."""

import unittest
from unittest.mock import patch

from tools import approval
from tools.approval_gateway_wait import _ApprovalEntry


class ApprovalSeenTests(unittest.TestCase):
    def test_only_the_reviewed_request_can_be_approved(self):
        first = _ApprovalEntry({"request_id": "first", "hcv_review": {"complete": True}})
        second = _ApprovalEntry({"request_id": "second", "hcv_review": {"complete": True}})
        with patch.dict(approval._gateway_queues, {"session": [first, second]}):
            self.assertEqual(approval.resolve_gateway_approval("session", "once", request_id="first"), 0)
            self.assertFalse(approval.mark_gateway_approval_review_seen("another-session", "first"))
            self.assertTrue(approval.mark_gateway_approval_review_seen("session", "first"))
            self.assertEqual(approval.resolve_gateway_approval("session", "once", request_id="second"), 0)
            self.assertEqual(approval.resolve_gateway_approval("session", "once", request_id="first"), 1)
            self.assertEqual(first.result, "once")
            self.assertEqual(approval.resolve_gateway_approval("session", "deny", request_id="second"), 1)
            self.assertEqual(second.result, "deny")

    def test_normal_requests_and_denials_keep_existing_behavior(self):
        ordinary = _ApprovalEntry({"request_id": "normal"})
        protected = _ApprovalEntry({"request_id": "protected", "hcv_review": {"complete": True}})
        with patch.dict(approval._gateway_queues, {"session": [ordinary, protected]}):
            self.assertEqual(approval.resolve_gateway_approval("session", "once", resolve_all=True), 1)
            self.assertEqual(ordinary.result, "once")
            self.assertIsNone(protected.result)
            self.assertEqual(approval.resolve_gateway_approval("session", "deny"), 1)


if __name__ == "__main__":
    unittest.main()

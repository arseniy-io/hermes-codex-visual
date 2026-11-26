from copy import deepcopy
from dataclasses import asdict
import json
from types import MethodType, SimpleNamespace
from unittest.mock import patch

SECRET = "HCV_RESULT_ONLY_IN_THE_LEDGER_379454"
RAW = "[ASYNC DELEGATION BATCH COMPLETE - regression] " + SECRET
ROOT = "root"


def human_and_automated_rows():
    local = {
        "text": RAW,
        "local_automation_v1": {
            "identity": '["async_delegation","regression-child"]',
            "owner": ROOT,
            "display_kind": "async_delegation_complete",
        },
    }
    native = {
        "native_text_v1": {
            "automation": {
                "identity": '["async_delegation","regression-forwarded-child"]',
                "owner": ROOT,
            },
            "event": {"text": RAW},
        },
    }
    raw_rows = [
        ("native-unknown", 70, "unknown", native),
        ("human-fake-header", 10, "queued", {"text": RAW}),
        ("human-unknown", 50, "unknown", {"text": "Неизвестный исход моего сообщения"}),
        ("local-started", 30, "started", local),
        ("native-queued", 60, "queued", native),
        ("local-queued", 20, "queued", local),
        ("native-started", 80, "started", native),
        ("local-unknown", 40, "unknown", local),
        ("native-human", 90, "queued", {"native_text_v1": {"event": {"text": "Моё нативное сообщение"}}}),
    ]
    return [
        dict(admission_id=key, seq=seq, status=status, outcome=None, payload=deepcopy(payload),
             request_id="input-" + key, target_session_id=ROOT, owner_epoch=5,
             generation=None if status == "queued" else 7, principal_id="desktop:person" if "human" in key else "automation:test")
        for key, seq, status, payload in raw_rows
    ]


def assert_pending_projection(tmp_path, *, is_local):
    from gateway.hcv_tree_owner import _owner, _state, _store
    from gateway.session_authority import SessionAuthority
    from gateway.session_contract import SessionRef
    from gateway.session_queued_controls import STEERING, pending_rows

    ledger = human_and_automated_rows()
    snapshot = deepcopy(ledger)
    transfer = dict(
        admission_id="steered-human", seq=55, status="terminal", outcome=STEERING,
        payload={"text": "Моё сообщение передали в текущий ход"}, request_id="input-steered",
        target_session_id=ROOT, owner_epoch=5, generation=7, principal_id="desktop:person",
    )
    transfer_snapshot = deepcopy(transfer)
    profile = str(tmp_path) if is_local else "external-profile"
    ref = SessionRef(profile, ROOT)
    authority = SimpleNamespace(
        profile_id=profile, epoch=5,
        _pending_rows=lambda value: ledger if value == ref else [],
        steer_transfers={ROOT: (7, {"steered-human": True})},
        launch_sources={ROOT: "desktop"}, db=object(),
    )
    authority._receipt = MethodType(SessionAuthority._receipt, authority)
    original = {row["admission_id"]: row for row in snapshot + [transfer_snapshot]}
    expected = [
        "human-fake-header", "local-started", "local-unknown", "human-unknown",
        "steered-human", "native-unknown", "native-started", "native-human",
    ]
    if not is_local:
        expected = [row["admission_id"] for row in sorted(original.values(), key=lambda row: row["seq"])]

    def assert_public_view(label):
        rows = pending_rows(authority, ref)
        actual = [row["admission_id"] for row in rows]
        assert actual == expected, f"{label}: public ids {actual}, expected {expected}"
        for row in rows:
            key = row["admission_id"]
            before = original[key]
            receipt = asdict(SessionAuthority._pending_receipt(authority, row))
            if is_local and key in {"local-unknown", "native-unknown"}:
                replacement = row["payload"]["text"]
                assert isinstance(replacement, str) and 0 < len(replacement.strip()) <= 240, label
                assert SECRET not in replacement and "ASYNC DELEGATION" not in replacement, label
                assert {**row, "payload": before["payload"]} == before, (label, key)
                assert receipt["text"] == replacement and receipt["status"] == "unknown", receipt
                assert receipt["admission_id"] == key and receipt["execution_generation"] == 7, receipt
                assert SECRET not in json.dumps(receipt, ensure_ascii=False), receipt
            else:
                assert row == before, (label, "changed an ordinary or started admission", key)
            if key == "human-fake-header":
                assert receipt["text"] == RAW and receipt["status"] == "queued", receipt
            elif key == "native-human":
                assert receipt["text"] == before["payload"]["native_text_v1"]["event"]["text"], receipt
            elif key == "human-unknown":
                assert receipt["text"] == before["payload"]["text"] and receipt["status"] == "unknown", receipt
            elif key == "steered-human":
                assert receipt["status"] == "started" and receipt["steering"] is True, receipt
        # Keep the exact delivery inputs, including native envelopes and ID of a recoverable row.
        assert authority._pending_rows(ref) is ledger
        assert authority._pending_rows(ref) == snapshot, label
        assert transfer == transfer_snapshot, label

    with patch("gateway.session_queued_controls.get_session_admission", return_value=transfer) as read_transfer:
        assert_public_view("active")
        if is_local:
            checkpoint = {"schema": 1, "owner": _owner(authority, ROOT), "state": "stopped"}
            _store(authority).write(checkpoint)
            assert_public_view("stopped")
            _store(authority).write({**checkpoint, "invalidated_by_new_turn": True})
            assert_public_view("invalidated checkpoint")
            _store(authority).write({**checkpoint, "state": "resumed"})
            assert_public_view("resumed")
            _state(authority)["stopping"].add(ROOT)
            assert_public_view("stopping")
        else:
            _state(authority)["stopping"].add(ROOT)
            assert_public_view("nonlocal profile")
        read_transfer.assert_called_with(authority.db, admission_id="steered-human")



def test_native_viewer_pending_shows_personal_inputs_and_keeps_recovery(tmp_path):
    assert_pending_projection(tmp_path, is_local=True)


def test_non_local_viewer_preserves_pending_receipts(tmp_path):
    assert_pending_projection(tmp_path, is_local=False)

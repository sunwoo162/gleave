from datetime import datetime, timezone

import pytest

from app.integrations.claimlatch_audit import (
    ClaimLatchAuditConflictError,
    ClaimLatchAuditRecord,
    ClaimLatchAuditStore,
)


def _record(*, payload_hash: str = "payload-hash") -> ClaimLatchAuditRecord:
    return ClaimLatchAuditRecord(
        audit_id="audit-1",
        subject_id="handoff-1",
        project_id="project-1",
        project_revision="rev-1",
        subject_type="agent_handoff",
        decision="PASS",
        claim_latch_report_id="report-1",
        receipt_id="receipt-1",
        payload_hash=payload_hash,
        policy_version="policy-v1",
        adapter_version="adapter-v1",
        claim_latch_version="0.3.86",
        claim_latch_profile_version="claimlatch-v0.2.0",
        request_payload={"draft": "The tests pass."},
        envelope={"decision": "PASS", "claimLatchReportId": "report-1"},
        created_at=datetime(2026, 10, 6, tzinfo=timezone.utc),
    )


def test_audit_store_survives_reopen_and_indexes_verification_key(tmp_path) -> None:
    path = tmp_path / "state.sqlite3"
    store = ClaimLatchAuditStore(path)
    store.init()

    saved = store.save(_record())

    reopened = ClaimLatchAuditStore(path)
    assert reopened.get("audit-1") == saved
    assert reopened.get_for_verification("project-1", "handoff-1", "rev-1") == saved


def test_audit_store_is_idempotent_for_same_payload_and_rejects_different_payload(
    tmp_path,
) -> None:
    store = ClaimLatchAuditStore(tmp_path / "state.sqlite3")
    store.init()
    first = store.save(_record())

    assert store.save(_record()) == first
    with pytest.raises(ClaimLatchAuditConflictError):
        store.save(_record(payload_hash="different-payload-hash"))

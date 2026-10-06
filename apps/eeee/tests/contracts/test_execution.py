from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from app.contracts.execution import (
    ApprovalState,
    ExecutionEnvelope,
    ExecutionError,
    ExecutionStatus,
    SideEffectLevel,
)


NOW = datetime(2026, 10, 6, 1, 0, tzinfo=timezone.utc)


def envelope(**overrides: object) -> ExecutionEnvelope:
    values = {
        "execution_id": "exe-1",
        "request_id": "req-1",
        "capability_id": "project-execution",
        "tool_id": "iseol",
        "actor": "eeee",
        "input": {"goal": "Todo app"},
        "started_at": NOW,
    }
    values.update(overrides)
    return ExecutionEnvelope(**values)


@pytest.mark.parametrize("field", ["execution_id", "request_id", "capability_id", "tool_id", "actor"])
def test_required_identity_rejects_blank_or_padded_values(field: str) -> None:
    with pytest.raises(ValidationError):
        envelope(**{field: "  "})
    with pytest.raises(ValidationError):
        envelope(**{field: " padded "})


def test_envelope_serializes_stable_camel_case_contract_and_is_frozen() -> None:
    item = envelope(
        project_id="project-1",
        project_revision="rev-a",
        evidence_ids=["evidence-1"],
        claim_latch_receipt_id="receipt-1",
        qa_report_id="qa-1",
        side_effect_level=SideEffectLevel.LOCAL,
        required_approval=True,
        approval_state="approved",
        input_schema_version="1",
    )

    serialized = item.model_dump(mode="json", by_alias=True)
    assert serialized["executionId"] == "exe-1"
    assert serialized["requestId"] == "req-1"
    assert serialized["projectId"] == "project-1"
    assert serialized["projectRevision"] == "rev-a"
    assert serialized["capabilityId"] == "project-execution"
    assert serialized["toolId"] == "iseol"
    assert serialized["inputSchemaVersion"] == "1"
    assert serialized["sideEffectLevel"] == "local"
    assert serialized["requiredApproval"] is True
    assert serialized["approvalState"] == "approved"
    assert serialized["evidenceIds"] == ["evidence-1"]
    assert serialized["claimLatchReceiptId"] == "receipt-1"
    assert serialized["qaReportId"] == "qa-1"
    assert "startedAt" in serialized
    with pytest.raises(ValidationError):
        item.status = ExecutionStatus.COMPLETED
    assert ExecutionEnvelope.model_validate(serialized) == item


def test_project_revision_requires_project_identity_and_vice_versa() -> None:
    with pytest.raises(ValidationError):
        envelope(project_revision="rev-a")
    with pytest.raises(ValidationError):
        envelope(project_id="project-1")
    assert envelope(project_id="project-1", project_revision="rev-a").project_revision == "rev-a"


def test_status_transitions_require_legal_sequence_and_terminal_evidence() -> None:
    queued = envelope()
    with pytest.raises(ValueError, match="transition"):
        queued.transition(ExecutionStatus.COMPLETED, at=NOW + timedelta(seconds=1), output={"ok": True})

    running = queued.transition(ExecutionStatus.RUNNING, at=NOW + timedelta(seconds=1))
    completed = running.transition(
        ExecutionStatus.COMPLETED,
        at=NOW + timedelta(seconds=2),
        output={"ok": True},
    )
    assert queued.status is ExecutionStatus.QUEUED
    assert running.status is ExecutionStatus.RUNNING
    assert completed.completed_at == NOW + timedelta(seconds=2)
    assert completed.output == {"ok": True}
    with pytest.raises(ValueError, match="transition"):
        completed.transition(ExecutionStatus.RUNNING, at=NOW + timedelta(seconds=3))
    with pytest.raises(ValidationError):
        running.transition(ExecutionStatus.COMPLETED, at=NOW + timedelta(seconds=2))


def test_failed_execution_requires_structured_error_and_chronological_timestamp() -> None:
    running = envelope().transition(ExecutionStatus.RUNNING, at=NOW + timedelta(seconds=1))
    with pytest.raises(ValidationError):
        running.transition(ExecutionStatus.FAILED, at=NOW + timedelta(seconds=2))
    failed = running.transition(
        ExecutionStatus.FAILED,
        at=NOW + timedelta(seconds=2),
        error=ExecutionError(code="plugin_crash", message="Process exited", retryable=True),
    )
    assert failed.error.code == "plugin_crash"
    assert failed.model_dump(mode="json", by_alias=True)["error"]["retryable"] is True
    with pytest.raises(ValidationError):
        running.transition(
            ExecutionStatus.FAILED,
            at=NOW - timedelta(seconds=1),
            error=ExecutionError(code="early", message="Earlier than start"),
        )


def test_approval_gates_running_and_completed_states() -> None:
    queued = envelope(required_approval=True, approval_state=ApprovalState.AWAITING_APPROVAL)
    pending = queued.transition(ExecutionStatus.AWAITING_APPROVAL, at=NOW + timedelta(seconds=1))
    with pytest.raises(ValueError, match="approval"):
        pending.transition(ExecutionStatus.RUNNING, at=NOW + timedelta(seconds=2))
    running = pending.transition(
        ExecutionStatus.RUNNING,
        at=NOW + timedelta(seconds=2),
        approval_state=ApprovalState.APPROVED,
    )
    assert running.approval_state is ApprovalState.APPROVED
    with pytest.raises(ValidationError):
        envelope(
            required_approval=True,
            approval_state=ApprovalState.DENIED,
            status=ExecutionStatus.COMPLETED,
            completed_at=NOW + timedelta(seconds=1),
            output={"ok": True},
        )

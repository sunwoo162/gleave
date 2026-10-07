from datetime import datetime, timezone

import httpx

from app.activity.store import ActivityLedger
from app.contracts import ExecutionEnvelope, ExecutionStatus
from app.integrations.claimlatch_audit import ClaimLatchAuditStore
from app.integrations.claimlatch_client import ClaimLatchClient
from app.integrations.contracts import ProjectOutcomeReportV1
from app.storage.sqlite import SQLiteStore
from app.trust.gate import TrustGate
from app.trust.pipeline import TrustPipeline


def _pipeline(tmp_path):
    audits = ClaimLatchAuditStore(tmp_path / "audit.sqlite3")
    client = ClaimLatchClient(
        "http://claimlatch.local",
        transport=httpx.MockTransport(lambda _request: httpx.Response(200, json={
            "schemaVersion": 1, "subjectId": "execution-1", "projectId": "project-1",
            "projectRevision": "rev-1", "subjectType": "claim", "claims": [],
            "evidence": [{"id": "evidence-1"}], "deterministicChecks": [],
            "decision": "PASS", "claimLatchReportId": "claim-report-1",
            "receiptId": "receipt-1", "createdAt": "2026-10-07T00:00:00Z",
        })),
        audit_store=audits,
        current_revision_resolver=lambda _project_id: "rev-1",
    )
    return TrustPipeline(TrustGate(client, current_revision_resolver=lambda _project_id: "rev-1"), audit_store=audits)


def _envelope():
    return ExecutionEnvelope(
        execution_id="execution-1", request_id="request-1", project_id="project-1",
        project_revision="rev-1", capability_id="project-execution", tool_id="iseol",
        actor="ISEOL", status=ExecutionStatus.RUNNING, evidence_ids=("evidence-1",),
    )


def _qa(*, status="PASS"):
    return {
        "id": "qa-report-1", "status": status, "independent": True,
        "projectId": "project-1", "projectRevision": "rev-1",
        "evidenceIds": ["evidence-1"], "checks": [{"status": "passed"}],
    }


def _outcome():
    return ProjectOutcomeReportV1.model_validate({
        "schemaVersion": 1, "projectId": "project-1", "requestId": "request-1",
        "projectRevision": "rev-1", "status": "completed", "artifacts": [{"id": "artifact-1"}],
        "agentTeams": [], "handoffs": [], "deterministicVerification": {"status": "PASS"},
        "qaReport": _qa(), "claimLatchReports": [{"id": "claim-report-1", "decision": "PASS",
        "projectId": "project-1", "projectRevision": "rev-1"}], "receipts": [{"id": "receipt-1"}],
        "risks": [], "memoryCandidates": [], "createdAt": datetime.now(timezone.utc).isoformat(),
    })


def test_release_gate_records_claimlatch_and_qa_activity(tmp_path):
    pipeline = _pipeline(tmp_path)

    # The pipeline receives its project ledger explicitly so the UI can render
    # the same decision that gated the release.
    store = SQLiteStore(tmp_path / "state.sqlite3")
    store.init()
    store.create_project("project-1", "Project", str(tmp_path / "project"), "rev-1")
    traced = TrustPipeline(
        pipeline.trust_gate,
        audit_store=pipeline.audit_store,
        activity=ActivityLedger(store),
    )

    result = traced.release_gate(_envelope(), _qa())

    assert result.decision == "PASS"
    events = traced.activity.list("project-1", "rev-1").events
    assert [event.event_type for event in events] == ["claimlatch.checked", "qa.completed"]
    assert all(event.status == "completed" for event in events)
    assert all(event.evidence_refs for event in events)
    assert events[0].reason
    assert events[0].selected_because


def test_blocked_release_records_blocking_qa_activity(tmp_path):
    pipeline = _pipeline(tmp_path)
    store = SQLiteStore(tmp_path / "state.sqlite3")
    store.init()
    store.create_project("project-1", "Project", str(tmp_path / "project"), "rev-1")
    traced = TrustPipeline(
        pipeline.trust_gate,
        audit_store=pipeline.audit_store,
        activity=ActivityLedger(store),
    )

    result = traced.release_gate(_envelope(), _qa(status="FAIL"))

    assert result.decision == "BLOCKED"
    events = traced.activity.list("project-1", "rev-1").events
    assert len(events) == 2
    qa_event = next(event for event in events if event.event_type == "qa.completed")
    assert qa_event.status == "blocked"
    assert "PASS" in qa_event.reason or "QA" in qa_event.reason
    assert qa_event.evidence_refs


def test_memory_promotion_records_memory_gate_after_release(tmp_path):
    pipeline = _pipeline(tmp_path)
    store = SQLiteStore(tmp_path / "state.sqlite3")
    store.init()
    store.create_project("project-1", "Project", str(tmp_path / "project"), "rev-1")
    traced = TrustPipeline(
        pipeline.trust_gate,
        audit_store=pipeline.audit_store,
        activity=ActivityLedger(store),
    )

    result = traced.memory_promotion_gate(_outcome(), _envelope(), _qa())

    assert result.decision == "PASS"
    events = traced.activity.list("project-1", "rev-1").events
    assert [event.event_type for event in events] == [
        "claimlatch.checked", "qa.completed", "memory.promotion.checked"
    ]
    memory_event = events[-1]
    assert memory_event.node_id == "memory:project-1"
    assert memory_event.evidence_refs


def test_each_agent_handoff_has_its_own_claimlatch_boundary(tmp_path):
    pipeline = _pipeline(tmp_path)
    store = SQLiteStore(tmp_path / "state.sqlite3")
    store.init()
    store.create_project("project-1", "Project", str(tmp_path / "project"), "rev-1")
    traced = TrustPipeline(
        pipeline.trust_gate,
        audit_store=pipeline.audit_store,
        activity=ActivityLedger(store),
    )

    result = traced.verify_agent_result(
        _envelope(),
        agent_id="frontend",
        role="frontend",
        summary="Todo 화면 구현 완료",
        evidence_ids=["evidence-1", "ui-test-1"],
        changed_files=["src/features/todo/ui/TodoList.tsx"],
    )

    assert result.decision == "PASS"
    event = traced.activity.list("project-1", "rev-1").events[0]
    assert event.event_type == "agent.completed"
    assert event.node_id == "agent:frontend"
    assert event.actor_id == "frontend"
    assert event.evidence_refs == ["evidence-1", "ui-test-1"]

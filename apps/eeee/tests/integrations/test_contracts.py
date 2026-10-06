import pytest
from pydantic import ValidationError

from app.integrations.contracts import (
    MemoryCandidateV1,
    ProjectBriefV1,
    ProjectOutcomeReportV1,
    VerificationEnvelopeV1,
)


def test_project_brief_requires_versioned_identity_and_memory_context() -> None:
    brief = ProjectBriefV1.model_validate(
        {
            "schemaVersion": 1,
            "projectId": "project-1",
            "requestId": "request-1",
            "userGoal": "Build a local project",
            "scope": ["web"],
            "constraints": [],
            "preferences": {},
            "schedule": {},
            "retrievedMemoryIds": ["memory-1"],
            "qaBaselineIds": ["qa-1"],
            "createdAt": "2026-10-06T00:00:00Z",
        }
    )

    assert brief.schema_version == 1
    assert brief.project_id == "project-1"
    assert brief.retrieved_memory_ids == ["memory-1"]


def test_project_brief_rejects_unsupported_schema_version() -> None:
    with pytest.raises(ValidationError, match="schemaVersion"):
        ProjectBriefV1.model_validate(
            {
                "schemaVersion": 2,
                "projectId": "project-1",
                "requestId": "request-1",
                "userGoal": "Build it",
                "scope": [],
                "constraints": [],
                "preferences": {},
                "schedule": {},
                "retrievedMemoryIds": [],
                "qaBaselineIds": [],
                "createdAt": "2026-10-06T00:00:00Z",
            }
        )


def test_outcome_report_requires_revision_bound_verification_metadata() -> None:
    report = ProjectOutcomeReportV1.model_validate(
        {
            "schemaVersion": 1,
            "projectId": "project-1",
            "requestId": "request-1",
            "projectRevision": "rev-2",
            "status": "completed",
            "artifacts": [],
            "agentTeams": [],
            "handoffs": [],
            "deterministicVerification": {"status": "PASS", "checks": []},
            "qaReport": {"status": "PASS", "findings": [], "evidenceIds": []},
            "claimLatchReports": [],
            "receipts": [],
            "risks": [],
            "memoryCandidates": [],
            "createdAt": "2026-10-06T00:00:00Z",
        }
    )

    assert report.project_revision == "rev-2"
    assert report.deterministic_verification["status"] == "PASS"


def test_verification_envelope_requires_decision_and_subject_revision() -> None:
    envelope = VerificationEnvelopeV1.model_validate(
        {
            "schemaVersion": 1,
            "subjectId": "handoff-1",
            "projectId": "project-1",
            "projectRevision": "rev-1",
            "subjectType": "agent_handoff",
            "claims": [],
            "evidence": [],
            "deterministicChecks": [],
            "decision": "BLOCK",
            "claimLatchReportId": "report-1",
            "receiptId": None,
            "createdAt": "2026-10-06T00:00:00Z",
        }
    )

    assert envelope.decision == "BLOCK"
    assert envelope.claim_latch_report_id == "report-1"


def test_memory_candidate_requires_source_and_promotion_state() -> None:
    candidate = MemoryCandidateV1.model_validate(
        {
            "schemaVersion": 1,
            "candidateId": "candidate-1",
            "kind": "qa_rule",
            "content": "Check responsive viewports",
            "scope": {"technology": "web"},
            "sourceProjectId": "project-1",
            "sourceArtifactIds": ["qa-report-1"],
            "evidenceIds": ["evidence-1"],
            "verificationIds": ["claimlatch-report-1"],
            "confidence": 0.9,
            "promotionState": "candidate",
            "createdAt": "2026-10-06T00:00:00Z",
        }
    )

    assert candidate.promotion_state == "candidate"
    assert candidate.source_project_id == "project-1"

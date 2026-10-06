from app.integrations.contracts import ProjectOutcomeReportV1
from app.memory.compiler import MemoryCompiler


def test_compiler_creates_candidates_from_verified_outcome_report() -> None:
    report = ProjectOutcomeReportV1.model_validate(
        {
            "schemaVersion": 1,
            "projectId": "project-1",
            "requestId": "request-1",
            "projectRevision": "rev-2",
            "status": "completed",
            "artifacts": [{"id": "qa-report-1"}],
            "agentTeams": [],
            "handoffs": [],
            "deterministicVerification": {"status": "PASS", "checks": []},
            "qaReport": {
                "status": "PASS",
                "findings": [],
                "evidenceIds": ["evidence-1"],
            },
            "claimLatchReports": [{"id": "claimlatch-1", "decision": "PASS"}],
            "receipts": [],
            "risks": [],
            "memoryCandidates": [
                {
                    "candidateId": "candidate-1",
                    "kind": "qa_rule",
                    "content": "Run responsive viewport checks",
                    "scope": {"technology": "web"},
                    "sourceArtifactIds": ["qa-report-1"],
                    "evidenceIds": ["evidence-1"],
                    "verificationIds": ["claimlatch-1"],
                    "confidence": 0.9,
                }
            ],
            "createdAt": "2026-10-06T00:00:00Z",
        }
    )

    candidates = MemoryCompiler().compile(report)

    assert len(candidates) == 1
    assert candidates[0].source_project_id == "project-1"
    assert candidates[0].promotion_state == "candidate"


def test_compiler_keeps_claimlatch_envelope_report_id_as_memory_evidence() -> None:
    report = ProjectOutcomeReportV1.model_validate(
        {
            "schemaVersion": 1,
            "projectId": "project-1",
            "requestId": "request-1",
            "projectRevision": "rev-2",
            "status": "completed",
            "artifacts": [{"id": "artifact-1"}],
            "agentTeams": [],
            "handoffs": [],
            "deterministicVerification": {"status": "PASS"},
            "qaReport": {"status": "PASS", "independent": True, "evidenceIds": ["qa-1"]},
            "claimLatchReports": [{"claimLatchReportId": "claimlatch-envelope-1", "decision": "PASS"}],
            "receipts": [],
            "risks": [],
            "memoryCandidates": [{
                "candidateId": "candidate-envelope-1",
                "kind": "qa_rule",
                "content": "Keep envelope IDs traceable.",
                "scope": {},
                "sourceArtifactIds": ["artifact-1"],
                "evidenceIds": ["qa-1"],
                "confidence": 0.9,
                "createdAt": "2026-10-06T00:00:00Z",
            }],
            "createdAt": "2026-10-06T00:00:00Z",
        }
    )

    candidates = MemoryCompiler().compile(report)

    assert candidates[0].verification_ids == ["claimlatch-envelope-1"]

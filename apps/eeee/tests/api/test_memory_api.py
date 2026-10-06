from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.config import Settings
from app.integrations.contracts import ProjectOutcomeReportV1
from app.main import create_app


def _outcome() -> ProjectOutcomeReportV1:
    return ProjectOutcomeReportV1.model_validate(
        {
            "schemaVersion": 1,
            "projectId": "project-api-1",
            "requestId": "request-api-1",
            "projectRevision": "rev-1",
            "status": "completed",
            "artifacts": [{"id": "qa-artifact-1"}],
            "agentTeams": [],
            "handoffs": [],
            "deterministicVerification": {"status": "PASS"},
            "qaReport": {
                "status": "PASS",
                "independent": True,
                "evidenceIds": ["qa-evidence-1"],
            },
            "claimLatchReports": [{"id": "claimlatch-1", "decision": "PASS"}],
            "receipts": [],
            "risks": [],
            "memoryCandidates": [
                {
                    "candidateId": "memory-api-1",
                    "kind": "qa_rule",
                    "content": "Run release smoke tests before deployment.",
                    "scope": {"workstream": "release"},
                    "sourceProjectId": "project-api-1",
                    "sourceArtifactIds": ["qa-artifact-1"],
                    "evidenceIds": ["qa-evidence-1"],
                    "verificationIds": ["claimlatch-1"],
                    "confidence": 0.95,
                    "promotionState": "candidate",
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                }
            ],
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
    )


def test_memory_api_rejects_unverified_outcome_before_memory_promotion(tmp_path) -> None:
    settings = Settings(data_dir=tmp_path / "data", workspace_root=tmp_path / "workspace")
    application = create_app(settings)
    client = TestClient(application)

    outcome_response = client.post(
        "/api/projects/project-api-1/outcomes",
        json=_outcome().model_dump(mode="json", by_alias=True),
    )
    assert outcome_response.status_code == 409
    assert "ClaimLatch" in outcome_response.json()["detail"]
    assert client.get("/api/memory", params={"query": "smoke"}).json() == []

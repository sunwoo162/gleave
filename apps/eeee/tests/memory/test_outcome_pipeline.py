from datetime import datetime, timezone

import pytest

from app.coordinator.service import Coordinator
from app.domain.errors import ApprovalError
from app.integrations.contracts import ProjectOutcomeReportV1
from app.storage.sqlite import SQLiteStore
from app.trust.gate import TrustGate


def _outcome(
    *,
    qa_status: str = "PASS",
    independent: bool = True,
    claim_latch_decision: str = "PASS",
    deterministic_status: str = "PASS",
    qa_checks: list[dict[str, object]] | None = None,
) -> ProjectOutcomeReportV1:
    return ProjectOutcomeReportV1.model_validate(
        {
            "schemaVersion": 1,
            "projectId": "project-1",
            "requestId": "request-1",
            "projectRevision": "rev-1",
            "status": "completed",
            "artifacts": [{"id": "artifact-1", "type": "qa-report"}],
            "agentTeams": [{"id": "iseol-qa", "role": "independent-qa"}],
            "handoffs": [],
            "deterministicVerification": {"status": deterministic_status},
            "qaReport": {
                "status": qa_status,
                "independent": independent,
                "evidenceIds": ["qa-evidence-1"],
                "checks": qa_checks if qa_checks is not None else [{"status": "passed"}],
            },
            "claimLatchReports": [
                {"id": "claimlatch-report-1", "decision": claim_latch_decision}
            ],
            "receipts": [{"id": "receipt-1"}],
            "risks": [],
            "memoryCandidates": [
                {
                    "candidateId": "memory-success-1",
                    "kind": "success_pattern",
                    "content": "Keep independent QA before release.",
                    "scope": {"workstream": "release"},
                    "sourceProjectId": "project-1",
                    "sourceArtifactIds": ["artifact-1"],
                    "evidenceIds": ["qa-evidence-1"],
                    "verificationIds": ["claimlatch-report-1"],
                    "confidence": 0.94,
                    "promotionState": "candidate",
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                }
            ],
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
    )


def test_iseol_independent_qa_result_becomes_eeee_memory_candidate(tmp_path) -> None:
    store = SQLiteStore(tmp_path / "state.sqlite3")
    store.init()
    coordinator = Coordinator(store)

    records = coordinator.record_project_outcome(_outcome())

    assert len(records) == 1
    assert records[0].status.value == "candidate"
    assert coordinator.memory.get("memory-success-1").source_project_id == "project-1"

    restarted = Coordinator(SQLiteStore(tmp_path / "state.sqlite3"))
    restarted.memory.init()
    assert restarted.memory.get("memory-success-1").verification_ids == [
        "claimlatch-report-1"
    ]


def test_memory_ingest_rejects_outcome_from_stale_project_revision(tmp_path) -> None:
    store = SQLiteStore(tmp_path / "state.sqlite3")
    store.init()
    store.create_project("project-1", "Project", str(tmp_path / "workspace"), revision="rev-2")
    coordinator = Coordinator(store)

    with pytest.raises(ApprovalError, match="stale project revision"):
        coordinator.record_project_outcome(_outcome())


@pytest.mark.parametrize(
    ("qa_status", "independent", "claim_latch_decision", "deterministic_status"),
    [
        ("FAIL", True, "PASS", "PASS"),
        ("PASS", False, "PASS", "PASS"),
        ("PASS", True, "WARN", "PASS"),
        ("PASS", True, "PASS", "FAIL"),
    ],
)
def test_memory_ingest_is_blocked_without_all_independent_release_gates(
    tmp_path,
    qa_status: str,
    independent: bool,
    claim_latch_decision: str,
    deterministic_status: str,
) -> None:
    store = SQLiteStore(tmp_path / "state.sqlite3")
    store.init()
    coordinator = Coordinator(store)

    with pytest.raises(ApprovalError, match="memory"):
        coordinator.record_project_outcome(
            _outcome(
                qa_status=qa_status,
                independent=independent,
                claim_latch_decision=claim_latch_decision,
                deterministic_status=deterministic_status,
            )
        )


def test_memory_ingest_requires_deterministic_qa_checks(tmp_path) -> None:
    store = SQLiteStore(tmp_path / "state.sqlite3")
    store.init()
    coordinator = Coordinator(store)

    with pytest.raises(ApprovalError, match="memory"):
        coordinator.record_project_outcome(_outcome(qa_checks=[]))


def test_configured_advisory_claimlatch_cannot_promote_memory(tmp_path) -> None:
    store = SQLiteStore(tmp_path / "state.sqlite3")
    store.init()
    coordinator = Coordinator(store, trust_gate=TrustGate(None, mode="advisory"))

    with pytest.raises(ApprovalError, match="memory"):
        coordinator.record_project_outcome(_outcome())

import pytest
from datetime import datetime, timezone

from app.coordinator.service import Coordinator
from app.domain.errors import ApprovalError
from app.memory.models import MemoryCandidate
from app.storage.sqlite import SQLiteStore
from app.trust.models import TrustCheck


class BlockingGate:
    def verify_action(self, **kwargs: object) -> TrustCheck:
        return TrustCheck(
            subject_id=str(kwargs["subject_id"]),
            project_id=str(kwargs["project_id"]),
            project_revision=str(kwargs["project_revision"]),
            action=str(kwargs["action"]),
            decision="BLOCKED",
            reason="ClaimLatch rejected the promotion",
        )

    def verify_claim(self, **kwargs: object) -> TrustCheck:
        return TrustCheck(
            subject_id=str(kwargs["subject_id"]),
            project_id=str(kwargs["project_id"]),
            project_revision=str(kwargs["project_revision"]),
            action=str(kwargs["action"]),
            decision="BLOCKED",
            reason="ClaimLatch rejected the claim",
        )


def test_claimlatch_block_prevents_memory_promotion(tmp_path) -> None:
    store = SQLiteStore(tmp_path / "state.sqlite3")
    store.init()
    store.create_project("project-1", "Project", str(tmp_path / "workspace"), revision="rev-1")
    coordinator = Coordinator(store, trust_gate=BlockingGate())
    coordinator.memory.save_candidate(
        MemoryCandidate(
            candidate_id="memory-1",
            kind="qa_rule",
            content="Keep independent QA before release.",
            scope={"workstream": "release"},
            source_project_id="project-1",
            source_artifact_ids=["artifact-1"],
            evidence_ids=["evidence-1"],
            verification_ids=["claimlatch-1"],
            confidence=0.9,
            created_at=datetime.now(timezone.utc),
        )
    )

    with pytest.raises(ApprovalError, match="ClaimLatch blocked memory promotion"):
        coordinator.promote_memory("memory-1", actor="user", evidence_ids=["evidence-1"])

    assert coordinator.memory.get("memory-1").status.value == "candidate"

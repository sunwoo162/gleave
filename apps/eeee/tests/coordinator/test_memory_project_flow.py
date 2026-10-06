from datetime import datetime, timezone

from app.coordinator.service import Coordinator
from app.memory.models import MemoryCandidate
from app.storage.sqlite import SQLiteStore


def test_next_project_brief_retrieves_promoted_qa_memory_as_a_baseline(tmp_path) -> None:
    store = SQLiteStore(tmp_path / "state.sqlite3")
    store.init()
    coordinator = Coordinator(store)
    coordinator.create_project("project-1", "First", str(tmp_path / "first"))
    coordinator.create_project("project-2", "Second", str(tmp_path / "second"))

    candidate = coordinator.memory.save_candidate(
        MemoryCandidate(
            candidate_id="memory-responsive-qa",
            kind="qa_rule",
            content="Always test responsive layouts at 360px and 768px viewports.",
            scope={"technology": "web", "feature": "responsive"},
            source_project_id="project-1",
            source_artifact_ids=["qa-artifact-1"],
            evidence_ids=["qa-evidence-1"],
            verification_ids=["claimlatch-1"],
            confidence=0.97,
            created_at=datetime.now(timezone.utc),
        )
    )
    coordinator.memory.promote(
        candidate.id,
        actor="user",
        evidence_ids=["qa-evidence-1"],
    )

    state = coordinator.create_request("project-2", "Build a responsive web app on Windows")
    assert state.request_id is not None
    brief = coordinator.build_project_brief("project-2", state.request_id)

    assert brief.retrieved_memory_ids == ["memory-responsive-qa"]
    assert brief.qa_baseline_ids == ["memory-responsive-qa"]

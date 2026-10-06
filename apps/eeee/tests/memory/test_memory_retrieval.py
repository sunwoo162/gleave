from pathlib import Path
from shutil import rmtree
from uuid import uuid4

from app.memory.models import MemoryCandidate
from app.memory.store import MemoryStore


def test_search_returns_scoped_active_memory_only() -> None:
    path = Path("var") / ("memory-search-" + uuid4().hex) / "memory.sqlite3"
    try:
        store = MemoryStore(path)
        store.init()
        matching = store.save_candidate(
            MemoryCandidate(
                candidate_id="matching",
                kind="qa_rule",
                content="Check responsive viewport screenshots",
                scope={"technology": "web", "feature": "ui"},
                source_project_id="project-1",
                source_artifact_ids=["qa-1"],
                evidence_ids=["evidence-1"],
                verification_ids=["verification-1"],
                confidence=0.95,
                created_at="2026-10-06T00:00:00Z",
            )
        )
        store.promote(matching.id, actor="user", evidence_ids=["evidence-1"])
        ignored = store.save_candidate(
            MemoryCandidate(
                candidate_id="ignored",
                kind="failure_pattern",
                content="Database retry failure",
                scope={"technology": "backend"},
                source_project_id="project-2",
                source_artifact_ids=["qa-2"],
                evidence_ids=["evidence-2"],
                verification_ids=["verification-2"],
                confidence=0.99,
                created_at="2026-10-06T00:00:00Z",
            )
        )

        results = store.search(
            "responsive viewport",
            scope={"technology": "web", "feature": "ui"},
        )

        assert [item.id for item in results] == [matching.id]
        assert ignored.status.value == "candidate"
    finally:
        rmtree(path.parent, ignore_errors=True)

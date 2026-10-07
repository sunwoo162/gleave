from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.planning.models import PlanningArtifact, PlanningHandoff, PlanningSession


def test_planning_session_accepts_all_lifecycle_states_and_aliases() -> None:
    for status in ("draft", "interviewing", "awaiting_approval", "approved", "handed_off", "blocked"):
        session = PlanningSession(session_id="planning-1", project_id="project-1", project_revision="1",
                                  mode="deep", status=status, current_question="What should we build?", revision=1)
        assert session.model_dump(by_alias=True)["projectId"] == "project-1"


def test_planning_models_reject_blank_identity() -> None:
    with pytest.raises(ValidationError):
        PlanningSession(session_id="", project_id="project-1", project_revision="1", mode="quick",
                        status="draft", revision=1)


def test_approved_handoff_requires_acceptance_qa_and_approval_metadata() -> None:
    with pytest.raises(ValidationError):
        PlanningHandoff(schema_version="planning-handoff.v1", handoff_id="handoff-1",
                        planning_session_id="planning-1", project_id="project-1", project_revision="1",
                        mode="quick", user_intent="Todo 앱", requirements=["Todo CRUD"],
                        acceptance_criteria=[], qa_plan=[], task_dag={}, artifact_ids=[], approval=None,
                        created_at=datetime.now(timezone.utc))


def test_artifact_uses_stable_type_and_content() -> None:
    artifact = PlanningArtifact(artifact_id="artifact-1", planning_session_id="planning-1",
                                project_id="project-1", project_revision="1", kind="acceptance-criteria",
                                content={"items": ["Todo can be created"]}, content_hash="sha256:abc",
                                created_at=datetime.now(timezone.utc))
    assert artifact.kind == "acceptance-criteria"

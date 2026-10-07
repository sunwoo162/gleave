from datetime import datetime, timezone

import pytest

from app.planning.models import PlanningArtifact, PlanningDecision, PlanningHandoff, PlanningSession
from app.runtime.store import StaleProjectRevision
from app.storage.sqlite import SQLiteStore


def _session() -> PlanningSession:
    return PlanningSession(session_id="planning-1", project_id="project-1", project_revision="1",
                            mode="deep", status="interviewing", current_question="What should we build?", revision=1)


def _artifact(kind: str) -> PlanningArtifact:
    return PlanningArtifact(artifact_id=f"artifact-{kind}", planning_session_id="planning-1",
                             project_id="project-1", project_revision="1", kind=kind,
                             content={"items": [kind]}, content_hash=f"sha256:{kind}",
                             created_at=datetime.now(timezone.utc))


def test_planning_records_round_trip_and_decisions_are_append_only(tmp_path) -> None:
    store = SQLiteStore(tmp_path / "state.sqlite3")
    store.init()
    store.create_project("project-1", "Test", str(tmp_path / "project"), revision="1")
    store.save_planning_session(_session())
    store.save_planning_artifact(_artifact("requirements"))
    store.append_planning_decision(PlanningDecision(
        decision_id="decision-1", planning_session_id="planning-1", project_id="project-1",
        project_revision="1", summary="Use FSD", reason="Keep feature boundaries clear",
        alternatives=["single page"], selected_because="testable", created_at=datetime.now(timezone.utc)))
    assert store.get_planning_session("planning-1").session_id == "planning-1"
    assert [item.kind for item in store.list_planning_artifacts("planning-1")] == ["requirements"]
    assert [item.decision_id for item in store.list_planning_decisions("planning-1")] == ["decision-1"]


def test_planning_handoff_round_trip_and_revision_is_checked(tmp_path) -> None:
    store = SQLiteStore(tmp_path / "state.sqlite3")
    store.init()
    store.create_project("project-1", "Test", str(tmp_path / "project"), revision="1")
    handoff = PlanningHandoff(schema_version="planning-handoff.v1", handoff_id="handoff-1",
                              planning_session_id="planning-1", project_id="project-1", project_revision="1",
                              mode="quick", user_intent="Todo 앱", requirements=["Todo CRUD"],
                              acceptance_criteria=["Can create a Todo"], qa_plan=["Run E2E"],
                              task_dag={"tasks": []}, artifact_ids=[],
                              approval={"status": "approved", "actor": "policy",
                                       "timestamp": datetime.now(timezone.utc).isoformat()},
                              created_at=datetime.now(timezone.utc))
    store.save_planning_handoff(handoff)
    assert store.get_planning_handoff("handoff-1").project_revision == "1"
    with pytest.raises(StaleProjectRevision):
        store.save_planning_session(_session().model_copy(update={"project_revision": "2"}))

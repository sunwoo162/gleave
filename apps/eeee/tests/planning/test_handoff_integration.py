import json
from datetime import datetime, timezone

from app.domain.models import RequestBrief
from app.planning.models import PlanningHandoff
from app.project_runtime.iseol_bridge import IseolPlanBridge


def _request() -> RequestBrief:
    return RequestBrief(raw_text="Todo 앱 만들어줘", goal="Todo 앱 만들어줘", target_type="todo_app",
                        constraints=["local-first"], acceptance_criteria=["todo can be added"])


def _handoff() -> PlanningHandoff:
    return PlanningHandoff(schema_version="planning-handoff.v1", handoff_id="handoff-1",
                            planning_session_id="planning-1", project_id="project-1", project_revision="rev-1",
                            mode="quick", user_intent="Todo 앱 만들어줘", requirements=["Todo CRUD"],
                            acceptance_criteria=["todo can be added"], qa_plan=["e2e"],
                            task_dag={"tasks": [{"id": "feature"}]}, artifact_ids=["artifact-1"],
                            technical_decisions=[{"summary": "FSD"}],
                            approval={"status": "approved", "actor": "policy",
                                     "timestamp": datetime.now(timezone.utc).isoformat()},
                            created_at=datetime.now(timezone.utc))


def test_bridge_sends_planning_handoff_with_versioned_project_brief() -> None:
    calls: list[str] = []

    def runner(_command: list[str], payload: str, _timeout: float) -> str:
        calls.append(payload)
        return json.dumps({"schemaVersion": 1, "projectId": "project-1", "tasks": [{"id": "task-1"}]})

    bridge = IseolPlanBridge(runner=runner, command=["node", "plan-cli.js"])
    plan = bridge.create_plan(project_id="project-1", project_revision="rev-1", request_id="request-1",
                              request=_request(), memory_ids=["memory-1"], qa_baseline_ids=["qa-1"],
                              planning_handoff=_handoff())

    assert plan["tasks"] == [{"id": "task-1"}]
    payload = json.loads(calls[0])
    assert payload["planningHandoff"]["handoffId"] == "handoff-1"
    assert payload["planningHandoff"]["projectRevision"] == "rev-1"
    assert payload["planningHandoff"]["approval"]["status"] == "approved"

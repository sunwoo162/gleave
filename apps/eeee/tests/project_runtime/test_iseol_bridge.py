import json

from app.domain.models import RequestBrief
from app.project_runtime.iseol_bridge import IseolPlanBridge


def request() -> RequestBrief:
    return RequestBrief(
        raw_text="Todo 앱 만들어줘",
        goal="Todo 앱 만들어줘",
        target_type="todo_app",
        constraints=["local-first"],
        acceptance_criteria=["todo can be added"],
    )


def test_bridge_sends_versioned_project_brief_and_returns_iseol_plan() -> None:
    calls: list[tuple[list[str], str]] = []

    def runner(command: list[str], payload: str, timeout: float) -> str:
        calls.append((command, payload))
        return json.dumps({"schemaVersion": 1, "projectId": "project-1", "tasks": [{"id": "task-1"}]})

    bridge = IseolPlanBridge(runner=runner, command=["node", "plan-cli.js"])
    plan = bridge.create_plan(
        project_id="project-1",
        project_revision="rev-1",
        request_id="request-1",
        request=request(),
        memory_ids=["memory-1"],
        qa_baseline_ids=["qa-1"],
    )

    assert plan["tasks"] == [{"id": "task-1"}]
    assert calls[0][0] == ["node", "plan-cli.js"]
    payload = json.loads(calls[0][1])
    assert payload["brief"]["schemaVersion"] == 1
    assert payload["brief"]["projectId"] == "project-1"
    assert payload["qualityMemory"][0]["id"] == "memory-1"


def test_bridge_rejects_invalid_iseol_output() -> None:
    bridge = IseolPlanBridge(runner=lambda *_: "{}", command=["node", "plan-cli.js"])

    try:
        bridge.create_plan(
            project_id="project-1",
            project_revision="rev-1",
            request_id="request-1",
            request=request(),
            memory_ids=[],
            qa_baseline_ids=[],
        )
    except RuntimeError as error:
        assert "invalid ISEOL plan" in str(error)
    else:
        raise AssertionError("invalid ISEOL output must be rejected")

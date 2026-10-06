from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.oss.researcher import GitHubResearcher
from app.main import create_app


def test_pet_api_runs_request_through_approval_and_report(tmp_path):
    settings = Settings(
        data_dir=tmp_path / "data",
        workspace_root=tmp_path / "workspaces",
    )
    client = TestClient(create_app(settings))
    assert (tmp_path / "workspaces" / "default").is_dir()

    created = client.post(
        "/projects/default/requests",
        json={"text": "Build a web app"},
    )
    assert created.status_code == 200
    initial = created.json()
    assert initial["state"] == "researching"
    task_id = initial["task_id"]

    awaiting = client.post(f"/projects/default/tasks/{task_id}/advance")
    assert awaiting.status_code == 200
    approval_state = awaiting.json()
    assert approval_state["state"] == "awaiting_approval"
    assert approval_state["request_id"]
    assert len(approval_state["candidates"]) == 2

    blocked = client.post(f"/projects/default/tasks/{task_id}/advance")
    assert blocked.status_code == 409

    approved = client.post(
        f"/projects/default/decisions/{approval_state['request_id']}/approve",
        json={"selected": ["demo/alpha"]},
    )
    assert approved.status_code == 200
    approved_state = approved.json()
    assert approved_state["state"] == "working"
    plan_path = Path(approved_state["workspace"]) / task_id / "plan.md"
    assert plan_path.is_file()
    assert "Build a web app" in plan_path.read_text(encoding="utf-8")

    verifying = client.post(f"/projects/default/tasks/{task_id}/advance")
    assert verifying.status_code == 200
    assert verifying.json()["state"] == "verifying"

    completed = client.post(f"/projects/default/tasks/{task_id}/advance")
    assert completed.status_code == 200
    final_state = completed.json()
    assert final_state["state"] == "completed"
    report_id = final_state["report"]["id"]
    verification_path = Path(final_state["workspace"]) / task_id / "verification.md"
    assert verification_path.is_file()
    assert "All deterministic checks passed" in verification_path.read_text(encoding="utf-8")
    assert final_state["report"]["artifacts"][0]["path"] == str(verification_path)

    report = client.get(f"/projects/default/reports/{report_id}")
    assert report.status_code == 200
    assert report.json()["status"] == "passed"


def test_health_route_remains_available_with_coordinator_app(tmp_path):
    settings = Settings(data_dir=tmp_path / "data", workspace_root=tmp_path / "workspaces")
    response = TestClient(create_app(settings)).get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_app_wires_github_researcher_when_token_is_configured(tmp_path):
    settings = Settings(
        data_dir=tmp_path / "data",
        workspace_root=tmp_path / "workspaces",
        github_token="secret-token",
    )

    application = create_app(settings)

    assert isinstance(application.state.coordinator.researcher, GitHubResearcher)


def test_run_endpoint_stops_for_approval_then_finishes_after_approval(tmp_path):
    settings = Settings(data_dir=tmp_path / "data", workspace_root=tmp_path / "workspaces")
    client = TestClient(create_app(settings))

    created = client.post(
        "/projects/default/requests",
        json={"text": "Build a web app"},
    ).json()
    task_id = created["task_id"]

    awaiting = client.post(f"/projects/default/tasks/{task_id}/run")

    assert awaiting.status_code == 200
    assert awaiting.json()["state"] == "awaiting_approval"
    request_id = awaiting.json()["request_id"]

    approved = client.post(
        f"/projects/default/decisions/{request_id}/approve",
        json={"selected": ["demo/alpha"]},
    ).json()
    completed = client.post(f"/projects/default/tasks/{task_id}/run")

    assert approved["state"] == "working"
    assert completed.status_code == 200
    assert completed.json()["state"] == "completed"


def test_workspace_verify_mode_runs_real_checks_and_writes_report(tmp_path):
    settings = Settings(
        data_dir=tmp_path / "data",
        workspace_root=tmp_path / "workspaces",
        execution_mode="workspace_verify",
    )
    client = TestClient(create_app(settings))
    workspace = tmp_path / "workspaces" / "default"
    (workspace / "sample.py").write_text("answer = 42\n", encoding="utf-8")

    created = client.post(
        "/projects/default/requests",
        json={"text": "Build a web app"},
    ).json()
    task_id = created["task_id"]
    awaiting = client.post(f"/projects/default/tasks/{task_id}/run").json()
    approved = client.post(
        f"/projects/default/decisions/{awaiting['request_id']}/approve",
        json={"selected": ["demo/alpha"]},
    )
    assert approved.status_code == 200

    completed = client.post(f"/projects/default/tasks/{task_id}/run")

    assert completed.status_code == 200
    final_state = completed.json()
    assert final_state["state"] == "completed"
    assert final_state["report"]["checks"][0]["name"] == "compileall"
    assert final_state["report"]["checks"][0]["status"] == "passed"
    verification_path = workspace / task_id / "verification.md"
    assert verification_path.is_file()
    assert "All deterministic checks passed" in verification_path.read_text(encoding="utf-8")

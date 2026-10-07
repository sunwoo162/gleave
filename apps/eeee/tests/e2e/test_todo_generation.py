from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_user_can_request_todo_and_receive_a_generated_project(tmp_path) -> None:
    settings = Settings(data_dir=tmp_path / "data", workspace_root=tmp_path / "workspaces")

    with TestClient(create_app(settings)) as client:
        response = client.post("/api/assistant/route", json={"text": "Todo 앱 만들어줘"})

    assert response.status_code == 200
    payload = response.json()
    workspace = Path(payload["project_profile"]["workspace"])
    assert payload["selection"]["capability_id"] == "project-execution"
    assert payload["status"] == "completed"
    assert payload["qualityStatus"] == "PASS"
    assert payload["qaReportPath"].endswith("QA_REPORT.json")
    assert payload["gitBranch"].startswith("project/")
    assert len(payload["gitCommit"]) == 40
    assert payload["executionPlanPath"].endswith("execution-plan.json")
    assert (workspace / "index.html").is_file()
    assert (workspace / "src" / "entities" / "todo" / "model.js").is_file()
    assert (workspace / "README.md").is_file()
    assert (workspace / "execution-plan.json").is_file()
    assert (workspace / "PROJECT_PROFILE.json").is_file()
    assert (workspace / "PROJECT_LOG.md").is_file()

from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_defaults_are_demo_mode_and_health_needs_no_credentials(tmp_path):
    settings = Settings(data_dir=tmp_path / "data", workspace_root=tmp_path / "workspaces")

    assert settings.execution_mode == "demo"
    assert settings.github_token is None
    assert TestClient(create_app(settings)).get("/health").status_code == 200


def test_api_rejects_workspace_outside_configured_root(tmp_path):
    root = tmp_path / "workspaces"
    outside = tmp_path / "outside"
    response = TestClient(
        create_app(Settings(data_dir=tmp_path / "data", workspace_root=root))
    ).post("/api/requests", json={"text": "Build a demo", "workspace": str(outside)})

    assert response.status_code == 400
    assert "inside the configured workspace root" in response.json()["detail"]


def test_ci_and_release_workflows_have_read_only_and_tag_contracts():
    ci = Path(".github/workflows/ci.yml").read_text(encoding="utf-8")
    release = Path(".github/workflows/release.yml").read_text(encoding="utf-8")

    assert "contents: read" in ci
    assert "python -m build --no-isolation" in ci
    assert "python scripts/check_artifacts.py dist" in ci
    assert "tags: [\"v*\"]" in release
    assert "contents: read" in release
    assert "pull_request" not in release
    assert "workflow_dispatch" in release

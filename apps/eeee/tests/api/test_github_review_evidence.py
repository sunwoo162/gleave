from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def _review(project_id: str, revision: str) -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "projectId": project_id,
        "projectRevision": revision,
        "repository": "sunwoo162/gleave",
        "pullNumber": 7,
        "headSha": "a" * 40,
        "reviewStatus": "passed",
        "findingsCount": 0,
        "checks": [{"name": "CI", "status": "passed"}],
        "source": "iseol-github-review",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }


def test_iseol_github_review_result_becomes_durable_project_evidence(tmp_path) -> None:
    application = create_app(
        Settings(data_dir=tmp_path / "data", workspace_root=tmp_path / "workspaces")
    )
    application.state.coordinator.create_project(
        "project-1", "Gleave", str(tmp_path / "workspace"), revision="rev-1"
    )
    client = TestClient(application)

    response = client.post(
        "/api/projects/project-1/evidence/github-review",
        json=_review("project-1", "rev-1"),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "accepted"
    assert response.json()["evidence"]["payload"]["headSha"] == "a" * 40
    assert application.state.api_flow.store.get_project_evidence(
        "project-1", "github-review", "a" * 40
    ).project_revision == "rev-1"


def test_stale_iseol_review_result_is_rejected_before_persistence(tmp_path) -> None:
    application = create_app(
        Settings(data_dir=tmp_path / "data", workspace_root=tmp_path / "workspaces")
    )
    application.state.coordinator.create_project(
        "project-1", "Gleave", str(tmp_path / "workspace"), revision="rev-2"
    )
    client = TestClient(application)

    response = client.post(
        "/api/projects/project-1/evidence/github-review",
        json=_review("project-1", "rev-1"),
    )

    assert response.status_code == 409
    assert "stale" in response.json()["detail"].lower()


def test_required_claimlatch_blocks_evidence_without_persisting_it(tmp_path) -> None:
    application = create_app(
        Settings(
            data_dir=tmp_path / "data",
            workspace_root=tmp_path / "workspaces",
            claim_latch_mode="required",
        )
    )
    application.state.coordinator.create_project(
        "project-1", "Gleave", str(tmp_path / "workspace"), revision="rev-1"
    )
    client = TestClient(application)

    response = client.post(
        "/api/projects/project-1/evidence/github-review",
        json=_review("project-1", "rev-1"),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "blocked"
    try:
        application.state.api_flow.store.get_project_evidence(
            "project-1", "github-review", "a" * 40
        )
    except KeyError:
        pass
    else:  # pragma: no cover - protects the fail-closed boundary
        raise AssertionError("blocked evidence must not be persisted")

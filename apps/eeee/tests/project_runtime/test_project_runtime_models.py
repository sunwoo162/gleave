import pytest

from app.project_runtime.models import ConnectorBinding, ProjectProfile


def test_project_profile_binds_every_project_surface_under_one_identity() -> None:
    profile = ProjectProfile(
        project_id="project-1",
        project_revision="rev-1",
        goal="Build a personal assistant",
        scope=["web_app"],
        constraints=["local-first"],
        acceptance_criteria=["works offline"],
        workspace="C:/workspaces/project-1",
        capabilities=["project-execution"],
        schedule={"timezone": "Asia/Seoul"},
        preferences={"language": "ko"},
        memory_ids=["memory-1"],
        qa_baseline_ids=["qa-1"],
        connectors=[
            ConnectorBinding(
                connector_id="notion",
                state="awaiting_configuration",
                intent="store project documentation",
                idempotency_key="project-1:rev-1:notion",
                reason="Notion token is not configured",
            )
        ],
        provenance={"goal": "user", "schedule": "inferred"},
    )

    assert profile.project_id == "project-1"
    assert profile.connectors[0].state == "awaiting_configuration"
    assert profile.provisioning_status == "awaiting_configuration"


def test_project_profile_rejects_empty_identity() -> None:
    with pytest.raises(ValueError):
        ProjectProfile(
            project_id="",
            project_revision="rev-1",
            goal="Build something",
            scope=[],
            constraints=[],
            acceptance_criteria=[],
            workspace="C:/workspace",
            capabilities=["project-execution"],
        )


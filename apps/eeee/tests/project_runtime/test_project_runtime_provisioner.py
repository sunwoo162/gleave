from pathlib import Path

from app.domain.models import PetState, Project, RequestBrief
from app.project_runtime.provisioner import ProjectProvisioner
from app.storage.sqlite import SQLiteStore


def request() -> RequestBrief:
    return RequestBrief(
        raw_text="웹 프로젝트 하나 만들어줘",
        goal="Build a web project",
        target_type="web_app",
        constraints=["local-first"],
        acceptance_criteria=["runs locally"],
    )


def project(workspace: Path) -> Project:
    return Project(
        id="project-1",
        name="Assistant project",
        workspace=str(workspace),
        revision="rev-1",
        state=PetState.idle,
        active_task_id=None,
    )


def test_provisioning_creates_one_profile_and_truthful_connector_plans(tmp_path) -> None:
    store = SQLiteStore(tmp_path / "state.sqlite3")
    store.init()
    provisioner = ProjectProvisioner(store)

    result = provisioner.provision(
        project(tmp_path / "workspace"),
        request(),
        memory_ids=["memory-1"],
        qa_baseline_ids=["qa-1"],
    )

    assert Path(result.profile.workspace).is_dir()
    assert result.profile.capabilities == ["project-execution"]
    assert {item.connector_id for item in result.profile.connectors} == {
        "notion",
        "google-calendar",
        "github",
        "iseol-runtime",
        "desktop",
        "mobile-bridge",
    }
    assert result.profile.provisioning_status == "awaiting_configuration"
    assert result.profile.connector("notion").state == "awaiting_configuration"
    assert result.profile.connector("iseol-runtime").state == "ready"
    assert result.profile.connector("desktop").state == "ready"
    assert result.profile.connector("mobile-bridge").state == "ready"
    assert result.missing_connectors == ["github", "google-calendar", "notion"]


def test_repeated_provisioning_is_idempotent_and_survives_store_reopen(tmp_path) -> None:
    database = tmp_path / "state.sqlite3"
    store = SQLiteStore(database)
    store.init()
    provisioner = ProjectProvisioner(store)
    input_project = project(tmp_path / "workspace")

    first = provisioner.provision(input_project, request(), memory_ids=[], qa_baseline_ids=[])
    second = provisioner.provision(input_project, request(), memory_ids=[], qa_baseline_ids=[])
    reopened = SQLiteStore(database)
    reopened.init()

    assert second.profile == first.profile
    assert reopened.get_project_profile("project-1") == first.profile
    assert len(first.profile.connectors) == len(second.profile.connectors)


def test_todo_request_provisions_an_actual_fsd_project(tmp_path) -> None:
    store = SQLiteStore(tmp_path / "state.sqlite3")
    store.init()
    provisioner = ProjectProvisioner(store)
    todo_request = RequestBrief(
        raw_text="Todo 앱 만들어줘",
        goal="Todo 앱 만들어줘",
        target_type="todo_app",
        constraints=["local-first"],
        acceptance_criteria=["todo can be added and completed"],
    )

    provisioner.provision(
        project(tmp_path / "todo-workspace"),
        todo_request,
        memory_ids=[],
        qa_baseline_ids=[],
    )

    assert (tmp_path / "todo-workspace" / "index.html").is_file()
    assert (tmp_path / "todo-workspace" / "src" / "entities" / "todo" / "model.js").is_file()


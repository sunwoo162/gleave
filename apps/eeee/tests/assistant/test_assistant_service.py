from pathlib import Path

from app.assistant.registry import build_default_registry
from app.assistant.router import CapabilityRouter
from app.assistant.service import AssistantService
from app.config import Settings
from app.coordinator.service import Coordinator
from app.project_runtime.provisioner import ProjectProvisioner
from app.storage.sqlite import SQLiteStore


def test_assistant_service_creates_one_project_runtime_for_project_intent(tmp_path) -> None:
    settings = Settings(data_dir=tmp_path / "data", workspace_root=tmp_path / "workspaces")
    store = SQLiteStore(settings.data_dir / "state.sqlite3")
    store.init()
    coordinator = Coordinator(store)
    service = AssistantService(
        router=CapabilityRouter(build_default_registry()),
        coordinator=coordinator,
        store=store,
        settings=settings,
        provisioner=ProjectProvisioner(store),
    )

    result = service.route("웹 프로젝트 하나 만들어줘")

    assert result.selection.capability_id == "project-execution"
    assert result.project_id is not None
    assert result.project_profile is not None
    assert Path(result.project_profile.workspace).is_dir()
    assert result.project_profile.project_id == result.project_id
    assert result.status == "awaiting_configuration"


def test_assistant_service_does_not_create_project_for_a_reminder(tmp_path) -> None:
    settings = Settings(data_dir=tmp_path / "data", workspace_root=tmp_path / "workspaces")
    store = SQLiteStore(settings.data_dir / "state.sqlite3")
    store.init()
    coordinator = Coordinator(store)
    service = AssistantService(
        router=CapabilityRouter(build_default_registry()),
        coordinator=coordinator,
        store=store,
        settings=settings,
        provisioner=ProjectProvisioner(store),
    )

    result = service.route("내일 오후 3시에 회의 일정 등록해줘")

    assert result.selection.capability_id == "personal-secretary"
    assert result.project_id is None
    assert result.project_profile is None
    assert result.status == "selected"


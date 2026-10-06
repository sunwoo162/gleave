from __future__ import annotations

from pathlib import Path
from collections.abc import Callable
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field

from app.assistant.models import AssistantRequest, CapabilitySelection
from app.assistant.router import CapabilityRouter
from app.config import Settings
from app.coordinator.service import Coordinator
from app.project_runtime.models import ProjectProfile
from app.project_runtime.provisioner import ProjectProvisioner
from app.storage.sqlite import SQLiteStore
from app.workflow.planner import parse_request


class AssistantRouteResult(BaseModel):
    status: Literal["selected", "needs_clarification", "ready", "awaiting_configuration", "blocked"]
    selection: CapabilitySelection
    message: str = Field(min_length=1)
    project_id: str | None = None
    project_profile: ProjectProfile | None = None
    missing_connectors: list[str] = Field(default_factory=list)


class AssistantService:
    """Top-level EEEE entrypoint that selects capabilities and provisions projects."""

    def __init__(
        self,
        *,
        router: CapabilityRouter,
        coordinator: Coordinator,
        store: SQLiteStore,
        settings: Settings,
        provisioner: ProjectProvisioner,
        event_publisher: Callable[[str, dict[str, object]], object] | None = None,
    ) -> None:
        self.router = router
        self.coordinator = coordinator
        self.store = store
        self.settings = settings
        self.provisioner = provisioner
        self.event_publisher = event_publisher

    def route(self, text: str, workspace: str | None = None) -> AssistantRouteResult:
        request = AssistantRequest(raw_text=text)
        selection = self.router.select(request)
        self._publish(
            "assistant.route.started",
            {"capabilityId": selection.capability_id, "selectionStatus": selection.status},
        )
        if selection.status == "needs_clarification":
            result = AssistantRouteResult(
                status="needs_clarification",
                selection=selection,
                message="어떤 작업 영역인지 조금 더 알려줘.",
            )
            self._publish("assistant.route.completed", _event_payload(result))
            return result

        if selection.capability_id != "project-execution":
            result = AssistantRouteResult(
                status="selected",
                selection=selection,
                message=f"Selected EEEE capability: {selection.capability_id}",
            )
            self._publish("assistant.route.completed", _event_payload(result))
            return result

        brief = parse_request(text)
        project_id = f"project-{uuid4().hex}"
        workspace_path = self._resolve_workspace(workspace, project_id)
        project = self.coordinator.create_project(project_id, brief.goal[:80], str(workspace_path))
        state = self.coordinator.create_request(project_id, text)
        if state.request_id is None:
            raise RuntimeError("Project request did not produce a request ID")
        self.store.save_request_context(state.request_id, project_id, str(workspace_path))
        project_brief = self.coordinator.build_project_brief(project_id, state.request_id)
        provisioned = self.provisioner.provision(
            project,
            brief,
            memory_ids=project_brief.retrieved_memory_ids,
            qa_baseline_ids=project_brief.qa_baseline_ids,
        )
        result = AssistantRouteResult(
            status=provisioned.status,
            selection=selection,
            message="Project Runtime이 생성되었고 외부 연결 상태를 확인해야 해.",
            project_id=project_id,
            project_profile=provisioned.profile,
            missing_connectors=provisioned.missing_connectors,
        )
        self._publish(
            "project.created",
            {"projectId": project_id, "projectRevision": project.revision, "status": result.status},
        )
        self._publish("assistant.route.completed", _event_payload(result))
        return result

    def get_project_profile(self, project_id: str) -> ProjectProfile:
        return self.store.get_project_profile(project_id)

    def _resolve_workspace(self, requested: str | None, project_id: str) -> Path:
        root = self.settings.workspace_root.resolve()
        candidate = Path(requested).resolve() if requested else root / "assistant" / project_id
        try:
            candidate.relative_to(root)
        except ValueError as exc:
            raise ValueError("Workspace must be inside the configured workspace root") from exc
        return candidate

    def _publish(self, kind: str, payload: dict[str, object]) -> None:
        if self.event_publisher is not None:
            self.event_publisher(kind, payload)


def _event_payload(result: AssistantRouteResult) -> dict[str, object]:
    return {
        "status": result.status,
        "capabilityId": result.selection.capability_id,
        "projectId": result.project_id,
    }


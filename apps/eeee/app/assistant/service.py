from __future__ import annotations

from collections.abc import Callable
from typing import Literal

from pydantic import BaseModel, Field

from app.assistant.models import AssistantContext, AssistantRequest, CapabilitySelection
from app.assistant.router import CapabilityRouter
from app.config import Settings
from app.coordinator.service import Coordinator
from app.project_runtime.models import ProjectProfile
from app.project_runtime.documents import ProjectDocumentService
from app.project_runtime.provisioner import ProjectProvisioner
from app.storage.sqlite import SQLiteStore
from app.kernel.service import KernelService


class AssistantRouteResult(BaseModel):
    status: Literal["selected", "needs_clarification", "ready", "awaiting_configuration", "blocked"]
    selection: CapabilitySelection
    message: str = Field(min_length=1)
    project_id: str | None = None
    project_profile: ProjectProfile | None = None
    missing_connectors: list[str] = Field(default_factory=list)


class AssistantService:
    """Compatibility facade for EEEE requests handled by the shared kernel."""

    def __init__(
        self,
        *,
        router: CapabilityRouter,
        coordinator: Coordinator,
        store: SQLiteStore,
        settings: Settings,
        provisioner: ProjectProvisioner,
        event_publisher: Callable[[str, dict[str, object]], object] | None = None,
        document_service: ProjectDocumentService | None = None,
        kernel: KernelService | None = None,
    ) -> None:
        self.router = router
        self.coordinator = coordinator
        self.store = store
        self.settings = settings
        self.provisioner = provisioner
        self.event_publisher = event_publisher
        self.document_service = document_service
        self.kernel = kernel or KernelService(
            router=router, coordinator=coordinator, store=store, settings=settings,
            provisioner=provisioner, event_publisher=event_publisher,
            document_service=document_service,
        )

    def route(
        self, text: str, workspace: str | None = None, *, requested_capability: str | None = None,
    ) -> AssistantRouteResult:
        envelope = self.kernel.route(
            AssistantRequest(raw_text=text, context={"workspace": workspace},
                             requested_capability=requested_capability),
            AssistantContext(),
        )
        if envelope.error is not None and envelope.error.code == "invalid_request":
            raise ValueError(envelope.error.message)
        output = envelope.model_dump(mode="json")["output"] or {}
        return AssistantRouteResult(
            status=output.get("status", "blocked"),
            selection=CapabilitySelection.model_validate(output["selection"]),
            message=output.get("message", "요청을 완료하지 못했어."),
            project_id=output.get("projectId"),
            project_profile=output.get("projectProfile"),
            missing_connectors=output.get("missingConnectors", []),
        )

    def get_project_profile(self, project_id: str) -> ProjectProfile:
        return self.store.get_project_profile(project_id)


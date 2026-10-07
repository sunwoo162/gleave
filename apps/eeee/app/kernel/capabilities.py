"""Provider-neutral built-in adapters; the kernel owns their execution ledger."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol
from uuid import uuid4

from app.assistant.models import AssistantContext, AssistantRequest, CapabilityDescriptor, CapabilityPlan
from app.config import Settings
from app.contracts import ExecutionEnvelope, ExecutionError, ExecutionStatus, SideEffectLevel
from app.coordinator.service import Coordinator
from app.project_runtime.provisioner import ProjectProvisioner
from app.runtime.store import StaleProjectRevision
from app.storage.sqlite import SQLiteStore
from app.workflow.planner import parse_request


@dataclass(frozen=True)
class CapabilityOutcome:
    output: dict[str, Any]
    status: ExecutionStatus = ExecutionStatus.COMPLETED
    error: ExecutionError | None = None


@dataclass(frozen=True)
class EnvelopeContext:
    envelope: ExecutionEnvelope
    assistant_context: AssistantContext
    run_child: Callable[..., ExecutionEnvelope]


class Capability(Protocol):
    descriptor: CapabilityDescriptor

    def plan(self, request: AssistantRequest, context: AssistantContext) -> CapabilityPlan: ...

    def execute(self, plan: CapabilityPlan, envelope_context: EnvelopeContext) -> CapabilityOutcome: ...


class LocalPlanningCapability:
    """Expose a local plan without claiming that a provider action occurred."""

    def __init__(self, descriptor: CapabilityDescriptor) -> None:
        self.descriptor = descriptor

    def plan(self, request: AssistantRequest, context: AssistantContext) -> CapabilityPlan:
        return CapabilityPlan(
            capability_id=self.descriptor.id,
            summary=request.raw_text,
            inputs={"text": request.raw_text},
            side_effect_level=self.descriptor.side_effect_level,
            requires_approval=self.descriptor.approval_level != "none",
        )

    def execute(self, plan: CapabilityPlan, envelope_context: EnvelopeContext) -> CapabilityOutcome:
        return CapabilityOutcome({
            "status": "selected", "capabilityStatus": "planned",
            "message": f"Selected EEEE capability: {self.descriptor.id}",
            "plan": plan.model_dump(mode="json"),
            "context": envelope_context.assistant_context.model_dump(mode="json"),
        })


class ProjectExecutionCapability:
    """Allocate one local project, then delegate its request and profile to ISEOL."""

    def __init__(
        self, descriptor: CapabilityDescriptor, *, coordinator: Coordinator,
        store: SQLiteStore, settings: Settings, provisioner: ProjectProvisioner,
        document_service: Any | None = None,
    ) -> None:
        self.descriptor = descriptor
        self.coordinator = coordinator
        self.store = store
        self.settings = settings
        self.provisioner = provisioner
        self.document_service = document_service

    def plan(self, request: AssistantRequest, context: AssistantContext) -> CapabilityPlan:
        project_id = f"project-{uuid4().hex}"
        root = self.settings.workspace_root.resolve()
        requested = request.context.get("workspace")
        workspace = Path(requested).resolve() if requested else root / "assistant" / project_id
        try:
            workspace.relative_to(root)
        except ValueError as exc:
            raise ValueError("Workspace must be inside the configured workspace root") from exc
        return CapabilityPlan(
            capability_id=self.descriptor.id, summary=request.raw_text,
            inputs={"text": request.raw_text, "projectId": project_id, "workspace": str(workspace)},
            side_effect_level=self.descriptor.side_effect_level,
            requires_approval=self.descriptor.approval_level != "none",
        )

    def execute(self, plan: CapabilityPlan, envelope_context: EnvelopeContext) -> CapabilityOutcome:
        text = plan.inputs["text"]
        brief = parse_request(text)
        project = self.coordinator.create_project(
            plan.inputs["projectId"], brief.goal[:80], plan.inputs["workspace"],
        )
        try:
            state = self.coordinator.create_request(project.id, text)
            if state.request_id is None:
                raise RuntimeError("Project request did not produce a request ID")
            self.store.save_request_context(state.request_id, project.id, project.workspace)
        except Exception as exc:
            message = str(exc).strip() or type(exc).__name__
            return CapabilityOutcome(
                {"status": "blocked", "message": message, "projectId": project.id,
                 "projectRevision": project.revision},
                ExecutionStatus.FAILED, ExecutionError(code="capability_failed", message=message),
            )

        def provision(_child: ExecutionEnvelope) -> CapabilityOutcome:
            project_brief = self.coordinator.build_project_brief(project.id, state.request_id)
            provisioned = self.provisioner.provision(
                project, brief,
                memory_ids=list(dict.fromkeys([
                    *project_brief.retrieved_memory_ids, *envelope_context.assistant_context.memory_ids,
                ])),
                qa_baseline_ids=list(dict.fromkeys([
                    *project_brief.qa_baseline_ids, *envelope_context.assistant_context.qa_baseline_ids,
                ])),
                request_id=state.request_id,
            )
            document_execution_id = None
            if self.document_service is not None:
                def sync_document(_document: ExecutionEnvelope) -> CapabilityOutcome:
                    result = self.document_service.sync(provisioned.profile)
                    status = (ExecutionStatus.COMPLETED if result.status in {"synced", "unchanged"}
                              else ExecutionStatus.BLOCKED)
                    return CapabilityOutcome(result.model_dump(mode="json", by_alias=True), status)

                document = envelope_context.run_child(
                    parent=_child, project_id=project.id, revision=project.revision,
                    request_id=state.request_id, tool_id="project.documents.sync",
                    inputs={"provider": "notion"}, side_effect_level=SideEffectLevel.EXTERNAL,
                    operation=sync_document, owns_trust_boundary=True,
                )
                document_execution_id = document.execution_id
                if document.status == ExecutionStatus.FAILED:
                    return CapabilityOutcome(
                        {"status": "blocked", "message": document.error.message,
                         "documentExecutionId": document.execution_id},
                        ExecutionStatus.FAILED, document.error,
                    )
            profile = self.store.get_project_profile(project.id)
            missing = sorted(binding.connector_id for binding in profile.connectors
                             if binding.state in {"awaiting_configuration", "planned"})
            return CapabilityOutcome({
                "status": profile.provisioning_status,
                "message": "Project Runtime이 생성되었고 외부 연결 상태를 확인해야 해.",
                "projectId": project.id, "projectProfile": profile.model_dump(mode="json", by_alias=True),
                "missingConnectors": missing, "documentExecutionId": document_execution_id,
                "executionPlanPath": provisioned.execution_plan_path,
            })

        try:
            child = envelope_context.run_child(
                parent=envelope_context.envelope, project_id=project.id, revision=project.revision,
                request_id=state.request_id, tool_id="iseol", inputs={"text": text, "workspace": project.workspace},
                side_effect_level=SideEffectLevel.LOCAL, operation=provision,
            )
        except StaleProjectRevision as exc:
            message = str(exc).strip() or "stale project revision"
            return CapabilityOutcome(
                {
                    "status": "blocked",
                    "message": message,
                    "projectId": project.id,
                    "projectRevision": project.revision,
                    "coordinatorRequestId": state.request_id,
                },
                ExecutionStatus.FAILED,
                ExecutionError(code="stale_project_revision", message=message),
            )
        output = dict(child.model_dump(mode="json")["output"] or {})
        output.update(projectId=project.id, projectRevision=project.revision, childExecutionId=child.execution_id,
                      coordinatorRequestId=state.request_id)
        status = (ExecutionStatus.FAILED if child.error is not None and child.error.code == "stale_project_revision"
                  else child.status)
        return CapabilityOutcome(output, status, child.error)

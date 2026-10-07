from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path

from app.domain.models import Project, RequestBrief
from app.project_runtime.connectors import ProjectConnector, build_default_connectors
from app.project_runtime.models import ProjectProfile, ProjectProvisioningResult
from app.project_runtime.scaffold import create_todo_scaffold
from app.project_runtime.iseol_bridge import IseolPlanBridge
import json
from app.storage.sqlite import SQLiteStore


class ProjectProvisioner:
    """Create the durable local representation of one unified Project Runtime."""

    def __init__(
        self,
        store: SQLiteStore,
        connectors: Mapping[str, ProjectConnector] | None = None,
        iseol_bridge: IseolPlanBridge | None = None,
    ) -> None:
        self.store = store
        self.connectors = dict(connectors or build_default_connectors())
        self.iseol_bridge = iseol_bridge

    def provision(
        self,
        project: Project,
        request: RequestBrief,
        *,
        memory_ids: list[str],
        qa_baseline_ids: list[str],
        request_id: str | None = None,
    ) -> ProjectProvisioningResult:
        existing = self._existing_current_profile(project)
        if existing is not None:
            if _is_todo_request(existing.goal, existing.scope):
                create_todo_scaffold(project.workspace)
            execution_plan_path = self._write_execution_plan(
                project, request, memory_ids, qa_baseline_ids, request_id,
            )
            return _result(existing, execution_plan_path=execution_plan_path)

        Path(project.workspace).mkdir(parents=True, exist_ok=True)
        if _is_todo_request(request.goal, [request.target_type, *request.acceptance_criteria]):
            create_todo_scaffold(project.workspace)
        profile = ProjectProfile(
            project_id=project.id,
            project_revision=project.revision,
            goal=request.goal,
            scope=[request.target_type, *request.acceptance_criteria],
            constraints=list(request.constraints),
            acceptance_criteria=list(request.acceptance_criteria),
            workspace=project.workspace,
            capabilities=["project-execution"],
            schedule={},
            preferences={},
            memory_ids=list(memory_ids),
            qa_baseline_ids=list(qa_baseline_ids),
            connectors=[],
            provenance={
                "goal": "user_request",
                "scope": "request_parser",
                "connectors": "local_connector_registry",
            },
        )
        bindings = [connector.plan(profile) for connector in self.connectors.values()]
        profile = profile.model_copy(update={"connectors": bindings})
        self.store.save_project_profile(profile)
        execution_plan_path = None
        execution_plan_path = self._write_execution_plan(
            project, request, memory_ids, qa_baseline_ids, request_id,
        )
        return _result(profile, execution_plan_path=execution_plan_path)

    def _write_execution_plan(
        self,
        project: Project,
        request: RequestBrief,
        memory_ids: list[str],
        qa_baseline_ids: list[str],
        request_id: str | None,
    ) -> str | None:
        if self.iseol_bridge is None or request_id is None:
            return None
        plan = self.iseol_bridge.create_plan(
            project_id=project.id,
            project_revision=project.revision,
            request_id=request_id,
            request=request,
            memory_ids=memory_ids,
            qa_baseline_ids=qa_baseline_ids,
        )
        plan_path = Path(project.workspace) / "execution-plan.json"
        plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return str(plan_path)

    def _existing_current_profile(self, project: Project) -> ProjectProfile | None:
        try:
            profile = self.store.get_project_profile(project.id)
        except KeyError:
            return None
        if profile.project_revision != project.revision:
            raise ValueError(
                "Cannot reuse a project profile from a different revision: "
                f"{profile.project_revision} != {project.revision}"
            )
        return profile


def _result(profile: ProjectProfile, *, execution_plan_path: str | None = None) -> ProjectProvisioningResult:
    missing = sorted(
        binding.connector_id
        for binding in profile.connectors
        if binding.state == "awaiting_configuration"
    )
    return ProjectProvisioningResult(profile=profile, missing_connectors=missing, execution_plan_path=execution_plan_path)


def _is_todo_request(goal: str, scope: list[str]) -> bool:
    text = " ".join([goal, *scope]).lower()
    return "todo" in text or "할 일" in text or "체크리스트" in text


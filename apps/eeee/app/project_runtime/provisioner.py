from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path

from app.domain.models import Project, RequestBrief
from app.project_runtime.connectors import ProjectConnector, build_default_connectors
from app.project_runtime.models import ProjectProfile, ProjectProvisioningResult
from app.storage.sqlite import SQLiteStore


class ProjectProvisioner:
    """Create the durable local representation of one unified Project Runtime."""

    def __init__(
        self,
        store: SQLiteStore,
        connectors: Mapping[str, ProjectConnector] | None = None,
    ) -> None:
        self.store = store
        self.connectors = dict(connectors or build_default_connectors())

    def provision(
        self,
        project: Project,
        request: RequestBrief,
        *,
        memory_ids: list[str],
        qa_baseline_ids: list[str],
    ) -> ProjectProvisioningResult:
        existing = self._existing_current_profile(project)
        if existing is not None:
            return _result(existing)

        Path(project.workspace).mkdir(parents=True, exist_ok=True)
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
        return _result(profile)

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


def _result(profile: ProjectProfile) -> ProjectProvisioningResult:
    missing = sorted(
        binding.connector_id
        for binding in profile.connectors
        if binding.state == "awaiting_configuration"
    )
    return ProjectProvisioningResult(profile=profile, missing_connectors=missing)


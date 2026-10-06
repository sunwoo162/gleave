from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Protocol

from app.project_runtime.models import ConnectorBinding, ProjectProfile


class ProjectConnector(Protocol):
    connector_id: str

    def plan(self, profile: ProjectProfile) -> ConnectorBinding: ...


@dataclass(frozen=True)
class PlanningConnector:
    connector_id: str
    intent: str
    configured: bool = False
    local_only: bool = False

    def plan(self, profile: ProjectProfile) -> ConnectorBinding:
        idempotency_key = _idempotency_key(profile.project_id, profile.project_revision, self.connector_id)
        if self.local_only:
            state = "ready"
            reason = None
        elif self.configured:
            state = "planned"
            reason = "Provider is configured; execution requires the connector adapter"
        else:
            state = "awaiting_configuration"
            reason = f"{self.connector_id} credentials are not configured"
        return ConnectorBinding(
            connector_id=self.connector_id,
            state=state,
            intent=self.intent,
            idempotency_key=idempotency_key,
            reason=reason,
        )


def build_default_connectors(
    *, configured: set[str] | None = None
) -> dict[str, ProjectConnector]:
    configured_ids = configured or set()
    return {
        "google-calendar": PlanningConnector(
            "google-calendar",
            "create milestones and deadlines",
            configured="google-calendar" in configured_ids,
        ),
        "discord": PlanningConnector(
            "discord",
            "create project category and channels",
            configured="discord" in configured_ids,
        ),
        "github": PlanningConnector(
            "github",
            "bind repository and project history",
            configured="github" in configured_ids,
        ),
        "desktop-mobile": PlanningConnector(
            "desktop-mobile",
            "publish the project surface to local clients",
            local_only=True,
        ),
    }


def _idempotency_key(project_id: str, revision: str, connector_id: str) -> str:
    value = f"{project_id}:{revision}:{connector_id}".encode("utf-8")
    return f"project-binding-{hashlib.sha256(value).hexdigest()[:24]}"


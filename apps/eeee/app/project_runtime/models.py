from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


ConnectorState = Literal[
    "planned",
    "ready",
    "awaiting_configuration",
    "completed",
    "blocked",
]
ProvisioningStatus = Literal["ready", "awaiting_configuration", "blocked"]


class ConnectorBinding(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    connector_id: str = Field(min_length=1, alias="connectorId")
    state: ConnectorState
    intent: str = Field(min_length=1)
    idempotency_key: str = Field(min_length=1, alias="idempotencyKey")
    external_ref: str | None = Field(default=None, alias="externalRef")
    reason: str | None = None


class ProjectProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    schema_version: int = 1
    project_id: str = Field(min_length=1, alias="projectId")
    project_revision: str = Field(min_length=1, alias="projectRevision")
    goal: str = Field(min_length=1)
    scope: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    acceptance_criteria: list[str] = Field(default_factory=list, alias="acceptanceCriteria")
    workspace: str = Field(min_length=1)
    capabilities: list[str] = Field(min_length=1)
    schedule: dict[str, Any] = Field(default_factory=dict)
    preferences: dict[str, Any] = Field(default_factory=dict)
    memory_ids: list[str] = Field(default_factory=list)
    qa_baseline_ids: list[str] = Field(default_factory=list)
    connectors: list[ConnectorBinding] = Field(default_factory=list)
    provenance: dict[str, str] = Field(default_factory=dict)

    @field_validator("project_id", "project_revision", "goal", "workspace")
    @classmethod
    def validate_identity_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("project identity and goal values must not be empty")
        return value

    @property
    def provisioning_status(self) -> ProvisioningStatus:
        states = {binding.state for binding in self.connectors}
        if "blocked" in states:
            return "blocked"
        if "awaiting_configuration" in states or "planned" in states:
            return "awaiting_configuration"
        return "ready"

    def connector(self, connector_id: str) -> ConnectorBinding:
        for binding in self.connectors:
            if binding.connector_id == connector_id:
                return binding
        raise KeyError(f"Connector not found in project profile: {connector_id}")


class ProjectProvisioningResult(BaseModel):
    profile: ProjectProfile
    missing_connectors: list[str] = Field(default_factory=list)

    @property
    def status(self) -> ProvisioningStatus:
        return self.profile.provisioning_status


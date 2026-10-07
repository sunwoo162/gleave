"""Stable local API contracts for the ISEOL project organization map."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.contracts import EventEnvelope


class MapModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)


class ProjectMapNode(MapModel):
    id: str
    role: str
    title: str
    group: str
    depth: int = Field(default=0, ge=0)
    status: Literal["waiting", "active", "completed", "blocked", "failed", "cancelled", "unavailable"]
    progress: float | None = Field(default=None, ge=0, le=100)
    project_revision: str | None = Field(default=None, alias="projectRevision")
    revision_status: Literal["current", "unavailable"] = Field(default="unavailable", alias="revisionStatus")
    execution_id: str | None = Field(default=None, alias="executionId")
    current_commit: str | None = Field(default=None, alias="currentCommit")
    changed_files: list[str] = Field(default_factory=list, alias="changedFiles")
    claim_latch_receipt_id: str | None = Field(default=None, alias="claimLatchReceiptId")
    claim_latch_status: Literal["PASS", "WARN", "BLOCK", "unavailable"] = Field(default="unavailable", alias="claimLatchStatus")
    qa_report_id: str | None = Field(default=None, alias="qaReportId")
    qa_status: Literal["PASS", "WARN", "BLOCK", "FAIL", "unavailable"] = Field(default="unavailable", alias="qaStatus")
    evidence_ids: list[str] = Field(default_factory=list, alias="evidenceIds")
    evidence_status: Literal["available", "unavailable"] = Field(default="unavailable", alias="evidenceStatus")
    troubleshooting_ids: list[str] = Field(default_factory=list, alias="troubleshootingIds")
    started_at: datetime | None = Field(default=None, alias="startedAt")
    completed_at: datetime | None = Field(default=None, alias="completedAt")
    reason: str | None = None
    alternatives: list[str] = Field(default_factory=list)
    selected_because: str | None = Field(default=None, alias="selectedBecause")
    activity_cursor: int | None = Field(default=None, alias="activityCursor")
    trust_blockers: list[str] = Field(default_factory=list, alias="trustBlockers")


class ProjectMapEdge(MapModel):
    source: str
    target: str
    kind: Literal["contains", "dependency", "handoff"]


class ProjectMapSnapshot(MapModel):
    project_id: str = Field(alias="projectId")
    project_revision: str = Field(alias="projectRevision")
    title: str
    nodes: list[ProjectMapNode]
    edges: list[ProjectMapEdge]
    current_node_ids: list[str] = Field(alias="currentNodeIds")
    cursor: int = Field(ge=0)
    warnings: list[str] = Field(default_factory=list)
    organization_version: int = Field(default=1, alias="organizationVersion")
    activity_cursor: int = Field(default=0, alias="activityCursor")


class ProjectMapEvents(MapModel):
    project_id: str = Field(alias="projectId")
    project_revision: str = Field(alias="projectRevision")
    cursor: int = Field(ge=0)
    events: list[EventEnvelope]

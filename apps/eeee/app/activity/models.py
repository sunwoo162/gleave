from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ActivityEvent(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    cursor: int | None = Field(default=None, ge=1)
    event_type: str = Field(min_length=1, alias="eventType")
    project_id: str = Field(min_length=1, alias="projectId")
    project_revision: str = Field(min_length=1, alias="projectRevision")
    run_id: str | None = Field(default=None, alias="runId")
    node_id: str = Field(min_length=1, alias="nodeId")
    parent_node_id: str | None = Field(default=None, alias="parentNodeId")
    actor_type: Literal["agent", "coordinator", "user", "system"] = Field(alias="actorType")
    actor_id: str = Field(min_length=1, alias="actorId")
    summary: str = Field(min_length=1)
    reason: str = ""
    alternatives: list[str] = Field(default_factory=list)
    selected_because: str = Field(default="", alias="selectedBecause")
    inputs: list[str] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)
    evidence_refs: list[str] = Field(default_factory=list, alias="evidenceRefs")
    status: Literal["waiting", "active", "completed", "blocked", "failed", "cancelled", "incomplete"]
    occurred_at: datetime = Field(alias="occurredAt")


class ActivityPage(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    project_id: str = Field(alias="projectId")
    project_revision: str = Field(alias="projectRevision")
    cursor: int = Field(ge=0)
    events: list[ActivityEvent] = Field(default_factory=list)

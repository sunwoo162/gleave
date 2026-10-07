"""Versioned state and task lease models for coordinated work."""

from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, Field


class AgentTask(BaseModel):
    id: str
    role: str
    state_version: int = Field(ge=0)
    workspace: Path
    owned_paths: list[str]
    status: str
    handoff: dict[str, object] = Field(default_factory=dict)
    # Optional projection metadata keeps old task leases readable. Execution
    # ownership/version semantics remain the coordinator's existing contract.
    title: str | None = None
    project_revision: str | None = None
    parent_task_id: str | None = None
    dependencies: list[str] = Field(default_factory=list)
    progress: float | None = Field(default=None, ge=0, le=100)
    execution_id: str | None = None
    troubleshooting_ids: list[str] = Field(default_factory=list)
    started_at: datetime | None = None
    completed_at: datetime | None = None


class ProjectState(BaseModel):
    version: int = Field(ge=0)
    requirements_hash: str
    current_commit: str | None
    active_tasks: list[AgentTask] = Field(default_factory=list)
    artifacts: list[str] = Field(default_factory=list)
    project_revision: str | None = None

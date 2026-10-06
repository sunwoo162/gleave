"""Versioned state and task lease models for coordinated work."""

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


class ProjectState(BaseModel):
    version: int = Field(ge=0)
    requirements_hash: str
    current_commit: str | None
    active_tasks: list[AgentTask] = Field(default_factory=list)
    artifacts: list[str] = Field(default_factory=list)

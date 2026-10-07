from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


PlanningMode = Literal["deep", "quick"]
PlanningStatus = Literal[
    "draft", "interviewing", "awaiting_approval", "approved", "handed_off", "blocked"
]
PlanningArtifactKind = Literal[
    "project-brief", "requirements", "user-scenarios", "ux-flow", "technical-decisions",
    "data-model", "acceptance-criteria", "qa-plan", "task-dag", "decision-log",
]


class PlanningModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)


class PlanningSession(PlanningModel):
    session_id: str = Field(min_length=1, alias="sessionId")
    project_id: str = Field(min_length=1, alias="projectId")
    project_revision: str = Field(min_length=1, alias="projectRevision")
    mode: PlanningMode
    status: PlanningStatus
    current_question: str | None = Field(default=None, alias="currentQuestion")
    revision: int = Field(default=1, ge=1)
    created_at: datetime | None = Field(default=None, alias="createdAt")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")


class PlanningArtifact(PlanningModel):
    artifact_id: str = Field(min_length=1, alias="artifactId")
    planning_session_id: str = Field(min_length=1, alias="planningSessionId")
    project_id: str = Field(min_length=1, alias="projectId")
    project_revision: str = Field(min_length=1, alias="projectRevision")
    kind: PlanningArtifactKind
    content: dict[str, Any]
    content_hash: str = Field(min_length=1, alias="contentHash")
    created_at: datetime = Field(alias="createdAt")


class PlanningDecision(PlanningModel):
    decision_id: str = Field(min_length=1, alias="decisionId")
    planning_session_id: str = Field(min_length=1, alias="planningSessionId")
    project_id: str = Field(min_length=1, alias="projectId")
    project_revision: str = Field(min_length=1, alias="projectRevision")
    summary: str = Field(min_length=1)
    reason: str = Field(min_length=1)
    alternatives: list[str] = Field(default_factory=list)
    selected_because: str = Field(min_length=1, alias="selectedBecause")
    created_at: datetime = Field(alias="createdAt")


class PlanningHandoff(PlanningModel):
    schema_version: Literal["planning-handoff.v1"] = Field(alias="schemaVersion")
    handoff_id: str = Field(min_length=1, alias="handoffId")
    planning_session_id: str = Field(min_length=1, alias="planningSessionId")
    project_id: str = Field(min_length=1, alias="projectId")
    project_revision: str = Field(min_length=1, alias="projectRevision")
    mode: PlanningMode
    user_intent: str = Field(min_length=1, alias="userIntent")
    requirements: list[str] = Field(min_length=1)
    user_scenarios: list[dict[str, Any]] = Field(default_factory=list, alias="userScenarios")
    ux_flow: list[dict[str, Any]] = Field(default_factory=list, alias="uxFlow")
    technical_decisions: list[dict[str, Any]] = Field(default_factory=list, alias="technicalDecisions")
    data_model: list[dict[str, Any]] = Field(default_factory=list, alias="dataModel")
    acceptance_criteria: list[str] = Field(min_length=1, alias="acceptanceCriteria")
    qa_plan: list[str] = Field(min_length=1, alias="qaPlan")
    task_dag: dict[str, Any]
    design_baseline: str = Field(default="oh-my-design-default", alias="designBaseline")
    rules_snapshot: dict[str, Any] = Field(default_factory=dict, alias="rulesSnapshot")
    artifact_ids: list[str] = Field(default_factory=list, alias="artifactIds")
    evidence_refs: list[str] = Field(default_factory=list, alias="evidenceRefs")
    approval: dict[str, str] | None = None
    created_at: datetime = Field(alias="createdAt")

    @model_validator(mode="after")
    def require_approval_metadata(self) -> PlanningHandoff:
        if self.approval is None or self.approval.get("status") != "approved":
            raise ValueError("planning handoff requires approved metadata")
        if not self.approval.get("actor") or not self.approval.get("timestamp"):
            raise ValueError("planning handoff approval requires actor and timestamp")
        return self

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ContractModel(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        extra="forbid",
        str_strip_whitespace=True,
    )


class ProjectBriefV1(ContractModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    project_id: str = Field(alias="projectId", min_length=1)
    request_id: str = Field(alias="requestId", min_length=1)
    user_goal: str = Field(alias="userGoal", min_length=1)
    scope: list[str]
    constraints: list[str]
    preferences: dict[str, Any]
    schedule: dict[str, Any]
    retrieved_memory_ids: list[str] = Field(alias="retrievedMemoryIds")
    qa_baseline_ids: list[str] = Field(alias="qaBaselineIds")
    created_at: datetime = Field(alias="createdAt")


ProjectStatus = Literal["planned", "running", "completed", "blocked", "failed", "cancelled"]
VerificationDecision = Literal["PASS", "WARN", "BLOCK"]
PromotionState = Literal["candidate", "active", "superseded", "revoked"]


class ProjectOutcomeReportV1(ContractModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    project_id: str = Field(alias="projectId", min_length=1)
    request_id: str = Field(alias="requestId", min_length=1)
    project_revision: str = Field(alias="projectRevision", min_length=1)
    status: ProjectStatus
    artifacts: list[dict[str, Any]]
    agent_teams: list[dict[str, Any]] = Field(alias="agentTeams")
    handoffs: list[dict[str, Any]]
    deterministic_verification: dict[str, Any] = Field(alias="deterministicVerification")
    qa_report: dict[str, Any] = Field(alias="qaReport")
    claim_latch_reports: list[dict[str, Any]] = Field(alias="claimLatchReports")
    receipts: list[dict[str, Any]]
    risks: list[dict[str, Any]]
    memory_candidates: list[dict[str, Any]] = Field(alias="memoryCandidates")
    created_at: datetime = Field(alias="createdAt")


class VerificationEnvelopeV1(ContractModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    subject_id: str = Field(alias="subjectId", min_length=1)
    project_id: str = Field(alias="projectId", min_length=1)
    project_revision: str = Field(alias="projectRevision", min_length=1)
    subject_type: str = Field(alias="subjectType", min_length=1)
    claims: list[dict[str, Any]]
    evidence: list[dict[str, Any]]
    deterministic_checks: list[dict[str, Any]] = Field(alias="deterministicChecks")
    decision: VerificationDecision
    claim_latch_report_id: str = Field(alias="claimLatchReportId", min_length=1)
    receipt_id: str | None = Field(alias="receiptId", default=None)
    created_at: datetime = Field(alias="createdAt")


MemoryKind = Literal[
    "success_pattern",
    "failure_pattern",
    "qa_rule",
    "regression_rule",
    "agent_routing_hint",
    "playbook",
]


class MemoryCandidateV1(ContractModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    candidate_id: str = Field(alias="candidateId", min_length=1)
    kind: MemoryKind
    content: str = Field(min_length=1)
    scope: dict[str, Any]
    source_project_id: str = Field(alias="sourceProjectId", min_length=1)
    source_artifact_ids: list[str] = Field(alias="sourceArtifactIds", min_length=1)
    evidence_ids: list[str] = Field(alias="evidenceIds", min_length=1)
    verification_ids: list[str] = Field(alias="verificationIds", min_length=1)
    confidence: float = Field(ge=0, le=1)
    promotion_state: PromotionState = Field(alias="promotionState")
    created_at: datetime = Field(alias="createdAt")

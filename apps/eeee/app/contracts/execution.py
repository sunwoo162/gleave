"""One immutable record for every capability and tool invocation."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime, timezone
from enum import Enum
from math import isfinite
from types import MappingProxyType
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator, model_validator


def _freeze_json(value: Any) -> Any:
    """Copy JSON-shaped data into immutable containers for audit records."""
    if isinstance(value, Mapping):
        if any(not isinstance(key, str) for key in value):
            raise ValueError("JSON object keys must be strings")
        return MappingProxyType({key: _freeze_json(item) for key, item in value.items()})
    if isinstance(value, (list, tuple)):
        return tuple(_freeze_json(item) for item in value)
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float) and isfinite(value):
        return value
    raise ValueError(f"Execution data is not JSON-compatible: {type(value).__name__}")


def _thaw_json(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {key: _thaw_json(item) for key, item in value.items()}
    if isinstance(value, tuple):
        return [_thaw_json(item) for item in value]
    return value


class ExecutionStatus(str, Enum):
    QUEUED = "queued"
    AWAITING_APPROVAL = "awaiting_approval"
    RUNNING = "running"
    COMPLETED = "completed"
    BLOCKED = "blocked"
    FAILED = "failed"
    CANCELLED = "cancelled"


class SideEffectLevel(str, Enum):
    NONE = "none"
    LOCAL = "local"
    EXTERNAL = "external"


class ApprovalState(str, Enum):
    NOT_REQUIRED = "not_required"
    AWAITING_APPROVAL = "awaiting_approval"
    APPROVED = "approved"
    DENIED = "denied"


class ExecutionError(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    code: str = Field(min_length=1)
    message: str = Field(min_length=1)
    retryable: bool = False

    @field_validator("code", "message")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip() or value != value.strip():
            raise ValueError("error fields must be nonblank and unpadded")
        return value


_ALLOWED_TRANSITIONS: dict[ExecutionStatus, frozenset[ExecutionStatus]] = {
    ExecutionStatus.QUEUED: frozenset(
        {ExecutionStatus.AWAITING_APPROVAL, ExecutionStatus.RUNNING, ExecutionStatus.BLOCKED, ExecutionStatus.CANCELLED}
    ),
    ExecutionStatus.AWAITING_APPROVAL: frozenset(
        {ExecutionStatus.RUNNING, ExecutionStatus.BLOCKED, ExecutionStatus.CANCELLED}
    ),
    ExecutionStatus.RUNNING: frozenset(
        {ExecutionStatus.COMPLETED, ExecutionStatus.BLOCKED, ExecutionStatus.FAILED, ExecutionStatus.CANCELLED}
    ),
    ExecutionStatus.COMPLETED: frozenset(),
    ExecutionStatus.BLOCKED: frozenset(),
    ExecutionStatus.FAILED: frozenset(),
    ExecutionStatus.CANCELLED: frozenset(),
}
_TERMINAL = frozenset(
    {ExecutionStatus.COMPLETED, ExecutionStatus.BLOCKED, ExecutionStatus.FAILED, ExecutionStatus.CANCELLED}
)


class ExecutionEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    execution_id: str = Field(min_length=1, alias="executionId")
    request_id: str = Field(min_length=1, alias="requestId")
    project_id: str | None = Field(default=None, min_length=1, alias="projectId")
    project_revision: str | None = Field(default=None, min_length=1, alias="projectRevision")
    capability_id: str = Field(min_length=1, alias="capabilityId")
    tool_id: str = Field(min_length=1, alias="toolId")
    actor: str = Field(min_length=1)
    input_schema_version: str = Field(default="1", min_length=1, alias="inputSchemaVersion")
    input: Mapping[str, Any] = Field(default_factory=dict)
    status: ExecutionStatus = ExecutionStatus.QUEUED
    output: Mapping[str, Any] | None = None
    side_effect_level: SideEffectLevel = Field(default=SideEffectLevel.NONE, alias="sideEffectLevel")
    required_approval: bool = Field(default=False, alias="requiredApproval")
    approval_state: ApprovalState = Field(default=ApprovalState.NOT_REQUIRED, alias="approvalState")
    evidence_ids: tuple[str, ...] = Field(default_factory=tuple, alias="evidenceIds")
    claim_latch_receipt_id: str | None = Field(default=None, min_length=1, alias="claimLatchReceiptId")
    qa_report_id: str | None = Field(default=None, min_length=1, alias="qaReportId")
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), alias="startedAt")
    completed_at: datetime | None = Field(default=None, alias="completedAt")
    error: ExecutionError | None = None

    @field_validator(
        "execution_id", "request_id", "project_id", "project_revision", "capability_id", "tool_id",
        "actor", "input_schema_version", "claim_latch_receipt_id", "qa_report_id"
    )
    @classmethod
    def nonblank_identity(cls, value: str | None) -> str | None:
        if value is not None and (not value.strip() or value != value.strip()):
            raise ValueError("identity values must be nonblank and unpadded")
        return value

    @field_validator("evidence_ids")
    @classmethod
    def nonblank_evidence_ids(cls, values: tuple[str, ...]) -> tuple[str, ...]:
        if any(not item.strip() or item != item.strip() for item in values):
            raise ValueError("evidence IDs must be nonblank and unpadded")
        return values

    @model_validator(mode="after")
    def validate_identity_and_lifecycle(self) -> ExecutionEnvelope:
        if (self.project_id is None) != (self.project_revision is None):
            raise ValueError("project ID and revision must be supplied together")
        if self.completed_at is not None and self.completed_at < self.started_at:
            raise ValueError("completion precedes execution start")
        if self.status in _TERMINAL and self.completed_at is None:
            raise ValueError("terminal execution requires completedAt")
        if self.status not in _TERMINAL and self.completed_at is not None:
            raise ValueError("nonterminal execution cannot have completedAt")
        if self.status == ExecutionStatus.COMPLETED and self.output is None:
            raise ValueError("completed execution requires structured output")
        if self.status == ExecutionStatus.FAILED and self.error is None:
            raise ValueError("failed execution requires structured error")
        if not self.required_approval and self.approval_state != ApprovalState.NOT_REQUIRED:
            raise ValueError("approval state requires requiredApproval")
        if self.required_approval and self.approval_state == ApprovalState.NOT_REQUIRED:
            raise ValueError("required approval needs an explicit state")
        if self.status == ExecutionStatus.AWAITING_APPROVAL and self.approval_state != ApprovalState.AWAITING_APPROVAL:
            raise ValueError("awaiting execution requires awaiting approval")
        if self.required_approval and self.status in {ExecutionStatus.RUNNING, ExecutionStatus.COMPLETED}:
            if self.approval_state != ApprovalState.APPROVED:
                raise ValueError("running or completed execution requires approval")
        object.__setattr__(self, "input", _freeze_json(self.input))
        if self.output is not None:
            object.__setattr__(self, "output", _freeze_json(self.output))
        return self

    @field_serializer("input", "output")
    def serialize_json_data(self, value: Mapping[str, Any] | None) -> Any:
        return None if value is None else _thaw_json(value)

    def transition(
        self,
        status: ExecutionStatus,
        *,
        at: datetime | None = None,
        output: dict[str, Any] | None = None,
        error: ExecutionError | None = None,
        approval_state: ApprovalState | None = None,
    ) -> ExecutionEnvelope:
        """Return a validated next state without mutating the prior audit record."""
        target = ExecutionStatus(status)
        if target not in _ALLOWED_TRANSITIONS[self.status]:
            raise ValueError(f"Invalid execution status transition: {self.status.value} -> {target.value}")
        next_approval = approval_state if approval_state is not None else self.approval_state
        if self.required_approval and target in {ExecutionStatus.RUNNING, ExecutionStatus.COMPLETED}:
            if next_approval != ApprovalState.APPROVED:
                raise ValueError("Execution cannot run without approval")
        timestamp = at or datetime.now(timezone.utc)
        values = self.model_dump()
        values.update(
            status=target,
            output=output,
            error=error,
            completed_at=timestamp if target in _TERMINAL else None,
        )
        values["approval_state"] = next_approval
        return ExecutionEnvelope.model_validate(values)

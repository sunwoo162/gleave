"""Transport-neutral contracts shared by built-in and external capabilities."""

from app.contracts.events import EventEnvelope, LocalEventBus
from app.contracts.execution import ApprovalState, ExecutionEnvelope, ExecutionError, ExecutionStatus, SideEffectLevel
from app.contracts.permissions import (
    PermissionDecision,
    PermissionDecisionStatus,
    PermissionRequest,
    PermissionScope,
)

__all__ = [
    "ApprovalState",
    "EventEnvelope",
    "ExecutionEnvelope",
    "ExecutionError",
    "ExecutionStatus",
    "LocalEventBus",
    "PermissionDecision",
    "PermissionDecisionStatus",
    "PermissionRequest",
    "PermissionScope",
    "SideEffectLevel",
]

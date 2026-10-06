"""Per-action scope and explicit approval decisions."""

from __future__ import annotations

from enum import Enum
from typing import Iterable

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.contracts.execution import SideEffectLevel


class PermissionDecisionStatus(str, Enum):
    ALLOWED = "allowed"
    DENIED = "denied"
    APPROVAL_REQUIRED = "approval_required"


class PermissionScope(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    id: str = Field(min_length=1)
    description: str = Field(min_length=1)
    side_effect_level: SideEffectLevel = Field(alias="sideEffectLevel")

    @field_validator("id", "description")
    @classmethod
    def nonblank_text(cls, value: str) -> str:
        if not value.strip() or value != value.strip():
            raise ValueError("permission scope text must be nonblank and unpadded")
        return value


class PermissionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    action_id: str = Field(min_length=1, alias="actionId")
    scopes: list[PermissionScope] = Field(default_factory=list)
    requires_approval: bool = Field(default=False, alias="requiresApproval")

    @field_validator("action_id")
    @classmethod
    def nonblank_action(cls, value: str) -> str:
        if not value.strip() or value != value.strip():
            raise ValueError("action ID must be nonblank and unpadded")
        return value

    @field_validator("scopes")
    @classmethod
    def unique_scopes(cls, scopes: list[PermissionScope]) -> list[PermissionScope]:
        ids = [scope.id for scope in scopes]
        if len(set(ids)) != len(ids):
            raise ValueError("duplicate permission scopes")
        return scopes


class PermissionDecision(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    action_id: str = Field(min_length=1, alias="actionId")
    status: PermissionDecisionStatus
    granted_scope_ids: list[str] = Field(default_factory=list, alias="grantedScopeIds")
    missing_scope_ids: list[str] = Field(default_factory=list, alias="missingScopeIds")
    user_approved: bool = Field(default=False, alias="userApproved")
    reason: str = Field(min_length=1)

    @classmethod
    def evaluate(
        cls,
        request: PermissionRequest,
        *,
        granted_scope_ids: Iterable[str],
        user_approved: bool,
    ) -> PermissionDecision:
        granted = set(granted_scope_ids)
        requested_ids = [scope.id for scope in request.scopes]
        missing = [scope_id for scope_id in requested_ids if scope_id not in granted]
        if missing:
            status = PermissionDecisionStatus.DENIED
            reason = "Required permission scope is not granted"
        elif request.requires_approval and not user_approved:
            status = PermissionDecisionStatus.APPROVAL_REQUIRED
            reason = "User approval is required"
        else:
            status = PermissionDecisionStatus.ALLOWED
            reason = "Requested scopes and approval are satisfied"
        return cls(
            action_id=request.action_id,
            status=status,
            granted_scope_ids=[scope_id for scope_id in requested_ids if scope_id in granted],
            missing_scope_ids=missing,
            user_approved=user_approved,
            reason=reason,
        )

    def authorizes(self, request: PermissionRequest) -> bool:
        return (
            self.status == PermissionDecisionStatus.ALLOWED
            and self.action_id == request.action_id
            and (not request.requires_approval or self.user_approved)
            and all(scope.id in self.granted_scope_ids for scope in request.scopes)
        )

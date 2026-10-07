import pytest
from pydantic import ValidationError

from app.contracts.permissions import (
    PermissionDecision,
    PermissionDecisionStatus,
    PermissionRequest,
    PermissionScope,
)


def test_missing_scope_is_denied_even_when_user_approved_action() -> None:
    request = PermissionRequest(
        action_id="calendar.write",
        scopes=[PermissionScope(id="calendar.events.write", description="Create events", side_effect_level="external")],
        requires_approval=True,
    )

    denied = PermissionDecision.evaluate(request, granted_scope_ids=set(), user_approved=True)
    assert denied.status is PermissionDecisionStatus.DENIED
    assert denied.authorizes(request) is False
    assert denied.missing_scope_ids == ["calendar.events.write"]


def test_approval_required_then_allowed_when_scope_and_approval_present() -> None:
    request = PermissionRequest(
        action_id="calendar.write",
        scopes=[PermissionScope(id="calendar.events.write", description="Create events", side_effect_level="external")],
        requires_approval=True,
    )

    pending = PermissionDecision.evaluate(
        request, granted_scope_ids={"calendar.events.write"}, user_approved=False
    )
    assert pending.status is PermissionDecisionStatus.APPROVAL_REQUIRED
    assert pending.authorizes(request) is False

    allowed = PermissionDecision.evaluate(
        request, granted_scope_ids={"calendar.events.write"}, user_approved=True
    )
    assert allowed.status is PermissionDecisionStatus.ALLOWED
    assert allowed.authorizes(request) is True
    assert allowed.model_dump(mode="json", by_alias=True)["grantedScopeIds"] == ["calendar.events.write"]


def test_decision_cannot_authorize_another_action_or_more_scopes() -> None:
    read_scope = PermissionScope(id="calendar.events.read", description="Read events", side_effect_level="external")
    write_scope = PermissionScope(id="calendar.events.write", description="Write events", side_effect_level="external")
    granted = PermissionDecision.evaluate(
        PermissionRequest(action_id="calendar.read", scopes=[read_scope]),
        granted_scope_ids={"calendar.events.read"},
        user_approved=False,
    )

    assert granted.authorizes(PermissionRequest(action_id="calendar.write", scopes=[read_scope])) is False
    assert granted.authorizes(PermissionRequest(action_id="calendar.read", scopes=[read_scope, write_scope])) is False
    assert granted.authorizes(
        PermissionRequest(action_id="calendar.read", scopes=[read_scope], requires_approval=True)
    ) is False


def test_scope_and_action_ids_reject_whitespace_and_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        PermissionScope(id=" ", description="Read", side_effect_level="none")
    with pytest.raises(ValidationError):
        PermissionScope(id="calendar.read", description="Read", side_effect_level="none", privileged=True)
    with pytest.raises(ValidationError):
        PermissionRequest(action_id=" padded ", scopes=[])

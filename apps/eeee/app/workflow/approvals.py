"""Candidate-selection approval and action permission requirements."""

import re
from typing import Literal

from app.domain.errors import (
    AlreadyApprovedError,
    ApprovalError,
    CandidateSetChangedError,
    InsufficientCandidatesError,
    UnknownCandidateError,
)
from app.domain.models import Decision
from app.storage.sqlite import SQLiteStore


PermissionLevel = Literal["read", "workspace_write", "command", "network", "external"]


class ApprovalService:
    def __init__(self, store: SQLiteStore):
        self.store = store

    def get_decision(self, decision_id: str) -> Decision | None:
        return self.store.get_decision(decision_id)

    def approve_decision(self, decision_id: str, selected: list[str]) -> Decision:
        """Approve a selection from at least two persisted candidates."""
        existing = self.store.get_decision(decision_id)
        if existing and existing.approved:
            raise AlreadyApprovedError(f"Decision already approved: {decision_id}")
        candidates = self.store.get_candidates(decision_id)
        names = list(dict.fromkeys(candidate.repository.full_name for candidate in candidates))
        if len(names) < 2:
            raise InsufficientCandidatesError("At least two distinct candidates must be compared")
        if not selected or len(selected) != len(set(selected)) or any(name not in names for name in selected):
            raise UnknownCandidateError("Selection must contain distinct compared candidates")
        decision = Decision(
            request_id=decision_id,
            selected=list(selected),
            alternatives=[name for name in names if name not in selected],
            approved=True,
            notes="",
        )
        if not self.store.save_approval_once(
            decision, {"action": "approved", "selected": list(selected)}, candidates
        ):
            raise AlreadyApprovedError(f"Decision already approved: {decision_id}")
        return decision

    @staticmethod
    def requirement_for(action: str) -> PermissionLevel:
        """Return the least permissive applicable level; unfamiliar actions fail closed."""
        name = action.strip().lower()
        levels = [ApprovalService._requirement_for_clause(clause) for clause in re.split(r"\band\b", name)]
        if not levels or any(level is None for level in levels):
            return "external"
        priority = {"read": 0, "workspace_write": 1, "command": 2, "network": 3, "external": 4}
        return max(levels, key=lambda level: priority[level])

    @staticmethod
    def _requirement_for_clause(action: str) -> PermissionLevel | None:
        if re.search(r"\b(?:delete|remove|rm|push|deploy|publish|message|email|send|transfer|upload|purchase|restart|system.wide|global)\b", action):
            return "external"
        if re.search(r"\b(?:install|clone|github|research|fetch|download|network|http|internet|curl|wget)\b", action):
            return "network"
        if re.search(r"\b(?:test|tests|build|lint|check|execute|run)\b", action):
            return "command"
        if re.search(r"\b(?:edit|write|create|modify|patch)\b", action):
            return "workspace_write"
        if re.search(r"\b(?:inspect|read|list|view)\b", action):
            return "read"
        return None

"""Deterministic acceptance checks before ClaimLatch handoff."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.agent.protocol import AgentResult
from app.iseol.agents import AgentNode


class AcceptanceDecision(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    decision: Literal["PASS", "BLOCK"]
    reason: str = Field(min_length=1)
    gaps: list[str] = Field(default_factory=list)


class AcceptanceEvaluator:
    """Check objective handoff prerequisites without relying on LLM judgment."""

    _implementation_roles = {"frontend", "backend", "data", "test", "review", "integration"}

    def evaluate(
        self, node: AgentNode, result: AgentResult, *, evidence_ids: list[str]
    ) -> AcceptanceDecision:
        gaps: list[str] = []
        if not result.summary.strip():
            gaps.append("summary is missing")
        if not evidence_ids:
            gaps.append("evidence is missing")
        if node.role in self._implementation_roles and not result.changed_files:
            gaps.append("changed files are missing")
        if node.role in {"test", "review", "integration"} and not result.test_commands:
            gaps.append("test commands are missing")
        if gaps:
            return AcceptanceDecision(
                decision="BLOCK",
                reason=f"Acceptance criteria are incomplete for {node.id}",
                gaps=gaps,
            )
        return AcceptanceDecision(
            decision="PASS",
            reason=f"Objective handoff prerequisites passed for {node.id}",
        )

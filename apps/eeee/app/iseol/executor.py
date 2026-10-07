"""Sequential, dependency-aware execution of the ISEOL specialist graph."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.agent.protocol import AgentRequest, AgentRuntime
from app.contracts import ExecutionEnvelope
from app.iseol.agents import AgentGraph, AgentNode
from app.trust.pipeline import TrustPipeline


RunStatus = Literal["completed", "blocked", "failed"]
NodeStatus = Literal["passed", "blocked", "failed"]


class AgentExecutionRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    agent_id: str = Field(alias="agentId")
    task_id: str = Field(alias="taskId")
    role: str
    status: NodeStatus
    summary: str
    changed_files: list[str] = Field(default_factory=list, alias="changedFiles")
    evidence_ids: list[str] = Field(default_factory=list, alias="evidenceIds")
    claim_latch_decision: str = Field(alias="claimLatchDecision")
    reason: str
    started_at: datetime = Field(alias="startedAt")
    completed_at: datetime = Field(alias="completedAt")


class AgentExecutionReport(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    graph_version: str = Field(alias="graphVersion")
    status: RunStatus
    agents: list[AgentExecutionRecord]

    def by_id(self, agent_id: str) -> AgentExecutionRecord:
        for agent in self.agents:
            if agent.agent_id == agent_id:
                return agent
        raise KeyError(f"Agent execution not found: {agent_id}")


class AgentGraphExecutor:
    """Run specialist nodes and enforce ClaimLatch before every handoff."""

    def __init__(
        self,
        *,
        runtime: AgentRuntime,
        trust_pipeline: TrustPipeline,
        workspace: Path,
    ) -> None:
        self.runtime = runtime
        self.trust_pipeline = trust_pipeline
        self.workspace = workspace

    def execute(self, graph: AgentGraph, envelope: ExecutionEnvelope) -> AgentExecutionReport:
        records: list[AgentExecutionRecord] = []
        completed_ids: set[str] = set()
        blocked_ids: set[str] = set()
        failed = False

        for node in graph.agents:
            started = datetime.now(timezone.utc)
            if any(dependency in blocked_ids or dependency not in completed_ids for dependency in node.dependencies):
                blocked_ids.add(node.id)
                records.append(self._blocked(node, started, "A dependency did not produce a verified handoff"))
                continue

            result = self.runtime.run(
                AgentRequest(
                    prompt=(
                        f"You are ISEOL agent role={node.role} agentId={node.id} "
                        f"taskId={node.task_id}. Goal: {node.goal}"
                    ),
                    workspace=self.workspace,
                    allowed_actions=list(node.allowed_tools),
                    run_id=f"{envelope.execution_id}:{node.id}",
                )
            )
            evidence_ids = [
                str(event["evidenceId"])
                for event in result.events
                if isinstance(event, dict) and isinstance(event.get("evidenceId"), str)
            ]
            if result.status != "completed":
                failed = True
                failed_record = AgentExecutionRecord(
                    agentId=node.id, taskId=node.task_id, role=node.role, status="failed",
                    summary=result.summary, changedFiles=list(result.changed_files),
                    evidenceIds=evidence_ids, claimLatchDecision="NOT_RUN",
                    reason=result.error or "Agent runtime did not complete",
                    startedAt=started, completedAt=datetime.now(timezone.utc),
                )
                records.append(failed_record)
                blocked_ids.add(node.id)
                continue

            child = envelope.model_copy(update={
                "execution_id": f"{envelope.execution_id}:{node.id}",
                "capability_id": f"iseol.agent.{node.id}",
                "evidence_ids": tuple(evidence_ids),
            })
            trust = self.trust_pipeline.verify_agent_result(
                child, agent_id=node.id, role=node.role, summary=result.summary,
                evidence_ids=evidence_ids, changed_files=list(result.changed_files),
            )
            if trust.decision != "PASS":
                blocked_ids.add(node.id)
                records.append(AgentExecutionRecord(
                    agentId=node.id, taskId=node.task_id, role=node.role, status="blocked",
                    summary=result.summary, changedFiles=list(result.changed_files),
                    evidenceIds=evidence_ids, claimLatchDecision=trust.decision,
                    reason=trust.reason, startedAt=started, completedAt=datetime.now(timezone.utc),
                ))
                continue

            completed_ids.add(node.id)
            records.append(AgentExecutionRecord(
                agentId=node.id, taskId=node.task_id, role=node.role, status="passed",
                summary=result.summary, changedFiles=list(result.changed_files),
                evidenceIds=evidence_ids, claimLatchDecision=trust.decision,
                reason=trust.reason, startedAt=started, completedAt=datetime.now(timezone.utc),
            ))

        status: RunStatus = "failed" if failed else (
            "completed" if len(completed_ids) == len(graph.agents) else "blocked"
        )
        return AgentExecutionReport(
            graphVersion=graph.schema_version, status=status, agents=records
        )

    @staticmethod
    def _blocked(node: AgentNode, started: datetime, reason: str) -> AgentExecutionRecord:
        return AgentExecutionRecord(
            agentId=node.id, taskId=node.task_id, role=node.role, status="blocked",
            summary="Agent was not started", claimLatchDecision="NOT_RUN", reason=reason,
            startedAt=started, completedAt=datetime.now(timezone.utc),
        )

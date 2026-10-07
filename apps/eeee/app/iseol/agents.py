"""Concrete ISEOL agent graph contracts.

The graph is deliberately provider-neutral: a node is an executable role with
an explicit dependency and handoff boundary, not merely a label in a report.
The runtime adapter may use a hosted model, a local model, or a deterministic
worker, but it must return the same evidence-bearing contract.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


AgentStatus = Literal["pending", "ready", "running", "passed", "warn", "blocked", "failed"]


class AgentNode(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    id: str = Field(min_length=1)
    task_id: str = Field(alias="taskId", min_length=1)
    role: str = Field(min_length=1)
    title: str = Field(min_length=1)
    goal: str = Field(min_length=1)
    dependencies: list[str] = Field(default_factory=list)
    allowed_tools: list[str] = Field(default_factory=list, alias="allowedTools")
    execution_policy: Literal["claimlatch_before_handoff"] = Field(
        default="claimlatch_before_handoff", alias="executionPolicy"
    )
    status: AgentStatus = "pending"


class AgentGraph(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    schema_version: Literal["iseol-agent-graph.v1"] = Field(alias="schemaVersion")
    goal: str = Field(min_length=1)
    agents: list[AgentNode] = Field(min_length=1)

    @property
    def task_ids(self) -> list[str]:
        return [agent.task_id for agent in self.agents]

    def by_id(self, agent_id: str) -> AgentNode:
        for agent in self.agents:
            if agent.id == agent_id:
                return agent
        raise KeyError(f"Agent not found: {agent_id}")


class AgentTeamFactory:
    """Build the default specialist team for a software project."""

    @staticmethod
    def default_graph(goal: str) -> AgentGraph:
        return AgentGraph(
            schemaVersion="iseol-agent-graph.v1",
            goal=goal,
            agents=[
                AgentNode(id="requirements", taskId="requirements", role="requirements", title="Requirements Agent", goal="확정 요구사항과 완료 조건을 만든다.", allowedTools=["workspace.read", "memory.search"]),
                AgentNode(id="design", taskId="design", role="design", title="Design Agent", goal="디자인 시스템과 화면 구조를 결정한다.", dependencies=["requirements"], allowedTools=["workspace.read", "workspace.write"]),
                AgentNode(id="frontend", taskId="frontend", role="frontend", title="Frontend Agent", goal="사용자 인터페이스와 반응형 동작을 구현한다.", dependencies=["requirements", "design"], allowedTools=["workspace.read", "workspace.write", "command.test"]),
                AgentNode(id="backend", taskId="backend", role="backend", title="Backend Agent", goal="도메인 로직과 API를 구현한다.", dependencies=["requirements"], allowedTools=["workspace.read", "workspace.write", "command.test"]),
                AgentNode(id="data", taskId="data", role="data", title="Data Agent", goal="데이터 모델과 영속 저장을 구현한다.", dependencies=["requirements", "backend"], allowedTools=["workspace.read", "workspace.write", "command.test"]),
                AgentNode(id="test", taskId="test", role="test", title="Test Agent", goal="단위·통합·E2E·반응형 검증을 작성하고 실행한다.", dependencies=["frontend", "backend", "data"], allowedTools=["workspace.read", "workspace.write", "command.test"]),
                AgentNode(id="review", taskId="review", role="review", title="Review Agent", goal="코드 품질·보안·구조·인코딩을 독립 검토한다.", dependencies=["frontend", "backend", "data"], allowedTools=["workspace.read", "command.test"]),
                AgentNode(id="integration", taskId="integration", role="integration", title="Integration Agent", goal="검증된 결과를 통합하고 릴리스 산출물을 만든다.", dependencies=["test", "review"], allowedTools=["workspace.read", "command.test", "workspace.write"]),
            ],
        )

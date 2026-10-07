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
    acceptance_criteria: list[str] = Field(default_factory=list, alias="acceptanceCriteria")
    system_prompt: str = Field(default="", alias="systemPrompt")
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
                AgentNode(id="requirements", taskId="requirements", role="requirements", title="Requirements Agent", goal="확정 요구사항과 완료 조건을 만든다.", acceptanceCriteria=["요구사항과 비기능 제약이 명시됨", "검증 가능한 완료 조건이 있음"], systemPrompt="제품 요구사항 분석가로서 모호한 요구를 검증 가능한 조건으로 바꿔라.", allowedTools=["workspace.read", "memory.search"]),
                AgentNode(id="design", taskId="design", role="design", title="Design Agent", goal="디자인 시스템과 화면 구조를 결정한다.", acceptanceCriteria=["화면 상태와 반응형 규칙이 정의됨", "기본 디자인 토큰을 따름"], systemPrompt="제품 디자이너로서 접근성·반응형·상태 화면까지 설계하라.", dependencies=["requirements"], allowedTools=["workspace.read", "workspace.write"]),
                AgentNode(id="frontend", taskId="frontend", role="frontend", title="Frontend Agent", goal="사용자 인터페이스와 반응형 동작을 구현한다.", acceptanceCriteria=["핵심 사용자 흐름이 동작함", "모바일·데스크톱 레이아웃이 검증됨"], systemPrompt="시니어 프론트엔드 엔지니어로서 유지보수 가능한 FSD 구조와 접근성 UI를 구현하라.", dependencies=["requirements", "design"], allowedTools=["workspace.read", "workspace.write", "command.test"]),
                AgentNode(id="backend", taskId="backend", role="backend", title="Backend Agent", goal="도메인 로직과 API를 구현한다.", acceptanceCriteria=["도메인 규칙이 테스트됨", "실패 응답과 입력 검증이 있음"], systemPrompt="시니어 백엔드 엔지니어로서 도메인 경계와 오류 처리를 명확히 구현하라.", dependencies=["requirements"], allowedTools=["workspace.read", "workspace.write", "command.test"]),
                AgentNode(id="data", taskId="data", role="data", title="Data Agent", goal="데이터 모델과 영속 저장을 구현한다.", acceptanceCriteria=["데이터 모델과 마이그레이션이 있음", "새로고침 후 데이터가 보존됨"], systemPrompt="데이터 엔지니어로서 데이터 무결성·영속성·마이그레이션을 검증하라.", dependencies=["requirements", "backend"], allowedTools=["workspace.read", "workspace.write", "command.test"]),
                AgentNode(id="test", taskId="test", role="test", title="Test Agent", goal="단위·통합·E2E·반응형 검증을 작성하고 실행한다.", acceptanceCriteria=["핵심 흐름의 자동 테스트가 있음", "회귀·반응형 검증 결과가 증거로 남음"], systemPrompt="독립 테스트 엔지니어로서 사용자 시나리오와 실패 경로를 먼저 검증하라.", dependencies=["frontend", "backend", "data"], allowedTools=["workspace.read", "workspace.write", "command.test"]),
                AgentNode(id="review", taskId="review", role="review", title="Review Agent", goal="코드 품질·보안·구조·인코딩을 독립 검토한다.", acceptanceCriteria=["보안·인코딩·구조 검토가 완료됨", "차단 이슈가 해결되거나 명시됨"], systemPrompt="신선한 컨텍스트의 엄격한 코드 리뷰어로서 구현자의 주장과 실제 diff를 대조하라.", dependencies=["frontend", "backend", "data"], allowedTools=["workspace.read", "command.test"]),
                AgentNode(id="integration", taskId="integration", role="integration", title="Integration Agent", goal="검증된 결과를 통합하고 릴리스 산출물을 만든다.", acceptanceCriteria=["전체 빌드와 릴리스 산출물이 생성됨", "모든 선행 검증이 PASS임"], systemPrompt="릴리스 엔지니어로서 검증된 산출물만 통합하고 재현 가능한 실행 절차를 남겨라.", dependencies=["test", "review"], allowedTools=["workspace.read", "command.test", "workspace.write"]),
            ],
        )

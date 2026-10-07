from pathlib import Path

from app.agent.protocol import AgentResult
from app.contracts import ExecutionEnvelope, ExecutionStatus
from app.iseol.agents import AgentTeamFactory
from app.iseol.executor import AgentGraphExecutor
from app.trust.pipeline import TrustPipelineDecision


class RecordingRuntime:
    def __init__(self, *, fail_agent: str | None = None):
        self.calls: list[str] = []
        self.fail_agent = fail_agent

    def run(self, request):
        agent_id = request.prompt.split("agentId=")[1].split()[0]
        self.calls.append(agent_id)
        if agent_id == self.fail_agent:
            return AgentResult("failed", f"{agent_id} failed", [], [], [], "failed")
        return AgentResult(
            "completed", f"{agent_id} completed", [{"evidenceId": f"evidence-{agent_id}"}],
            [f"src/{agent_id}.py"], [f"pytest tests/{agent_id}"], None,
        )


class PassingTrust:
    def __init__(self, blocked_agent: str | None = None):
        self.blocked_agent = blocked_agent
        self.calls: list[str] = []

    def verify_agent_result(self, envelope, *, agent_id, role, summary, evidence_ids, changed_files):
        self.calls.append(agent_id)
        decision = "BLOCKED" if agent_id == self.blocked_agent else "PASS"
        return TrustPipelineDecision(
            decision=decision,
            reason="blocked for test" if decision == "BLOCKED" else "verified",
            project_id=envelope.project_id,
            project_revision=envelope.project_revision,
            subject_id=envelope.execution_id,
            evidence_ids=list(evidence_ids),
        )


def _envelope() -> ExecutionEnvelope:
    return ExecutionEnvelope(
        execution_id="run-1", request_id="request-1", project_id="project-1",
        project_revision="rev-1", capability_id="project-execution", tool_id="iseol",
        actor="ISEOL", status=ExecutionStatus.RUNNING,
    )


def test_executor_runs_only_ready_nodes_and_verifies_every_handoff(tmp_path):
    runtime = RecordingRuntime()
    trust = PassingTrust()
    executor = AgentGraphExecutor(runtime=runtime, trust_pipeline=trust, workspace=Path(tmp_path))

    report = executor.execute(AgentTeamFactory.default_graph("Todo 앱"), _envelope())

    assert report.status == "completed"
    assert set(runtime.calls) == {"requirements", "design", "frontend", "backend", "data", "test", "review", "integration"}
    assert set(trust.calls) == set(runtime.calls)
    assert all(item.status == "passed" for item in report.agents)


def test_executor_blocks_dependents_after_failed_or_untrusted_handoff(tmp_path):
    runtime = RecordingRuntime()
    trust = PassingTrust(blocked_agent="frontend")
    executor = AgentGraphExecutor(runtime=runtime, trust_pipeline=trust, workspace=Path(tmp_path))

    report = executor.execute(AgentTeamFactory.default_graph("Todo 앱"), _envelope())

    assert report.status == "blocked"
    assert "frontend" in runtime.calls
    assert "test" not in runtime.calls
    assert "integration" not in runtime.calls
    assert report.by_id("frontend").status == "blocked"
    assert report.by_id("test").status == "blocked"

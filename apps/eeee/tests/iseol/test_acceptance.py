from app.agent.protocol import AgentResult
from app.iseol.agents import AgentNode
from app.iseol.evaluator import AcceptanceEvaluator


def test_acceptance_evaluator_requires_evidence_and_artifacts_for_implementation():
    node = AgentNode(
        id="frontend", taskId="frontend", role="frontend", title="Frontend",
        goal="build UI", acceptanceCriteria=["핵심 사용자 흐름이 동작함"],
    )
    result = AgentResult("completed", "UI done", [], [], ["pytest tests/frontend"], None)

    decision = AcceptanceEvaluator().evaluate(node, result, evidence_ids=[])

    assert decision.decision == "BLOCK"
    assert "changed files" in " ".join(decision.gaps).lower()
    assert "evidence" in " ".join(decision.gaps).lower()


def test_acceptance_evaluator_passes_verified_testable_handoff():
    node = AgentNode(
        id="test", taskId="test", role="test", title="Test",
        goal="verify", acceptanceCriteria=["회귀 검증 결과가 증거로 남음"],
    )
    result = AgentResult("completed", "tests passed", [{"evidenceId": "ev-test"}], ["tests/e2e/test.py"], ["pytest tests"], None)

    decision = AcceptanceEvaluator().evaluate(node, result, evidence_ids=["ev-test"])

    assert decision.decision == "PASS"
    assert decision.gaps == []

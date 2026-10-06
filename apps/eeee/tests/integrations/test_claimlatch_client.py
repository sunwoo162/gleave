import httpx
import pytest

from app.integrations.claimlatch_client import (
    ClaimLatchClient,
    VerificationBlocked,
)


def _envelope(decision: str) -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "subjectId": "handoff-1",
        "projectId": "project-1",
        "projectRevision": "rev-1",
        "subjectType": "agent_handoff",
        "claims": [],
        "evidence": [],
        "deterministicChecks": [],
        "decision": decision,
        "claimLatchReportId": "report-1",
        "receiptId": "receipt-1",
        "createdAt": "2026-10-06T00:00:00Z",
    }


def test_client_parses_passing_text_verification() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/verify"
        return httpx.Response(200, json=_envelope("PASS"))

    client = ClaimLatchClient(
        "http://127.0.0.1:4567",
        transport=httpx.MockTransport(handler),
    )

    result = client.verify_text(
        {
            "subjectId": "handoff-1",
            "projectId": "project-1",
            "projectRevision": "rev-1",
            "subjectType": "agent_handoff",
            "question": "What changed?",
            "draft": "The tests pass.",
        }
    )

    assert result.decision == "PASS"
    assert result.claim_latch_report_id == "report-1"


def test_client_require_pass_raises_for_blocked_result() -> None:
    client = ClaimLatchClient(
        "http://127.0.0.1:4567",
        transport=httpx.MockTransport(lambda _request: httpx.Response(422, json=_envelope("BLOCK"))),
    )

    with pytest.raises(VerificationBlocked):
        client.require_pass(
            {
                "subjectId": "handoff-1",
                "projectId": "project-1",
                "projectRevision": "rev-1",
                "subjectType": "agent_handoff",
                "question": "What changed?",
                "draft": "unsupported",
            }
        )


def test_client_fails_closed_when_adapter_is_unavailable() -> None:
    client = ClaimLatchClient(
        "http://127.0.0.1:4567",
        transport=httpx.MockTransport(
            lambda _request: httpx.Response(503, json={"error": "unavailable"})
        ),
    )

    with pytest.raises(VerificationBlocked):
        client.require_pass(
            {
                "subjectId": "handoff-1",
                "projectId": "project-1",
                "projectRevision": "rev-1",
                "subjectType": "agent_handoff",
                "question": "What changed?",
                "draft": "unknown",
            }
        )

import httpx
import pytest

from app.integrations.claimlatch_audit import ClaimLatchAuditStore
from app.integrations.claimlatch_client import (
    ClaimLatchIntegrationError,
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


def test_client_persists_claimlatch_audit_metadata_and_is_idempotent(tmp_path) -> None:
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json=_envelope("PASS"))

    store = ClaimLatchAuditStore(tmp_path / "state.sqlite3")
    store.init()
    payload = {
        "subjectId": "handoff-1",
        "projectId": "project-1",
        "projectRevision": "rev-1",
        "subjectType": "agent_handoff",
        "question": "What changed?",
        "draft": "The tests pass.",
    }
    client = ClaimLatchClient(
        "http://127.0.0.1:4567",
        transport=httpx.MockTransport(handler),
        audit_store=store,
        policy_version="policy-v2",
        adapter_version="adapter-v3",
        claim_latch_profile_version="claimlatch-v0.2.0",
        claim_latch_version="0.3.86",
        current_revision_resolver=lambda _project_id: "rev-1",
    )

    first = client.verify_text(payload)
    second = client.verify_text(payload)

    assert first == second
    assert calls == 2
    audit = store.get_for_verification("project-1", "handoff-1", "rev-1")
    assert audit.decision == "PASS"
    assert audit.payload_hash
    assert audit.policy_version == "policy-v2"
    assert audit.adapter_version == "adapter-v3"
    assert audit.claim_latch_profile_version == "claimlatch-v0.2.0"
    assert audit.claim_latch_version == "0.3.86"
    assert audit.request_payload == payload


def test_client_rejects_stale_revision_before_calling_adapter(tmp_path) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("stale verification must not reach the adapter")

    store = ClaimLatchAuditStore(tmp_path / "state.sqlite3")
    store.init()
    client = ClaimLatchClient(
        "http://127.0.0.1:4567",
        transport=httpx.MockTransport(handler),
        audit_store=store,
        current_revision_resolver=lambda _project_id: "rev-2",
    )

    with pytest.raises(ClaimLatchIntegrationError, match="stale project revision"):
        client.verify_text(
            {
                "subjectId": "handoff-1",
                "projectId": "project-1",
                "projectRevision": "rev-1",
                "subjectType": "agent_handoff",
                "question": "What changed?",
                "draft": "The tests pass.",
            }
        )


def test_client_rejects_response_for_different_subject(tmp_path) -> None:
    store = ClaimLatchAuditStore(tmp_path / "state.sqlite3")
    store.init()
    client = ClaimLatchClient(
        "http://127.0.0.1:4567",
        transport=httpx.MockTransport(
            lambda _request: httpx.Response(
                200,
                json={**_envelope("PASS"), "subjectId": "other-handoff"},
            )
        ),
        audit_store=store,
    )

    with pytest.raises(ClaimLatchIntegrationError, match="identity mismatch"):
        client.verify_text(
            {
                "subjectId": "handoff-1",
                "projectId": "project-1",
                "projectRevision": "rev-1",
                "subjectType": "agent_handoff",
                "question": "What changed?",
                "draft": "The tests pass.",
            }
        )


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

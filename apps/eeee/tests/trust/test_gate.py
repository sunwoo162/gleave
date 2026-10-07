import httpx

from app.integrations.claimlatch_client import ClaimLatchClient
from app.trust.gate import TrustGate


def _envelope(decision: str) -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "subjectId": "claim-1",
        "projectId": "project-1",
        "projectRevision": "rev-1",
        "subjectType": "claim",
        "claims": [],
        "evidence": [],
        "deterministicChecks": [],
        "decision": decision,
        "claimLatchReportId": "report-1",
        "receiptId": "receipt-1",
        "createdAt": "2026-10-06T00:00:00Z",
    }


def _client(handler) -> ClaimLatchClient:
    return ClaimLatchClient(
        "http://127.0.0.1:4567",
        transport=httpx.MockTransport(handler),
        current_revision_resolver=lambda _project_id: "rev-1",
    )


def test_configured_claim_pass_preserves_identity_and_report() -> None:
    gate = TrustGate(
        _client(lambda request: httpx.Response(200, json=_envelope("PASS"))),
        current_revision_resolver=lambda _project_id: "rev-1",
    )

    result = gate.verify_claim(
        subject_id="claim-1",
        project_id="project-1",
        project_revision="rev-1",
        claim="The project is ready.",
    )

    assert result.decision == "PASS"
    assert result.subject_id == "claim-1"
    assert result.project_revision == "rev-1"
    assert result.report_id == "report-1"


def test_configured_block_is_exposed_as_blocked() -> None:
    gate = TrustGate(
        _client(lambda request: httpx.Response(422, json=_envelope("BLOCK"))),
        current_revision_resolver=lambda _project_id: "rev-1",
    )

    result = gate.verify_claim(
        subject_id="claim-1",
        project_id="project-1",
        project_revision="rev-1",
        claim="Unsupported claim.",
    )

    assert result.decision == "BLOCKED"
    assert result.report_id == "report-1"


def test_missing_claimlatch_is_blocked_for_required_actions() -> None:
    gate = TrustGate(None, mode="required")

    result = gate.verify_action(
        subject_id="github-review-1",
        project_id="project-1",
        project_revision="rev-1",
        action="publish_github_review",
    )

    assert result.decision == "BLOCKED"
    assert "not configured" in result.reason


def test_missing_claimlatch_is_warn_for_advisory_local_claims() -> None:
    gate = TrustGate(None, mode="advisory")

    result = gate.verify_claim(
        subject_id="claim-1",
        project_id="project-1",
        project_revision="rev-1",
        claim="A local planning note.",
    )

    assert result.decision == "WARN"
    assert result.claim_latch_profile_version == "claimlatch-v0.2.0"


def test_stale_project_revision_is_rejected_before_adapter_call() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("stale checks must not reach ClaimLatch")

    gate = TrustGate(
        ClaimLatchClient(
            "http://127.0.0.1:4567",
            transport=httpx.MockTransport(handler),
        ),
        current_revision_resolver=lambda _project_id: "rev-2",
    )

    result = gate.verify_action(
        subject_id="action-1",
        project_id="project-1",
        project_revision="rev-1",
        action="send_external_message",
    )

    assert result.decision == "BLOCKED"
    assert "stale project revision" in result.reason

from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any, Literal

from app.integrations.claimlatch_client import (
    ClaimLatchClient,
    ClaimLatchIntegrationError,
    VerificationBlocked,
)
from app.trust.models import TrustCheck, TrustDecision


TrustMode = Literal["advisory", "required"]


class TrustGate:
    """One fail-closed boundary for all claims and side-effecting actions.

    The gate deliberately keeps local planning usable when ClaimLatch is not
    configured, but never turns a missing or stale verification into PASS.
    """

    def __init__(
        self,
        client: ClaimLatchClient | None,
        *,
        mode: TrustMode = "advisory",
        profile_version: str = "claimlatch-v0.2.0",
        engine_version: str = "0.3.86",
        current_revision_resolver: Callable[[str], str | None] | None = None,
    ) -> None:
        self.client = client
        self.mode = mode
        self.profile_version = profile_version
        self.engine_version = engine_version
        self.current_revision_resolver = current_revision_resolver

    @property
    def health_status(self) -> Literal["configured", "advisory", "required"]:
        if self.client is not None:
            return "configured"
        return "required" if self.mode == "required" else "advisory"

    def health_payload(self) -> dict[str, str]:
        return {
            "status": self.health_status,
            "mode": self.mode,
            "profileVersion": self.profile_version,
            "engineVersion": self.engine_version,
        }

    def verify_claim(
        self,
        *,
        subject_id: str,
        project_id: str,
        project_revision: str,
        claim: str,
        action: str = "verify_claim",
    ) -> TrustCheck:
        identity = self._identity(subject_id, project_id, project_revision, action)
        stale = self._stale_reason(project_id, project_revision)
        if stale is not None:
            return self._blocked(identity, stale)
        if self.client is None:
            return self._unavailable(identity)

        payload = {
            "subjectId": subject_id,
            "projectId": project_id,
            "projectRevision": project_revision,
            "subjectType": "claim",
            "question": "Verify the assistant claim.",
            "draft": claim,
        }
        try:
            envelope = self.client.require_pass(payload)
        except VerificationBlocked as exc:
            if exc.envelope is not None:
                return self._from_decision(
                    identity,
                    exc.envelope.decision,
                    report_id=exc.envelope.claim_latch_report_id,
                    receipt_id=exc.envelope.receipt_id,
                    reason="ClaimLatch returned a non-PASS decision",
                )
            return self._unavailable(identity, reason=self._cause_reason(exc))
        except ClaimLatchIntegrationError as exc:
            return self._integration_failure(identity, exc)
        return self._from_decision(
            identity,
            envelope.decision,
            report_id=envelope.claim_latch_report_id,
            receipt_id=envelope.receipt_id,
            reason="ClaimLatch verified the claim",
        )

    def verify_action(
        self,
        *,
        subject_id: str,
        project_id: str,
        project_revision: str,
        action: str,
        payload: Mapping[str, Any] | None = None,
    ) -> TrustCheck:
        identity = self._identity(subject_id, project_id, project_revision, action)
        stale = self._stale_reason(project_id, project_revision)
        if stale is not None:
            return self._blocked(identity, stale)
        if self.client is None:
            return self._unavailable(identity)

        request_payload = {
            "subjectId": subject_id,
            "projectId": project_id,
            "projectRevision": project_revision,
            "subjectType": "action",
            "action": action,
            "payload": dict(payload or {}),
        }
        try:
            result = self.client.verify_structured(request_payload)
        except ClaimLatchIntegrationError as exc:
            return self._integration_failure(identity, exc)
        result_identity = self._result_identity(result)
        if result_identity and result_identity != {
            "subject_id": subject_id,
            "project_id": project_id,
            "project_revision": project_revision,
        }:
            return self._blocked(identity, "ClaimLatch action identity mismatch")
        decision = result["decision"]
        report_id = _first_string(result, "claimLatchReportId", "reportId")
        receipt_id = _first_string(result, "receiptId")
        return self._from_decision(
            identity,
            decision,
            report_id=report_id,
            receipt_id=receipt_id,
            reason="ClaimLatch verified the action",
        )

    def _identity(
        self, subject_id: str, project_id: str, project_revision: str, action: str
    ) -> dict[str, str]:
        return {
            "subject_id": subject_id,
            "project_id": project_id,
            "project_revision": project_revision,
            "action": action,
        }

    def _stale_reason(self, project_id: str, project_revision: str) -> str | None:
        if self.current_revision_resolver is None:
            return None
        current_revision = self.current_revision_resolver(project_id)
        if current_revision is None:
            return f"current project revision unavailable for {project_id}"
        if current_revision != project_revision:
            return (
                "ClaimLatch verification used a stale project revision: "
                f"expected {current_revision}, received {project_revision}"
            )
        return None

    def _unavailable(self, identity: Mapping[str, str], *, reason: str | None = None) -> TrustCheck:
        decision: TrustDecision = "BLOCKED" if self.mode == "required" else "WARN"
        return TrustCheck(
            **identity,
            decision=decision,
            reason=reason or "ClaimLatch is not configured",
            claim_latch_profile_version=self.profile_version,
            claim_latch_version=self.engine_version,
        )

    def _integration_failure(self, identity: Mapping[str, str], exc: Exception) -> TrustCheck:
        if "stale project revision" in str(exc).lower():
            return self._blocked(identity, str(exc))
        return self._unavailable(identity, reason=self._cause_reason(exc))

    def _blocked(self, identity: Mapping[str, str], reason: str) -> TrustCheck:
        return TrustCheck(
            **identity,
            decision="BLOCKED",
            reason=reason,
            claim_latch_profile_version=self.profile_version,
            claim_latch_version=self.engine_version,
        )

    def _from_decision(
        self,
        identity: Mapping[str, str],
        decision: str,
        *,
        report_id: str | None,
        receipt_id: str | None,
        reason: str,
    ) -> TrustCheck:
        mapped: TrustDecision = {
            "PASS": "PASS",
            "WARN": "WARN",
            "BLOCK": "BLOCKED",
        }.get(decision, "BLOCKED")
        if decision not in {"PASS", "WARN", "BLOCK"}:
            reason = "ClaimLatch returned an invalid decision"
        return TrustCheck(
            **identity,
            decision=mapped,
            report_id=report_id,
            receipt_id=receipt_id,
            reason=reason,
            claim_latch_profile_version=self.profile_version,
            claim_latch_version=self.engine_version,
        )

    @staticmethod
    def _cause_reason(exc: Exception) -> str:
        cause = exc.__cause__
        if cause is not None and str(cause):
            return str(cause)
        return str(exc) or "ClaimLatch adapter is unavailable"

    @staticmethod
    def _result_identity(result: Mapping[str, Any]) -> dict[str, str] | None:
        keys = ("subjectId", "projectId", "projectRevision")
        if not any(key in result for key in keys):
            return None
        values = {key: result.get(key) for key in keys}
        if any(not isinstance(value, str) or not value.strip() for value in values.values()):
            return {"subject_id": "", "project_id": "", "project_revision": ""}
        return {
            "subject_id": values["subjectId"],
            "project_id": values["projectId"],
            "project_revision": values["projectRevision"],
        }


def _first_string(value: Mapping[str, Any], *keys: str) -> str | None:
    for key in keys:
        item = value.get(key)
        if isinstance(item, str) and item.strip():
            return item
    return None

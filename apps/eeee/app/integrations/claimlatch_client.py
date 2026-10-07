from __future__ import annotations

from collections.abc import Mapping
import hashlib
import json
from typing import Any, Callable

import httpx

from app.integrations.claimlatch_audit import (
    ClaimLatchAuditConflictError,
    ClaimLatchAuditRecord,
    ClaimLatchAuditStore,
)
from app.integrations.contracts import VerificationEnvelopeV1


class ClaimLatchIntegrationError(RuntimeError):
    """The local ClaimLatch adapter could not return a valid verification envelope."""


class VerificationBlocked(ClaimLatchIntegrationError):
    """A result could not be promoted to a trusted release."""

    def __init__(
        self,
        message: str,
        *,
        envelope: VerificationEnvelopeV1 | None = None,
    ) -> None:
        super().__init__(message)
        self.envelope = envelope


class ClaimLatchClient:
    def __init__(
        self,
        base_url: str,
        *,
        timeout: float = 30.0,
        transport: httpx.BaseTransport | None = None,
        audit_store: ClaimLatchAuditStore | None = None,
        policy_version: str = "claimlatch-policy-v1",
        adapter_version: str = "eeee-claimlatch-adapter-v1",
        claim_latch_profile_version: str = "claimlatch-v0.2.0",
        claim_latch_version: str = "0.3.86",
        current_revision_resolver: Callable[[str], str | None] | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.transport = transport
        self.audit_store = audit_store
        self.policy_version = policy_version
        self.adapter_version = adapter_version
        self.claim_latch_profile_version = claim_latch_profile_version
        self.claim_latch_version = claim_latch_version
        self.current_revision_resolver = current_revision_resolver
        if self.audit_store is not None:
            self.audit_store.init()

    def verify_text(self, payload: Mapping[str, Any]) -> VerificationEnvelopeV1:
        request_payload = dict(payload)
        identity = self._identity(request_payload)
        self._ensure_current_revision(identity["project_id"], identity["project_revision"])
        response = self._post("/v1/verify", payload)
        if response.status_code not in {200, 422}:
            raise ClaimLatchIntegrationError(
                f"ClaimLatch adapter returned HTTP {response.status_code}"
            )
        try:
            envelope = VerificationEnvelopeV1.model_validate(response.json())
        except Exception as exc:
            raise ClaimLatchIntegrationError(
                "ClaimLatch adapter returned an invalid verification envelope"
            ) from exc
        self._validate_identity(identity, envelope)
        self._ensure_current_revision(identity["project_id"], identity["project_revision"])
        if self.audit_store is not None:
            self._save_audit(request_payload, envelope)
        return envelope

    def verify_structured(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        response = self._post("/v1/verify-structured", payload)
        if response.status_code not in {200, 422}:
            raise ClaimLatchIntegrationError(
                f"ClaimLatch structured verifier returned HTTP {response.status_code}"
            )
        value = response.json()
        if not isinstance(value, dict) or value.get("decision") not in {"PASS", "WARN", "BLOCK"}:
            raise ClaimLatchIntegrationError(
                "ClaimLatch structured verifier returned an invalid decision"
            )
        return value

    def require_pass(self, payload: Mapping[str, Any]) -> VerificationEnvelopeV1:
        try:
            envelope = self.verify_text(payload)
        except ClaimLatchIntegrationError as exc:
            raise VerificationBlocked(
                "ClaimLatch verification was unavailable; release is blocked"
            ) from exc
        if envelope.decision != "PASS":
            raise VerificationBlocked(
                "ClaimLatch blocked the release",
                envelope=envelope,
            )
        return envelope

    def _post(self, path: str, payload: Mapping[str, Any]) -> httpx.Response:
        try:
            with httpx.Client(
                base_url=self.base_url,
                timeout=self.timeout,
                transport=self.transport,
            ) as client:
                return client.post(path, json=dict(payload))
        except httpx.HTTPError as exc:
            raise ClaimLatchIntegrationError(
                "ClaimLatch adapter request failed"
            ) from exc

    @staticmethod
    def _identity(payload: Mapping[str, Any]) -> dict[str, str]:
        fields = {
            "subject_id": "subjectId",
            "project_id": "projectId",
            "project_revision": "projectRevision",
            "subject_type": "subjectType",
        }
        identity: dict[str, str] = {}
        for name, key in fields.items():
            value = payload.get(key)
            if not isinstance(value, str) or not value.strip():
                raise ClaimLatchIntegrationError(f"ClaimLatch payload is missing {key}")
            identity[name] = value
        return identity

    def _ensure_current_revision(self, project_id: str, project_revision: str) -> None:
        if self.current_revision_resolver is None:
            return
        current_revision = self.current_revision_resolver(project_id)
        if not current_revision:
            raise ClaimLatchIntegrationError(
                f"current project revision unavailable for {project_id}"
            )
        if current_revision != project_revision:
            raise ClaimLatchIntegrationError(
                "ClaimLatch verification used a stale project revision: "
                f"expected {current_revision}, received {project_revision}"
            )

    @staticmethod
    def _validate_identity(
        identity: Mapping[str, str], envelope: VerificationEnvelopeV1
    ) -> None:
        envelope_identity = {
            "subject_id": envelope.subject_id,
            "project_id": envelope.project_id,
            "project_revision": envelope.project_revision,
            "subject_type": envelope.subject_type,
        }
        if any(envelope_identity[key] != value for key, value in identity.items()):
            raise ClaimLatchIntegrationError("ClaimLatch verification identity mismatch")

    def _save_audit(
        self,
        request_payload: dict[str, Any],
        envelope: VerificationEnvelopeV1,
    ) -> None:
        payload_hash = _hash_json(request_payload)
        audit_id = "claimlatch-audit-" + _hash_json(
            {
                "subjectId": envelope.subject_id,
                "projectId": envelope.project_id,
                "projectRevision": envelope.project_revision,
                "payloadHash": payload_hash,
            }
        )[:24]
        record = ClaimLatchAuditRecord(
            audit_id=audit_id,
            subject_id=envelope.subject_id,
            project_id=envelope.project_id,
            project_revision=envelope.project_revision,
            subject_type=envelope.subject_type,
            decision=envelope.decision,
            claim_latch_report_id=envelope.claim_latch_report_id,
            receipt_id=envelope.receipt_id,
            payload_hash=payload_hash,
            policy_version=self.policy_version,
            adapter_version=self.adapter_version,
            claim_latch_version=self.claim_latch_version,
            claim_latch_profile_version=self.claim_latch_profile_version,
            request_payload=request_payload,
            envelope=envelope.model_dump(by_alias=True, mode="json"),
            created_at=envelope.created_at,
        )
        try:
            self.audit_store.save(record)
        except ClaimLatchAuditConflictError as exc:
            raise ClaimLatchIntegrationError(str(exc)) from exc


def _hash_json(value: Mapping[str, Any]) -> str:
    try:
        encoded = json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise ClaimLatchIntegrationError(
            "ClaimLatch payload is not canonically serializable"
        ) from exc
    return hashlib.sha256(encoded).hexdigest()

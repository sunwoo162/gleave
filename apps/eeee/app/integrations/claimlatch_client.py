from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import httpx

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
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.transport = transport

    def verify_text(self, payload: Mapping[str, Any]) -> VerificationEnvelopeV1:
        response = self._post("/v1/verify", payload)
        if response.status_code not in {200, 422}:
            raise ClaimLatchIntegrationError(
                f"ClaimLatch adapter returned HTTP {response.status_code}"
            )
        try:
            return VerificationEnvelopeV1.model_validate(response.json())
        except Exception as exc:
            raise ClaimLatchIntegrationError(
                "ClaimLatch adapter returned an invalid verification envelope"
            ) from exc

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

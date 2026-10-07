"""Versioned line-delimited JSON protocol used by the local host."""

from typing import Any


PROTOCOL_VERSION = "1"


def request(correlation_id: str, action: str, value: dict[str, Any]) -> dict[str, Any]:
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "correlationId": correlation_id,
        "action": action,
        "input": value,
    }


def validate_response(value: object, correlation_id: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("plugin response must be an object")
    if value.get("protocolVersion") != PROTOCOL_VERSION:
        raise ValueError("plugin response protocol version is unsupported")
    if value.get("correlationId") != correlation_id:
        raise ValueError("plugin response correlation ID does not match")
    if value.get("status") not in {"completed", "failed"}:
        raise ValueError("plugin response status is invalid")
    output = value.get("output", {})
    if not isinstance(output, dict):
        raise ValueError("plugin response output must be an object")
    return value

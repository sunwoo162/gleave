from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.assistant.models import CapabilityDescriptor


@dataclass(frozen=True)
class RegisteredCapability:
    descriptor: CapabilityDescriptor
    handler: Any


class CapabilityRegistry:
    """Runtime registry for EEEE capabilities and their opaque handlers."""

    def __init__(self) -> None:
        self._capabilities: dict[str, RegisteredCapability] = {}

    def register(self, descriptor: CapabilityDescriptor, handler: Any) -> None:
        if descriptor.id in self._capabilities:
            raise ValueError(f"Capability already registered: {descriptor.id}")
        self._capabilities[descriptor.id] = RegisteredCapability(descriptor, handler)

    def list(self) -> list[CapabilityDescriptor]:
        return [item.descriptor for item in self._capabilities.values()]

    def resolve(self, capability_id: str) -> RegisteredCapability:
        try:
            return self._capabilities[capability_id]
        except KeyError as exc:
            raise KeyError(f"Unknown capability: {capability_id}") from exc


def _descriptor(
    capability_id: str,
    display_name: str,
    intents: list[str],
    trigger_phrases: list[str],
    *,
    required_connectors: list[str] | None = None,
    side_effect_level: str = "none",
    approval_level: str = "none",
    memory_writable: bool = False,
) -> CapabilityDescriptor:
    return CapabilityDescriptor(
        id=capability_id,
        version="1.0.0",
        display_name=display_name,
        intents=intents,
        trigger_phrases=trigger_phrases,
        required_connectors=required_connectors or [],
        side_effect_level=side_effect_level,  # type: ignore[arg-type]
        approval_level=approval_level,  # type: ignore[arg-type]
        claim_latch_policy="claimlatch-v0.2.0",
        memory_writable=memory_writable,
    )


def build_default_registry() -> CapabilityRegistry:
    registry = CapabilityRegistry()
    registry.register(
        _descriptor(
            "personal-secretary",
            "Personal Secretary",
            ["schedule", "reminder", "routine"],
            ["일정", "달력", "캘린더", "약속", "회의", "리마인더", "calendar", "schedule", "remind"],
            required_connectors=["google-calendar"],
            side_effect_level="external",
            approval_level="user",
        ),
        None,
    )
    registry.register(
        _descriptor(
            "project-execution",
            "Project Execution",
            ["project", "development", "build"],
            ["프로젝트", "앱", "서비스", "기능", "개발", "만들어", "구현", "project", "app", "build", "develop"],
            required_connectors=["notion", "github", "google-calendar", "desktop", "mobile-bridge"],
            side_effect_level="external",
            approval_level="user",
            memory_writable=True,
        ),
        None,
    )
    registry.register(
        _descriptor(
            "knowledge-documents",
            "Knowledge and Documents",
            ["document", "knowledge", "search"],
            ["문서", "파일", "정리", "요약", "기억", "검색", "document", "file", "summarize", "memory"],
            memory_writable=True,
        ),
        None,
    )
    registry.register(
        _descriptor(
            "presence",
            "Presence",
            ["desktop", "mobile", "notification"],
            ["바탕화면", "위젯", "휴대폰", "모바일", "desktop", "widget", "mobile", "phone"],
            required_connectors=["desktop", "mobile-bridge"],
            side_effect_level="local",
        ),
        None,
    )
    return registry


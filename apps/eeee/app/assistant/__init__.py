"""EEEE's extensible assistant kernel contracts and routing."""

from app.assistant.models import (
    AssistantContext,
    AssistantRequest,
    CapabilityDescriptor,
    CapabilityPlan,
    CapabilityResult,
    CapabilitySelection,
)
from app.assistant.registry import CapabilityRegistry, build_default_registry
from app.assistant.router import CapabilityRouter

__all__ = [
    "AssistantContext",
    "AssistantRequest",
    "CapabilityDescriptor",
    "CapabilityPlan",
    "CapabilityResult",
    "CapabilitySelection",
    "CapabilityRegistry",
    "CapabilityRouter",
    "build_default_registry",
]

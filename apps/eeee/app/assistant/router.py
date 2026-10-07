from __future__ import annotations

import re

from app.assistant.models import (
    AssistantRequest,
    CapabilityCandidate,
    CapabilitySelection,
)
from app.assistant.registry import CapabilityRegistry


class CapabilityRouter:
    """Select the best registered EEEE capability without hidden side effects."""

    MINIMUM_SCORE = 1

    def __init__(self, registry: CapabilityRegistry) -> None:
        self.registry = registry

    def select(self, request: AssistantRequest) -> CapabilitySelection:
        if request.requested_capability is not None:
            registered = self.registry.resolve(request.requested_capability)
            return CapabilitySelection(
                status="selected",
                capability_id=registered.descriptor.id,
                candidates=[
                    CapabilityCandidate(
                        capability_id=registered.descriptor.id,
                        score=1,
                        reasons=["explicit capability request"],
                    )
                ],
                reasons=["selected by explicit capability request"],
            )

        normalized = _normalize(request.raw_text)
        candidates: list[CapabilityCandidate] = []
        for descriptor in self.registry.list():
            matched = [phrase for phrase in descriptor.trigger_phrases if _contains(normalized, phrase)]
            score = len(matched)
            if score:
                candidates.append(
                    CapabilityCandidate(
                        capability_id=descriptor.id,
                        score=score,
                        reasons=[f"matched trigger: {phrase}" for phrase in matched],
                    )
                )

        candidates.sort(key=lambda item: (-item.score, item.capability_id))
        if not candidates or candidates[0].score < self.MINIMUM_SCORE:
            if not candidates:
                candidates = [
                    CapabilityCandidate(
                        capability_id=descriptor.id,
                        score=0,
                        reasons=["no trigger matched"],
                    )
                    for descriptor in self.registry.list()
                ]
            return CapabilitySelection(
                status="needs_clarification",
                candidates=candidates,
                reasons=["No registered capability reached the routing threshold"],
            )

        winner = candidates[0]
        return CapabilitySelection(
            status="selected",
            capability_id=winner.capability_id,
            candidates=candidates,
            reasons=winner.reasons,
        )


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value.casefold()).strip()


def _contains(normalized_text: str, phrase: str) -> bool:
    normalized_phrase = _normalize(phrase)
    if not normalized_phrase:
        return False
    if normalized_phrase.isascii():
        # English triggers are words, not substrings ("app" is not "happy").
        return re.search(r"(?<![a-z0-9_])" + re.escape(normalized_phrase) + r"(?![a-z0-9_])", normalized_text) is not None
    return normalized_phrase in normalized_text

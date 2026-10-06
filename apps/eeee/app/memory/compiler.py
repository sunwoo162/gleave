from __future__ import annotations

from typing import Any

from app.integrations.contracts import ProjectOutcomeReportV1
from app.memory.models import MemoryCandidate


class MemoryCompiler:
    """Turn a verified project outcome into traceable memory candidates."""

    def compile(self, outcome_report: ProjectOutcomeReportV1) -> list[MemoryCandidate]:
        candidates: list[MemoryCandidate] = []
        for raw in outcome_report.memory_candidates:
            value = dict(raw)
            value.setdefault("sourceProjectId", outcome_report.project_id)
            value.setdefault("promotionState", "candidate")
            value.setdefault("createdAt", outcome_report.created_at)
            if "evidenceIds" not in value:
                value["evidenceIds"] = outcome_report.qa_report.get("evidenceIds", [])
            if "verificationIds" not in value:
                value["verificationIds"] = [
                    str(item["id"])
                    for item in outcome_report.claim_latch_reports
                    if isinstance(item, dict) and item.get("id")
                ]
            if "sourceArtifactIds" not in value:
                value["sourceArtifactIds"] = [
                    str(item["id"])
                    for item in outcome_report.artifacts
                    if isinstance(item, dict) and item.get("id")
                ]
            candidates.append(
                MemoryCandidate(
                    candidate_id=str(value["candidateId"]),
                    kind=value["kind"],
                    content=str(value["content"]),
                    scope=dict(value["scope"]),
                    source_project_id=str(value["sourceProjectId"]),
                    source_artifact_ids=list(value["sourceArtifactIds"]),
                    evidence_ids=list(value["evidenceIds"]),
                    verification_ids=list(value["verificationIds"]),
                    confidence=float(value.get("confidence", 0.5)),
                    promotion_state="candidate",
                    created_at=value["createdAt"],
                )
            )
        return candidates

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ReleaseArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str = Field(min_length=1)
    path: str = Field(min_length=1)
    evidence_ids: list[str] = Field(min_length=1)


class ReleaseManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: int = 1
    decision: str
    project_id: str = Field(min_length=1)
    project_revision: str = Field(min_length=1)
    workspace: str = Field(min_length=1)
    artifact_ids: list[str] = Field(min_length=1)
    evidence_ids: list[str] = Field(min_length=1)
    claim_latch_receipt_id: str = Field(min_length=1)
    claim_latch_report_id: str = Field(min_length=1)
    created_at: datetime


def build_release_manifest(
    *,
    project_id: str,
    project_revision: str,
    workspace: str,
    artifacts: list[dict[str, Any]],
    qa_report: dict[str, Any],
    claim_latch: dict[str, Any],
) -> ReleaseManifest:
    reasons: list[str] = []
    if qa_report.get("projectId") != project_id or qa_report.get("projectRevision") != project_revision:
        reasons.append("QA report is stale")
    if qa_report.get("status") != "PASS" or qa_report.get("independent") is not True:
        reasons.append("independent QA did not PASS")
    qa_evidence = [item for item in qa_report.get("evidenceIds", []) if isinstance(item, str) and item]
    if not qa_evidence:
        reasons.append("QA evidence is missing")
    if claim_latch.get("decision") != "PASS" or not claim_latch.get("receiptId"):
        reasons.append("ClaimLatch release verification did not PASS")
    try:
        parsed_artifacts = [ReleaseArtifact.model_validate(item) for item in artifacts]
    except Exception as exc:
        raise ValueError("release blocked: invalid artifact evidence") from exc
    evidence_ids = list(dict.fromkeys([*(evidence for artifact in parsed_artifacts for evidence in artifact.evidence_ids), *qa_evidence]))
    if reasons:
        raise ValueError("release blocked: " + "; ".join(reasons))
    return ReleaseManifest(
        decision="PASS",
        project_id=project_id,
        project_revision=project_revision,
        workspace=workspace,
        artifact_ids=[artifact.id for artifact in parsed_artifacts],
        evidence_ids=evidence_ids,
        claim_latch_receipt_id=str(claim_latch["receiptId"]),
        claim_latch_report_id=str(claim_latch["claimLatchReportId"]),
        created_at=datetime.now(timezone.utc),
    )

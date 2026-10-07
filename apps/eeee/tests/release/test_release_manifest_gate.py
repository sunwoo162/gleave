import pytest

from app.release.manifest import build_release_manifest


def _input(**overrides):
    value = {
        "project_id": "project-1",
        "project_revision": "rev-1",
        "workspace": "C:/workspace/project-1",
        "artifacts": [
            {"id": "source", "path": "src", "evidence_ids": ["evidence-source"]},
            {"id": "qa", "path": "QA_REPORT.md", "evidence_ids": ["evidence-qa"]},
        ],
        "qa_report": {
            "projectId": "project-1",
            "projectRevision": "rev-1",
            "status": "PASS",
            "independent": True,
            "evidenceIds": ["evidence-qa"],
        },
        "claim_latch": {
            "decision": "PASS",
            "receiptId": "receipt-1",
            "claimLatchReportId": "report-1",
        },
    }
    value.update(overrides)
    return value


def test_release_manifest_passes_only_with_current_qa_claimlatch_and_artifacts() -> None:
    manifest = build_release_manifest(**_input())
    assert manifest.decision == "PASS"
    assert manifest.project_id == "project-1"
    assert manifest.claim_latch_receipt_id == "receipt-1"
    assert manifest.evidence_ids == ["evidence-source", "evidence-qa"]


def test_release_manifest_blocks_stale_or_unverified_results() -> None:
    with pytest.raises(ValueError, match="release blocked"):
        build_release_manifest(
            **_input(
                qa_report={
                    "projectId": "project-1",
                    "projectRevision": "old-rev",
                    "status": "PASS",
                    "independent": True,
                    "evidenceIds": ["evidence-qa"],
                }
            )
        )
    with pytest.raises(ValueError, match="release blocked"):
        build_release_manifest(**_input(claim_latch={"decision": "WARN", "receiptId": None, "claimLatchReportId": "report-1"}))


def test_release_manifest_blocks_artifact_without_evidence() -> None:
    with pytest.raises(ValueError, match="release blocked"):
        build_release_manifest(**_input(artifacts=[{"id": "source", "path": "src", "evidence_ids": []}]))

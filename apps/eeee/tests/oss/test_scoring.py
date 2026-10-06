from datetime import datetime, timezone

import pytest

from app.domain.models import RepositorySnapshot, RequestBrief
from app.oss.scoring import score_candidate


def brief():
    return RequestBrief(
        raw_text="Build a Python document search library",
        goal="document search",
        target_type="python library",
        constraints=["python"],
        acceptance_criteria=["document search"],
    )


def repository(**changes):
    values = {
        "full_name": "example/document-search",
        "html_url": "https://github.com/example/document-search",
        "description": "Python document search library",
        "stars": 1200,
        "forks": 150,
        "open_issues": 0,
        "license_spdx": "MIT",
        "default_branch": "main",
        "pushed_at": datetime.now(timezone.utc).isoformat(),
        "topics": ["python", "document", "search", "library"],
    }
    values.update(changes)
    return RepositorySnapshot(**values)


def test_fully_supported_candidate_uses_exact_weighted_dimensions():
    result = score_candidate(brief(), repository())

    assert result.dimension_scores == {
        "fit": 45,
        "adoption": 15,
        "maintenance": 15,
        "trust": 15,
        "integration": 10,
    }
    assert result.total == 100
    assert result.total == sum(result.dimension_scores.values())
    assert result.status == "candidate"
    for dimension in result.dimension_scores:
        assert any(item.lower().startswith(dimension) for item in result.evidence)


def test_stale_unlicensed_repository_scores_lower_and_reports_both_risks():
    healthy = score_candidate(brief(), repository())
    stale = score_candidate(
        brief(),
        repository(
            stars=5,
            forks=0,
            license_spdx=None,
            pushed_at="2020-01-01T00:00:00Z",
        ),
    )

    assert stale.total < healthy.total
    assert stale.dimension_scores["maintenance"] == 0
    assert stale.dimension_scores["trust"] < 15
    assert any("license" in risk.lower() for risk in stale.risks)
    assert any("stale" in risk.lower() for risk in stale.risks)
    assert stale.status == "uncertain"


def test_missing_maintenance_evidence_is_not_invented():
    result = score_candidate(brief(), repository(pushed_at=""))

    assert result.dimension_scores["maintenance"] == 0
    assert any("maintenance" in risk.lower() for risk in result.risks)
    assert result.status == "uncertain"


def test_future_push_does_not_earn_maintenance_points():
    result = score_candidate(brief(), repository(pushed_at="2099-01-01T00:00:00Z"))

    assert result.dimension_scores["maintenance"] == 0
    assert result.total == 85
    assert any("future" in item.lower() for item in result.evidence)
    assert any("future" in risk.lower() for risk in result.risks)
    assert result.status == "uncertain"


def test_unknown_spdx_identifier_does_not_earn_license_trust():
    result = score_candidate(brief(), repository(license_spdx="BOGUS"))

    assert result.dimension_scores["trust"] == 5
    assert any("license" in risk.lower() for risk in result.risks)
    assert result.status == "uncertain"


def test_requirement_fit_outweighs_stars_and_all_scores_are_bounded():
    matching = score_candidate(brief(), repository(stars=2, forks=0, open_issues=4))
    popular_mismatch = score_candidate(
        brief(),
        repository(
            full_name="example/other",
            description="Unrelated graphics engine",
            topics=["graphics", "engine"],
            stars=1_000_000,
            forks=100_000,
        ),
    )

    assert matching.dimension_scores["fit"] == 45
    assert popular_mismatch.dimension_scores["fit"] == 0
    assert matching.total > popular_mismatch.total
    for result in (matching, popular_mismatch):
        assert 0 <= result.total <= 100
        assert result.total == pytest.approx(sum(result.dimension_scores.values()))

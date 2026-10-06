"""Explainable scores for GitHub repository candidates."""

import re
from datetime import datetime, timezone

from app.domain.models import CandidateScore, RepositorySnapshot, RequestBrief
from app.oss.license_ids import RECOGNIZED_SPDX_IDS


WEIGHTS = {"fit": 45, "adoption": 15, "maintenance": 15, "trust": 15, "integration": 10}
_STOP_WORDS = {"a", "an", "and", "for", "in", "of", "the", "to", "with"}


def _terms(text: str) -> set[str]:
    return {term for term in re.findall(r"[a-z0-9]+", text.lower()) if term not in _STOP_WORDS}


def score_candidate(brief: RequestBrief, repository: RepositorySnapshot) -> CandidateScore:
    """Score only evidence available in the brief and repository snapshot."""
    evidence: list[str] = []
    risks: list[str] = []
    repository_terms = _terms(
        " ".join([repository.full_name, repository.description, *repository.topics])
    )
    requirement_terms = _terms(
        " ".join([brief.goal, *brief.constraints, *brief.acceptance_criteria])
    )
    matched = requirement_terms & repository_terms
    fit = WEIGHTS["fit"] * len(matched) / len(requirement_terms) if requirement_terms else 0
    evidence.append(
        f"Fit: {len(matched)}/{len(requirement_terms)} requirement terms matched: "
        f"{', '.join(sorted(matched)) or 'none'}"
    )
    if not matched:
        risks.append("No requirement fit evidence in repository metadata")

    stars = max(0, repository.stars)
    forks = max(0, repository.forks)
    issues = max(0, repository.open_issues)
    adoption = WEIGHTS["adoption"] * (
        0.7 * min(stars / 1000, 1) + 0.3 * min(forks / 100, 1)
    ) / (1 + issues / 50)
    evidence.append(
        f"Adoption: {repository.stars} stars, {repository.forks} forks, "
        f"{repository.open_issues} open issues"
    )

    maintenance = 0.0
    if repository.pushed_at:
        try:
            pushed_at = datetime.fromisoformat(repository.pushed_at.replace("Z", "+00:00"))
            if pushed_at.tzinfo is None:
                raise ValueError("maintenance timestamp has no timezone")
            now = datetime.now(timezone.utc)
            if pushed_at > now:
                evidence.append(f"Maintenance: future push timestamp {repository.pushed_at} is invalid")
                risks.append("Maintenance evidence is invalid: push timestamp is in the future")
            else:
                age_days = (now - pushed_at).days
                maintenance = WEIGHTS["maintenance"] * max(0, 1 - age_days / 365)
                evidence.append(f"Maintenance: last pushed {repository.pushed_at} ({age_days} days ago)")
                if age_days >= 365:
                    risks.append("Stale maintenance: no push in at least 365 days")
        except ValueError:
            evidence.append("Maintenance: no usable push timestamp")
            risks.append("Maintenance evidence is missing or invalid")
    else:
        evidence.append("Maintenance: no push timestamp provided")
        risks.append("Maintenance evidence is missing")

    license_spdx = repository.license_spdx
    has_license = license_spdx in RECOGNIZED_SPDX_IDS
    trust = 10 if has_license else 0
    trust += 3 if repository.html_url.startswith("https://github.com/") else 0
    trust += 2 if repository.default_branch else 0
    evidence.append(
        f"Trust: license {license_spdx if has_license else 'unknown'}, "
        f"repository URL {'present' if repository.html_url else 'missing'}, "
        f"default branch {'present' if repository.default_branch else 'missing'}; "
        "security advisories not assessed"
    )
    if not has_license:
        risks.append("License is missing or unidentified; usage rights are uncertain")

    target_terms = _terms(brief.target_type)
    integration_matches = target_terms & repository_terms
    integration = (
        WEIGHTS["integration"] * len(integration_matches) / len(target_terms)
        if target_terms
        else 0
    )
    evidence.append(
        f"Integration: {len(integration_matches)}/{len(target_terms)} target terms matched: "
        f"{', '.join(sorted(integration_matches)) or 'none'}"
    )
    if target_terms and not integration_matches:
        risks.append("No integration compatibility evidence in repository metadata")

    dimension_scores = {
        "fit": round(fit, 2),
        "adoption": round(adoption, 2),
        "maintenance": round(maintenance, 2),
        "trust": round(trust, 2),
        "integration": round(integration, 2),
    }
    total = min(100.0, max(0.0, round(sum(dimension_scores.values()), 2)))
    return CandidateScore(
        repository=repository,
        total=total,
        dimension_scores=dimension_scores,
        evidence=evidence,
        risks=risks,
        status="uncertain" if risks else "candidate",
    )

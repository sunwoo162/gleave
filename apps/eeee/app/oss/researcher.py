"""Synchronous GitHub research adapter for the coordinator."""

import asyncio

from app.domain.models import CandidateScore, RequestBrief
from app.oss.github_client import GitHubClient, ResearchError
from app.oss.scoring import score_candidate


class GitHubResearcher:
    """Fetch, score, and rank enough GitHub repositories for approval."""

    def __init__(self, client: GitHubClient, limit: int = 5):
        self.client = client
        self.limit = limit

    def research(self, brief: RequestBrief) -> list[CandidateScore]:
        snapshots = asyncio.run(
            self.client.search_repositories(brief.goal, limit=self.limit)
        )
        if len(snapshots) < 2:
            raise ResearchError("GitHub research requires at least two candidates")
        candidates = [score_candidate(brief, snapshot) for snapshot in snapshots]
        return sorted(
            candidates,
            key=lambda candidate: (-candidate.total, candidate.repository.full_name),
        )

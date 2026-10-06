import asyncio

import httpx
import pytest

from app.domain.models import RequestBrief
from app.oss.github_client import GitHubClient, ResearchError
from app.oss.researcher import GitHubResearcher


def brief() -> RequestBrief:
    return RequestBrief(
        raw_text="Build a Python document search library",
        goal="document search",
        target_type="python library",
        constraints=["python"],
        acceptance_criteria=["document search"],
    )


def repository(full_name: str, stars: int) -> dict[str, object]:
    return {
        "full_name": full_name,
        "html_url": f"https://github.com/{full_name}",
        "description": "Python document search library",
        "stargazers_count": stars,
        "forks_count": 10,
        "open_issues_count": 1,
        "license": {"spdx_id": "MIT"},
        "default_branch": "main",
        "pushed_at": "2026-09-20T12:00:00Z",
        "topics": ["python", "document", "search", "library"],
    }


def test_researcher_searches_brief_scores_and_sorts_candidates():
    def handle(request):
        assert request.url.path == "/search/repositories"
        assert request.url.params["q"] == "document search"
        assert request.url.params["per_page"] == "5"
        return httpx.Response(
            200,
            json={
                "items": [
                    repository("example/low", 10),
                    repository("example/high", 1000),
                ]
            },
        )

    researcher = GitHubResearcher(
        GitHubClient(transport=httpx.MockTransport(handle)),
        limit=5,
    )

    candidates = researcher.research(brief())

    assert [candidate.repository.full_name for candidate in candidates] == [
        "example/high",
        "example/low",
    ]
    assert all(candidate.total > 0 for candidate in candidates)


def test_researcher_rejects_fewer_than_two_candidates():
    client = GitHubClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json={"items": [repository("example/only", 1)]})
        )
    )

    with pytest.raises(ResearchError, match="at least two"):
        GitHubResearcher(client).research(brief())

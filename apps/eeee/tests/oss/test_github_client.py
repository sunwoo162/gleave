import asyncio

import httpx
import pytest

from app.oss.github_client import GitHubClient, ResearchError


def repository_payload(**changes):
    payload = {
        "full_name": "example/search-kit",
        "html_url": "https://github.com/example/search-kit",
        "description": "Document search toolkit",
        "stargazers_count": 240,
        "forks_count": 22,
        "open_issues_count": 3,
        "license": {"spdx_id": "MIT"},
        "default_branch": "main",
        "pushed_at": "2026-09-20T12:00:00Z",
        "topics": ["search", "python"],
    }
    payload.update(changes)
    return payload


def test_search_sends_query_language_limit_and_bearer_token():
    def handle(request):
        assert request.url.path == "/search/repositories"
        assert request.url.params["q"] == "document search language:Python"
        assert request.url.params["per_page"] == "3"
        assert request.headers["Authorization"] == "Bearer secret-token"
        return httpx.Response(200, json={"items": [repository_payload()]})

    client = GitHubClient(token="secret-token", transport=httpx.MockTransport(handle))
    snapshots = asyncio.run(client.search_repositories("document search", language="Python", limit=3))

    assert len(snapshots) == 1
    assert snapshots[0].full_name == "example/search-kit"
    assert snapshots[0].license_spdx == "MIT"
    assert snapshots[0].pushed_at == "2026-09-20T12:00:00Z"


def test_get_repository_omits_authorization_and_preserves_missing_evidence():
    def handle(request):
        assert request.url.path == "/repos/example/search-kit"
        assert "Authorization" not in request.headers
        return httpx.Response(200, json=repository_payload(license=None, pushed_at=None))

    client = GitHubClient(transport=httpx.MockTransport(handle))
    snapshot = asyncio.run(client.get_repository("example/search-kit"))

    assert snapshot.license_spdx is None
    assert snapshot.pushed_at == ""


def test_unknown_spdx_identifier_is_preserved_as_missing_evidence():
    client = GitHubClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200, json=repository_payload(license={"spdx_id": "BOGUS"})
            )
        )
    )

    snapshot = asyncio.run(client.get_repository("example/search-kit"))

    assert snapshot.license_spdx is None


@pytest.mark.parametrize(
    "html_url",
    [
        "https://github.com/other/search-kit",
        "https://github.com/example/other-kit",
        "https://github.com.example.org/example/search-kit",
    ],
)
def test_repository_url_must_identify_the_full_name(html_url):
    client = GitHubClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json=repository_payload(html_url=html_url))
        )
    )

    with pytest.raises(ResearchError):
        asyncio.run(client.get_repository("example/search-kit"))


@pytest.mark.parametrize("status", [403, 429, 500])
def test_non_success_responses_raise_recoverable_research_error(status):
    client = GitHubClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(status, json={"message": "unavailable"}))
    )

    with pytest.raises(ResearchError) as error:
        asyncio.run(client.search_repositories("search"))

    assert error.value.status_code == status
    assert error.value.recoverable is True


@pytest.mark.parametrize(
    "body",
    [
        {"items": "invalid"},
        {"items": [repository_payload(pushed_at="not-a-date")]},
        {"items": [repository_payload(license={"name": "MIT"})]},
    ],
)
def test_malformed_search_response_raises_research_error(body):
    client = GitHubClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, json=body)))

    with pytest.raises(ResearchError) as error:
        asyncio.run(client.search_repositories("search"))

    assert error.value.recoverable is True


def test_malformed_repository_response_raises_research_error():
    client = GitHubClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json=repository_payload(stargazers_count="many")))
    )

    with pytest.raises(ResearchError):
        asyncio.run(client.get_repository("example/search-kit"))

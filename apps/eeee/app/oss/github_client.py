"""Small GitHub REST client for repository snapshots."""

import re
from datetime import datetime
from urllib.parse import urlsplit

import httpx
from pydantic import ValidationError

from app.domain.models import RepositorySnapshot
from app.oss.license_ids import RECOGNIZED_SPDX_IDS


class ResearchError(Exception):
    """A recoverable failure to obtain trustworthy repository evidence."""

    recoverable = True

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class GitHubClient:
    def __init__(self, token: str | None = None, transport: httpx.AsyncBaseTransport | None = None):
        self.token = token
        self.transport = transport

    async def search_repositories(
        self, query: str, language: str | None = None, limit: int = 5
    ) -> list[RepositorySnapshot]:
        if not 1 <= limit <= 100:
            raise ValueError("limit must be between 1 and 100")
        search_query = f"{query} language:{language}" if language else query
        payload = await self._get("/search/repositories", params={"q": search_query, "per_page": limit})
        items = payload.get("items")
        if not isinstance(items, list):
            raise ResearchError("Malformed GitHub search response: items must be a list")
        return [self._snapshot(item) for item in items]

    async def get_repository(self, full_name: str) -> RepositorySnapshot:
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", full_name):
            raise ValueError("full_name must be owner/repository")
        payload = await self._get(f"/repos/{full_name}")
        return self._snapshot(payload)

    async def _get(self, path: str, params: dict[str, str | int] | None = None) -> dict:
        headers = {"Accept": "application/vnd.github+json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        try:
            async with httpx.AsyncClient(
                base_url="https://api.github.com",
                headers=headers,
                timeout=httpx.Timeout(10.0, connect=5.0),
                transport=self.transport,
            ) as client:
                response = await client.get(path, params=params)
        except httpx.HTTPError as exc:
            raise ResearchError(f"GitHub request failed: {exc}") from exc
        if not 200 <= response.status_code < 300:
            raise ResearchError(
                f"GitHub returned HTTP {response.status_code}", status_code=response.status_code
            )
        try:
            payload = response.json()
        except ValueError as exc:
            raise ResearchError("Malformed GitHub JSON response") from exc
        if not isinstance(payload, dict):
            raise ResearchError("Malformed GitHub response: expected an object")
        return payload

    @staticmethod
    def _snapshot(payload: object) -> RepositorySnapshot:
        if not isinstance(payload, dict):
            raise ResearchError("Malformed GitHub repository response")
        try:
            full_name = payload["full_name"]
            html_url = payload["html_url"]
            if not isinstance(full_name, str) or not re.fullmatch(
                r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", full_name
            ) or not isinstance(html_url, str):
                raise ResearchError("Malformed GitHub repository identity")
            url = urlsplit(html_url)
            if (
                url.scheme != "https"
                or url.netloc.lower() != "github.com"
                or url.path.rstrip("/").casefold() != f"/{full_name}".casefold()
                or url.query
                or url.fragment
            ):
                raise ResearchError("GitHub repository URL does not match full_name")
            license_data = payload.get("license")
            if license_data is not None:
                if not isinstance(license_data, dict) or "spdx_id" not in license_data:
                    raise ResearchError("Malformed GitHub license response")
                license_spdx = license_data["spdx_id"]
                if license_spdx is not None and not isinstance(license_spdx, str):
                    raise ResearchError("Malformed GitHub license identifier")
                if license_spdx not in RECOGNIZED_SPDX_IDS:
                    license_spdx = None
            else:
                license_spdx = None
            pushed_at = payload.get("pushed_at")
            if pushed_at is None:
                pushed_at = ""
            if not isinstance(pushed_at, str):
                raise ResearchError("GitHub repository has an invalid maintenance timestamp")
            if pushed_at:
                try:
                    timestamp = datetime.fromisoformat(pushed_at.replace("Z", "+00:00"))
                except ValueError as exc:
                    raise ResearchError("GitHub repository has an invalid maintenance timestamp") from exc
                if timestamp.tzinfo is None:
                    raise ResearchError("GitHub repository has an invalid maintenance timestamp")
            return RepositorySnapshot.model_validate(
                {
                    "full_name": full_name,
                    "html_url": html_url,
                    "description": payload.get("description") or "",
                    "stars": payload["stargazers_count"],
                    "forks": payload["forks_count"],
                    "open_issues": payload["open_issues_count"],
                    "license_spdx": license_spdx,
                    "default_branch": payload["default_branch"],
                    "pushed_at": pushed_at,
                    "topics": payload.get("topics", []),
                }
            )
        except (KeyError, TypeError, ValueError, ValidationError) as exc:
            raise ResearchError("Malformed GitHub repository response") from exc

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from app.project_runtime.models import ProjectProfile


class NotionClientError(RuntimeError):
    """A safe, provider-neutral error from the Notion REST boundary."""


@dataclass(frozen=True)
class NotionPageRef:
    id: str
    url: str | None = None


class NotionClient:
    """Minimal typed Notion adapter used by EEEE's project document connector."""

    def __init__(
        self,
        token: str,
        *,
        parent_page_id: str,
        base_url: str = "https://api.notion.com",
        api_version: str = "2026-03-11",
        timeout_seconds: float = 20.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        if not token.strip():
            raise ValueError("Notion token is required")
        if not parent_page_id.strip():
            raise ValueError("Notion parent page id is required")
        self.parent_page_id = parent_page_id.strip()
        self.api_version = api_version
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            timeout=timeout_seconds,
            transport=transport,
            headers={
                "Authorization": f"Bearer {token}",
                "Notion-Version": api_version,
                "Content-Type": "application/json",
            },
        )

    def create_project_page(self, profile: ProjectProfile, lines: list[str]) -> NotionPageRef:
        response = self._client.post(
            "/v1/pages",
            json={
                "parent": {"type": "page_id", "page_id": self.parent_page_id},
                "properties": {"title": {"title": [_text_span(f"Gleave · {profile.project_id}")]}},
                "children": [
                    {
                        "object": "block",
                        "type": "heading_2",
                        "heading_2": {"rich_text": [_text_span("Project specification")]},
                    },
                    *_paragraph_blocks(lines),
                ],
            },
        )
        payload = self._json(response)
        page_id = payload.get("id")
        if not isinstance(page_id, str) or not page_id.strip():
            raise NotionClientError("Notion create response did not contain a page id")
        url = payload.get("url")
        return NotionPageRef(id=page_id, url=url if isinstance(url, str) else None)

    def append_revision(self, page_id: str, revision: str, lines: list[str]) -> None:
        response = self._client.patch(
            f"/v1/blocks/{page_id}/children",
            json={
                "children": [
                    {
                        "object": "block",
                        "type": "heading_3",
                        "heading_3": {"rich_text": [_text_span(f"Revision {revision}")]},
                    },
                    *_paragraph_blocks(lines),
                ]
            },
        )
        self._json(response)

    def get_page(self, page_id: str) -> NotionPageRef:
        response = self._client.get(f"/v1/pages/{page_id}")
        payload = self._json(response)
        resolved_id = payload.get("id")
        if not isinstance(resolved_id, str) or not resolved_id.strip():
            raise NotionClientError("Notion page response did not contain a page id")
        url = payload.get("url")
        return NotionPageRef(id=resolved_id, url=url if isinstance(url, str) else None)

    def _json(self, response: httpx.Response) -> dict[str, Any]:
        if not response.is_success:
            try:
                detail = response.json()
            except ValueError:
                detail = response.text
            raise NotionClientError(
                f"Notion API request failed ({response.status_code}): {detail}"
            )
        try:
            payload = response.json()
        except ValueError as exc:
            raise NotionClientError("Notion API returned invalid JSON") from exc
        if not isinstance(payload, dict):
            raise NotionClientError("Notion API returned an invalid object")
        return payload


def _text_span(content: str) -> dict[str, Any]:
    return {"type": "text", "text": {"content": content[:2000]}}


def _paragraph_blocks(lines: list[str]) -> list[dict[str, Any]]:
    return [
        {
            "object": "block",
            "type": "paragraph",
            "paragraph": {"rich_text": [_text_span(line)]},
        }
        for line in lines
        if line.strip()
    ]

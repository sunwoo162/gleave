"""Headless Desktop control-plane state and commands."""

from __future__ import annotations

from typing import Any


class DesktopSession:
    """Keep the Desktop presentation model separate from the Qt window."""

    def __init__(self, client: Any) -> None:
        self.client = client
        self.project_id: str | None = None
        self.snapshot: dict[str, object] = {}

    def refresh(self, project_id: str | None = None) -> dict[str, object]:
        if project_id is not None:
            self.project_id = project_id
        self.snapshot = self.client.get_desktop_state(self.project_id)
        return self.snapshot

    def route(self, text: str, workspace: str | None = None) -> dict[str, object]:
        result = self.client.route_assistant(text, workspace)
        selected_project = result.get("project_id")
        if isinstance(selected_project, str) and selected_project:
            self.project_id = selected_project
        snapshot = self.refresh()
        snapshot["assistantRoute"] = result
        self.snapshot = snapshot
        return snapshot

    def issue_pairing_code(self) -> dict[str, object]:
        result = self.client.issue_pairing_code()
        return _without_secrets(result)


def _without_secrets(value: dict[str, object]) -> dict[str, object]:
    return {
        key: item
        for key, item in value.items()
        if key.replace("_", "").lower() not in {"accesstoken", "token", "password"}
    }

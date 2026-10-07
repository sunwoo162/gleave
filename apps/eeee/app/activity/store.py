from __future__ import annotations

import hashlib
import json

from app.activity.models import ActivityEvent, ActivityPage
from app.storage.sqlite import SQLiteStore


class ActivityLedger:
    def __init__(self, store: SQLiteStore) -> None:
        self.store = store

    @staticmethod
    def require_explanation(event: ActivityEvent) -> None:
        if event.status == "completed" and not event.reason.strip():
            raise ValueError("completed activity requires reason")
        if event.status == "completed" and event.event_type in {
            "task.completed", "commit.created", "review.completed", "qa.completed", "claimlatch.checked",
        } and not event.evidence_refs:
            raise ValueError("completed activity requires evidence")

    def append(self, event: ActivityEvent) -> ActivityEvent:
        self.require_explanation(event)
        self.store._ensure_activity_revision(event.project_id, event.project_revision)
        payload = event.model_dump(mode="json", by_alias=True)
        payload["hash"] = "sha256:" + hashlib.sha256(
            json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        with self.store._connect() as connection:
            cursor = connection.execute(
                "INSERT INTO project_activity_events "
                "(project_id, project_revision, event_json, event_hash, occurred_at) VALUES (?, ?, ?, ?, ?)",
                (event.project_id, event.project_revision, json.dumps(payload, ensure_ascii=False),
                 payload["hash"], event.occurred_at.isoformat()),
            ).lastrowid
        return event.model_copy(update={"cursor": cursor})

    def list(self, project_id: str, revision: str, cursor: int = 0) -> ActivityPage:
        self.store._ensure_activity_revision(project_id, revision)
        with self.store._connect() as connection:
            rows = connection.execute(
                "SELECT cursor, event_json FROM project_activity_events "
                "WHERE project_id = ? AND project_revision = ? AND cursor > ? ORDER BY cursor",
                (project_id, revision, cursor),
            ).fetchall()
        events = []
        for row in rows:
            payload = json.loads(row["event_json"])
            payload.pop("hash", None)
            events.append(ActivityEvent.model_validate({**payload, "cursor": row["cursor"]}))
        return ActivityPage(project_id=project_id, project_revision=revision,
                            cursor=max([cursor, *(event.cursor or 0 for event in events)]), events=events)

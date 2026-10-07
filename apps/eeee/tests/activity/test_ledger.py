from datetime import datetime, timezone

from app.activity.models import ActivityEvent
from app.activity.store import ActivityLedger
from app.storage.sqlite import SQLiteStore


def _event(node: str, cursor: int | None = None) -> ActivityEvent:
    return ActivityEvent(event_type="decision.made", project_id="project-1", project_revision="1",
                         run_id="run-1", node_id=node, parent_node_id="root", actor_type="agent",
                         actor_id="planner", summary="Choose FSD", reason="Keep boundaries clear",
                         alternatives=["single file"], selected_because="Easier to test",
                         inputs=["artifact://requirements"], outputs=["artifact://decision"],
                         evidence_refs=["commit://abc"], status="completed",
                         occurred_at=datetime.now(timezone.utc), cursor=cursor)


def test_activity_ledger_is_append_only_and_cursor_paginated(tmp_path) -> None:
    store = SQLiteStore(tmp_path / "state.sqlite3")
    store.init()
    store.create_project("project-1", "Test", str(tmp_path), revision="1")
    ledger = ActivityLedger(store)
    first = ledger.append(_event("planning"))
    second = ledger.append(_event("frontend"))
    page = ledger.list("project-1", "1", cursor=first.cursor or 0)
    assert first.cursor == 1
    assert second.cursor == 2
    assert [item.node_id for item in page.events] == ["frontend"]
    assert page.cursor == 2


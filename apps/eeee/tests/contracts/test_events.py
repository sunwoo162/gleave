from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.contracts.events import EventEnvelope, LocalEventBus


def event(number: int, *, project_id: str | None = None, revision: str | None = None) -> EventEnvelope:
    return EventEnvelope(
        event_type="execution.updated",
        execution_id=f"exe-{number}",
        request_id=f"req-{number}",
        project_id=project_id,
        project_revision=revision,
        payload={"number": number},
        published_at=datetime(2026, 10, 6, tzinfo=timezone.utc),
    )


def test_publish_allocates_ordered_cursors_and_replay_filters_after_cursor() -> None:
    bus = LocalEventBus()
    first = bus.publish(event(1, project_id="p1", revision="r1"))
    second = bus.publish(event(2, project_id="p2", revision="r1"))
    third = bus.publish(event(3, project_id="p1", revision="r1"))

    assert [first.cursor, second.cursor, third.cursor] == [1, 2, 3]
    assert [item.cursor for item in bus.replay(after_cursor=1)] == [2, 3]
    assert [item.cursor for item in bus.replay(after_cursor=0, project_id="p1")] == [1, 3]
    assert [item.cursor for item in bus.replay(after_cursor=0, limit=2)] == [1, 2]
    assert first.model_dump(mode="json", by_alias=True)["projectRevision"] == "r1"
    assert first.model_dump(mode="json", by_alias=True)["eventType"] == "execution.updated"


def test_subscriber_failure_does_not_stop_other_subscribers_or_replay() -> None:
    bus = LocalEventBus()
    received: list[int] = []

    def broken(_: EventEnvelope) -> None:
        raise RuntimeError("observer broke")

    bus.subscribe(broken)
    unsubscribe = bus.subscribe(lambda item: received.append(item.cursor))
    bus.publish(event(1))
    assert received == [1]
    assert [item.cursor for item in bus.replay()] == [1]
    assert bus.subscriber_errors == [(1, "RuntimeError", "observer broke")]
    unsubscribe()
    bus.publish(event(2))
    assert received == [1]


def test_unpublished_event_is_immutable_and_rejects_incomplete_project_revision() -> None:
    item = event(1)
    assert item.cursor is None
    with pytest.raises(ValidationError):
        item.cursor = 4
    with pytest.raises(ValidationError):
        event(2, project_id="p1")
    with pytest.raises(ValidationError):
        event(3, revision="r1")

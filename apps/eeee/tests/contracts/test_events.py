from datetime import datetime, timezone
from threading import Event, Thread
from time import monotonic, sleep

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


def test_published_event_payload_cannot_be_mutated() -> None:
    source = {"nested": [{"value": "original"}]}
    item = EventEnvelope(
        event_type="execution.updated",
        execution_id="exe-1",
        request_id="req-1",
        payload=source,
    )
    published = LocalEventBus().publish(item)
    source["nested"][0]["value"] = "tampered"
    with pytest.raises(TypeError):
        published.payload["nested"][0]["value"] = "tampered again"
    assert published.model_dump(mode="json", by_alias=True)["payload"] == {
        "nested": [{"value": "original"}]
    }


def test_concurrent_publish_delivers_callbacks_in_cursor_order() -> None:
    bus = LocalEventBus()
    entered_first = Event()
    release_first = Event()
    delivered: list[int] = []

    def callback(item: EventEnvelope) -> None:
        if item.cursor == 1:
            entered_first.set()
            assert release_first.wait(timeout=3)
        delivered.append(item.cursor)

    bus.subscribe(callback)
    first = Thread(target=lambda: bus.publish(event(1)))
    second = Thread(target=lambda: bus.publish(event(2)))
    try:
        first.start()
        assert entered_first.wait(timeout=3)
        second.start()
        deadline = monotonic() + 3
        while len(bus.replay()) < 2 and monotonic() < deadline:
            sleep(0.005)
        assert len(bus.replay()) == 2
        assert delivered == []
    finally:
        release_first.set()
        first.join(timeout=3)
        second.join(timeout=3)

    assert not first.is_alive() and not second.is_alive()
    assert delivered == [1, 2]


def test_callback_can_wait_for_another_thread_to_publish_without_deadlock() -> None:
    bus = LocalEventBus()
    delivered: list[int] = []

    def callback(item: EventEnvelope) -> None:
        if item.cursor == 1:
            worker_finished = Event()

            def publish_from_worker() -> None:
                bus.publish(event(2))
                worker_finished.set()

            worker = Thread(target=publish_from_worker, daemon=True)
            worker.start()
            if not worker_finished.wait(timeout=1):
                raise TimeoutError("worker publish waited for the active callback")
            worker.join(timeout=1)
        delivered.append(item.cursor)

    bus.subscribe(callback)
    bus.publish(event(1))

    assert delivered == [1, 2]
    assert bus.subscriber_errors == []

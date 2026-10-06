"""Ordered local lifecycle events independent of their eventual transport."""

from __future__ import annotations

from collections import deque
from collections.abc import Callable, Mapping
from datetime import datetime, timezone
from threading import Condition, Lock, get_ident
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator, model_validator

from app.contracts.execution import _freeze_json, _thaw_json


class EventEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    cursor: int | None = Field(default=None, ge=1)
    event_type: str = Field(min_length=1, alias="eventType")
    execution_id: str = Field(min_length=1, alias="executionId")
    request_id: str = Field(min_length=1, alias="requestId")
    project_id: str | None = Field(default=None, min_length=1, alias="projectId")
    project_revision: str | None = Field(default=None, min_length=1, alias="projectRevision")
    payload: Mapping[str, Any] = Field(default_factory=dict)
    published_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), alias="publishedAt")

    @field_validator("event_type", "execution_id", "request_id", "project_id", "project_revision")
    @classmethod
    def nonblank_identity(cls, value: str | None) -> str | None:
        if value is not None and (not value.strip() or value != value.strip()):
            raise ValueError("event identifiers must be nonblank and unpadded")
        return value

    @model_validator(mode="after")
    def validate_project_identity(self) -> EventEnvelope:
        if (self.project_id is None) != (self.project_revision is None):
            raise ValueError("project ID and revision must be supplied together")
        object.__setattr__(self, "payload", _freeze_json(self.payload))
        return self

    @field_serializer("payload")
    def serialize_payload(self, value: Mapping[str, Any]) -> dict[str, Any]:
        return _thaw_json(value)


class LocalEventBus:
    """Small in-memory event log with isolated synchronous observers."""

    def __init__(self) -> None:
        self._condition = Condition(Lock())
        self._events: list[EventEnvelope] = []
        self._subscribers: dict[int, Callable[[EventEnvelope], None]] = {}
        self._subscriber_errors: list[tuple[int, str, str]] = []
        self._next_subscriber_id = 1
        self._pending: deque[tuple[EventEnvelope, tuple[tuple[int, Callable[[EventEnvelope], None]], ...]]] = deque()
        self._dispatching = False
        self._dispatcher_thread_id: int | None = None
        self._delivered_cursor = 0

    @property
    def subscriber_errors(self) -> list[tuple[int, str, str]]:
        with self._condition:
            return list(self._subscriber_errors)

    def subscribe(self, callback: Callable[[EventEnvelope], None]) -> Callable[[], None]:
        with self._condition:
            subscriber_id = self._next_subscriber_id
            self._next_subscriber_id += 1
            self._subscribers[subscriber_id] = callback

        def unsubscribe() -> None:
            with self._condition:
                self._subscribers.pop(subscriber_id, None)

        return unsubscribe

    def publish(self, event: EventEnvelope) -> EventEnvelope:
        if event.cursor is not None:
            raise ValueError("event cursor is assigned by the bus")
        with self._condition:
            published = EventEnvelope.model_validate({**event.model_dump(), "cursor": len(self._events) + 1})
            self._events.append(published)
            subscribers = tuple(self._subscribers.items())
            self._pending.append((published, subscribers))
            if not self._dispatching:
                self._dispatching = True
                self._dispatcher_thread_id = get_ident()
            elif self._dispatcher_thread_id == get_ident():
                # A callback may publish again; the active dispatcher drains it next.
                return published
            else:
                while self._delivered_cursor < published.cursor:
                    self._condition.wait()
                return published
        self._drain_notifications()
        return published

    def _drain_notifications(self) -> None:
        while True:
            with self._condition:
                if not self._pending:
                    self._dispatching = False
                    self._dispatcher_thread_id = None
                    self._condition.notify_all()
                    return
                published, subscribers = self._pending.popleft()
            for subscriber_id, callback in subscribers:
                try:
                    callback(published)
                except Exception as exc:
                    # Observers cannot prevent another observer or replay; failures remain visible.
                    with self._condition:
                        self._subscriber_errors.append((subscriber_id, type(exc).__name__, str(exc)))
            with self._condition:
                self._delivered_cursor = published.cursor
                self._condition.notify_all()

    def replay(
        self,
        *,
        after_cursor: int = 0,
        project_id: str | None = None,
        project_revision: str | None = None,
        limit: int | None = None,
    ) -> list[EventEnvelope]:
        if after_cursor < 0 or limit is not None and limit < 1:
            raise ValueError("cursor must be nonnegative and limit must be positive")
        if project_revision is not None and project_id is None:
            raise ValueError("revision filter requires project ID")
        with self._condition:
            events = [
                event for event in self._events
                if event.cursor > after_cursor
                and (project_id is None or event.project_id == project_id)
                and (project_revision is None or event.project_revision == project_revision)
            ]
        return events if limit is None else events[:limit]

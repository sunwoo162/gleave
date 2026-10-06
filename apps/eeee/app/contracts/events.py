"""Ordered local lifecycle events independent of their eventual transport."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timezone
from threading import Lock
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class EventEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    cursor: int | None = Field(default=None, ge=1)
    event_type: str = Field(min_length=1, alias="eventType")
    execution_id: str = Field(min_length=1, alias="executionId")
    request_id: str = Field(min_length=1, alias="requestId")
    project_id: str | None = Field(default=None, min_length=1, alias="projectId")
    project_revision: str | None = Field(default=None, min_length=1, alias="projectRevision")
    payload: dict[str, Any] = Field(default_factory=dict)
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
        return self


class LocalEventBus:
    """Small in-memory event log with isolated synchronous observers."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._events: list[EventEnvelope] = []
        self._subscribers: dict[int, Callable[[EventEnvelope], None]] = {}
        self._subscriber_errors: list[tuple[int, str, str]] = []
        self._next_subscriber_id = 1

    @property
    def subscriber_errors(self) -> list[tuple[int, str, str]]:
        with self._lock:
            return list(self._subscriber_errors)

    def subscribe(self, callback: Callable[[EventEnvelope], None]) -> Callable[[], None]:
        with self._lock:
            subscriber_id = self._next_subscriber_id
            self._next_subscriber_id += 1
            self._subscribers[subscriber_id] = callback

        def unsubscribe() -> None:
            with self._lock:
                self._subscribers.pop(subscriber_id, None)

        return unsubscribe

    def publish(self, event: EventEnvelope) -> EventEnvelope:
        if event.cursor is not None:
            raise ValueError("event cursor is assigned by the bus")
        with self._lock:
            published = EventEnvelope.model_validate({**event.model_dump(), "cursor": len(self._events) + 1})
            self._events.append(published)
            subscribers = tuple(self._subscribers.items())
        for subscriber_id, callback in subscribers:
            try:
                callback(published)
            except Exception as exc:
                # Observers cannot prevent another observer or replay; their failures remain visible.
                with self._lock:
                    self._subscriber_errors.append((subscriber_id, type(exc).__name__, str(exc)))
                continue
        return published

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
        with self._lock:
            events = [
                event for event in self._events
                if event.cursor > after_cursor
                and (project_id is None or event.project_id == project_id)
                and (project_revision is None or event.project_revision == project_revision)
            ]
        return events if limit is None else events[:limit]

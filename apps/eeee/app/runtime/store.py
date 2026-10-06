"""SQLite projections of shared execution and plugin lifecycle contracts."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import sqlite3
from typing import Any

from pydantic import BaseModel

from app.contracts import EventEnvelope, ExecutionEnvelope, ExecutionStatus
from app.storage.sqlite import SQLiteStore


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _current_project_revision(
    connection: sqlite3.Connection, project_id: str | None, revision: str | None
) -> None:
    if project_id is None:
        return
    row = connection.execute("SELECT revision FROM projects WHERE id = ?", (project_id,)).fetchone()
    if row is None:
        raise KeyError(f"Project not found: {project_id}")
    if row["revision"] != revision:
        raise ValueError(f"stale project revision for {project_id}: {revision}")


def _ensure_execution_update(previous: ExecutionEnvelope, current: ExecutionEnvelope) -> None:
    identity = (
        "request_id", "project_id", "project_revision", "capability_id", "tool_id", "actor",
        "input_schema_version", "input", "started_at",
    )
    if any(getattr(previous, field) != getattr(current, field) for field in identity):
        raise ValueError("execution identity and original input cannot change")
    if previous.status in {
        ExecutionStatus.COMPLETED, ExecutionStatus.BLOCKED,
        ExecutionStatus.FAILED, ExecutionStatus.CANCELLED,
    } and previous != current:
        raise ValueError("terminal execution cannot be rewritten")
    if previous.status == current.status:
        return
    # The shared contract owns transition policy. Validate the proposed status
    # with it rather than keeping a second transition matrix in persistence.
    previous.transition(
        current.status,
        at=current.completed_at,
        output=None if current.output is None else dict(current.output),
        error=current.error,
        approval_state=current.approval_state,
    )


class ExecutionStore:
    """Persist envelopes and an ordered, replayable local event ledger."""

    def __init__(self, store: SQLiteStore):
        self.store = store

    def save(self, envelope: ExecutionEnvelope) -> ExecutionEnvelope:
        with self.store._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            _current_project_revision(connection, envelope.project_id, envelope.project_revision)
            row = connection.execute(
                "SELECT envelope_json, created_at FROM execution_envelopes WHERE execution_id = ?",
                (envelope.execution_id,),
            ).fetchone()
            if row is not None:
                previous = ExecutionEnvelope.model_validate_json(row["envelope_json"])
                _ensure_execution_update(previous, envelope)
            timestamp = _now()
            connection.execute(
                "INSERT INTO execution_envelopes "
                "(execution_id, request_id, project_id, project_revision, capability_id, tool_id, "
                "status, envelope_json, started_at, completed_at, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(execution_id) DO UPDATE SET "
                "status = excluded.status, envelope_json = excluded.envelope_json, "
                "completed_at = excluded.completed_at, updated_at = excluded.updated_at",
                (
                    envelope.execution_id, envelope.request_id, envelope.project_id,
                    envelope.project_revision, envelope.capability_id, envelope.tool_id,
                    envelope.status.value, envelope.model_dump_json(by_alias=True),
                    envelope.started_at.isoformat(),
                    envelope.completed_at.isoformat() if envelope.completed_at else None,
                    row["created_at"] if row is not None else timestamp, timestamp,
                ),
            )
        return envelope

    def get(self, execution_id: str) -> ExecutionEnvelope:
        with self.store._connect() as connection:
            row = connection.execute(
                "SELECT envelope_json FROM execution_envelopes WHERE execution_id = ?",
                (execution_id,),
            ).fetchone()
        if row is None:
            raise KeyError(f"Execution not found: {execution_id}")
        return ExecutionEnvelope.model_validate_json(row["envelope_json"])

    def list_for_project(self, project_id: str, revision: str | None = None) -> list[ExecutionEnvelope]:
        query = "SELECT envelope_json FROM execution_envelopes WHERE project_id = ?"
        parameters: list[str] = [project_id]
        if revision is not None:
            query += " AND project_revision = ?"
            parameters.append(revision)
        query += " ORDER BY started_at, created_at, rowid"
        with self.store._connect() as connection:
            rows = connection.execute(query, parameters).fetchall()
        return [ExecutionEnvelope.model_validate_json(row["envelope_json"]) for row in rows]

    def append_event(self, event: EventEnvelope) -> EventEnvelope:
        with self.store._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            _current_project_revision(connection, event.project_id, event.project_revision)
            execution = connection.execute(
                "SELECT request_id, project_id, project_revision FROM execution_envelopes "
                "WHERE execution_id = ?", (event.execution_id,),
            ).fetchone()
            if execution is None:
                raise KeyError(f"Execution not found: {event.execution_id}")
            if (
                execution["request_id"] != event.request_id
                or execution["project_id"] != event.project_id
                or execution["project_revision"] != event.project_revision
            ):
                raise ValueError("event and execution identity mismatch")
            cursor = connection.execute(
                "INSERT INTO execution_events "
                "(execution_id, request_id, project_id, project_revision, event_type, event_json, published_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    event.execution_id, event.request_id, event.project_id,
                    event.project_revision, event.event_type, event.model_dump_json(by_alias=True),
                    event.published_at.isoformat(),
                ),
            ).lastrowid
            published = EventEnvelope.model_validate({**event.model_dump(), "cursor": cursor})
            connection.execute(
                "UPDATE execution_events SET event_json = ? WHERE cursor = ?",
                (published.model_dump_json(by_alias=True), cursor),
            )
        return published

    def replay_events(
        self, *, after_cursor: int = 0, project_id: str | None = None,
        revision: str | None = None, limit: int | None = None,
    ) -> list[EventEnvelope]:
        if after_cursor < 0 or limit is not None and limit < 1:
            raise ValueError("cursor must be nonnegative and limit must be positive")
        if revision is not None and project_id is None:
            raise ValueError("revision filter requires project ID")
        query = "SELECT event_json FROM execution_events WHERE cursor > ?"
        parameters: list[int | str] = [after_cursor]
        if project_id is not None:
            query += " AND project_id = ?"
            parameters.append(project_id)
        if revision is not None:
            query += " AND project_revision = ?"
            parameters.append(revision)
        query += " ORDER BY cursor"
        if limit is not None:
            query += " LIMIT ?"
            parameters.append(limit)
        with self.store._connect() as connection:
            rows = connection.execute(query, parameters).fetchall()
        return [EventEnvelope.model_validate_json(row["event_json"]) for row in rows]


@dataclass(frozen=True)
class PluginRegistration:
    plugin_id: str
    manifest_version: str
    manifest: dict[str, Any]
    status: str
    created_at: str
    updated_at: str
    removed_at: str | None = None


_PLUGIN_STATUSES = frozenset(
    {"available", "not_installed", "awaiting_authentication", "connected", "disabled", "failed"}
)


def _registration_from_row(row: sqlite3.Row) -> PluginRegistration:
    return PluginRegistration(
        plugin_id=row["plugin_id"], manifest_version=row["manifest_version"],
        manifest=json.loads(row["manifest_json"]), status=row["status"],
        created_at=row["created_at"], updated_at=row["updated_at"], removed_at=row["removed_at"],
    )


def _manifest_data(manifest: Mapping[str, Any] | BaseModel) -> dict[str, Any]:
    if isinstance(manifest, BaseModel):
        data = manifest.model_dump(mode="json", by_alias=True)
    elif isinstance(manifest, Mapping):
        data = dict(manifest)
    else:
        raise TypeError("plugin manifest must be a mapping or Pydantic model")
    if not isinstance(data.get("id"), str) or not data["id"].strip():
        raise ValueError("plugin manifest id is required")
    if not isinstance(data.get("version"), str) or not data["version"].strip():
        raise ValueError("plugin manifest version is required")
    return json.loads(json.dumps(data, ensure_ascii=False, allow_nan=False))


class PluginRegistrationStore:
    """Soft-delete plugin registrations while retaining lifecycle audit rows."""

    def __init__(self, store: SQLiteStore):
        self.store = store

    @staticmethod
    def _audit(
        connection: sqlite3.Connection, plugin_id: str, action: str, status: str,
        manifest_version: str, occurred_at: str,
    ) -> None:
        connection.execute(
            "INSERT INTO plugin_audit_events "
            "(plugin_id, action, status, manifest_version, event_json, occurred_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                plugin_id, action, status, manifest_version,
                json.dumps({"pluginId": plugin_id, "action": action, "status": status,
                            "manifestVersion": manifest_version, "occurredAt": occurred_at}),
                occurred_at,
            ),
        )

    def register(self, manifest: Mapping[str, Any] | BaseModel) -> PluginRegistration:
        data = _manifest_data(manifest)
        plugin_id, version = data["id"], data["version"]
        timestamp = _now()
        with self.store._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            prior = connection.execute(
                "SELECT removed_at FROM plugin_registrations WHERE plugin_id = ?", (plugin_id,)
            ).fetchone()
            if prior is not None and prior["removed_at"] is None:
                raise ValueError(f"plugin already registered: {plugin_id}")
            if prior is None:
                connection.execute(
                    "INSERT INTO plugin_registrations "
                    "(plugin_id, manifest_version, status, manifest_json, created_at, updated_at, removed_at) "
                    "VALUES (?, ?, 'available', ?, ?, ?, NULL)",
                    (plugin_id, version, json.dumps(data, ensure_ascii=False, sort_keys=True), timestamp, timestamp),
                )
            else:
                connection.execute(
                    "UPDATE plugin_registrations SET manifest_version = ?, status = 'available', "
                    "manifest_json = ?, created_at = ?, updated_at = ?, removed_at = NULL "
                    "WHERE plugin_id = ?",
                    (version, json.dumps(data, ensure_ascii=False, sort_keys=True), timestamp, timestamp, plugin_id),
                )
            self._audit(connection, plugin_id, "registered", "available", version, timestamp)
            row = connection.execute(
                "SELECT * FROM plugin_registrations WHERE plugin_id = ?", (plugin_id,)
            ).fetchone()
        return _registration_from_row(row)

    def get(self, plugin_id: str) -> PluginRegistration:
        with self.store._connect() as connection:
            row = connection.execute(
                "SELECT * FROM plugin_registrations WHERE plugin_id = ? AND removed_at IS NULL",
                (plugin_id,),
            ).fetchone()
        if row is None:
            raise KeyError(f"Plugin not found: {plugin_id}")
        return _registration_from_row(row)

    def list(self, status: str | None = None) -> list[PluginRegistration]:
        if status is not None and status not in _PLUGIN_STATUSES:
            raise ValueError(f"invalid plugin status: {status}")
        query = "SELECT * FROM plugin_registrations WHERE removed_at IS NULL"
        parameters: tuple[str, ...] = ()
        if status is not None:
            query += " AND status = ?"
            parameters = (status,)
        query += " ORDER BY plugin_id"
        with self.store._connect() as connection:
            rows = connection.execute(query, parameters).fetchall()
        return [_registration_from_row(row) for row in rows]

    def set_status(self, plugin_id: str, status: str) -> PluginRegistration:
        if status not in _PLUGIN_STATUSES:
            raise ValueError(f"invalid plugin status: {status}")
        timestamp = _now()
        with self.store._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT * FROM plugin_registrations WHERE plugin_id = ? AND removed_at IS NULL",
                (plugin_id,),
            ).fetchone()
            if row is None:
                raise KeyError(f"Plugin not found: {plugin_id}")
            connection.execute(
                "UPDATE plugin_registrations SET status = ?, updated_at = ? WHERE plugin_id = ?",
                (status, timestamp, plugin_id),
            )
            self._audit(connection, plugin_id, f"status:{status}", status, row["manifest_version"], timestamp)
            updated = connection.execute(
                "SELECT * FROM plugin_registrations WHERE plugin_id = ?", (plugin_id,)
            ).fetchone()
        return _registration_from_row(updated)

    def remove(self, plugin_id: str) -> None:
        timestamp = _now()
        with self.store._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT manifest_version FROM plugin_registrations "
                "WHERE plugin_id = ? AND removed_at IS NULL", (plugin_id,),
            ).fetchone()
            if row is None:
                raise KeyError(f"Plugin not found: {plugin_id}")
            connection.execute(
                "UPDATE plugin_registrations SET status = 'removed', updated_at = ?, removed_at = ? "
                "WHERE plugin_id = ?", (timestamp, timestamp, plugin_id),
            )
            self._audit(connection, plugin_id, "removed", "removed", row["manifest_version"], timestamp)

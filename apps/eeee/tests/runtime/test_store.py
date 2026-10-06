"""Durable execution and plugin-registration behavior at the SQLite boundary."""

from datetime import datetime, timedelta, timezone
import sqlite3

import pytest

from app.contracts import EventEnvelope, ExecutionEnvelope, ExecutionStatus
from app.runtime.store import ExecutionStore, PluginRegistrationStore
from app.storage.sqlite import SQLiteStore


def _envelope(**updates: object) -> ExecutionEnvelope:
    values: dict[str, object] = {
        "execution_id": "execution-1",
        "request_id": "request-1",
        "project_id": "project-1",
        "project_revision": "rev-1",
        "capability_id": "project-execution",
        "tool_id": "iseol",
        "actor": "EEEE",
        "input": {"request": "Todo 앱 만들어줘", "options": ["local"]},
        "evidence_ids": ("evidence-1",),
        "claim_latch_receipt_id": "claim-1",
        "qa_report_id": "qa-1",
        "started_at": datetime(2026, 10, 6, 1, 2, 3, tzinfo=timezone.utc),
    }
    values.update(updates)
    return ExecutionEnvelope(**values)


def _event(*, execution_id: str = "execution-1", revision: str = "rev-1") -> EventEnvelope:
    return EventEnvelope(
        event_type="execution.running",
        execution_id=execution_id,
        request_id="request-1",
        project_id="project-1",
        project_revision=revision,
        payload={"progress": ["start"]},
        published_at=datetime(2026, 10, 6, 1, 2, 3, tzinfo=timezone.utc),
    )


def _store(tmp_path) -> SQLiteStore:
    store = SQLiteStore(tmp_path / "runtime.sqlite3")
    store.init()
    store.create_project("project-1", "Todo", str(tmp_path / "workspace"), revision="rev-1")
    return store


def test_envelope_round_trip_preserves_revision_trust_and_evidence_after_restart(tmp_path) -> None:
    store = _store(tmp_path)
    execution = ExecutionStore(store)
    queued = _envelope()
    execution.save(queued)
    running = queued.transition(ExecutionStatus.RUNNING)
    execution.save(running)
    completed = running.transition(
        ExecutionStatus.COMPLETED,
        at=queued.started_at + timedelta(minutes=1),
        output={"result": {"files": ["README.md"]}},
    )
    execution.save(completed)

    reopened = ExecutionStore(SQLiteStore(store.path))
    loaded = reopened.get("execution-1")
    assert loaded == completed
    assert loaded.project_revision == "rev-1"
    assert loaded.claim_latch_receipt_id == "claim-1"
    assert loaded.qa_report_id == "qa-1"
    assert loaded.evidence_ids == ("evidence-1",)
    assert loaded.model_dump(mode="json", by_alias=True)["output"] == {"result": {"files": ["README.md"]}}


def test_project_listing_filters_revision_and_retains_historical_envelopes(tmp_path) -> None:
    store = _store(tmp_path)
    executions = ExecutionStore(store)
    executions.save(_envelope())
    store.update_project_revision("project-1", "rev-2")
    executions.save(_envelope(execution_id="execution-2", project_revision="rev-2"))

    assert [item.execution_id for item in executions.list_for_project("project-1")] == [
        "execution-1", "execution-2"
    ]
    assert [item.execution_id for item in executions.list_for_project("project-1", "rev-1")] == [
        "execution-1"
    ]
    assert [item.execution_id for item in executions.list_for_project("project-1", "rev-2")] == [
        "execution-2"
    ]


def test_stale_revision_cannot_write_envelope_or_event(tmp_path) -> None:
    store = _store(tmp_path)
    executions = ExecutionStore(store)
    executions.save(_envelope())
    store.update_project_revision("project-1", "rev-2")

    with pytest.raises(ValueError, match="stale|revision"):
        executions.save(_envelope(execution_id="execution-2"))
    with pytest.raises(ValueError, match="stale|revision"):
        executions.append_event(_event())
    assert [item.execution_id for item in executions.list_for_project("project-1")] == ["execution-1"]
    assert executions.replay_events(project_id="project-1") == []


def test_missing_project_and_identity_change_are_rejected(tmp_path) -> None:
    store = _store(tmp_path)
    executions = ExecutionStore(store)
    with pytest.raises(KeyError, match="Project"):
        executions.save(_envelope(project_id="missing-project"))
    executions.save(_envelope())
    with pytest.raises(ValueError, match="identity|request"):
        executions.save(_envelope(request_id="another-request"))
    assert executions.get("execution-1").request_id == "request-1"


def test_terminal_execution_cannot_be_rewritten_as_another_result(tmp_path) -> None:
    executions = ExecutionStore(_store(tmp_path))
    queued = _envelope()
    completed = queued.transition(ExecutionStatus.RUNNING).transition(
        ExecutionStatus.COMPLETED,
        at=queued.started_at + timedelta(minutes=1),
        output={"result": "verified"},
    )
    executions.save(completed)
    forged = ExecutionEnvelope.model_validate(
        {**completed.model_dump(), "output": {"result": "unverified"}}
    )

    with pytest.raises(ValueError, match="terminal|completed"):
        executions.save(forged)
    assert executions.get("execution-1") == completed


def test_events_receive_durable_ordered_cursors_and_replay_by_project_revision(tmp_path) -> None:
    store = _store(tmp_path)
    executions = ExecutionStore(store)
    executions.save(_envelope())
    first = executions.append_event(_event())
    second = executions.append_event(_event())
    assert (first.cursor, second.cursor) == (1, 2)

    reopened = ExecutionStore(SQLiteStore(store.path))
    assert [item.cursor for item in reopened.replay_events(project_id="project-1", revision="rev-1")] == [1, 2]
    assert [item.cursor for item in reopened.replay_events(after_cursor=1)] == [2]
    assert reopened.replay_events(project_id="project-1", revision="rev-2") == []


def _manifest(plugin_id: str = "echo") -> dict[str, object]:
    return {
        "id": plugin_id,
        "version": "1.2.3",
        "displayName": "Echo",
        "capabilities": ["echo"],
        "permissions": ["local.read"],
    }


def test_plugin_registration_round_trip_status_and_manifest_version(tmp_path) -> None:
    store = _store(tmp_path)
    registrations = PluginRegistrationStore(store)
    created = registrations.register(_manifest())
    assert created.plugin_id == "echo"
    assert created.status == "available"
    assert created.manifest["version"] == "1.2.3"
    assert created.created_at <= created.updated_at

    connected = registrations.set_status("echo", "connected")
    reopened = PluginRegistrationStore(SQLiteStore(store.path))
    assert reopened.get("echo").status == "connected"
    assert reopened.get("echo").manifest == _manifest()
    assert reopened.get("echo").created_at == created.created_at
    assert connected.updated_at >= created.updated_at
    assert [entry.plugin_id for entry in reopened.list(status="connected")] == ["echo"]
    assert reopened.list(status="available") == []


def test_plugin_removal_disables_listing_and_retains_audit_history(tmp_path) -> None:
    store = _store(tmp_path)
    registrations = PluginRegistrationStore(store)
    registrations.register(_manifest())
    registrations.set_status("echo", "failed")
    registrations.remove("echo")

    reopened = PluginRegistrationStore(SQLiteStore(store.path))
    assert reopened.list() == []
    with pytest.raises(KeyError, match="Plugin"):
        reopened.get("echo")
    with sqlite3.connect(store.path) as connection:
        registration = connection.execute(
            "SELECT status, removed_at, manifest_json FROM plugin_registrations WHERE plugin_id = 'echo'"
        ).fetchone()
        actions = [row[0] for row in connection.execute(
            "SELECT action FROM plugin_audit_events WHERE plugin_id = 'echo' ORDER BY id"
        )]
    assert registration[0] == "removed"
    assert registration[1] is not None
    assert '"version": "1.2.3"' in registration[2]
    assert actions == ["registered", "status:failed", "removed"]


def test_plugin_registration_rejects_duplicate_and_invalid_status(tmp_path) -> None:
    registrations = PluginRegistrationStore(_store(tmp_path))
    registrations.register(_manifest())
    with pytest.raises(ValueError, match="already|registered"):
        registrations.register(_manifest())
    with pytest.raises(ValueError, match="status"):
        registrations.set_status("echo", "made_up")
    assert registrations.get("echo").status == "available"


def test_runtime_tables_are_added_without_discarding_existing_project_data(tmp_path) -> None:
    store = _store(tmp_path)
    store.init()
    with sqlite3.connect(store.path) as connection:
        names = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert store.get_project("project-1").name == "Todo"
    assert {
        "execution_envelopes", "execution_events", "plugin_registrations", "plugin_audit_events"
    } <= names

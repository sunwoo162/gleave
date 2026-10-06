from datetime import datetime, timezone
import json
import sqlite3

import pytest

from app.contracts import EventEnvelope, ExecutionEnvelope, ExecutionStatus
from app.domain.models import PetState, ReportRecord
from app.harness.coordinator import Coordinator
from app.harness.state import AgentTask
from app.integrations.claimlatch_audit import ClaimLatchAuditRecord
from app.runtime.store import ExecutionStore
from app.storage.sqlite import SQLiteStore


NOW = datetime(2026, 10, 6, tzinfo=timezone.utc)


@pytest.fixture
def store(tmp_path):
    result = SQLiteStore(tmp_path / "state.sqlite3")
    result.init()
    result.create_project("p", "Todo", str(tmp_path), revision="r1")
    result.create_project("other", "Other", str(tmp_path), revision="r1")
    return result


def task(store, task_id, role, status, **metadata):
    result = AgentTask(
        id=task_id, role=role, state_version=0, workspace="workspace",
        owned_paths=[task_id], status=status, project_revision="r1", **metadata,
    )
    store.save_harness_task("p", result)
    return result


def snapshot(store, revision=None):
    from app.project_view.service import ProjectViewService

    return ProjectViewService(store).get_snapshot("p", revision)


def execution(store, execution_id="ex", project_id="p", **metadata):
    result = ExecutionEnvelope(
        execution_id=execution_id, request_id="request", project_id=project_id,
        project_revision="r1", capability_id="project-execution", tool_id="iseol",
        actor="ISEOL", status=ExecutionStatus.RUNNING, started_at=NOW, **metadata,
    )
    ExecutionStore(store).save(result)
    return result


def audit(store, receipt="receipt", project_id="p", revision="r1", decision="PASS"):
    store.claimlatch_audits.save(ClaimLatchAuditRecord(
        audit_id=f"audit-{project_id}-{receipt}", subject_id="ex", project_id=project_id,
        project_revision=revision, subject_type="agent-result", decision=decision,
        claim_latch_report_id="claim-report", receipt_id=receipt, payload_hash="hash",
        policy_version="1", adapter_version="1", claim_latch_version="0.2.0",
        request_payload={}, envelope={}, created_at=NOW,
    ))


def test_map_groups_real_tasks_and_selects_all_parallel_current_nodes(store):
    task(store, "qa", "qa", "blocked", dependencies=["build"])
    task(store, "fail", "backend", "failed")
    task(store, "build", "frontend", "running", title="Todo list", progress=45)
    task(store, "plan", "planning", "completed", handoff={"next_task_ids": ["build"]})
    task(store, "wait", "frontend", "pending", dependencies=["plan"])
    task(store, "design", "design", "active")

    result = snapshot(store)
    nodes = {node.id: node for node in result.nodes}
    assert [node.id for node in result.nodes] == [
        "iseol:p", "task:plan", "task:design", "task:build", "task:wait", "task:fail", "task:qa",
    ]
    assert [nodes[f"task:{key}"].status for key in ("wait", "build", "plan", "qa", "fail")] == [
        "waiting", "active", "completed", "blocked", "failed",
    ]
    assert result.current_node_ids == ["task:design", "task:build"]
    assert nodes["task:build"].title == "Todo list"
    assert nodes["task:build"].progress == 45
    assert nodes["task:qa"].depth > nodes["task:build"].depth
    edges = {(edge.source, edge.target, edge.kind) for edge in result.edges}
    assert ("task:build", "task:qa", "dependency") in edges
    assert ("task:plan", "task:build", "handoff") in edges
    assert ("task:plan", "task:wait", "dependency") in edges
    assert result.project_revision == "r1"


def test_handoff_completion_preserves_commit_files_and_timestamps(store):
    harness = Coordinator(store, "p")
    started = harness.start_task(AgentTask(
        id="build", role="frontend", state_version=0, workspace="workspace",
        owned_paths=["src"], status="pending", title="Build Todo",
    ), harness.get_state())
    harness.record_handoff(started.id, {
        "changed_files": ["src/todo.ts"], "summary": "Built list",
        "next_steps": "Independent QA", "evidence_paths": ["test-log.txt"], "commit": "abc123",
    })

    result = snapshot(store)
    node = next(node for node in result.nodes if node.id == "task:build")
    assert node.status == "completed"
    assert node.current_commit == "abc123"
    assert node.changed_files == ["src/todo.ts"]
    assert node.started_at is not None and node.completed_at >= node.started_at
    assert node.evidence_ids == ["test-log.txt"]
    assert node.evidence_status == "unavailable"  # A path is not verified evidence.
    assert store.get_harness_task("build").project_revision == "r1"
    assert store.get_harness_state("p").project_revision == "r1"


def test_execution_evidence_attaches_only_to_explicitly_linked_task(store):
    execution(store, claim_latch_receipt_id="receipt", qa_report_id="qa-report", evidence_ids=("proof",))
    audit(store)
    store.save_report(ReportRecord(id="qa-report", project_id="p", task_id="build", revision="r1",
                                  status="passed", summary="QA", checks=[{"status": "passed"}]))
    task(store, "build", "frontend", "running", execution_id="ex", troubleshooting_ids=["incident-1"])
    task(store, "unlinked", "backend", "completed")

    nodes = {node.id: node for node in snapshot(store).nodes}
    node = nodes["task:build"]
    assert node.execution_id == "ex"
    assert node.claim_latch_receipt_id == "receipt"
    assert node.claim_latch_status == "PASS"
    assert node.qa_report_id == "qa-report" and node.qa_status == "PASS"
    assert node.evidence_ids == ["proof"]
    assert node.troubleshooting_ids == ["incident-1"]
    assert nodes["task:unlinked"].claim_latch_status == "unavailable"
    assert nodes["task:unlinked"].qa_status == "unavailable"
    assert "execution:ex" not in nodes  # No duplicate task/execution node.


@pytest.mark.parametrize("source", ["missing", "foreign", "stale"])
def test_receipt_and_qa_reference_alone_never_imply_pass(store, source):
    execution(store, claim_latch_receipt_id="receipt", qa_report_id="qa-report")
    if source != "missing":
        project_id = "other" if source == "foreign" else "p"
        revision = "old" if source == "stale" else "r1"
        audit(store, project_id=project_id, revision=revision)
        store.save_report(ReportRecord(id="qa-report", project_id=project_id, task_id="build",
                                      revision=revision, status="passed", summary="QA", checks=[]))
    task(store, "build", "frontend", "completed", execution_id="ex")

    node = next(node for node in snapshot(store).nodes if node.id == "task:build")
    assert node.claim_latch_status == "unavailable"
    assert node.qa_status == "unavailable"


def test_warn_and_failed_verification_are_not_upgraded_by_completed_task(store):
    execution(store, claim_latch_receipt_id="receipt", qa_report_id="qa-report")
    audit(store, decision="WARN")
    store.save_report(ReportRecord(id="qa-report", project_id="p", task_id="build", revision="r1",
                                  status="failed", summary="QA failed", checks=[{"status": "failed"}]))
    task(store, "build", "frontend", "completed", execution_id="ex")
    node = next(node for node in snapshot(store).nodes if node.id == "task:build")
    assert node.claim_latch_status == "WARN" and node.qa_status == "FAIL"


def test_current_revision_excludes_stale_tasks_and_rejects_requested_old_revision(store):
    from app.runtime.store import StaleProjectRevision

    task(store, "old", "frontend", "completed")
    execution(store)
    store.update_project_revision("p", "r2")
    result = snapshot(store)
    assert result.project_revision == "r2"
    assert [node.id for node in result.nodes] == ["iseol:p"]
    with pytest.raises(StaleProjectRevision):
        snapshot(store, "r1")


def test_projection_is_read_only_and_replays_only_project_revision_events(store):
    from app.project_view.service import ProjectViewService

    ex = execution(store)
    foreign = execution(store, "foreign", "other")
    executions = ExecutionStore(store)
    for item, kind in ((ex, "execution.running"), (foreign, "execution.running"), (ex, "task.changed")):
        executions.append_event(EventEnvelope(event_type=kind, execution_id=item.execution_id,
            request_id=item.request_id, project_id=item.project_id, project_revision=item.project_revision))
    view = ProjectViewService(store)
    result = view.get_snapshot("p")
    assert result.cursor == 3
    replay = view.get_events("p", cursor=1)
    assert replay.cursor == 3
    assert [event.cursor for event in replay.events] == [3]
    assert view.get_events("p", cursor=3).events == []
    assert view.get_events("p", cursor=3).cursor == 3
    with pytest.raises(KeyError):
        store.get_harness_state("p")  # Projection must not initialize state.
    with pytest.raises(ValueError):
        view.get_events("p", cursor=-1)
    with pytest.raises(KeyError):
        view.get_snapshot("unknown")


def test_unlinked_iseol_execution_is_visible_but_other_capabilities_are_not(store):
    execution(store)
    ExecutionStore(store).save(ExecutionEnvelope(
        execution_id="doc", request_id="r", project_id="p", project_revision="r1",
        capability_id="knowledge-documents", tool_id="documents", actor="EEEE",
    ))
    result = snapshot(store)
    assert [node.id for node in result.nodes] == ["iseol:p", "execution:ex"]
    assert result.current_node_ids == ["execution:ex"]


def test_nested_tasks_use_containment_edges_and_unknown_dependencies_are_not_fabricated(store):
    task(store, "team", "frontend", "running")
    task(store, "child", "frontend", "pending", parent_task_id="team", dependencies=["missing"])
    result = snapshot(store)
    assert ("task:team", "task:child", "contains") in {
        (edge.source, edge.target, edge.kind) for edge in result.edges
    }
    assert all(edge.source != "task:missing" for edge in result.edges)
    assert result.warnings


def test_legacy_unversioned_task_remains_visible_without_trust_claims(store):
    store.save_harness_task("p", AgentTask(id="legacy", role="builder", state_version=0,
        workspace="workspace", owned_paths=[], status="handed_off", handoff={"commit": "abc"}))
    node = next(node for node in snapshot(store).nodes if node.id == "task:legacy")
    assert node.revision_status == "unavailable"
    assert node.qa_status == "unavailable" and node.claim_latch_status == "unavailable"


def test_parent_and_dependency_cycles_do_not_hang_projection(store):
    task(store, "a", "frontend", "running", parent_task_id="b", dependencies=["b"])
    task(store, "b", "frontend", "running", parent_task_id="a", dependencies=["a"])
    result = snapshot(store)
    assert len(result.nodes) == 3
    assert result.warnings


def test_coordinator_work_is_current_after_provisioning_envelope_completed(store):
    work = store.create_task("p", "request", "r1")
    ex = execution(store)
    ExecutionStore(store).save(ex.transition(ExecutionStatus.COMPLETED, output={"status": "provisioned"}))
    result = snapshot(store)
    node = next(node for node in result.nodes if node.id == f"task:{work.id}")
    assert node.status == "active"
    assert node.execution_id == "ex"
    assert node.completed_at is None  # Provisioning completion isn't work completion.
    assert result.current_node_ids == [f"task:{work.id}"]
    assert all(node.id != "execution:ex" for node in result.nodes)


def test_current_work_qa_resolves_durable_task_report_without_execution(store):
    work = store.create_task("p", "request", "r1")
    store.save_report(ReportRecord(id="qa", project_id="p", task_id=work.id, revision="r1",
        status="passed", summary="QA", checks=[{"status": "passed"}]))
    store.update_task(work.id, PetState.completed, "Finished", report_id="qa")
    node = next(node for node in snapshot(store).nodes if node.id == f"task:{work.id}")
    assert node.qa_status == "PASS" and node.qa_report_id == "qa"
    assert node.claim_latch_status == "unavailable"


def test_unlinked_execution_commit_and_file_details_are_projected(store):
    ex = execution(store)
    ExecutionStore(store).save(ex.transition(ExecutionStatus.COMPLETED, output={
        "commit": "aabb", "changedFiles": ["todo.py"], "troubleshootingIds": ["incident-2"],
    }))
    node = next(node for node in snapshot(store).nodes if node.id == "execution:ex")
    assert node.current_commit == "aabb" and node.changed_files == ["todo.py"]
    assert node.troubleshooting_ids == ["incident-2"]


@pytest.mark.parametrize("checks", [[], [{"status": "skipped"}], [{"status": "passed"}, None]])
def test_empty_skipped_or_malformed_qa_checks_do_not_prove_pass(store, checks):
    # The report table permits legacy arbitrary JSON; malformed stored records
    # are treated as unavailable rather than turned into a successful check.
    execution(store, qa_report_id="qa")
    task(store, "build", "frontend", "completed", execution_id="ex")
    with store._connect() as connection:
        connection.execute("INSERT INTO reports VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("qa", "p", "build", "r1", "passed", "Legacy QA", json.dumps(checks)))
    node = next(node for node in snapshot(store).nodes if node.id == "task:build")
    assert node.qa_status == "unavailable"


def test_local_receipt_for_another_subject_is_not_a_task_verification(store):
    execution(store, claim_latch_receipt_id="receipt")
    audit(store)
    with store._connect() as connection:
        connection.execute("UPDATE claimlatch_audits SET subject_id = 'different-task'")
    task(store, "build", "frontend", "completed", execution_id="ex")
    node = next(node for node in snapshot(store).nodes if node.id == "task:build")
    assert node.claim_latch_status == "unavailable"


def test_unknown_state_is_not_silently_successful(store):
    task(store, "future", "frontend", "future-state")
    node = next(node for node in snapshot(store).nodes if node.id == "task:future")
    assert node.status == "unavailable"
    assert node.progress is None


def test_snapshot_reads_one_revision_even_when_revision_advances_mid_read(store, monkeypatch):
    task(store, "build", "frontend", "running")
    with store._connect() as connection:
        connection.execute("PRAGMA journal_mode=WAL")
    connect = store._connect
    changed = False

    class ConcurrentRevisionConnection:
        def __init__(self):
            self.connection = connect()

        def __getattr__(self, name):
            return getattr(self.connection, name)

        def __enter__(self):
            self.connection.__enter__()
            return self

        def __exit__(self, *args):
            return self.connection.__exit__(*args)

        def execute(self, query, parameters=()):
            nonlocal changed
            if "FROM harness_tasks" in query and not changed:
                changed = True
                with sqlite3.connect(store.path) as writer:
                    writer.execute("UPDATE projects SET revision = 'r2' WHERE id = 'p'")
            return self.connection.execute(query, parameters)

    monkeypatch.setattr(store, "_connect", ConcurrentRevisionConnection)
    result = snapshot(store)
    assert result.project_revision == "r1"
    assert any(node.id == "task:build" for node in result.nodes)
    latest = snapshot(store)
    assert latest.project_revision == "r2"
    assert [node.id for node in latest.nodes] == ["iseol:p"]


def test_events_from_old_revision_do_not_leak_into_current_cursor(store):
    from app.project_view.service import ProjectViewService
    from app.runtime.store import StaleProjectRevision

    ex = execution(store)
    ExecutionStore(store).append_event(EventEnvelope(event_type="execution.running", execution_id="ex",
        request_id=ex.request_id, project_id="p", project_revision="r1"))
    store.update_project_revision("p", "r2")
    service = ProjectViewService(store)
    result = service.get_events("p")
    assert result.project_revision == "r2" and result.cursor == 0 and result.events == []
    with pytest.raises(StaleProjectRevision):
        service.get_events("p", revision="r1")


def test_handoff_evidence_alias_is_not_lost_in_projection(store):
    harness = Coordinator(store, "p")
    item = AgentTask(id="build", role="frontend", status="pending", state_version=0,
        workspace="workspace", owned_paths=["src"])
    harness.start_task(item, harness.get_state())
    harness.record_handoff("build", {"summary": "Done", "changed_files": ["src/main.py"],
        "next_step_notes": "Verify", "evidence": ["qa-log.txt"]})
    node = next(node for node in snapshot(store).nodes if node.id == "task:build")
    assert node.evidence_ids == ["qa-log.txt"]


def test_work_task_qa_takes_precedence_over_provisioning_qa(store):
    work = store.create_task("p", "request", "r1")
    execution(store, qa_report_id="provision-qa")
    store.save_report(ReportRecord(id="provision-qa", project_id="p", task_id="ex", revision="r1",
        status="passed", summary="Workspace QA", checks=[{"status": "passed"}]))
    store.save_report(ReportRecord(id="work-qa", project_id="p", task_id=work.id, revision="r1",
        status="failed", summary="App tests failed", checks=[{"status": "failed"}]))
    store.update_task(work.id, PetState.failed, "App tests failed", report_id="work-qa")
    node = next(node for node in snapshot(store).nodes if node.id == f"task:{work.id}")
    assert node.qa_report_id == "work-qa" and node.qa_status == "FAIL"


def test_unversioned_task_cannot_inherit_current_trust_from_new_harness_state(store):
    Coordinator(store, "p").get_state()  # A newly initialized current state.
    execution(store, claim_latch_receipt_id="receipt")
    audit(store)
    store.save_harness_task("p", AgentTask(id="legacy", role="builder", state_version=0,
        workspace="workspace", owned_paths=[], status="completed", execution_id="ex"))
    node = next(node for node in snapshot(store).nodes if node.id == "task:legacy")
    assert node.revision_status == "unavailable"
    assert node.project_revision is None
    assert node.claim_latch_status == "unavailable"

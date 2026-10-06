import subprocess
import httpx
import pytest

from app.coordinator.service import Coordinator
from app.domain.errors import ApprovalError
from app.domain.models import PetState
from app.storage.sqlite import SQLiteStore
from app.oss.github_client import GitHubClient
from app.oss.researcher import GitHubResearcher
from app.workspace.artifacts import WorkspaceArtifactWriter
from app.execution.runner import WorkspaceCommandRunner
from app.execution.verifier import WorkspaceVerifier


def setup_coordinator(tmp_path):
    store = SQLiteStore(tmp_path / "coordinator.sqlite3")
    store.init()
    coordinator = Coordinator(store)
    coordinator.create_project("project-1", "Demo project", str(tmp_path / "workspace"), "rev-1")
    return coordinator, store


def test_coordinator_requires_approval_before_work_and_reaches_completion(tmp_path):
    coordinator, store = setup_coordinator(tmp_path)

    researching = coordinator.create_request("project-1", "Build a web app")
    task_id = researching.task_id
    assert researching.state == PetState.researching
    assert task_id is not None

    awaiting = coordinator.advance_task("project-1", task_id)
    assert awaiting.state == PetState.awaiting_approval
    assert len(awaiting.candidates) == 2

    with pytest.raises(ApprovalError, match="Approval required"):
        coordinator.advance_task("project-1", task_id)

    request_id = store.get_task(task_id).request_id
    working = coordinator.approve_selection("project-1", request_id, ["demo/alpha"])
    assert working.state == PetState.working

    verifying = coordinator.advance_task("project-1", task_id)
    assert verifying.state == PetState.verifying

    completed = coordinator.advance_task("project-1", task_id)
    assert completed.state == PetState.completed
    assert completed.report is not None
    assert completed.report["status"] == "passed"
    assert store.get_report(completed.report["id"]).revision == "rev-1"

    with pytest.raises(ApprovalError, match="completed"):
        coordinator.advance_task("project-1", task_id)


def test_coordinator_blocks_stale_revision_and_retry_restarts_from_current_revision(tmp_path):
    coordinator, store = setup_coordinator(tmp_path)
    researching = coordinator.create_request("project-1", "Build a web app")
    task_id = researching.task_id
    assert task_id is not None
    coordinator.advance_task("project-1", task_id)
    request_id = store.get_task(task_id).request_id
    coordinator.approve_selection("project-1", request_id, ["demo/alpha"])
    coordinator.advance_task("project-1", task_id)

    store.update_project_revision("project-1", "rev-2")
    blocked = coordinator.advance_task("project-1", task_id)
    assert blocked.state == PetState.blocked
    assert blocked.report is None

    retried = coordinator.retry_task("project-1", task_id)
    assert retried.state == PetState.researching
    assert store.get_task(task_id).revision == "rev-2"


def test_coordinator_retries_approved_task_when_verification_artifact_fails(tmp_path):
    class FailingVerificationWriter(WorkspaceArtifactWriter):
        def write_verification(self, *args, **kwargs):
            raise OSError("disk full")

    store = SQLiteStore(tmp_path / "coordinator.sqlite3")
    store.init()
    coordinator = Coordinator(store, artifact_writer=FailingVerificationWriter())
    coordinator.create_project("project-1", "Demo project", str(tmp_path / "workspace"), "rev-1")

    researching = coordinator.create_request("project-1", "Build a web app")
    assert researching.task_id is not None
    coordinator.advance_task("project-1", researching.task_id)
    request_id = store.get_task(researching.task_id).request_id
    coordinator.approve_selection("project-1", request_id, ["demo/alpha"])
    coordinator.advance_task("project-1", researching.task_id)

    failed = coordinator.advance_task("project-1", researching.task_id)

    assert failed.state == PetState.failed
    assert failed.required_action == "retry_task"
    retried = coordinator.retry_task("project-1", researching.task_id)
    assert retried.state == PetState.working


def test_coordinator_retries_research_when_plan_artifact_fails(tmp_path):
    class FailingPlanWriter(WorkspaceArtifactWriter):
        def write_plan(self, *args, **kwargs):
            raise OSError("workspace unavailable")

    store = SQLiteStore(tmp_path / "coordinator.sqlite3")
    store.init()
    coordinator = Coordinator(store, artifact_writer=FailingPlanWriter())
    coordinator.create_project("project-1", "Demo project", str(tmp_path / "workspace"), "rev-1")

    researching = coordinator.create_request("project-1", "Build a web app")
    assert researching.task_id is not None
    coordinator.advance_task("project-1", researching.task_id)
    request_id = store.get_task(researching.task_id).request_id

    failed = coordinator.approve_selection("project-1", request_id, ["demo/alpha"])

    assert failed.state == PetState.failed
    assert failed.required_action == "retry_task"
    retried = coordinator.retry_task("project-1", researching.task_id)
    assert retried.state == PetState.researching


def github_repository(full_name: str) -> dict[str, object]:
    return {
        "full_name": full_name,
        "html_url": f"https://github.com/{full_name}",
        "description": "A web app starter",
        "stargazers_count": 120,
        "forks_count": 10,
        "open_issues_count": 1,
        "license": {"spdx_id": "MIT"},
        "default_branch": "main",
        "pushed_at": "2026-09-20T12:00:00Z",
        "topics": ["web-app", "python"],
    }


def test_coordinator_uses_github_researcher_for_candidate_discovery(tmp_path):
    def handle(request):
        assert request.url.path == "/search/repositories"
        assert request.url.params["q"] == "Build a web app"
        return httpx.Response(
            200,
            json={"items": [github_repository("real/alpha"), github_repository("real/beta")]},
        )

    store = SQLiteStore(tmp_path / "coordinator.sqlite3")
    store.init()
    researcher = GitHubResearcher(
        GitHubClient(transport=httpx.MockTransport(handle))
    )
    coordinator = Coordinator(store, researcher=researcher)
    coordinator.create_project("project-1", "Demo project", str(tmp_path / "workspace"), "rev-1")

    researching = coordinator.create_request("project-1", "Build a web app")
    awaiting = coordinator.advance_task("project-1", researching.task_id)

    assert [candidate.repository.full_name for candidate in awaiting.candidates] == [
        "real/alpha",
        "real/beta",
    ]


def test_coordinator_marks_github_research_failure_for_retry(tmp_path):
    researcher = GitHubResearcher(
        GitHubClient(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(503, json={"message": "unavailable"})
            )
        )
    )
    store = SQLiteStore(tmp_path / "coordinator.sqlite3")
    store.init()
    coordinator = Coordinator(store, researcher=researcher)
    coordinator.create_project("project-1", "Demo project", str(tmp_path / "workspace"), "rev-1")

    researching = coordinator.create_request("project-1", "Build a web app")
    failed = coordinator.advance_task("project-1", researching.task_id)

    assert failed.state == PetState.failed
    assert failed.required_action == "retry_task"
    assert "GitHub research failed" in failed.message


def test_coordinator_runs_until_approval_checkpoint_then_completion(tmp_path):
    coordinator, store = setup_coordinator(tmp_path)
    researching = coordinator.create_request("project-1", "Build a web app")
    assert researching.task_id is not None

    awaiting = coordinator.run_until_checkpoint("project-1", researching.task_id)

    assert awaiting.state == PetState.awaiting_approval
    request_id = store.get_task(researching.task_id).request_id
    coordinator.approve_selection("project-1", request_id, ["demo/alpha"])

    completed = coordinator.run_until_checkpoint("project-1", researching.task_id)

    assert completed.state == PetState.completed


def _approved_task(coordinator, store, project_id="project-1"):
    researching = coordinator.create_request(project_id, "Build a web app")
    assert researching.task_id is not None
    coordinator.advance_task(project_id, researching.task_id)
    request_id = store.get_task(researching.task_id).request_id
    coordinator.approve_selection(project_id, request_id, ["demo/alpha"])
    return researching.task_id


def test_workspace_verifier_completes_task_and_persists_real_report(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "sample.py").write_text("answer = 42\n", encoding="utf-8")
    store = SQLiteStore(tmp_path / "coordinator.sqlite3")
    store.init()
    coordinator = Coordinator(
        store,
        verifier=WorkspaceVerifier(WorkspaceCommandRunner(tmp_path)),
    )
    coordinator.create_project("project-1", "Demo project", str(workspace), "rev-1")

    task_id = _approved_task(coordinator, store)
    assert coordinator.advance_task("project-1", task_id).state == PetState.verifying

    completed = coordinator.advance_task("project-1", task_id)

    assert completed.state == PetState.completed
    assert completed.report is not None
    assert completed.report["checks"][0]["name"] == "compileall"
    assert completed.report["checks"][0]["status"] == "passed"
    assert store.get_report(completed.report["id"]).checks[0]["name"] == "compileall"
    verification_path = workspace / task_id / "verification.md"
    assert verification_path.is_file()
    assert "compileall" in verification_path.read_text(encoding="utf-8")


def test_workspace_verifier_failure_sets_retry_action_and_report(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "broken.py").write_text("def broken(:\n", encoding="utf-8")
    store = SQLiteStore(tmp_path / "coordinator.sqlite3")
    store.init()
    coordinator = Coordinator(
        store,
        verifier=WorkspaceVerifier(WorkspaceCommandRunner(tmp_path)),
    )
    coordinator.create_project("project-1", "Demo project", str(workspace), "rev-1")

    task_id = _approved_task(coordinator, store)
    coordinator.advance_task("project-1", task_id)
    failed = coordinator.advance_task("project-1", task_id)

    assert failed.state == PetState.failed
    assert failed.required_action == "retry_task"
    assert failed.report is not None
    assert failed.report["status"] == "failed"
    assert failed.report["checks"][0]["exit_code"] != 0
    assert "compileall" in failed.report["summary"]

    retried = coordinator.retry_task("project-1", task_id)
    assert retried.state == PetState.working


def test_workspace_policy_error_blocks_task_without_running_commands(tmp_path, monkeypatch):
    allowed_root = tmp_path / "allowed"
    outside_workspace = tmp_path / "outside"
    allowed_root.mkdir()
    outside_workspace.mkdir()
    store = SQLiteStore(tmp_path / "coordinator.sqlite3")
    store.init()
    coordinator = Coordinator(
        store,
        verifier=WorkspaceVerifier(WorkspaceCommandRunner(allowed_root)),
    )
    coordinator.create_project(
        "project-1", "Demo project", str(outside_workspace), "rev-1"
    )
    task_id = _approved_task(coordinator, store)
    coordinator.advance_task("project-1", task_id)

    def unexpected_process(*args, **kwargs):
        raise AssertionError("subprocess must not start for a blocked workspace")

    monkeypatch.setattr(subprocess, "run", unexpected_process)
    blocked = coordinator.advance_task("project-1", task_id)

    assert blocked.state == PetState.blocked
    assert blocked.required_action == "retry_task"
    assert "outside" in blocked.message.lower()
    assert store.get_task_events(task_id)[-1]["action"] == "workspace_blocked"

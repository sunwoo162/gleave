"""Application service for the request/research/approval/run API."""

from datetime import datetime, timezone
from pathlib import Path
from threading import Event, Thread
from typing import Callable
from uuid import uuid4

from app.agent.protocol import AgentRequest, AgentResult, AgentRuntime
from app.config import Settings
from app.coordinator.service import Coordinator
from app.domain.errors import ApprovalError
from app.domain.models import CandidateScore, Decision, RequestBrief, RequestSnapshot, Run
from app.storage.sqlite import SQLiteStore
from app.workflow.planner import WorkPlan, build_work_plan
from app.workspace.artifacts import WorkspaceArtifactWriter


class ApiFlowService:
    """Coordinate the HTTP flow while keeping runtime calls behind an interface."""

    LEASE_SECONDS = 60
    HEARTBEAT_INTERVAL_SECONDS = 10.0

    def __init__(
        self,
        coordinator: Coordinator,
        store: SQLiteStore,
        settings: Settings,
        runtime: AgentRuntime,
        artifact_writer: WorkspaceArtifactWriter | None = None,
        clock: Callable[[], datetime] | None = None,
        lease_seconds: int = LEASE_SECONDS,
        heartbeat_interval_seconds: float = HEARTBEAT_INTERVAL_SECONDS,
    ) -> None:
        self.coordinator = coordinator
        self.store = store
        self.settings = settings
        self.runtime = runtime
        self.artifacts = artifact_writer or WorkspaceArtifactWriter()
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self.lease_seconds = lease_seconds
        self.heartbeat_interval_seconds = heartbeat_interval_seconds

    def create_request(self, text: str, workspace: str | None) -> tuple[str, RequestBrief, str]:
        project_id = f"api-{uuid4().hex}"
        workspace_path = self._resolve_workspace(workspace, project_id)
        workspace_path.mkdir(parents=True, exist_ok=True)
        self.coordinator.create_project(project_id, text[:80], str(workspace_path))
        state = self.coordinator.create_request(project_id, text)
        if state.request_id is None:
            raise RuntimeError("Created request did not produce a request ID")
        request_id = state.request_id
        self.store.save_request_context(request_id, project_id, str(workspace_path))
        run = self.store.create_run(request_id, str(workspace_path))
        return request_id, self.store.get_request(request_id), run.id

    def research(self, request_id: str) -> tuple[list[CandidateScore], WorkPlan]:
        project_id, _workspace = self.store.get_request_context(request_id)
        state = self.coordinator.get_state(project_id)
        if state.state.value == "researching":
            state = self.coordinator.advance_task(project_id, state.task_id or "")
        if state.state.value == "failed":
            raise RuntimeError(state.message)
        candidates = self.store.get_candidates(request_id)
        return candidates, build_work_plan(self.store.get_request(request_id), candidates)

    def approve(
        self, request_id: str, selected: list[str]
    ) -> tuple[Decision, str, list[dict[str, object]]]:
        project_id, _workspace = self.store.get_request_context(request_id)
        self.coordinator.approve_selection(project_id, request_id, selected)
        decision = self.store.get_decision(request_id)
        if decision is None or not decision.approved:
            raise ApprovalError("Approval was not persisted")
        run = self.store.get_run_for_request(request_id)
        return decision, run.id, self.store.get_decision_events(request_id)

    def execute(self, run_id: str) -> Run:
        run = self.store.get_run(run_id)
        decision = self.store.get_decision(run.request_id)
        if decision is None or not decision.approved:
            raise ApprovalError("Run execution requires an approved decision")

        owner_token = uuid4().hex
        claim = self.store.claim_run_execution(
            run_id, owner_token, self._clock, self.lease_seconds
        )
        if not claim.acquired:
            return claim.run
        run = claim.run
        stop_heartbeat = Event()

        def heartbeat() -> None:
            while not stop_heartbeat.wait(self.heartbeat_interval_seconds):
                try:
                    if not self.store.renew_run_execution(
                        run_id, owner_token, claim.generation, self._clock,
                        self.lease_seconds,
                    ):
                        break
                except Exception:
                    break

        heartbeat_thread = Thread(target=heartbeat, daemon=True)
        heartbeat_thread.start()

        try:
            request = AgentRequest(
                prompt=self.store.get_request(run.request_id).raw_text,
                workspace=Path(run.workspace),
                allowed_actions=["read", "workspace_write", "command"],
                run_id=run.id,
            )
            try:
                result = self.runtime.run(request)
            except Exception:
                result = AgentResult(
                    status="failed",
                    summary="Agent runtime raised an unexpected error",
                    events=[],
                    changed_files=[],
                    test_commands=[],
                    error="Agent runtime raised an unexpected error",
                )
            if result.status not in {"completed", "failed", "unavailable"}:
                result = AgentResult(
                    status="failed",
                    summary=result.summary,
                    events=result.events,
                    changed_files=result.changed_files,
                    test_commands=result.test_commands,
                    error=f"Agent runtime returned non-terminal status: {result.status}",
                )
            events = list(result.events)
            if result.test_commands and not any(
                str(event.get("type", "")).lower() == "verification" for event in result.events
            ):
                events.append(
                    {"type": "verification", "status": "reported", "commands": result.test_commands},
                )
            if not self.store.renew_run_execution(
                run_id, owner_token, claim.generation, self._clock,
                self.lease_seconds,
            ):
                return self.store.get_run(run_id)
            decision = self.store.get_decision(run.request_id)
            if decision is None:
                raise ApprovalError("Run execution requires an approved decision")
            bundle_paths = self.artifacts.write_run_bundle(
                run.workspace,
                run.id,
                brief=self.store.get_request(run.request_id),
                decision=decision,
                candidates=self.store.get_candidates(run.request_id),
                status=result.status,
                summary=result.summary,
                changed_files=result.changed_files,
                test_commands=result.test_commands,
                error=result.error,
            )
            artifact = {
                "type": "agent_result",
                "summary": result.summary,
                "changed_files": result.changed_files,
                "test_commands": result.test_commands,
            }
            artifacts = [artifact] + [
                {"type": "run_bundle", "path": str(path)} for path in bundle_paths
            ]
            completed = self.store.complete_run_execution(
                run.id, owner_token, claim.generation, result.status,
                events, artifacts, result.error, self._clock,
            )
            return completed if completed is not None else self.store.get_run(run_id)
        except Exception:
            try:
                self.store.complete_run_execution(
                    run.id, owner_token, claim.generation, "failed", [], [],
                    "Run execution failed while persisting its result", self._clock,
                )
            except Exception:
                pass
            raise
        finally:
            stop_heartbeat.set()
            heartbeat_thread.join()

    def get_run(self, run_id: str) -> Run:
        return self.store.get_run(run_id)

    def list_runs(
        self,
        request_id: str | None = None,
        *,
        status: str | None = None,
        search: str | None = None,
        created_after: str | None = None,
        created_before: str | None = None,
        sort: str | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[Run]:
        return self.store.list_runs(
            request_id,
            status=status,
            search=search,
            created_after=created_after,
            created_before=created_before,
            sort=sort,
            limit=limit,
            offset=offset,
        )

    def count_runs(
        self,
        request_id: str | None = None,
        *,
        status: str | None = None,
        search: str | None = None,
        created_after: str | None = None,
        created_before: str | None = None,
    ) -> int:
        return self.store.count_runs(
            request_id,
            status=status,
            search=search,
            created_after=created_after,
            created_before=created_before,
        )

    def list_runs_with_count(
        self,
        request_id: str | None = None,
        *,
        status: str | None = None,
        search: str | None = None,
        created_after: str | None = None,
        created_before: str | None = None,
        sort: str | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> tuple[list[Run], int]:
        return self.store.list_runs_with_count(
            request_id,
            status=status,
            search=search,
            created_after=created_after,
            created_before=created_before,
            sort=sort,
            limit=limit,
            offset=offset,
        )

    def get_request_snapshot(self, request_id: str) -> RequestSnapshot:
        brief = self.store.get_request(request_id)
        project_id, workspace = self.store.get_request_context(request_id)
        return RequestSnapshot(
            request_id=request_id,
            project_id=project_id,
            brief=brief,
            workspace=workspace,
            candidates=self.store.get_candidates(request_id),
            decision=self.store.get_decision(request_id),
            decision_events=self.store.get_decision_events(request_id),
            runs=self.store.list_runs(request_id),
        )

    def retry(self, run_id: str) -> Run:
        run = self.store.get_run(run_id)
        decision = self.store.get_decision(run.request_id)
        if decision is None or not decision.approved:
            raise ApprovalError("Run retry requires an approved decision")
        return self.store.reset_run_for_retry(run.id)

    def _resolve_workspace(self, requested: str | None, project_id: str) -> Path:
        root = self.settings.workspace_root.resolve()
        candidate = Path(requested).resolve() if requested else root / "api" / project_id
        try:
            candidate.relative_to(root)
        except ValueError as exc:
            raise ValueError("Workspace must be inside the configured workspace root") from exc
        return candidate

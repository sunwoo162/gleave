from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, Field

from app.api.service import ApiFlowService
from app.coordinator.service import Coordinator
from app.design.references import DesignService, ReferencePack
from app.design.visual_verify import VisualReport
from app.domain.models import (
    CandidateScore,
    Decision,
    PetViewModel,
    RequestBrief,
    Run,
)
from app.workflow.planner import WorkPlan, build_work_plan


def _normalise_run_timestamp(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


class RequestPayload(BaseModel):
    text: str = Field(min_length=1)
    workspace: str | None = None


class ApprovalPayload(BaseModel):
    selected: list[str] = Field(min_length=1)


class RequestResponse(BaseModel):
    request_id: str
    brief: RequestBrief
    run_id: str


class RequestSnapshotResponse(BaseModel):
    request_id: str
    project_id: str
    brief: RequestBrief
    workspace: str
    candidates: list[CandidateScore] = Field(default_factory=list)
    decision: Decision | None = None
    decision_events: list[dict[str, object]] = Field(default_factory=list)
    runs: list[Run] = Field(default_factory=list)
    work_plan: WorkPlan


class ResearchResponse(BaseModel):
    candidates: list[CandidateScore]
    work_plan: WorkPlan


class ApprovalResponse(BaseModel):
    decision: Decision
    run_id: str
    decision_events: list[dict[str, object]] = Field(default_factory=list)


class DesignReferencePayload(BaseModel):
    urls: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    target_type: str = Field(min_length=1)


class DesignReferenceResponse(BaseModel):
    id: str
    pack: ReferencePack
    tokens: dict[str, object]


class DesignVerifyPayload(BaseModel):
    url: str = Field(min_length=1)
    baseline: str = Field(min_length=1)


class DesignVerifyResponse(BaseModel):
    id: str
    report: VisualReport


def build_router(coordinator: Coordinator) -> APIRouter:
    router = APIRouter()

    @router.post("/projects/{project_id}/requests", response_model=PetViewModel)
    def create_request(project_id: str, payload: RequestPayload) -> PetViewModel:
        return coordinator.create_request(project_id, payload.text)

    @router.get("/projects/{project_id}/state", response_model=PetViewModel)
    def get_state(project_id: str) -> PetViewModel:
        return coordinator.get_state(project_id)

    @router.post(
        "/projects/{project_id}/decisions/{request_id}/approve",
        response_model=PetViewModel,
    )
    def approve_selection(
        project_id: str, request_id: str, payload: ApprovalPayload
    ) -> PetViewModel:
        return coordinator.approve_selection(project_id, request_id, payload.selected)

    @router.post(
        "/projects/{project_id}/tasks/{task_id}/advance",
        response_model=PetViewModel,
    )
    def advance_task(project_id: str, task_id: str) -> PetViewModel:
        return coordinator.advance_task(project_id, task_id)

    @router.post(
        "/projects/{project_id}/tasks/{task_id}/run",
        response_model=PetViewModel,
    )
    def run_task(project_id: str, task_id: str) -> PetViewModel:
        return coordinator.run_until_checkpoint(project_id, task_id)

    @router.post(
        "/projects/{project_id}/tasks/{task_id}/retry",
        response_model=PetViewModel,
    )
    def retry_task(project_id: str, task_id: str) -> PetViewModel:
        return coordinator.retry_task(project_id, task_id)

    @router.get("/projects/{project_id}/reports/{report_id}")
    def get_report(project_id: str, report_id: str) -> dict[str, object]:
        report = coordinator.store.get_report(report_id)
        if report.project_id != project_id:
            raise KeyError(f"Report not found: {report_id}")
        return report.model_dump(mode="json")

    return router


def build_api_router(flow: ApiFlowService) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.post("/requests", response_model=RequestResponse)
    def create_api_request(payload: RequestPayload) -> RequestResponse:
        try:
            request_id, brief, run_id = flow.create_request(payload.text, payload.workspace)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return RequestResponse(request_id=request_id, brief=brief, run_id=run_id)

    @router.get("/requests/{request_id}", response_model=RequestSnapshotResponse)
    def get_api_request(request_id: str) -> RequestSnapshotResponse:
        snapshot = flow.get_request_snapshot(request_id)
        return RequestSnapshotResponse(
            **snapshot.model_dump(mode="python"),
            work_plan=build_work_plan(snapshot.brief, snapshot.candidates),
        )

    @router.post("/requests/{request_id}/research", response_model=ResearchResponse)
    def research_api_request(request_id: str) -> ResearchResponse:
        try:
            candidates, work_plan = flow.research(request_id)
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        return ResearchResponse(candidates=candidates, work_plan=work_plan)

    @router.post("/requests/{request_id}/approve", response_model=ApprovalResponse)
    def approve_api_request(
        request_id: str, payload: ApprovalPayload
    ) -> ApprovalResponse:
        decision, run_id, decision_events = flow.approve(request_id, payload.selected)
        return ApprovalResponse(
            decision=decision,
            run_id=run_id,
            decision_events=decision_events,
        )

    @router.post("/runs/{run_id}/execute", response_model=Run)
    def execute_api_run(run_id: str) -> Run:
        return flow.execute(run_id)

    @router.get("/runs", response_model=list[Run])
    def list_api_runs(
        response: Response,
        request_id: str | None = None,
        status: Literal["created", "running", "completed", "failed", "unavailable"] | None = None,
        search: str | None = Query(default=None, max_length=200),
        created_after: datetime | None = Query(default=None),
        created_before: datetime | None = Query(default=None),
        sort: Literal["newest", "oldest"] = "newest",
        limit: int | None = Query(default=None, ge=1, le=100),
        offset: int = Query(default=0, ge=0),
    ) -> list[Run]:
        runs, total = flow.list_runs_with_count(
            request_id,
            status=status,
            search=search,
            created_after=_normalise_run_timestamp(created_after),
            created_before=_normalise_run_timestamp(created_before),
            sort=sort,
            limit=None if limit is None else limit + 1,
            offset=offset,
        )
        response.headers["X-Total-Count"] = str(total)
        if limit is None:
            return runs
        has_more = len(runs) > limit
        response.headers["X-Has-More"] = str(has_more).lower()
        return runs[:limit]

    @router.post("/runs/{run_id}/retry", response_model=Run)
    def retry_api_run(run_id: str) -> Run:
        return flow.retry(run_id)

    @router.get("/runs/{run_id}", response_model=Run)
    def get_api_run(run_id: str) -> Run:
        return flow.get_run(run_id)

    return router


def build_design_router(design: DesignService) -> APIRouter:
    router = APIRouter(prefix="/api/design")

    @router.post("/references", response_model=DesignReferenceResponse)
    def create_design_references(
        payload: DesignReferencePayload,
    ) -> DesignReferenceResponse:
        try:
            pack_id, pack, tokens = design.create(
                payload.urls, payload.keywords, payload.target_type
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return DesignReferenceResponse(id=pack_id, pack=pack, tokens=tokens)

    @router.get("/references/{pack_id}", response_model=DesignReferenceResponse)
    def get_design_references(pack_id: str) -> DesignReferenceResponse:
        pack, tokens = design.get(pack_id)
        return DesignReferenceResponse(id=pack_id, pack=pack, tokens=tokens)

    @router.post("/verify")
    def verify_design(payload: DesignVerifyPayload) -> DesignVerifyResponse:
        verification_id, report = design.verify(payload.url, payload.baseline)
        return DesignVerifyResponse(id=verification_id, report=report)

    @router.get("/verify/{verification_id}", response_model=DesignVerifyResponse)
    def get_design_verification(verification_id: str) -> DesignVerifyResponse:
        _url, _baseline, report = design.get_verification(verification_id)
        return DesignVerifyResponse(id=verification_id, report=report)

    return router

from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.agent.openhands_runtime import OpenHandsRuntime
from app.agent.protocol import AgentRuntime
from app.api.service import ApiFlowService
from app.api.routes import build_api_router, build_design_router, build_router
from app.config import Settings
from app.coordinator.service import Coordinator
from app.design.references import DesignService
from app.domain.errors import ApprovalError
from app.execution.runner import WorkspaceCommandRunner
from app.execution.verifier import WorkspaceVerifier
from app.integrations.claimlatch_client import ClaimLatchClient
from app.oss.github_client import GitHubClient
from app.oss.researcher import GitHubResearcher
from app.storage.sqlite import SQLiteStore


def create_app(
    settings: Settings | None = None,
    *,
    researcher: GitHubResearcher | None = None,
    agent_runtime: AgentRuntime | None = None,
) -> FastAPI:
    app_settings = settings or Settings()
    application = FastAPI(title=app_settings.app_name)
    store = SQLiteStore(app_settings.data_dir / "state.sqlite3")
    store.init()
    configured_researcher = researcher if researcher is not None else (
        GitHubResearcher(GitHubClient(token=app_settings.github_token))
        if app_settings.github_token
        else None
    )
    verifier = None
    if app_settings.execution_mode == "workspace_verify":
        verifier = WorkspaceVerifier(
            WorkspaceCommandRunner(
                app_settings.workspace_root,
                default_timeout_seconds=app_settings.command_timeout_seconds,
                max_output_chars=app_settings.max_command_output_chars,
            )
        )
    coordinator = Coordinator(store, researcher=configured_researcher, verifier=verifier)
    app_settings.workspace_root.mkdir(parents=True, exist_ok=True)
    default_workspace = app_settings.workspace_root / "default"
    default_workspace.mkdir(parents=True, exist_ok=True)
    try:
        store.get_project("default")
    except KeyError:
        coordinator.create_project(
            "default",
            app_settings.app_name,
            str(default_workspace),
        )
    claim_latch_client = None
    if app_settings.claim_latch_adapter_url:
        claim_latch_client = ClaimLatchClient(
            app_settings.claim_latch_adapter_url,
            audit_store=store.claimlatch_audits,
            policy_version=app_settings.claim_latch_policy_version,
            adapter_version=app_settings.claim_latch_adapter_version,
            claim_latch_version=app_settings.claim_latch_version,
            current_revision_resolver=_current_project_revision(store),
        )
    application.state.coordinator = coordinator
    application.state.claim_latch_client = claim_latch_client
    runtime = agent_runtime or OpenHandsRuntime(
        api_key=app_settings.llm_api_key,
        model=app_settings.llm_model,
        base_url=app_settings.llm_base_url,
    )
    api_flow = ApiFlowService(coordinator, store, app_settings, runtime)
    application.state.api_flow = api_flow
    design_service = DesignService(store=store)
    application.state.design_service = design_service

    @application.exception_handler(ApprovalError)
    async def handle_approval_error(_request: Request, exc: ApprovalError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @application.exception_handler(KeyError)
    async def handle_key_error(_request: Request, exc: KeyError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc).strip("'")})

    @application.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    application.include_router(build_router(coordinator))
    application.include_router(build_api_router(api_flow))
    application.include_router(build_design_router(design_service))
    static_dir = Path(__file__).parent / "static"
    application.mount("/static", StaticFiles(directory=static_dir), name="static")

    @application.get("/", include_in_schema=False)
    def index() -> FileResponse:
        return FileResponse(static_dir / "index.html")

    return application


def _current_project_revision(store: SQLiteStore):
    def resolve(project_id: str) -> str | None:
        try:
            return store.get_project(project_id).revision
        except KeyError:
            return None

    return resolve


def run(host: str = "127.0.0.1", port: int = 8000) -> None:
    uvicorn.run("app.main:create_app", factory=True, host=host, port=port)


if __name__ == "__main__":
    run()

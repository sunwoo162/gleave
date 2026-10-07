# Web/App Project Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make EEEE generate and verify deployable web/app projects with a local frontend, backend API, database boundary, authentication contract, and deployment handoff while EEEE itself remains local-first.

**Architecture:** EEEE classifies a request as a product project, ISEOL creates a project-specific team, and the Project Runtime provisions a full-stack workspace. The generated project runs locally with a deterministic demo auth path and explicit production environment contracts; real hosting, OAuth credentials, and external writes remain optional deployment actions behind connectors and ClaimLatch approval.

**Tech Stack:** Python/FastAPI EEEE runtime, deterministic generated Node-free HTML/JS frontend, Python standard-library local API, SQLite-compatible persistence boundary, JSON contracts, Git, ClaimLatch v0.2.0, pytest.

**Spec:** `docs/architecture/eeee-platform.md` and the existing EEEE personal-assistant project design.

## Global Constraints

- EEEE control plane and source-of-truth storage remain local-first.
- Generated projects must be runnable locally without provider credentials.
- Production OAuth, database, hosting, and public deployment must be represented as configuration-gated actions, never falsely reported as complete.
- Every generated project must include FSD structure, UTF-8 evidence, QA evidence, release manifest, and ClaimLatch identity.
- Existing Todo generation and desktop behavior must remain backward compatible.
- Existing unrelated dirty worktree changes must not be included.

## Review Focus

- A request containing “웹앱”, “로그인”, or “서비스” selects a full-stack product profile instead of the static Todo profile.
- Missing OAuth/database/hosting credentials remain `awaiting_configuration` while local demo mode still runs.
- Authentication failures never expose tokens or claim production login success.
- Frontend and API remain usable after a fresh local start and after restart.
- QA and ClaimLatch bind to the same project ID, revision, generated files, and release manifest.

### Task 1: Product project profile and routing

**Files:**
- Modify: `apps/eeee/app/workflow/*` or the existing request/capability descriptors selected by the current router
- Modify: `apps/eeee/app/project_runtime/provisioner.py`
- Test: `apps/eeee/tests/workflow/` and `apps/eeee/tests/project_runtime/`

**Interfaces:**
- Produce a stable `product_type`/`runtime_profile` for `static_app`, `web_app`, or `mobile_app`.
- Preserve `project-execution` capability and existing Todo behavior.

- [ ] Write failing tests proving “로그인 웹앱 만들어줘” selects `web_app`, while “Todo 앱 만들어줘” keeps the verified Todo profile.
- [ ] Run the focused routing tests and observe the expected failure.
- [ ] Implement the smallest profile classifier and persist the selected profile in `PROJECT_PROFILE.json`.
- [ ] Run routing and project runtime tests.
- [ ] Commit: `feat: classify generated product runtime profiles`.

### Task 2: Full-stack web app scaffold

**Files:**
- Create: `apps/eeee/app/project_runtime/web_scaffold.py`
- Modify: `apps/eeee/app/project_runtime/provisioner.py`
- Modify: `apps/eeee/app/project_runtime/todo_runner.py` or introduce a shared runner contract
- Test: `apps/eeee/tests/project_runtime/test_web_scaffold.py`

**Interfaces:**
- `create_web_app_scaffold(workspace: str | Path, project_name: str) -> list[Path]`.
- Generate `apps/web`, `apps/api`, `packages/auth`, `packages/db`, `docker-compose.yml`, `.env.example`, `DEPLOYMENT.md`, and FSD frontend boundaries.

- [ ] Write failing scaffold contract tests for frontend, API, auth, database, environment, deployment, and QA files.
- [ ] Run them RED.
- [ ] Generate a local runnable web app with a demo session endpoint, Todo CRUD API, SQLite boundary, and explicit production configuration placeholders.
- [ ] Add UTF-8, syntax, structure, and no-secret checks to the runner.
- [ ] Run scaffold and runner tests GREEN.
- [ ] Commit: `feat: scaffold deployable web app projects`.

### Task 3: Local full-stack execution and auth contract

**Files:**
- Create/modify: `apps/eeee/app/project_runtime/web_runner.py`
- Create: generated `apps/api/server.py`, `apps/api/store.py`, `packages/auth/README.md`
- Test: `apps/eeee/tests/project_runtime/test_web_runner.py`

**Interfaces:**
- `WebProjectRunner.run_local(workspace: Path) -> LocalRuntimeResult`.
- Local mode exposes health, demo login, current user, and Todo CRUD; production mode refuses to claim configured OAuth until required environment variables exist.

- [ ] Write failing API contract tests for health, demo login, unauthorized Todo access, and authorized Todo CRUD.
- [ ] Run RED.
- [ ] Implement a bounded local API and persistence layer with explicit demo-mode labeling.
- [ ] Run GREEN and restart tests to prove persistence.
- [ ] Commit: `feat: run generated web projects locally`.

### Task 4: Project QA, ClaimLatch, and deployment handoff

**Files:**
- Modify: `apps/eeee/app/project_runtime/*runner.py`
- Modify: `apps/eeee/app/release/manifest.py` if required by the shared contract
- Test: `apps/eeee/tests/project_runtime/`, `apps/eeee/tests/trust/`, `apps/eeee/tests/e2e/`

**Interfaces:**
- Release evidence includes `runtime_profile`, local API checks, auth mode, missing connector states, deployment readiness, and exact revision identity.

- [ ] Write failing tests for truthful `awaiting_configuration`, ClaimLatch PASS binding, and BLOCK when production auth is claimed without credentials.
- [ ] Run RED.
- [ ] Add deterministic web QA and release evidence while preserving the existing Todo gate.
- [ ] Run focused and full EEEE suites plus ClaimLatch adapter tests.
- [ ] Commit: `feat: verify web project release readiness`.

### Task 5: Desktop project view and documentation

**Files:**
- Modify: `apps/eeee/app/desktop/*` only where the existing project card needs runtime profile/status fields
- Modify: `docs/operations/local-runtime.md`
- Create: `docs/operations/web-project-runtime.md`
- Test: `apps/eeee/tests/desktop/` and relevant API tests

**Interfaces:**
- Desktop shows whether the project is static/local web/deploy-ready and lists missing external configuration without blocking local work.

- [ ] Write failing presentation tests for runtime profile, local URL/status, and deployment readiness.
- [ ] Implement the minimal desktop projection and documentation.
- [ ] Run desktop offscreen tests and the complete verification suite.
- [ ] Commit: `feat: expose web project runtime status in desktop`.

## Verification

Run after each task:

```powershell
C:\Users\user\Documents\eeee-platform-env\Scripts\python.exe -m pytest -q
npm test --silent --prefix integrations/claimlatch-adapter
```

The acceptance flow is: `로그인 기능 있는 Todo 웹앱 만들어줘` → generated full-stack workspace → local demo login → authorized Todo CRUD → restart persistence → QA PASS → ClaimLatch PASS → deployment manifest with any missing external credentials truthfully listed.

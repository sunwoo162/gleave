# OSS Product Builder MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local web MVP that turns a natural-language product request into a verified OSS shortlist, an approved implementation run, a reference-driven design, and a tested project workspace coordinated by a verification harness.

**Architecture:** A Python FastAPI service owns the request lifecycle, OSS research, scoring, approvals, workspace policy, and run history. A small static browser UI calls that local API. OpenHands SDK is the first coding-agent runtime behind an adapter; the adapter is optional at startup so research and planning remain usable without an LLM key.

**Tech Stack:** Python 3.12, FastAPI, Pydantic, SQLite, httpx, pytest, vanilla HTML/CSS/JavaScript, OpenHands SDK/tools, GitHub REST API.

**Spec:** `docs/superpowers/specs/2026-09-28-oss-product-builder-design.md`

## Global Constraints

- The system is local-first and must not be coupled to Discord or another chat channel.
- OSS selection prioritizes requirement fit over freshness; stars are an adoption signal, not proof of trustworthiness.
- A minimum of two OSS candidates is compared before selection is approved.
- Dependency versions and generated project decisions are recorded; packages are never installed as unpinned `latest` by default.
- External transfer, deletion, deployment, purchase, messaging, and system-wide changes require explicit approval.
- Initial file writes are restricted to the selected project workspace.
- The MVP excludes always-on screen monitoring and unbounded autonomous multi-agent swarms.
- Design references must retain source URL, license evidence, extraction time, and applied transformations; unclear assets are not copied.
- Agent completion claims are not verification evidence; the harness must rerun deterministic checks on the integrated latest state.

## Review Focus

- GitHub API outage, rate limit, or malformed repository metadata must produce a recoverable research error and never a false recommendation; covered by Task 3.
- Missing license, stale maintenance, or low-evidence repositories must be marked uncertain or rejected rather than silently scored as trusted; covered by Task 3.
- Missing model/runtime configuration must leave research and approval usable and must report execution as unavailable; covered by Tasks 4 and 6.
- A path outside the selected workspace must be rejected, including `..` traversal and Windows drive changes; covered by Task 5.
- Unapproved install, destructive, external, or system-wide commands must not execute; covered by Tasks 5 and 7.
- A reference with missing provenance or an agent result from a stale project snapshot must be rejected or revalidated; covered by Tasks 9 and 10.

### Task 1: Python service scaffold and local configuration

**Files:**
- Create: `pyproject.toml`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `app/__init__.py`
- Create: `app/config.py`
- Create: `app/main.py`
- Create: `tests/test_health.py`

**Interfaces:**
- Produces `Settings` in `app/config.py` with `app_name`, `data_dir`, `workspace_root`, `github_token`, `llm_base_url`, `llm_api_key`, and `llm_model`.
- Produces `create_app(settings: Settings | None = None) -> FastAPI` in `app/main.py`.
- Exposes `GET /health -> {"status": "ok"}`.

- [ ] **Step 1: Write the failing health test**

  Add `test_health_returns_ok` using FastAPI `TestClient`; assert HTTP 200 and the exact JSON body `{"status": "ok"}`.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `python -m pytest tests/test_health.py -q`

  Expected: FAIL because the `app` package and route do not exist.

- [ ] **Step 3: Implement the minimal service scaffold**

  Add the declared dependencies and a settings object that reads `.env` without requiring optional credentials. Mount the health route through `create_app()` and make `python -m app.main` start Uvicorn on `127.0.0.1`.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run: `python -m pytest tests/test_health.py -q`

  Expected: PASS.

- [ ] **Step 5: Commit**

  Run: `git add pyproject.toml .env.example .gitignore app tests/test_health.py && git commit -m "chore: scaffold local service"`

### Task 2: Domain models and SQLite run store

**Files:**
- Create: `app/domain/__init__.py`
- Create: `app/domain/models.py`
- Create: `app/storage/__init__.py`
- Create: `app/storage/sqlite.py`
- Create: `tests/domain/test_models.py`
- Create: `tests/storage/test_sqlite.py`

**Interfaces:**
- `RequestBrief` contains `raw_text: str`, `goal: str`, `target_type: str`, `constraints: list[str]`, and `acceptance_criteria: list[str]`.
- `RepositorySnapshot` contains `full_name`, `html_url`, `description`, `stars`, `forks`, `open_issues`, `license_spdx: str | None`, `default_branch`, `pushed_at`, and `topics`.
- `CandidateScore` contains `repository: RepositorySnapshot`, `total: float`, `dimension_scores: dict[str, float]`, `evidence: list[str]`, `risks: list[str]`, and `status: str`.
- `Decision` contains `request_id`, `selected: list[str]`, `alternatives: list[str]`, `approved: bool`, and `notes`.
- `Run` contains `id`, `request_id`, `status`, `workspace`, `events`, and `artifacts`.
- `SQLiteStore.init() -> None`, `save_request(brief: RequestBrief) -> str`, `save_candidates(request_id: str, candidates: list[CandidateScore]) -> None`, `get_candidates(request_id: str) -> list[CandidateScore]`, `save_decision(decision: Decision) -> None`, `create_run(request_id: str, workspace: str) -> Run`, `append_event(run_id: str, event: dict[str, object]) -> None`, and `get_run(run_id: str) -> Run`.

- [ ] **Step 1: Write failing model and persistence tests**

  Assert Pydantic rejects an empty `raw_text`, preserves nullable licenses, round-trips two scored candidates, and persists run events in insertion order.

- [ ] **Step 2: Run focused tests to verify failure**

  Run: `python -m pytest tests/domain/test_models.py tests/storage/test_sqlite.py -q`

  Expected: FAIL because the models and store do not exist.

- [ ] **Step 3: Implement models and schema**

  Use Pydantic models for API/domain validation and SQLite JSON columns for candidate evidence, risks, events, and artifacts. Create tables idempotently in `SQLiteStore.init()`.

- [ ] **Step 4: Run focused tests to verify persistence**

  Run: `python -m pytest tests/domain/test_models.py tests/storage/test_sqlite.py -q`

  Expected: PASS.

- [ ] **Step 5: Commit**

  Run: `git add app/domain app/storage tests/domain tests/storage && git commit -m "feat: add domain models and run store"`

### Task 3: GitHub OSS research and trust-aware scoring

**Files:**
- Create: `app/oss/__init__.py`
- Create: `app/oss/github_client.py`
- Create: `app/oss/scoring.py`
- Create: `tests/oss/test_github_client.py`
- Create: `tests/oss/test_scoring.py`

**Interfaces:**
- `GitHubClient.search_repositories(query: str, language: str | None = None, limit: int = 5) -> list[RepositorySnapshot]`.
- `GitHubClient.get_repository(full_name: str) -> RepositorySnapshot`.
- `score_candidate(brief: RequestBrief, repository: RepositorySnapshot) -> CandidateScore`.
- Scoring dimensions and weights are exactly: `fit=45`, `adoption=15`, `maintenance=15`, `trust=15`, `integration=10`.

- [ ] **Step 1: Write failing HTTP client tests**

  Mock GitHub search and repository responses. Assert query parameters, optional bearer token behavior, mapping of `license.spdx_id` to `license_spdx`, and a typed `ResearchError` for non-2xx responses.

- [ ] **Step 2: Run focused client tests to verify failure**

  Run: `python -m pytest tests/oss/test_github_client.py -q`

  Expected: FAIL because the client is not implemented.

- [ ] **Step 3: Implement the GitHub client**

  Use `httpx.AsyncClient`, GitHub REST search/repository endpoints, a bounded timeout, and the configured token when present. Never fabricate missing license or maintenance values; preserve them as missing evidence.

- [ ] **Step 4: Write failing scoring tests**

  Assert a well-maintained, licensed, highly adopted repository receives a higher score than a stale repository with no license, and assert the latter contains a trust risk. Assert the total is the weighted sum capped to `[0, 100]`.

- [ ] **Step 5: Implement deterministic scoring**

  Derive adoption from normalized stars/forks/issues, maintenance from `pushed_at`, trust from license and repository evidence, and fit/integration from the request text and declared topics. Keep each dimension explainable with evidence strings.

- [ ] **Step 6: Run OSS tests to verify the full researcher**

  Run: `python -m pytest tests/oss -q`

  Expected: PASS.

- [ ] **Step 7: Commit**

  Run: `git add app/oss tests/oss && git commit -m "feat: research and score OSS candidates"`

### Task 4: Request planning, candidate decision, and approval state machine

**Files:**
- Create: `app/workflow/__init__.py`
- Create: `app/workflow/planner.py`
- Create: `app/workflow/approvals.py`
- Create: `tests/workflow/test_planner.py`
- Create: `tests/workflow/test_approvals.py`

**Interfaces:**
- `parse_request(text: str) -> RequestBrief` preserves the original text and derives a non-empty goal, target type, constraints, and acceptance criteria. If no LLM is configured, it uses deterministic extraction and marks the brief as needing confirmation when uncertain.
- `build_work_plan(brief: RequestBrief, candidates: list[CandidateScore]) -> WorkPlan` returns ordered steps with `id`, `title`, `description`, `requires_approval`, and `expected_outputs`.
- `WorkPlan` contains `steps: list[WorkStep]` and `requires_selection: bool`; `WorkStep` contains `id`, `title`, `description`, `requires_approval`, and `expected_outputs`.
- `ApprovalService.approve_decision(decision_id: str, selected: list[str]) -> Decision` rejects unknown or fewer-than-two candidate comparisons and marks the selected decision approved.
- `ApprovalService.requirement_for(action: str) -> PermissionLevel` returns one of `read`, `workspace_write`, `command`, `network`, or `external`.

- [ ] **Step 1: Write failing planner tests**

  Assert a natural-language request preserves its raw text, extracts a non-empty goal, and produces acceptance criteria containing build/test execution. Assert an ambiguous request is marked for confirmation rather than silently inventing constraints.

- [ ] **Step 2: Implement the deterministic planner**

  Use a small target-type vocabulary (`web_app`, `developer_tool`, `automation`, `local_ai_app`, `unknown`) and preserve unclassified text in constraints. Add an optional LLM hook behind the same interface, but make no-credential behavior deterministic.

- [ ] **Step 3: Write failing approval tests**

  Assert a decision cannot be approved with an unknown candidate, cannot be approved when fewer than two candidates were compared, and becomes immutable after approval except through a new decision revision.

- [ ] **Step 4: Implement approval and permission mapping**

  Persist approval state and record the approver action as an event. Map install, delete, push, deploy, messaging, and external network actions to approval-required levels.

- [ ] **Step 5: Run workflow tests**

  Run: `python -m pytest tests/workflow -q`

  Expected: PASS.

- [ ] **Step 6: Commit**

  Run: `git add app/workflow tests/workflow && git commit -m "feat: add request planning and approvals"`

### Task 5: Workspace isolation and command policy

**Files:**
- Create: `app/workspace/__init__.py`
- Create: `app/workspace/manager.py`
- Create: `app/workspace/policy.py`
- Create: `tests/workspace/test_manager.py`
- Create: `tests/workspace/test_policy.py`

**Interfaces:**
- `WorkspaceManager.create(run_id: str, source: Path | None = None) -> Path` creates a run directory below the configured workspace root.
- `WorkspaceManager.resolve(relative_path: str) -> Path` returns a normalized path only when it stays inside the run directory; otherwise it raises `WorkspaceBoundaryError`.
- `CommandPolicy.evaluate(argv: list[str], permission: PermissionLevel, approved: bool) -> CommandDecision` returns `allowed`, `reason`, and `requires_confirmation`.

- [ ] **Step 1: Write failing boundary tests**

  Test a normal child path, `..` traversal, an absolute path, a different Windows drive, and a symlink/junction-like escape where the platform permits it. Assert only the child path succeeds.

- [ ] **Step 2: Implement workspace path validation**

  Use `Path.resolve(strict=False)` and `os.path.commonpath`-style containment checks. Store one run’s files below `.oss-builder/runs/<run_id>/` or the configured workspace root, never the user home directory.

- [ ] **Step 3: Write failing command-policy tests**

  Assert read-only inspection is allowed, workspace writes require approval, unapproved package installation is denied, destructive commands are denied, and approved test/build commands are allowed only with a workspace cwd.

- [ ] **Step 4: Implement the command policy**

  Represent commands as argv lists, not shell strings. Add Windows-aware executable and argument checks, a denylist for deletion/system-wide changes, and explicit approval metadata.

- [ ] **Step 5: Run workspace tests**

  Run: `python -m pytest tests/workspace -q`

  Expected: PASS.

- [ ] **Step 6: Commit**

  Run: `git add app/workspace tests/workspace && git commit -m "feat: enforce workspace and command boundaries"`

### Task 6: OpenHands coding-runtime adapter and run reporting

**Files:**
- Create: `app/agent/__init__.py`
- Create: `app/agent/protocol.py`
- Create: `app/agent/openhands_runtime.py`
- Create: `tests/agent/test_runtime.py`

**Interfaces:**
- `AgentRequest` contains `prompt: str`, `workspace: Path`, `allowed_actions: list[str]`, and `run_id: str`.
- `AgentResult` contains `status: str`, `summary: str`, `events: list[dict[str, object]]`, `changed_files: list[str]`, `test_commands: list[str]`, and `error: str | None`.
- `AgentRuntime.run(request: AgentRequest) -> AgentResult` is the runtime protocol.
- `OpenHandsRuntime.run()` creates an OpenHands conversation in the approved workspace, exposes file editor, terminal, and task tracker tools, and converts SDK events into `AgentResult`.

- [ ] **Step 1: Write failing adapter tests**

  Mock the OpenHands SDK boundary. Assert a successful event stream yields changed files and a summary, a missing SDK or missing `LLM_API_KEY` yields a clear unavailable result, and a runtime exception becomes a failed result without hiding the error.

- [ ] **Step 2: Implement the protocol and lazy runtime import**

  Keep OpenHands imports inside `OpenHandsRuntime` so the research UI can run without the optional agent dependency. Pass `LLM_MODEL`, `LLM_BASE_URL`, and the configured API key to the SDK only at execution time.

- [ ] **Step 3: Add permission-aware prompts and event conversion**

  Include the approved OSS decision, acceptance criteria, workspace boundary, and required verification commands in the prompt. Convert tool and conversation events into persisted run events and redact obvious API-key patterns.

- [ ] **Step 4: Run agent tests**

  Run: `python -m pytest tests/agent -q`

  Expected: PASS without a live model key.

- [ ] **Step 5: Commit**

  Run: `git add app/agent tests/agent && git commit -m "feat: add OpenHands runtime adapter"`

### Task 7: API routes and local browser UI

**Files:**
- Modify: `app/main.py`
- Create: `app/api/__init__.py`
- Create: `app/api/routes.py`
- Create: `app/static/index.html`
- Create: `app/static/app.js`
- Create: `app/static/styles.css`
- Create: `tests/api/test_request_flow.py`

**Interfaces:**
- `POST /api/requests` accepts `{ "text": str, "workspace": str | null }` and returns `{ "request_id": str, "brief": RequestBrief }`.
- `POST /api/requests/{request_id}/research` returns `{ "candidates": list[CandidateScore], "work_plan": WorkPlan }`.
- `POST /api/requests/{request_id}/approve` accepts `{ "selected": list[str] }` and returns an approved `Decision` plus `run_id`.
- `POST /api/runs/{run_id}/execute` starts the approved runtime and returns the current `Run`.
- `GET /api/runs/{run_id}` returns the latest run, events, artifacts, and error state.

- [ ] **Step 1: Write the API flow test with mocked GitHub and runtime**

  Exercise create request → research → compare at least two candidates → approve → execute → fetch run. Assert that execute before approval returns HTTP 409 and that the final response includes status, changed files, and verification events.

- [ ] **Step 2: Implement dependency wiring**

  Build one application container containing `Settings`, `SQLiteStore`, `GitHubClient`, `ApprovalService`, `WorkspaceManager`, and an injected `AgentRuntime`. Use a fake runtime in tests and `OpenHandsRuntime` in the default application.

- [ ] **Step 3: Implement API routes**

  Validate request bodies with Pydantic, map domain errors to 400/404/409/502 responses, persist every state transition, and never call the runtime from an unapproved run.

- [ ] **Step 4: Implement the static UI**

  Provide a request textarea, target workspace field, candidate comparison cards with evidence/risks, an approval control, live run status, event log, changed-file list, and a clear missing-configuration message. Keep all controls local and avoid third-party CDN assets.

- [ ] **Step 5: Run API and UI-serving tests**

  Run: `python -m pytest tests/api/test_request_flow.py -q`

  Expected: PASS, including the approval boundary and static index response.

- [ ] **Step 6: Commit**

  Run: `git add app/main.py app/api app/static tests/api && git commit -m "feat: add product builder API and UI"`

### Task 8: End-to-end sample, documentation, and release verification

**Files:**
- Create: `README.md`
- Create: `docs/oss-decision-template.md`
- Create: `tests/e2e/test_sample_flow.py`
- Modify: `.env.example`

**Interfaces:**
- `README.md` documents Windows setup, environment variables, start command, approval model, optional OpenHands configuration, and the sample flow.
- The sample flow creates a small workspace artifact and records `OSS-DECISIONS.md`, a lockfile or pinned dependency list, test output, and a final report.

- [ ] **Step 1: Write the deterministic end-to-end test**

  Use a fake GitHub response and fake agent runtime to assert the full sample flow produces an artifact directory, decision record, run log, and a completed report without live credentials.

- [ ] **Step 2: Implement the sample artifact/report writer**

  Write only within the run workspace. Include selected repository URLs, versions or commits, licenses, evidence, test commands, and pass/fail results.

- [ ] **Step 3: Write setup and troubleshooting documentation**

  Document `python -m venv .venv`, dependency installation, `python -m app.main`, optional `LLM_*` variables, GitHub rate-limit behavior, and the fact that the first execution requires explicit approval.

- [ ] **Step 4: Run the full verification suite**

  Run: `python -m pytest -q`

  Expected: all tests pass.

  Then run: `python -m app.main`

  Expected: the service binds to `127.0.0.1`, `/health` returns `{"status":"ok"}`, and the browser UI loads without external assets.

- [ ] **Step 5: Commit**

  Run: `git add README.md docs/oss-decision-template.md .env.example tests/e2e && git commit -m "docs: verify OSS Product Builder MVP"`

### Task 9: Coordinator Harness, shared state, and independent verification

**Files:**
- Create: `app/harness/__init__.py`
- Create: `app/harness/state.py`
- Create: `app/harness/coordinator.py`
- Create: `app/harness/verifier.py`
- Create: `tests/harness/test_state.py`
- Create: `tests/harness/test_coordinator.py`
- Create: `tests/harness/test_verifier.py`

**Interfaces:**
- `ProjectState` contains `version: int`, `requirements_hash: str`, `current_commit: str | None`, `active_tasks: list[AgentTask]`, and `artifacts: list[str]`.
- `AgentTask` contains `id`, `role`, `state_version`, `workspace`, `owned_paths`, `status`, and `handoff`.
- `Coordinator.start_task(task: AgentTask, state: ProjectState) -> AgentTask` rejects a stale state version or overlapping owned paths.
- `Coordinator.record_handoff(task_id: str, handoff: dict[str, object]) -> ProjectState` increments the state version and records changed files and evidence.
- `VerificationRunner.run(workspace: Path, acceptance_criteria: list[str], commands: list[list[str]]) -> VerificationReport` executes only approved commands and returns `PASS`, `WARN`, or `BLOCKED` with command output and evidence paths.
- `VerificationReport` contains `status`, `commit`, `checks`, `evidence_paths`, and `blocking_reasons`.
- `ReviewReport` contains `status`, `findings`, and `required_actions`.

- [ ] **Step 1: Write failing state and ownership tests**

  Assert a task can start on the current state, a stale task is rejected, and two tasks cannot own the same file at the same time.

- [ ] **Step 2: Implement versioned shared state and task leases**

  Persist the state and leases through `SQLiteStore`; require a handoff with changed files, summary, and next-step notes before releasing a task.

- [ ] **Step 3: Write failing verifier tests**

  Mock a passing test command, a failing test command, and an unapproved command. Assert only the first produces `PASS`, a failed mandatory command produces `BLOCKED`, and an unapproved command never starts.

- [ ] **Step 4: Implement deterministic verification**

  Run commands through `CommandPolicy`, capture stdout/stderr/exit code, record the integrated commit, and attach each result to the verification report. The verifier must not trust agent-written claims.

- [ ] **Step 5: Add optional fresh-context review**

  Define `ReviewerAgent.review(diff: str, requirements: RequestBrief) -> ReviewReport` as a separate adapter. Give it only the latest diff, requirements, and verification report; a review finding blocks completion until resolved or explicitly waived.

- [ ] **Step 6: Run harness tests**

  Run: `python -m pytest tests/harness -q`

  Expected: PASS without a live model.

- [ ] **Step 7: Commit**

  Run: `git add app/harness tests/harness && git commit -m "feat: add coordinator harness and verification"`

### Task 10: Reference-driven design agent and visual verification

**Files:**
- Create: `app/design/__init__.py`
- Create: `app/design/references.py`
- Create: `app/design/tokens.py`
- Create: `app/design/visual_verify.py`
- Create: `tests/design/test_references.py`
- Create: `tests/design/test_visual_verify.py`
- Modify: `app/api/routes.py`
- Modify: `app/static/index.html`
- Modify: `app/static/app.js`
- Modify: `app/static/styles.css`

**Interfaces:**
- `DesignReference` contains `source_url`, `source_kind`, `title`, `license_name: str | None`, `license_url: str | None`, `captured_at`, `allowed_uses`, and `notes`.
- `ReferencePack` contains `references: list[DesignReference]`, `layout_patterns`, `component_patterns`, `tokens`, and `attribution`.
- `ReferenceCollector.collect(urls: list[str], keywords: list[str], target_type: str) -> ReferencePack` records provenance and rejects references with unknown usage rights for direct asset copying.
- `DesignTokenExtractor.extract(pack: ReferencePack) -> dict[str, object]` returns named color, typography, spacing, radius, and breakpoint tokens with source references.
- `VisualVerifier.compare(url: str, expected: Path) -> VisualReport` returns screenshot path, mismatch status, and actionable differences.
- `VisualReport` contains `status`, `actual_screenshot`, `baseline`, `differences`, `viewport`, and `environment`.
- `POST /api/design/references` creates a reference pack; `GET /api/design/references/{id}` returns provenance and extracted tokens.

- [ ] **Step 1: Write failing provenance tests**

  Assert a reference with an explicit license is accepted, a missing-license reference is marked `reference_only`, direct asset copying is disabled, and attribution is preserved in the pack.

- [ ] **Step 2: Implement reference collection and token extraction**

  Support user-provided URLs first. Store source metadata and allow the design agent to produce tokens and component names without copying brand assets or page text.

- [ ] **Step 3: Write failing visual verification tests**

  Mock a screenshot comparison and assert a matching screenshot returns `PASS`, a mismatch returns `WARN` with a path to the actual screenshot, and an unreachable local app returns `BLOCKED`.

- [ ] **Step 4: Implement browser visual verification**

  Use Playwright screenshots when the project exposes a local URL. Keep browser verification deterministic by recording viewport, browser, OS, and baseline version.

- [ ] **Step 5: Add reference pack controls to the UI**

  Add URL/keyword inputs, provenance cards, token preview, attribution text, and a design verification status panel. Do not add a “copy this site” action.

- [ ] **Step 6: Run design tests**

  Run: `python -m pytest tests/design -q`

  Expected: PASS without external reference credentials.

- [ ] **Step 7: Commit**

  Run: `git add app/design app/api/routes.py app/static tests/design && git commit -m "feat: add reference-driven design agent"`

## Plan Self-Review

- Spec coverage: request analysis, OSS evidence and scoring, approval state, local workspace boundaries, agent execution, model configuration, shared multi-agent state, design references, visual verification, artifacts, and explicit non-goals are covered by Tasks 2–10.
- Step scan: each task has a failing test, implementation, focused verification, and a reviewable commit boundary.
- Type consistency: domain models are introduced in Task 2 and consumed by research, workflow, API, and tests using the same names.
- Review focus: all six failure modes are assigned to owning tasks and pinned by tests.
- Proportion: Tasks 1–8 deliver the first vertical MVP; Tasks 9–10 add the harness and reference-driven design capabilities without adding screen monitoring, voice, or scheduled jobs.

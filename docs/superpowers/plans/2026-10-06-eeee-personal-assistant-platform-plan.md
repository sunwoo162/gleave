# EEEE Personal Assistant Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe the aggregate repository as the single local-first Gleave project, with EEEE as its extensible assistant kernel, a unified Project Runtime, explicit connector plans, and a global ClaimLatch/QA trust boundary.

**Architecture:** Keep `apps/eeee` as the local EEEE kernel and introduce focused `assistant`, `project_runtime`, and `trust` packages. Preserve the current coordinator and ISEOL execution behavior behind the new project capability, while representing Notion, Calendar, GitHub CI/Review, Desktop, and Mobile as connector ports whose local planning state is durable even when external credentials are absent. Keep ClaimLatch and deterministic QA as separate gates that must agree on project identity and revision before release or memory promotion.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, SQLite, TypeScript/Node 20 for ISEOL and the ClaimLatch adapter, existing versioned JSON contracts, pytest, and Node's built-in test runner. No new runtime dependency.

**Spec:** `docs/superpowers/specs/2026-10-06-eeee-personal-assistant-platform-design.md`

## Global Constraints

- `Gleave` is the single installable project; EEEE, ISEOL, and ClaimLatch remain internal modules with explicit boundaries.
- EEEE is the top-level personal assistant and chooses capabilities; ISEOL is selected for project execution and owns project Agent organization.
- Project creation produces one durable `projectId` and binds profile, workspace, ISEOL, connector plans, client surfaces, QA baselines, and project memory scope.
- External connectors must report `planned` or `awaiting_configuration` when credentials or a provider are unavailable; they must never claim an external side effect occurred.
- ClaimLatch integration profile is `claimlatch-v0.2.0`; audit records separately preserve the actual bundled ClaimLatch engine version.
- ClaimLatch, deterministic verification, and independent QA must use the same `projectId` and `projectRevision` before release or memory promotion.
- Existing project execution, memory, and ClaimLatch tests must remain green.
- No login service, hosted EEEE server, central database, or mandatory cloud dependency may be introduced.

## Review Focus

- A request with no explicit project keyword still routes correctly from intent and does not silently create a project.
- Repeated provisioning is idempotent for the same project and revision and does not duplicate connector plans.
- Missing Notion/Calendar/GitHub credentials produce truthful non-success states and retain the requested intent.
- A stale project revision cannot be used to create a trusted connector action, release, or promoted memory.
- ClaimLatch unavailability is fail-closed for external side effects while local planning remains inspectable.

### Task 1: Canonical architecture documentation and repository entrypoint

**Files:**
- Create: `docs/architecture/eeee-platform.md`
- Modify: `docs/architecture.md`
- Modify: `README.md`
- Test: `scripts/check-repository.ps1` (existing hygiene command only; no code test required)

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-10-06-eeee-personal-assistant-platform-design.md`
- Produces: one reader-facing architecture document that names `eeee-platform` as the single project and links to the implementation spec and operations guide.

- [ ] **Step 1: Write the canonical architecture document**

  Copy the approved design into `docs/architecture/eeee-platform.md`, retaining the organization chart, capability routing, Project Runtime provisioning, ClaimLatch placement, local-first rules, repository map, and completion criteria. Keep the spec as the engineering authority and the architecture document as the user-facing explanation.

- [ ] **Step 2: Replace the old architecture entrypoint**

  Change `docs/architecture.md` into a concise index that states the single-project model and links to the canonical architecture, integration contracts, local runtime operations, and superpowers design/plan files. Remove wording that makes ISEOL look like a peer product or makes EEEE project-only.

- [ ] **Step 3: Update the root README**

  Add the new product definition, one-project repository map, local-first runtime statement, and ClaimLatch/QA trust statement. Preserve existing quick-start commands and point readers to the canonical architecture.

- [ ] **Step 4: Run repository hygiene**

  Run: `./scripts/check-repository.ps1`

  Expected: `Repository hygiene check passed.`

- [ ] **Step 5: Commit**

  `git add docs README.md && git commit -m "docs: define EEEE as extensible personal assistant platform"`

### Task 2: EEEE capability contracts and deterministic routing

**Files:**
- Create: `apps/eeee/app/assistant/__init__.py`
- Create: `apps/eeee/app/assistant/models.py`
- Create: `apps/eeee/app/assistant/registry.py`
- Create: `apps/eeee/app/assistant/router.py`
- Create: `apps/eeee/tests/assistant/test_registry.py`
- Create: `apps/eeee/tests/assistant/test_router.py`

**Interfaces:**
- Produces `CapabilityDescriptor`, `CapabilityMatch`, `AssistantRequest`, `AssistantContext`, `CapabilityPlan`, `CapabilityResult`, and `CapabilitySelection` Pydantic models.
- Produces `CapabilityRegistry.register(descriptor, handler)`, `CapabilityRegistry.list()`, and `CapabilityRegistry.resolve(capability_id)`.
- Produces `CapabilityRouter.select(request: AssistantRequest) -> CapabilitySelection`.
- Produces `build_default_registry() -> CapabilityRegistry` with `personal-secretary`, `project-execution`, `knowledge-documents`, and `presence` descriptors.

- [ ] **Step 1: Write failing model and registry tests**

  Pin unique capability IDs, descriptor side-effect levels, explicit capability override, duplicate registration rejection, and missing capability lookup failure.

- [ ] **Step 2: Run the focused tests to verify they fail**

  Run: `C:\Users\user\Documents\eeee-platform-env\Scripts\python.exe -m pytest -q apps/eeee/tests/assistant/test_registry.py`

  Expected: FAIL because the `app.assistant` package does not exist.

- [ ] **Step 3: Implement the capability contracts and registry**

  Use Pydantic models with strict non-empty IDs and a registry that stores immutable descriptors plus handlers. Keep handlers opaque to the kernel so future capability packages can register without changing the core.

- [ ] **Step 4: Write failing router tests**

  Pin these routes: Korean/English project requests to `project-execution`, calendar/reminder requests to `personal-secretary`, document requests to `knowledge-documents`, desktop/mobile widget requests to `presence`, and ambiguous requests to a deterministic `needs_clarification` result. Explicit `requested_capability` must override keyword scoring only when the capability is registered.

- [ ] **Step 5: Run the router tests to verify they fail**

  Run: `C:\Users\user\Documents\eeee-platform-env\Scripts\python.exe -m pytest -q apps/eeee/tests/assistant/test_router.py`

  Expected: FAIL because `CapabilityRouter` and the default registry are not implemented.

- [ ] **Step 6: Implement default descriptors and routing**

  Score registered trigger phrases deterministically, preserve the top candidates and reasons, and return `needs_clarification` when no candidate reaches the minimum score. Do not create projects in this task.

- [ ] **Step 7: Run assistant tests**

  Run: `C:\Users\user\Documents\eeee-platform-env\Scripts\python.exe -m pytest -q apps/eeee/tests/assistant`

  Expected: all assistant tests pass.

- [ ] **Step 8: Commit**

  `git add apps/eeee/app/assistant apps/eeee/tests/assistant && git commit -m "feat: add EEEE capability registry and request routing"`

### Task 3: Unified Project Runtime models, durable profile storage, and connector plans

**Files:**
- Create: `apps/eeee/app/project_runtime/__init__.py`
- Create: `apps/eeee/app/project_runtime/models.py`
- Create: `apps/eeee/app/project_runtime/connectors.py`
- Create: `apps/eeee/app/project_runtime/provisioner.py`
- Modify: `apps/eeee/app/storage/sqlite.py`
- Create: `apps/eeee/tests/project_runtime/test_models.py`
- Create: `apps/eeee/tests/project_runtime/test_provisioner.py`
- Modify: `apps/eeee/tests/storage/test_project_state.py`

**Interfaces:**
- Produces `ConnectorState = Literal["planned", "ready", "awaiting_configuration", "completed", "blocked"]`.
- Produces `ConnectorBinding`, `ProjectProfile`, and `ProjectProvisioningResult` Pydantic models.
- Produces `ProjectConnector.plan(profile: ProjectProfile) -> ConnectorBinding`.
- Produces `ProjectProvisioner.provision(project: Project, request: RequestBrief, *, memory_ids: list[str], qa_baseline_ids: list[str]) -> ProjectProvisioningResult`.
- Adds `SQLiteStore.save_project_profile(profile)` and `SQLiteStore.get_project_profile(project_id)`, with an idempotent `project_profiles` table keyed by `project_id`.

- [ ] **Step 1: Write failing model tests**

  Pin profile identity, revision, provenance for inferred fields, connector states, idempotency keys, and rejection of empty project IDs or revisions.

- [ ] **Step 2: Run the model tests to verify they fail**

  Run: `C:\Users\user\Documents\eeee-platform-env\Scripts\python.exe -m pytest -q apps/eeee/tests/project_runtime/test_models.py`

  Expected: FAIL because the project runtime package is absent.

- [ ] **Step 3: Implement project runtime models and connector ports**

  Provide planning-only built-ins for `notion`, `google-calendar`, `github`, `iseol-runtime`, `desktop`, and `mobile-bridge`. Their output must preserve the intended action and return `awaiting_configuration` when the provider is not configured; no connector may claim completion without a provider acknowledgement.

- [ ] **Step 4: Write failing persistence and provisioner tests**

  Pin that provisioning creates a stable profile, local workspace path, ISEOL capability binding, all connector plans, retrieved memory IDs, QA baseline IDs, and a repeated provisioning call returns the same profile without duplicate records. Reopening SQLite must restore the profile.

- [ ] **Step 5: Run the provisioner tests to verify they fail**

  Run: `C:\Users\user\Documents\eeee-platform-env\Scripts\python.exe -m pytest -q apps/eeee/tests/project_runtime/test_provisioner.py apps/eeee/tests/storage/test_project_state.py`

  Expected: FAIL because `ProjectProvisioner` and the profile table do not exist.

- [ ] **Step 6: Implement durable profile storage and `ProjectProvisioner`**

  Provision from the parsed request and existing EEEE memory. Use a deterministic profile hash to derive idempotency keys. Create only local directories in this task; external services remain planned/awaiting configuration.

- [ ] **Step 7: Run project runtime tests**

  Run: `C:\Users\user\Documents\eeee-platform-env\Scripts\python.exe -m pytest -q apps/eeee/tests/project_runtime apps/eeee/tests/storage/test_project_state.py`

  Expected: all project runtime tests pass.

- [ ] **Step 8: Commit**

  `git add apps/eeee/app/project_runtime apps/eeee/app/storage/sqlite.py apps/eeee/tests/project_runtime apps/eeee/tests/storage/test_project_state.py && git commit -m "feat: add durable unified project runtime"`

### Task 4: Route project requests through EEEE and expose the unified runtime profile

**Files:**
- Create: `apps/eeee/app/assistant/service.py`
- Modify: `apps/eeee/app/api/routes.py`
- Modify: `apps/eeee/app/api/service.py`
- Modify: `apps/eeee/app/main.py`
- Modify: `apps/eeee/app/domain/models.py`
- Create: `apps/eeee/tests/assistant/test_service.py`
- Modify: `apps/eeee/tests/api/test_request_flow.py`
- Create: `apps/eeee/tests/api/test_assistant_routes.py`

**Interfaces:**
- Produces `AssistantService.route(text: str, workspace: str | None = None) -> AssistantRouteResult`.
- `AssistantRouteResult` includes `selection`, optional `project_id`, optional `project_profile`, and a truthful `status`.
- Adds `POST /api/assistant/route` with `{text, workspace?}` and `GET /api/projects/{project_id}/profile`.
- `ApiFlowService.create_request` consumes `CapabilityRouter` and `ProjectProvisioner` but preserves the existing tuple return shape for legacy callers.

- [ ] **Step 1: Write failing service and API tests**

  Pin that a project request is selected as `project-execution`, creates one project/profile/workspace, exposes connector plans, and does not report Notion or Calendar as completed when they are not configured. Pin that a reminder request returns `personal-secretary` without creating a project.

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `C:\Users\user\Documents\eeee-platform-env\Scripts\python.exe -m pytest -q apps/eeee/tests/assistant/test_service.py apps/eeee/tests/api/test_assistant_routes.py`

  Expected: FAIL because the assistant service, routes, and runtime wiring do not exist.

- [ ] **Step 3: Implement `AssistantService` and application wiring**

  Build the default registry once per app, inject the router and provisioner into `ApiFlowService`, and retain the existing `/api/requests` behavior for project requests. The new assistant route is the canonical entrypoint and returns explicit clarification/configuration states instead of silently falling back to project mode.

- [ ] **Step 4: Add profile API serialization**

  Add response models for `AssistantRouteResult` and `ProjectProfile`, preserving camelCase aliases at the HTTP boundary while keeping Python models snake_case internally.

- [ ] **Step 5: Run focused and regression tests**

  Run: `C:\Users\user\Documents\eeee-platform-env\Scripts\python.exe -m pytest -q apps/eeee/tests/assistant apps/eeee/tests/api/test_assistant_routes.py apps/eeee/tests/api/test_request_flow.py`

  Expected: all focused tests pass and the legacy request flow remains green.

- [ ] **Step 6: Commit**

  `git add apps/eeee/app/assistant/service.py apps/eeee/app/api apps/eeee/app/main.py apps/eeee/app/domain/models.py apps/eeee/tests/assistant apps/eeee/tests/api && git commit -m "feat: route requests through EEEE assistant and project runtime"`

### Task 5: Make ClaimLatch a visible global trust boundary

**Files:**
- Create: `apps/eeee/app/trust/__init__.py`
- Create: `apps/eeee/app/trust/models.py`
- Create: `apps/eeee/app/trust/gate.py`
- Modify: `apps/eeee/app/config.py`
- Modify: `apps/eeee/app/main.py`
- Modify: `apps/eeee/app/integrations/claimlatch_client.py`
- Create: `apps/eeee/tests/trust/test_gate.py`
- Modify: `apps/eeee/tests/integrations/test_claimlatch_client.py`
- Modify: `apps/eeee/tests/integrations/test_claimlatch_audit.py`
- Modify: `apps/eeee/tests/test_health.py`

**Interfaces:**
- Produces `TrustDecision = Literal["PASS", "WARN", "BLOCKED"]` and `TrustCheck` with subject, project, revision, action, decision, report ID, and reason.
- Produces `TrustGate.verify_action(...) -> TrustCheck` and `TrustGate.verify_claim(...) -> TrustCheck`.
- Adds `Settings.claim_latch_profile_version` defaulting to `claimlatch-v0.2.0` while preserving `Settings.claim_latch_version` as the actual engine version recorded in audit.
- Exposes health metadata showing whether ClaimLatch is `configured`, `advisory`, or `required` without leaking credentials.

- [ ] **Step 1: Write failing trust gate tests**

  Pin PASS for a configured adapter response, BLOCKED for BLOCK, BLOCKED for missing ClaimLatch on external side effects when `claim_latch_mode="required"`, WARN for local advisory checks, and rejection of stale project revisions.

- [ ] **Step 2: Run trust tests to verify they fail**

  Run: `C:\Users\user\Documents\eeee-platform-env\Scripts\python.exe -m pytest -q apps/eeee/tests/trust/test_gate.py`

  Expected: FAIL because the trust package and mode setting do not exist.

- [ ] **Step 3: Implement trust models and fail-closed gate**

  Delegate text claims to `ClaimLatchClient.require_pass` and structured actions to `verify_structured`. If the adapter is unavailable, return WARN only for advisory local planning and BLOCKED for required external actions. Preserve identity and revision in every decision.

- [ ] **Step 4: Record the v0.2.0 integration profile in ClaimLatch audit metadata**

  Thread the profile version through the client and audit record without replacing the actual engine version. Update the existing audit idempotency tests to assert both fields.

- [ ] **Step 5: Wire the gate into application state and health**

  Construct one `TrustGate` in `create_app`, expose it as `application.state.trust_gate`, and add non-secret ClaimLatch status to `/health` while preserving `status: ok`.

- [ ] **Step 6: Run trust and regression tests**

  Run: `C:\Users\user\Documents\eeee-platform-env\Scripts\python.exe -m pytest -q apps/eeee/tests/trust apps/eeee/tests/integrations apps/eeee/tests/test_health.py`

  Expected: all trust, integration, and health tests pass.

- [ ] **Step 7: Commit**

  `git add apps/eeee/app/trust apps/eeee/app/config.py apps/eeee/app/main.py apps/eeee/app/integrations apps/eeee/tests/trust apps/eeee/tests/integrations apps/eeee/tests/test_health.py && git commit -m "feat: add global ClaimLatch trust boundary"`

### Task 6: Cross-runtime documentation, verification, and final integration

**Files:**
- Modify: `integrations/contracts/README.md`
- Modify: `docs/operations/local-runtime.md`
- Create: `apps/desktop/README.md`
- Create: `apps/mobile/README.md`
- Create: `apps/eeee/app/mobile/bridge.py`
- Create: `apps/eeee/tests/mobile/test_bridge.py`
- Modify: `scripts/verify-all.ps1`
- Modify: `.github/workflows/verify.yml`
- Create: `apps/eeee/tests/e2e/test_assistant_project_runtime.py`

**Interfaces:**
- Documents the Project Runtime profile and connector states for ISEOL and adapter consumers.
- Makes the focused verification command exercise assistant, project runtime, trust, and existing ISEOL/ClaimLatch gates.
- Produces one end-to-end test from natural-language project request to durable profile and truthful connector statuses.
- Produces a paired Desktop↔Mobile bridge for remote assistant commands and live event streaming without moving state or secrets to Mobile.

- [ ] **Step 1: Write the end-to-end test**

  Start the local FastAPI app with no external credentials, route a project request, assert one project/profile/workspace, assert ISEOL is selected, assert Notion/Calendar/GitHub are not falsely completed, and assert the profile survives app restart.

- [ ] **Step 2: Run the end-to-end test to verify it fails**

  Run: `C:\Users\user\Documents\eeee-platform-env\Scripts\python.exe -m pytest -q apps/eeee/tests/e2e/test_assistant_project_runtime.py`

  Expected: FAIL until the prior tasks are wired together.

- [ ] **Step 3: Update cross-runtime and local operations documentation**

  Describe the one-project identity, connector state machine, ClaimLatch v0.2.0 integration profile, engine-version audit field, and desktop/mobile local bridge boundary.

- [ ] **Step 4: Expand focused verification**

  Add the new EEEE test directories to `scripts/verify-all.ps1` and keep the existing ISEOL QA/ReleaseGate and ClaimLatch adapter checks unchanged.

- [ ] **Step 5: Run the full verification suite**

  Run: `./scripts/verify-all.ps1 -Full -PythonPath C:\Users\user\Documents\eeee-platform-env\Scripts\python.exe`

  Expected: EEEE, ISEOL, and the ClaimLatch adapter all pass with zero failures.

- [ ] **Step 6: Run repository diff checks**

  Run: `git diff --check`

  Expected: no output and exit code 0.

- [ ] **Step 7: Commit**

  `git add apps integrations docs scripts .github README.md && git commit -m "feat: complete EEEE unified assistant platform foundation"`

## Self-review checklist

- [ ] Every requirement in the design spec has a task: EEEE kernel/capabilities (Task 2), unified Project Runtime (Task 3), provisioning and adapters (Tasks 3-4), ISEOL boundary preservation (Task 4/6), ClaimLatch global trust (Task 5), memory/release identity (Task 5/6), local-first operation (Tasks 3-6), and documentation (Tasks 1/6).
- [ ] All interfaces consumed by later tasks are defined in an earlier task.
- [ ] Review-focus failure modes have explicit tests in Tasks 2-6.
- [ ] No task introduces a cloud server, login service, or new runtime dependency.
- [ ] Existing tests remain part of the final verification command.

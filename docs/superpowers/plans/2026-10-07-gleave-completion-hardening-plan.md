# Gleave Completion Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Connect the existing EEEE, ISEOL, ClaimLatch, QA, memory, and desktop runtime pieces into one evidence-gated path that can turn `Todo 앱 만들어줘` into a runnable, tested, documented project.

**Architecture:** Keep EEEE as the personal-assistant boundary, ISEOL as the sole project Agent coordinator, and ClaimLatch plus deterministic QA as the release trust boundary. Add explicit versioned task/artifact contracts, an executable project workflow, FSD scaffolding, independent QA evidence, and a release manifest without replacing the existing persistence or stale-revision protections.

**Tech Stack:** Python 3.12, PySide6 desktop shell, SQLite/local filesystem persistence, TypeScript ISEOL runtime, Vitest, pytest, ClaimLatch v0.2.0 adapter, Playwright-compatible E2E contract.

**Spec:** `docs/architecture/eeee-platform.md`, `docs/superpowers/specs/2026-10-06-eeee-personal-assistant-platform-design.md`, `docs/superpowers/specs/2026-10-06-gleave-desktop-shell-design.md`, `docs/superpowers/specs/2026-10-06-project-portfolio-generation-design.md`.

## Global Constraints

- EEEE remains the top-level assistant; ISEOL owns Agent creation, routing, handoff, integration, QA coordination, and release evaluation.
- Project execution is local-first; external connectors require explicit capability and approval.
- No Agent completion claim is trusted without deterministic evidence and a ClaimLatch verification envelope.
- The default generated UI baseline is the local Stayfolio-derived `DESIGN.md`; user instructions override it.
- Memory promotion is separate from memory compilation and requires provenance plus verification.
- Existing user changes and unrelated desktop work must be preserved.

## Review Focus

- A request classified as a todo project must create a real FSD scaffold and not only a project profile; covered by Task 4.
- A stale or conflicting project revision must not publish a completed child or parent result; covered by Task 2 and Task 5.
- A QA report with only natural-language claims must not pass release; covered by Task 3 and Task 5.
- Closing the workspace window must not terminate the desktop pet or background worker; covered by Task 6.
- Generated portfolio/memory text must not contain unsupported facts or metrics; covered by Task 5.

### Task 1: Versioned Agent and Task Contracts

**Files:**
- Create: `packages/iseol/src/agent-organization/contracts.ts`
- Modify: `packages/iseol/src/agent-organization/registry.ts`
- Modify: `packages/iseol/src/agent-organization/team-composer.ts`
- Test: `packages/iseol/tests/agent-organization/contracts.test.ts`
- Test: `packages/iseol/tests/agent-organization/team-composer.test.ts`

**Interfaces:**
- Produces `AgentDefinition`, `WorkTask`, `TaskArtifact`, `TaskStatus`, and `VerificationEnvelopeV1` for later tasks.
- Preserves existing `composeAgentTeams` output compatibility while adding permissions, owned paths, dependencies, acceptance criteria, reviewer, and QA owner.

- [ ] Write failing tests for invalid definitions, path ownership overlap, missing dependencies, stale revisions, and unverified completion.
- [ ] Run the focused Vitest tests and confirm the expected RED failures.
- [ ] Implement the versioned contracts and validation helpers.
- [ ] Run focused and existing ISEOL tests and confirm GREEN.

### Task 2: Executable ISEOL Task DAG

**Files:**
- Create: `packages/iseol/src/agent-organization/task-decomposer.ts`
- Create: `packages/iseol/src/agent-organization/task-scheduler.ts`
- Create: `packages/iseol/src/agent-organization/failure-router.ts`
- Create: `packages/iseol/src/agent-organization/service.ts`
- Modify: `packages/iseol/src/runtime/iseol-runtime-services.ts`
- Test: `packages/iseol/tests/agent-organization/task-decomposer.test.ts`
- Test: `packages/iseol/tests/agent-organization/service.test.ts`

**Interfaces:**
- Consumes Task 1 contracts and existing memory/QA baseline services.
- Produces a deterministic `ProjectExecutionPlan` and lifecycle events for the Python EEEE bridge and UI.

- [ ] Write failing tests for todo classification, dependency ordering, parallel groups, retry routing, cancellation, and stale revision rejection.
- [ ] Implement DAG decomposition and ready/running/blocked/completed transitions.
- [ ] Implement ISEOL as the sole owner of Agent dispatch and handoff state.
- [ ] Wire the service into runtime construction without breaking existing APIs.
- [ ] Run TypeScript unit tests and existing runtime tests.

### Task 3: Unified Verification and Independent QA Evidence

**Files:**
- Create: `packages/iseol/src/qa/release-gate.ts`
- Create: `packages/iseol/src/qa/verification-envelope.ts`
- Modify: `packages/iseol/src/qa/qa-orchestrator.ts`
- Modify: `packages/iseol/src/qa/evidence-ledger.ts`
- Modify: `apps/eeee/app/integrations/claimlatch_client.py`
- Test: `packages/iseol/tests/qa/release-gate.test.ts`
- Test: `apps/eeee/tests/integrations/test_claimlatch_envelope.py`

**Interfaces:**
- Produces the same envelope fields across Python and TypeScript: request, project, revision, artifact, evidence, status, receipt, policy, and payload hash.
- Release Gate accepts only deterministic QA evidence plus ClaimLatch verification.

- [ ] Write failing tests for missing evidence, adapter failure, unsupported claims, stale revisions, and successful receipt linkage.
- [ ] Implement the shared envelope validator and fail-closed release gate.
- [ ] Route handoff, QA summary, final report, and memory candidate verification through the gate.
- [ ] Run Python and TypeScript focused tests, then the full existing suites.

### Task 4: Real Todo Project Provisioning

**Files:**
- Create: `apps/eeee/app/project_runtime/templates/todo_project.py`
- Create: `apps/eeee/app/project_runtime/scaffold.py`
- Modify: `apps/eeee/app/project_runtime/provisioner.py`
- Modify: `apps/eeee/app/assistant/service.py`
- Test: `apps/eeee/tests/project_runtime/test_todo_scaffold.py`
- Test: `apps/eeee/tests/assistant/test_todo_request_e2e.py`

**Interfaces:**
- Consumes the execution plan and project profile.
- Produces an FSD project scaffold, `DESIGN.md`, README, test directories, and a release candidate artifact list.

- [ ] Write failing tests proving `Todo 앱 만들어줘` creates source, FSD layers, persistence, tests, docs, and runnable commands.
- [ ] Implement deterministic local scaffold generation with Korean-first documentation and UTF-8 output.
- [ ] Connect assistant request routing to the scaffold path instead of returning only a project profile.
- [ ] Run the focused end-to-end test and verify generated files and contents.

### Task 5: Release, Memory, and Portfolio Handoff

**Files:**
- Create: `apps/eeee/app/release/manifest.py`
- Modify: `apps/eeee/app/coordinator/service.py`
- Modify: `apps/eeee/app/memory/store.py`
- Modify: `packages/iseol/src/project-model/portfolio.ts`
- Test: `apps/eeee/tests/release/test_release_manifest.py`
- Test: `packages/iseol/tests/project-model/portfolio-grounding.test.ts`

**Interfaces:**
- Consumes Task 3 verification envelopes and Task 4 generated project evidence.
- Produces a release manifest, memory candidate, and evidence-grounded portfolio snapshot.

- [ ] Write failing tests for release refusal, unsupported portfolio claims, provenance requirements, and QA-rule promotion.
- [ ] Implement release manifest creation and final completion status.
- [ ] Connect verified project outcomes to memory candidates without automatic unsafe promotion.
- [ ] Connect portfolio generation to the same evidence snapshot.
- [ ] Run focused tests and all regression suites.

### Task 6: Desktop Pet and Background Worker Lifecycle

**Files:**
- Modify: `apps/eeee/app/desktop/window.py`
- Modify: `apps/eeee/app/desktop/__main__.py`
- Modify: `apps/desktop/gleave-desktop.spec`
- Test: `apps/eeee/tests/desktop/test_runtime.py`
- Test: `apps/eeee/tests/desktop/test_pet_lifecycle.py`

**Interfaces:**
- Keeps the pet process alive independently of the workspace window.
- Exposes double-click chat, Ctrl-click workspace, tray status, background progress, and explicit quit.

- [ ] Write failing tests for workspace close, explicit quit, background completion notification, and task persistence.
- [ ] Implement separate pet and workspace lifecycle ownership.
- [ ] Update packaging and run desktop smoke checks.

### Task 7: Repository Governance and Full Verification

**Files:**
- Create: `.github/pull_request_template.md`
- Create: `.github/CODEOWNERS`
- Create: `.github/workflows/e2e.yml`
- Create: `docs/REPOSITORY_CONVENTIONS.md`
- Modify: `README.md`
- Modify: `repository-manifest.json`
- Test: `scripts/verify-all.ps1`

- [ ] Move aggregate repository CI governance to the root and document commit/PR rules.
- [ ] Add encoding, secret, path-boundary, contract, Python, TypeScript, and E2E verification to one command.
- [ ] Run the complete verification and record exact results.


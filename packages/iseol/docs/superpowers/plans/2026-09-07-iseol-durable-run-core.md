# Iseol Durable Run Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make an Iseol development Run durable, stage-driven, automatically advancing, recoverable after interruption, and protected against duplicate external side effects.

**Architecture:** Extend the existing preflighted `HarnessRunEnvelope` with versioned runtime state while retaining compatibility with preflight-only Run JSON. Add pure state-machine and completion-gate modules, append-only events/checkpoints, an idempotency ledger, recovery reconciliation, and a bounded Run Supervisor that advances until done or a genuine waiting/blocking state.

**Tech Stack:** TypeScript 7, Node.js 22, `node:test`, `node:fs/promises`, JSON/JSONL persistence, no new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-07-iseol-product-architecture-design.md`

## Global Constraints

- Read `docs/HARNESS_ENGINEERING.md` before every implementation task.
- Preserve existing Discord/GitHub/Figma/Calendar behavior.
- Durable Run state, not a ChatGPT conversation, is the source of truth.
- Every meaningful stage transition writes durable state and an append-only event.
- Recovery reconciles durable state with external reality before repeating side effects.
- PR/deploy-style side effects require idempotency keys and reusable completed receipts.
- Infinite retry loops are forbidden; the supervisor uses a bounded step budget.
- Completion requires configured evidence, not worker prose.
- Existing preflight-only Run JSON remains loadable.
- Commit messages are English Conventional Commit-style.

---## File structure

- `src/harness/contracts.ts` — add Run stage/status/evidence/event/checkpoint/side-effect receipt contracts.
- `src/harness/state-machine.ts` — deterministic stage ordering, legal status/stage transitions, and skip reasons.
- `src/harness/completion-gates.ts` — evidence requirements for quality/delivery stages and DONE eligibility.
- `src/harness/event-store.ts` — append/read JSONL Run events and checkpoint metadata.
- `src/harness/run-store.ts` — persist runtime state and migrate legacy preflight-only envelopes when loaded.
- `src/harness/side-effect-ledger.ts` — reserve/complete/reuse idempotent external effects.
- `src/harness/recovery.ts` — reconcile interrupted Runs against injected external-reality inspectors.
- `src/harness/run-supervisor.ts` — bounded automatic stage execution until DONE/wait/block/failure.
- `tests/harness-state-machine.test.ts` — stage/status transition coverage.
- `tests/harness-completion-gates.test.ts` — evidence-backed completion coverage.
- `tests/harness-event-store.test.ts` — append/reload ordering and checkpoint coverage.
- `tests/harness-side-effect-ledger.test.ts` — duplicate side-effect prevention coverage.
- `tests/harness-recovery.test.ts` — interrupted Run reconciliation coverage.
- `tests/harness-run-supervisor.test.ts` — automatic continuation and stop-condition coverage.

### Task 1: Runtime contracts and deterministic state machine

**Files:**
- Modify: `src/harness/contracts.ts`
- Create: `src/harness/state-machine.ts`
- Create: `tests/harness-state-machine.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `HarnessRunStage`, `HarnessRunStatus`, `HarnessRunState`, `HARNESS_STAGE_ORDER`, `createInitialRunState(preflight, now)`, `nextHarnessStage(stage)`, `transitionRunState(state, command)`.
- Consumes: existing `HarnessPreflightRecord`.- [x] **Step 1: Write failing state-machine tests**

Cover: successful preflight starts at `CONTEXT/READY`; blocked preflight starts `PREFLIGHT/BLOCKED_USER`; `start` moves READY to RUNNING; `complete-stage` advances one stage; `pause/resume` preserves stage; illegal transitions throw; `DONE` is terminal.

- [x] **Step 2: Run focused test and confirm RED**

Run: `node --import tsx --test tests/harness-state-machine.test.ts`
Expected: FAIL because the state-machine module does not exist.

- [x] **Step 3: Implement minimal runtime contracts and state machine**

Use the exact stage order from the product spec: `PREFLIGHT`, `CONTEXT`, `ANALYZE`, `PLAN`, `IMPLEMENT`, `TEST`, `SELF_REVIEW`, `COMMIT`, `PR`, `CI`, `MERGE`, `DEPLOY`, `PRODUCTION_VERIFY`, `DONE`. Runtime statuses are `READY`, `RUNNING`, `WAITING_EXTERNAL`, `WAITING_AGENT`, `RECOVERING`, `BLOCKED_USER`, `FAILED_RETRYABLE`, `FAILED_FINAL`, `PAUSED`, `CANCELLED`, `DONE`.

- [x] **Step 4: Run focused test and build**

Run: `node --import tsx --test tests/harness-state-machine.test.ts && npm run build`
Expected: PASS.

- [x] **Step 5: Commit**

`git commit -m "feat: add durable run state machine"`

### Task 2: Evidence-backed completion gates

**Files:**
- Modify: `src/harness/contracts.ts`
- Create: `src/harness/completion-gates.ts`
- Create: `tests/harness-completion-gates.test.ts`

**Interfaces:**
- Produces: `HarnessEvidenceRecord`, `requiredEvidenceForStage(stage)`, `assertStageCompletionEvidence(stage, evidence)`, `assertRunCompletionEvidence(evidence)`.
- Consumes: `HarnessRunStage`.- [x] **Step 1: Write failing completion-gate tests**

Require `test` evidence for TEST, `review` for SELF_REVIEW, `commit` for COMMIT, `pull-request` for PR, `ci` for CI, `deployment` for DEPLOY, and `production-verification` for PRODUCTION_VERIFY. Prove DONE rejects missing configured delivery evidence.

- [x] **Step 2: Run focused test and confirm RED**

Run: `node --import tsx --test tests/harness-completion-gates.test.ts`
Expected: FAIL because completion gates do not exist.

- [x] **Step 3: Implement structured evidence checks**

Evidence records contain `id`, `kind`, `stage`, `recordedAt`, and `summary`, with optional provider/reference metadata. Gate functions inspect evidence kinds only; they do not trust free-form worker completion claims.

- [x] **Step 4: Run focused test and build**

Expected: PASS.

- [x] **Step 5: Commit**

`git commit -m "feat: enforce run completion evidence"`

### Task 3: Append-only events, checkpoints, and legacy Run migration

**Files:**
- Modify: `src/harness/contracts.ts`
- Create: `src/harness/event-store.ts`
- Modify: `src/harness/run-store.ts`
- Modify: `src/harness/run-service.ts`
- Create: `tests/harness-event-store.test.ts`
- Modify: `tests/harness-run-store.test.ts`
- Modify: `tests/harness-run-service.test.ts`

**Interfaces:**
- Produces: `appendHarnessRunEvent`, `loadHarnessRunEvents`, `saveHarnessCheckpoint`, `loadLatestHarnessCheckpoint`; `loadHarnessRun` always returns an envelope with runtime state.
- Consumes: state-machine initial-state helper.- [x] **Step 1: Write failing event/migration tests**

Prove JSONL events reload in append order, latest checkpoint reloads exactly, new Runs persist state immediately, and a legacy envelope without `state` is normalized from preflight when loaded.

- [x] **Step 2: Run focused tests and confirm RED**

Run: `node --import tsx --test tests/harness-event-store.test.ts tests/harness-run-store.test.ts tests/harness-run-service.test.ts`
Expected: FAIL on missing runtime/event behavior.

- [x] **Step 3: Implement append-only event/checkpoint persistence**

Store events at `<root>/<runId>/events.jsonl` and checkpoints under `<root>/<runId>/checkpoints/`. Never rewrite historical events. Keep `run.json` as the latest durable state snapshot using the existing atomic rename pattern.

- [x] **Step 4: Implement legacy normalization**

When `run.json` lacks `state`, derive it with `createInitialRunState(preflight, updatedAt)` in memory. The next save writes the normalized shape. Do not mutate unrelated legacy fields.

- [x] **Step 5: Run focused tests and build**

Expected: PASS.

- [x] **Step 6: Commit**

`git commit -m "feat: persist run events and checkpoints"`

### Task 4: Idempotent external side-effect ledger

**Files:**
- Create: `src/harness/side-effect-ledger.ts`
- Create: `tests/harness-side-effect-ledger.test.ts`

**Interfaces:**
- Produces: `reserveHarnessSideEffect(root, input)`, `completeHarnessSideEffect(root, input)`, `loadHarnessSideEffect(root, runId, key)`.
- Side-effect keys use `<kind>:<stable-target>` and kinds initially support `commit`, `pull-request`, `merge`, and `deployment`.- [x] **Step 1: Write failing ledger tests**

Prove the first reservation returns `reserved`, the same key cannot be reserved twice while in progress, a completed receipt is returned on retry instead of requesting another side effect, and keys cannot escape the Run directory.

- [x] **Step 2: Run focused test and confirm RED**

Run: `node --import tsx --test tests/harness-side-effect-ledger.test.ts`
Expected: FAIL because the ledger module does not exist.

- [x] **Step 3: Implement atomic receipt persistence**

Store each receipt as JSON under `<root>/<runId>/effects/` using a SHA-256 filename derived from the idempotency key. Persist `status: reserved | completed`, timestamps, kind, key, and optional external reference. Never persist provider credentials.

- [x] **Step 4: Run focused test and build**

Expected: PASS.

- [x] **Step 5: Commit**

`git commit -m "feat: prevent duplicate run side effects"`

### Task 5: Interrupted Run reconciliation and recovery

**Files:**
- Create: `src/harness/recovery.ts`
- Create: `tests/harness-recovery.test.ts`

**Interfaces:**
- Produces: `recoverHarnessRun(input)` and `HarnessRealityInspector`.
- `HarnessRealityInspector` returns current branch/commit, existing PR/CI/deployment references, and worker availability without mutating them.

- [x] **Step 1: Write failing recovery tests**

Cover: interrupted PR stage reuses an existing PR receipt/reference; deployment stage skips deployment when the current commit is already deployed; unavailable Desktop Agent yields `WAITING_AGENT`; recoverable session loss moves through `RECOVERING` back to the same unfinished stage.

- [x] **Step 2: Run focused test and confirm RED**

Run: `node --import tsx --test tests/harness-recovery.test.ts`
Expected: FAIL because recovery orchestration does not exist.

- [x] **Step 3: Implement reconciliation-first recovery**

Recovery loads the Run, enters `RECOVERING`, invokes the read-only inspector, reconciles completed external reality into receipts/evidence, persists a checkpoint/event, and returns the first unfinished safe stage. It never blindly repeats an external side effect.

- [x] **Step 4: Run focused test and build**

Expected: PASS.

- [x] **Step 5: Commit**

`git commit -m "feat: recover interrupted development runs"`### Task 6: Bounded automatic Run Supervisor

**Files:**
- Create: `src/harness/run-supervisor.ts`
- Create: `tests/harness-run-supervisor.test.ts`

**Interfaces:**
- Produces: `superviseHarnessRun(input)` and `HarnessStageExecutor`.
- `HarnessStageExecutor` receives the durable Run envelope and returns one of: `completed` with evidence, `waiting-external`, `waiting-agent`, `blocked-user`, `retryable-failure`, or `final-failure`.

- [x] **Step 1: Write failing supervisor tests**

Prove a successful fake executor advances multiple stages without a user `continue`; waiting/blocking results stop immediately with persisted state; retryable failures are bounded by `maxSteps`; DONE requires completion gates; every completed stage appends an event/checkpoint before the next executor call.

- [x] **Step 2: Run focused test and confirm RED**

Run: `node --import tsx --test tests/harness-run-supervisor.test.ts`
Expected: FAIL because the supervisor module does not exist.

- [x] **Step 3: Implement bounded autonomous continuation**

The supervisor loads durable state, asserts preflight readiness, starts/resumes the Run, executes one stage at a time, validates returned evidence, persists state/event/checkpoint, and immediately continues while status remains runnable. Default `maxSteps` is finite; exhaustion returns `FAILED_RETRYABLE` with an explicit reason rather than looping forever.

- [x] **Step 4: Run focused test and build**

Expected: PASS.

- [x] **Step 5: Commit**

`git commit -m "feat: supervise runs through delivery stages"`

## Phase verification

- [x] Re-read `docs/HARNESS_ENGINEERING.md`.
- [x] `node --import tsx --test tests/harness-*.test.ts`
- [x] `npm test`
- [x] `npm run build`
- [x] `git diff --check`
- [x] Confirm no Discord command, provider API, or deployment path was mutated directly in this phase.
- [x] Record execution notes and test counts in this plan.

## Phase completion gate

The phase is complete only when a preflighted Run can be loaded after restart, automatically advance through multiple fake stages without repeated user prompts, stop durably on wait/block/failure conditions, reconcile interrupted external effects before retry, and reject DONE when required evidence is absent.
## Execution notes

- Implemented in isolated worktree branch `feat/iseol-durable-run-core`.
- Every implementation task re-read `docs/HARNESS_ENGINEERING.md` before mutation.
- Added deterministic Run stages/statuses, evidence-backed completion gates, append-only events/checkpoints, legacy Run normalization, idempotent external side-effect receipts, reconciliation-first recovery, and a bounded automatic Run Supervisor.
- Recovery reuses existing PR/deployment reality instead of blindly repeating provider mutations and moves unavailable Desktop Agent work into `WAITING_AGENT`.
- Supervisor advances multiple stages without repeated user `continue` input, stops durably on waiting/blocking/final-failure states, and bounds retry loops through `maxSteps`.
- Harness-focused verification: 39/39 tests passed.
- Full project verification: 81/81 tests passed.
- TypeScript build passed and `git diff --check` reported no whitespace errors.
- Phase changes are restricted to harness core/tests, the implementation plan, and package test registration; existing Discord/GitHub/Figma/Calendar execution paths were not directly modified.

# Operator Recovery and Desktop Job Containment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an authenticated, revision-checked operator path that inspects and safely contains uncertain Desktop jobs without claiming execution outcomes, while preserving WAITING_AGENT/WAITING_EXTERNAL runs and preventing unsafe redispatch.

**Architecture:** Keep job records and Run history append-only. Store containment as a separate durable, atomic sidecar keyed by job identity; enforce it at lease acquisition and recovery discovery. Add read-only operator inspection and approval-gated containment/reconciliation APIs, reusing existing operator approval and audit patterns. Do not change production state in this task.

**Tech Stack:** TypeScript, Node test runner, atomic JSON stores, existing web control-plane router and operator approval store.

## Global Constraints

- Never infer that a missing result means a mutation did not run.
- Never redispatch existing jobs or alter operating durable roots in this task.
- Preserve Run/job revisions, idempotency keys, history, approvals, and evidence.
- Require target-bound operator approval and expected revision for state-changing actions.
- Keep WAITING_AGENT and WAITING_EXTERNAL semantics; no automatic resume or terminal transition.
- Do not weaken Desktop authorization, workspace validation, or strict parser contracts.

### Task 1: Durable job containment primitives

**Files:**
- Modify: src/desktop-agent/job-store.ts
- Test: tests/desktop-agent-job-store.test.ts

- [ ] Add bounded containment record and atomic sidecar persistence.
- [ ] Add containDesktopJob, loadDesktopJobContainment, and isDesktopJobContained.
- [ ] Reject lease acquisition and recoverable listing for contained jobs.
- [ ] Test pending read-only and mutation jobs, active lease rejection, idempotency, and preservation of original job/result fields.

### Task 2: Operator desktop recovery service

**Files:**
- Create: src/desktop-agent/operator-reconciliation.ts
- Test: tests/desktop-agent-operator-reconciliation.test.ts

- [ ] Implement read-only inspection with operation/mutation risk, lease, result, and containment facts.
- [ ] Implement approval/revision/idempotency guarded containment only for pending, lease-free jobs.
- [ ] Implement verified result reconciliation only when a result exactly matches job/run/agent identity; never synthesize a result from workspace state.
- [ ] Append bounded audit records and preserve uncertainty.

### Task 3: Control-plane operator endpoints

**Files:**
- Modify: src/runtime/iseol-runtime-services.ts
- Modify: src/web-control-plane/router.ts
- Test: existing router tests

- [ ] Expose read-only job inspection and approval-gated containment/reconciliation through official routes.
- [ ] Reuse operator token/identity, target-bound approval, expected revision and operation id.
- [ ] Return explicit conflict/rejection responses; never auto-resume Runs or dispatch jobs.

### Task 4: Lifecycle safety integration

**Files:**
- Modify: src/desktop-agent/reality-inspector.ts or startup recovery integration only if required.
- Test: focused lifecycle/recovery tests.

- [ ] Ensure contained jobs are not eligible for automatic recovery/dispatch.
- [ ] Preserve WAITING_AGENT and WAITING_EXTERNAL runs across restart.
- [ ] Add regression coverage for startup barrier and no duplicate dispatch.

### Task 5: Verification

- [ ] Run focused job/operator/lifecycle tests.
- [ ] Run npm test, npm run build, git diff --check, and node --check web/app.js.
- [ ] Inspect real configured durable roots read-only and perform no operator action.
- [ ] Commit only implementation/tests, never operational records.

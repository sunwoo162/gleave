# Learning Session Revision CAS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect owner-scoped learning session state from stale resume and completion writes while preserving backward-compatible reads and idempotent terminal behavior.

**Architecture:** Add a durable numeric revision to `LearningSession`. Resume and completion accept an optional expected revision; a mismatch fails closed with a conflict before any write. The authenticated user router maps the conflict to HTTP 409, and the UI API sends the revision returned by the latest session projection.

**Tech Stack:** TypeScript, Node test runner, JSON file stores with atomic rename, authenticated user Control Plane router, React user UI API.

**Spec:** `docs/ISEOL_LEARNING_SPEC.md` (session CAS, owner/scope checks, durable append-only learning records)

## Global Constraints

- Preserve owner and private scope checks for every learning resource.
- Do not overwrite prior answers, feedback, review records, or session history.
- A stale mutation must return a bounded conflict and must not create activity or growth evidence.
- Keep legacy callers that omit `expectedRevision` working until the UI and API clients migrate.
- Do not contact external AI/providers or operational Runtime/Agent processes.

## Review Focus

- A second tab completing an old session must be rejected without changing the stored session.
- Repeating completion with the current terminal session must remain idempotent.
- Restarted services must read the persisted revision and enforce the same CAS boundary.
- A foreign principal must not learn whether the session exists through the conflict path.
- Existing learning browser journeys must continue to pass when the UI sends the returned revision.

### Task 1: Durable learning session revision and service CAS

**Files:**
- Modify: `src/learning/contracts.ts`
- Modify: `src/learning/service.ts`
- Test: `tests/learning-session-completion.test.ts`

**Interfaces:**
- Consumes: existing `LearningSession` owner-scoped store and session lifecycle methods.
- Produces: `LearningSession.revision: number`; `resumeLearningSession(principal, sessionId, expectedRevision?)`; `completeLearningSession(principal, sessionId, expectedRevision?)`.

- [x] **Step 1: Write the failing stale-session test**
- [x] **Step 2: Run the focused test and verify the stale write currently succeeds**
- [x] **Step 3: Implement revision increments and expected-revision checks**
- [x] **Step 4: Run focused session tests and the learning service regression**
- [x] **Step 5: Commit `feat: add learning session revision guards`**

### Task 2: Authenticated router and UI propagation

**Files:**
- Modify: `src/learning/router.ts`
- Modify: `user-ui/src/api/userApi.ts`
- Modify: `user-ui/src/pages/Learning.tsx`
- Test: `tests/learning-router.test.ts` or the existing learning router contract suite
- Test: `tests/user-ui-learning-contract.test.ts`

**Interfaces:**
- Consumes: Task 1 optional `expectedRevision` service arguments.
- Produces: HTTP 409 for stale session mutations; UI completion/resume calls that carry the latest `session.revision`.

- [x] **Step 1: Write failing router/UI contract assertions**
- [x] **Step 2: Run focused contracts and verify the missing propagation**
- [x] **Step 3: Parse `expectedRevision` and pass it through the router/API/page**
- [x] **Step 4: Run focused, product, build, and isolated browser verification**
- [x] **Step 5: Commit `feat: enforce learning session CAS at the user boundary`**

### Documentation and final verification

- [ ] Record the evidence and remaining process-local/cross-process boundary in `docs/ISEOL_AUTONOMOUS_DEVELOPMENT_LOG.md` and `docs/ISEOL_FEATURE_INVENTORY.md`.
- [ ] Commit documentation separately.
- [x] Run `git diff --check`, TypeScript, both builds, product regression, serial root regression, and isolated browser E2E before claiming the unit complete.

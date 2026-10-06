# Durable Notification Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Serialize owner-scoped notification creation and read transitions across same-host service instances while preserving the existing notification, SSE, and UI contracts.

**Architecture:** Add a small filesystem lock below the notification data root. Lock identities are hashed from bounded owner/source keys, lock acquisition uses exclusive file creation with bounded waiting and exact dead-owner reclamation, and every acquired lock is removed in `finally`. The existing process-local tail remains as a fast in-process queue inside the durable lock boundary.

**Tech Stack:** TypeScript, Node `fs/promises`, Node test runner, existing notification store/service and isolated browser harness.

**Spec:** Existing notification idempotency and SSE boundaries in `docs/ISEOL_FEATURE_INVENTORY.md` and `docs/ISEOL_AUTONOMOUS_DEVELOPMENT_LOG.md`.

## Global Constraints

- Keep notification records owner-scoped and source-idempotent.
- Do not change notification API shapes, SSE event payloads, UI copy, or external delivery behavior.
- Preserve fail-closed behavior for malformed or active lock records.
- Claim only same-host/shared-root serialization; do not claim cross-machine or provider-side exactly-once behavior.
- Do not touch operational Runtime/Agent state, UNKNOWN records, external providers, deployment, push, or AI Broadcast Room artifacts.

## Review Focus

- Two service instances creating one source concurrently must return one durable notification and one stream event.
- A competing read must wait for the exact notification identity lock and remain idempotent.
- Active-owner and malformed lock records must not be reclaimed or bypassed.
- Dead-owner lock records must be reclaimable only for their exact hashed key.
- Exceptional task completion must remove the exact lock so later work is not permanently blocked.

### Task 1: Durable notification lock and service integration

**Files:**
- Create: `src/notifications/notification-lock.ts`
- Modify: `src/notifications/service.ts`
- Test: `tests/user-notifications.test.ts`

**Interfaces:**
- Produces `withDurableNotificationLock<T>(root: string, lockKey: string, task: () => Promise<T>, options?: { waitForMs?: number; pollIntervalMs?: number }): Promise<T>`.
- The service uses `${userId}:<source-type>:<source-id>` for creation and `${userId}:notification:<notificationId>` for reads.

- [x] **Step 1: Write the failing tests**

  Keep the existing RED contracts for a held durable creation lock, a held read lock, and cross-service idempotency in `tests/user-notifications.test.ts`.

- [x] **Step 2: Run the focused tests to verify RED**

  Run `node --import tsx --test tests/user-notifications.test.ts`.
  Expected: module resolution fails because `notification-lock.ts` is not yet present.

- [ ] **Step 3: Implement the minimal lock and wrap service mutations**

  Add exclusive-file acquisition under `root/.locks/notifications/<sha256(lockKey)>.lock`, bounded metadata `{ version, pid, token, createdAt }`, active/malformed-owner fail-closed handling, dead-owner reclamation, and `finally` cleanup. Wrap the existing process-local notification tail with the durable lock and use a bounded wait of 2 seconds for service operations.

- [ ] **Step 4: Run focused notification tests**

  Run `node --import tsx --test tests/user-notifications.test.ts tests/user-notifications-api.test.ts tests/user-notifications-stream.test.ts`.
  Expected: all notification service/API/SSE tests pass, including the cross-service lock cases.

- [ ] **Step 5: Commit the feature**

  Commit `src/notifications/notification-lock.ts`, `src/notifications/service.ts`, the existing notification lock tests, and this plan/documentation with `feat: serialize user notification mutations`.

### Task 2: Product regression and evidence documentation

**Files:**
- Modify: `docs/ISEOL_AUTONOMOUS_DEVELOPMENT_LOG.md`
- Modify: `docs/ISEOL_FEATURE_INVENTORY.md`
- Test: existing user-product, root, and isolated browser suites

**Interfaces:**
- No product API or UI interface changes; browser verification reuses existing notification journeys.

- [ ] **Step 1: Run focused user-product notification contracts**

  Run the notification/API/SSE/UI contract commands and record exact counts.

- [ ] **Step 2: Run full user-product regression, TypeScript checks, and both builds**

  Require exit code 0 and preserve any pre-existing warning text without treating it as success evidence.

- [ ] **Step 3: Run isolated browser E2E**

  Require notification creation/read/SSE journeys, two-account isolation, reload persistence, and responsive `[390, 768, 1024, 1440]` coverage.

- [ ] **Step 4: Update evidence docs and commit docs**

  Record the same-host boundary, focused/full counts, browser result, and unchanged safety boundary. Run `git diff --check` and commit with `docs: record notification durable lock boundary`.

## Self-review

- Spec coverage: creation, read, malformed/active/dead lock behavior, cleanup, focused regression, full regression, and browser evidence are covered by Tasks 1–2.
- Step scan: each step has one checkable outcome and exact files/commands.
- Type consistency: the helper signature and service lock identities are defined once and reused by all tests.
- Review focus: all five likely failure modes are pinned by the existing lock tests or the focused service suite.
- Proportion: the plan adds one focused helper and a service wrapper without changing notification schemas, routers, or UI.

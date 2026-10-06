# Notification Idempotency Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or implement natively in the current autonomous task) to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent concurrent duplicate owner-scoped notification records and stream events for the same durable source identity.

**Architecture:** Keep the existing notification contracts, owner ACL, durable JSON store, and stream replay unchanged. Add a process-local per-user/source serialization gate around each notification producer's idempotent read/write/publish sequence, so concurrent calls converge on one notification without changing notification content or delivery semantics.

**Tech Stack:** TypeScript, Node test runner, existing atomic JSON notification store, authenticated user Control Plane, React user UI.

**Spec:** `docs/ISEOL_PRODUCT_SPEC.md` notification and multi-user data-isolation requirements; existing `src/notifications/contracts.ts` and `src/notifications/service.ts` are the authoritative local contract.

## Global Constraints

- Preserve owner-scoped notification records and private source payload boundaries.
- Do not change notification titles, bodies, source schemas, settings behavior, or browser design.
- Do not claim cross-process exactly-once delivery or provider-side semantics; the gate is one service-instance boundary.
- Do not contact external AI/providers, mutate operational Runtime/Agent state, replay UNKNOWN records, deploy, push, or delete data.
- Existing callers and idempotent sequential behavior must remain backward compatible.

## Review Focus

- Two concurrent calls for one owner/source must create one notification and one `created` stream event.
- Different owners must not share a serialization gate.
- Repeated sequential calls must still return the same durable notification.
- Read transitions must remain owner-bound and publish only one `read` event.
- A failed observer must not break the durable write or release the gate.

### Task 1: RED concurrency regression

**Files:**
- Modify: `tests/user-notifications.test.ts`

**Interfaces:**
- Consumes: existing `createNotificationService`, `createDirectMessageNotification`, and `subscribe` contracts.
- Produces: a failing regression proving concurrent same-source notification creation currently duplicates durable records/events.

- [ ] **Step 1: Add a concurrent same-source test** that blocks the first notification's observer/write boundary, starts two producer calls for the same owner/source, and asserts one durable record and one `created` stream event after both resolve.
- [ ] **Step 2: Run the focused test and confirm RED** because both calls currently pass the idempotency read before either save completes.

### Task 2: Serialize the producer idempotency boundary

**Files:**
- Modify: `src/notifications/service.ts`
- Test: `tests/user-notifications.test.ts`

**Interfaces:**
- Consumes: Task 1 regression and current notification producer methods.
- Produces: process-local per-user/source serialization for create and read transitions, with existing public return types unchanged.

- [ ] **Step 1: Add the minimal keyed promise-tail helper** inside `createNotificationService`.
- [ ] **Step 2: Wrap each producer's existing load/construct/save/publish sequence with the keyed gate.**
- [ ] **Step 3: Keep `markRead` owner-scoped and idempotent while serializing its load/write/publish sequence under the notification id.
- [ ] **Step 4: Run focused notification and stream tests and confirm GREEN.**

### Task 3: Regression, browser, and evidence

**Files:**
- Modify: `docs/ISEOL_AUTONOMOUS_DEVELOPMENT_LOG.md`
- Modify: `docs/ISEOL_FEATURE_INVENTORY.md`

- [ ] **Step 1: Run focused notification/API/UI checks, TypeScript, both builds, user-product regression, serial root regression, and isolated browser E2E.**
- [ ] **Step 2: Record the exact counts, process-local boundary, and safety checks in the two evidence documents.**
- [ ] **Step 3: Commit feature/test and documentation separately with `fix:` and `docs:` prefixes.**

## Completion boundary

This unit hardens local notification idempotency only. It does not implement the still-unspecified weekly digest scheduler, cross-process distributed locking, external push delivery, or any deferred AI Broadcast Room behavior.

# Learning Content Reservation Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make learning-session content request creation and completion safe across service instances sharing one owner-scoped data root, while preserving idempotent reconnect behavior and the existing local Runtime boundary.

**Architecture:** Reserve a session's content request under the existing per-session promise tail plus the durable session lock. The durable lock keeps its conflict behavior for ordinary CAS mutations, while content reservation may wait briefly for an active same-host lock so a competing idempotent request can observe the first persisted request. Dispatch happens after the reservation is released, so a slow local Runtime cannot hold the session mutation lock. Content completion uses the same boundary and returns the already-validated request on duplicate callbacks.

**Spec:** `docs/ISEOL_LEARNING_SPEC.md` session content request idempotency, owner scope, durable learning records, and local Runtime-only dispatch.

## Global constraints

- Preserve owner isolation, private scope, and the existing `waiting-runtime` behavior when no local content Runtime is configured.
- Do not call external AI providers, modify operational Runtime/Agent state, replay UNKNOWN records, or fabricate lesson content.
- Keep ordinary resume/complete session CAS mutations fail-fast on an active competing lock.
- Wait only for the exact owner/session lock below the configured learning root, with a bounded timeout.
- Do not claim distributed or cross-machine exactly-once semantics; the guarantee remains same-host/shared-root.

## Task 1: RED reservation-boundary test

- [x] Add a test that holds the exact session lock from a separate service boundary, starts a content request, and proves the request cannot persist before the lock is released.
- [x] Run the focused content test and observe that the current implementation mutates while the lock is held.

## Task 2: Lock content reservation and completion

- [x] Add an explicit bounded wait option to the durable session lock while keeping the default conflict behavior unchanged.
- [x] Move content request lookup/creation and the session `contentStatus` transition under the per-session and durable lock.
- [x] Release the lock before invoking the local content dispatcher; ensure a competing caller observes the same request and does not dispatch again.
- [x] Guard duplicate content completion callbacks with the same durable session lock.
- [x] Add cross-service idempotency coverage for one request identity and one dispatcher invocation.

## Task 3: Evidence and verification

- [x] Run focused learning-content tests, the full learning regression, user-product regression, serial root regression, type checks, builds, diff checks, and isolated browser E2E.
- [x] Record the bounded same-host reservation guarantee and remaining provider/runtime limits in the evidence documents.
- [x] Commit implementation/tests, then documentation separately with Conventional Commit messages.

## Verification record

- RED focused content test failed because the pre-lock implementation completed a request while a competing session lock was held.
- GREEN focused content coverage passed `5/5`; user-product regression passed `318/318`; serial root regression passed `678/678`; root and user UI TypeScript checks, both builds, `git diff --check`, and isolated browser E2E passed.
- The reservation lock waits at most two seconds for an active same-host owner/session lock, persists one request before dispatch, and invokes only explicitly injected local content Runtime adapters. Cross-machine locking, provider-side exactly-once behavior, and content correctness remain out of scope.
- Implementation/tests commit: `f2463e3 feat: serialize learning content reservations`.

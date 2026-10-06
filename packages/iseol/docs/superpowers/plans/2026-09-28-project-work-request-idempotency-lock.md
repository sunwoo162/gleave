# Project Work Request Idempotency Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve one durable Project Work Request when separate service instances concurrently submit the same owner-scoped `idempotencyKey`.

**Architecture:** Keep the existing per-file write queue and add an exact hashed idempotency-key lock below the project model root around the list/validate/save creation sequence. The lock is acquired only for request creation; workspace tree reconciliation remains idempotent and activity evidence is still emitted only for the caller that actually created the durable request. Existing request conflicts remain fail-closed.

**Spec:** `docs/ISEOL_PROJECT_SPEC.md` Project → Task identity, idempotent Work Request creation, owner scope, and durable activity provenance.

## Global constraints

- Preserve project ownership, dependency validation, idempotency conflict behavior, task node identity, and existing activity attribution.
- Lock only the exact project/idempotency-key path below the configured project model root; do not use user-supplied text as a filename.
- Do not start or modify operational Runtime/Agent processes, replay UNKNOWN records, call external AI/providers, or alter connector/design/deployment state.
- Keep same-host/shared-root semantics explicit; do not claim database or cross-machine distributed exactly-once behavior.

## Task 1: RED creation-boundary test

- [x] Add a test that holds the exact idempotency lock from a separate service boundary, starts creation, and proves the current implementation can persist while the lock is held.
- [x] Run the focused test and observe the pre-fix failure.

## Task 2: Durable idempotent creation

- [x] Implement bounded-wait lock metadata with a hashed key, exact path containment, active-owner preservation, dead-owner reclamation, and `finally` cleanup.
- [x] Wrap the lower-level list/validate/save creation sequence with the lock while preserving dependency and idempotency conflict checks.
- [x] Add concurrent same-key assertions for one created record, one identity, and one conflict when payloads differ.

## Task 3: Evidence and verification

- [x] Run focused project work-request tests, user-product regression, serial root regression, type checks, builds, diff checks, and isolated browser E2E.
- [x] Record the same-host creation guarantee and remaining runtime/provider boundary in the evidence documents.
- [x] Commit implementation/tests, then documentation separately with Conventional Commit messages.

## Verification record

- RED: the creation-boundary test reproduced a Work Request being persisted while a competing idempotency lock was held.
- GREEN: focused Project Work Request coverage passed `14/14`; user-product regression passed `319/319`; serial root regression passed `680/680`; root and user UI TypeScript checks, backend build, `git diff --check`, and isolated browser E2E passed. Browser coverage included project Runtime execution, learning content/session completion, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.
- The lock hashes the bounded idempotency key and provides same-host/shared-root serialization only. It does not claim cross-machine database semantics, provider-side exactly-once behavior, or live operational Runtime throughput.
- Implementation/tests commit: `3b0a139 feat: lock project work request idempotency`.

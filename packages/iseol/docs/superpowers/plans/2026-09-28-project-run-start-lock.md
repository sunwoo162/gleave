# Project Run Start Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent concurrent direct `startProjectRun` calls from separate service instances from creating multiple Harness Run identities for one queued Project Work Request.

**Architecture:** Add an exact project/work-request execution lock below the project model root around the existing authenticated start flow. The first caller may wait at the injected Runtime enqueue boundary; a competing caller waits, re-reads the Work Request, and returns the existing active Run instead of preparing a second Run. Existing scheduler lock, approval checks, dependency checks, workspace preparation, and Runtime waiting states remain authoritative.

**Spec:** `docs/ISEOL_PROJECT_SPEC.md` Work Request → Run identity, explicit execution, approval checkpoint, owner scope, and failure recovery.

## Global constraints

- Preserve owner authorization, Build Run approval, dependency gating, Run identity validation, waiting/unknown states, and explicit user-triggered execution.
- Do not start/stop operational Runtime/Agent processes, replay UNKNOWN records, call external AI/providers, or change deployment/design/connector state.
- Lock only the exact validated project/work-request path below the configured project model root.
- Keep same-host/shared-root semantics explicit; do not claim provider-side exactly-once or live production throughput.

## Task 1: RED concurrent-start test

- [x] Add a test with two service instances that holds the first Runtime enqueue and proves the current direct-start path invokes enqueue twice and can overwrite the durable Run identity.
- [x] Run the focused test and observe the pre-fix duplicate-start failure (`2 !== 1`).

## Task 2: Durable Work Request Run-start lock

- [x] Add bounded-wait lock metadata for a validated project/work-request identity, with active-owner preservation, dead-owner reclamation, and `finally` cleanup.
- [x] Wrap `startProjectRun` after lock acquisition and re-read the Work Request before preparing or enqueueing a Run.
- [x] Add assertions for one enqueue call, one durable Run identity, and `already-active` on the competing caller.

## Task 3: Evidence and verification

- [x] Run focused project execution tests, user-product regression, serial root regression, type checks, builds, diff checks, and isolated browser E2E.
- [x] Record the same-host direct-start guarantee and remaining Runtime/provider boundary in the evidence documents.
- [x] Commit implementation/tests, then documentation separately with Conventional Commit messages.

## Verification record

- RED focused test reproduced two enqueue calls and a competing Run identity before the lock (`2 !== 1`). GREEN focused project execution passed `20/20`; the user-product regression passed `320/320`; serial root regression passed `680/680` on the final run. The Idea Lab E2E file was also rerun independently and passed `4/4` after one earlier full-suite transient `invalid count: 0` failure.
- Backend and user UI TypeScript checks, backend build, user UI build, `git diff --check`, and isolated browser E2E all passed. Browser coverage included project Runtime execution, learning content/session completion, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Implementation commit: `4106127 feat: serialize project Run starts`. Documentation commit follows after the evidence updates.
- Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, and durable operational data remained untouched.

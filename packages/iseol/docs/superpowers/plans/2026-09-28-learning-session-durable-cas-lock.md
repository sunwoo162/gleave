# Learning Session Durable CAS Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the learning session revision guard across concurrently created service instances sharing the same owner-scoped data root, without changing operational Runtime state.

**Architecture:** Keep the existing in-process promise tail for low-latency serialization, and add an exact session-scoped filesystem lock acquired with exclusive create before loading and mutating the durable session. A competing mutation fails with the same bounded revision conflict; the lock is released in `finally` and never expands beyond the configured learning data root.

**Spec:** `docs/ISEOL_LEARNING_SPEC.md` session CAS, owner/scope checks, durable append-only learning records.

## Global constraints

- Preserve owner and private scope checks and the existing HTTP 409 conflict boundary.
- Never mutate operational Runtime/Agent state, UNKNOWN records, external providers, or approved design assets.
- Do not retry a competing session mutation or synthesize activity/growth evidence.
- Use only exact owner/session lock paths below the isolated learning data root.
- Keep legacy persisted sessions readable through the existing revision normalization.

## Task 1: RED cross-instance concurrency test

- [x] Add a test that creates two learning services over one temporary root and concurrently completes one session with the same expected revision.
- [x] Run the focused test and observe that both service instances can currently complete instead of one receiving a revision conflict.

## Task 2: Durable session lock

- [x] Implement an exact session lock helper with exclusive file creation, bounded metadata, `finally` cleanup, and conflict mapping.
- [x] Wrap resume and completion mutations after the existing in-process gate.
- [x] Run focused session/API regression and ensure one transition/activity event survives the race.

## Task 3: Evidence and verification

- [x] Run learning tests, product regression, serial root regression, type checks, both builds, `git diff --check`, and isolated browser E2E.
- [x] Record the local durable-lock boundary and remaining crash/stale-lock policy in the two evidence documents.
- [x] Commit implementation/tests, then documentation separately with Conventional Commit messages.

## Verification record

- RED cross-instance completion test failed with both service instances fulfilling (`2 !== 1`).
- GREEN learning regression passed `69/69`; user-product regression passed `315/315`; serial root regression passed `678/678`.
- Root and user UI TypeScript checks, both builds, `git diff --check`, and isolated browser E2E passed. Browser coverage included `learningSessionCompletion: "passed"`, two isolated accounts, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.
- The lock stores only bounded version/PID/token/timestamp metadata below the owner-scoped learning root. An active owner process is never removed; a dead owner lock is reclaimed only at that exact session path. Cross-machine distributed locking and provider-side exactly-once semantics remain out of scope.

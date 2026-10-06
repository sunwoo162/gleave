# Project Scheduler Durable Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent two user-project service instances sharing one project model root from selecting the same queued Work Request and creating duplicate project Runs when the owner starts the queue concurrently.

**Architecture:** Preserve the existing per-service project schedule promise tail and add an exact project-scoped filesystem lock below the project model root. The schedule operation re-reads the project only after acquiring the lock, so a waiting service observes the first service's durable Work Request transition and returns a truthful zero-selection result. A bounded wait is used for this idempotent owner-triggered scheduling operation; Runtime enqueue remains outside operational process control and is still supplied only through the existing injected boundary.

**Spec:** `docs/ISEOL_PROJECT_SPEC.md` Work Request queue, bounded scheduler concurrency, explicit user execution, and durable Run identity.

## Global constraints

- Preserve owner authorization, team ACLs, Build Run approval, dependency readiness, Run identity, and existing waiting/unknown states.
- Do not start, stop, or reconnect the operational Runtime/Agent; do not replay UNKNOWN records or call external providers.
- Lock only the exact project schedule path below the configured project model root.
- Keep startup/recovery auto-scheduling disabled and do not claim live operational throughput.
- Do not add provider-side exactly-once claims; this is a same-host/shared-root queue-selection guard.

## Task 1: RED cross-service scheduler test

- [x] Add a test that starts two services over one root, holds the first enqueue after selection, and proves the second service currently selects the same queued request.
- [x] Run the focused scheduler test and observe duplicate enqueue calls before the fix.

## Task 2: Durable project schedule lock

- [x] Implement bounded-wait project lock metadata with exact path containment, active-owner preservation, dead-owner reclamation, and `finally` cleanup.
- [x] Wrap the existing project schedule operation after the existing in-process tail and re-read the project inside the durable lock.
- [x] Add cross-service assertions for one enqueue call, one durable Run identity, and one zero-selection result for the waiting scheduler.

## Task 3: Evidence and verification

- [x] Run focused project scheduler tests, user-product regression, serial root regression, type checks, builds, diff checks, and isolated browser E2E.
- [x] Record the same-host queue-selection guarantee and live Runtime throughput boundary in the evidence documents.
- [x] Commit implementation/tests, then documentation separately with Conventional Commit messages.

## Verification record

- RED: the cross-service scheduler test reproduced two enqueue calls (`2 !== 1`) while the first service was held before its Work Request transition.
- GREEN: focused user-project execution coverage passed `19/19`; user-product regression passed `319/319`; serial root regression passed `678/678`; root and user UI TypeScript checks, both builds, and isolated browser E2E passed. Browser coverage included project Runtime execution, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.
- The project lock is a same-host/shared-root queue-selection guard only. Live operational Runtime throughput, provider-side exactly-once behavior, and automatic startup/recovery scheduling remain out of scope.
- Implementation/tests commit: `99e1b4d feat: serialize project queue scheduling`.

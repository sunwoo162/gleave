# Learning Review Timezone Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Schedule the next learning review by the learner's local calendar days so daylight-saving transitions do not shift the intended local review time.

**Architecture:** Keep the existing durable `ReviewItem.dueAt` UTC representation and owner-scoped service API. Add a small timezone-aware calendar-day conversion at the service boundary, using the authenticated principal's enriched timezone when available and retaining the current UTC-24-hour fallback for direct legacy callers without timezone metadata.

**Tech Stack:** TypeScript, Node `Intl.DateTimeFormat`, Node test runner, existing JSON durable learning store.

**Spec:** `docs/ISEOL_LEARNING_SPEC.md` sections 1–3 and the existing `ReviewItem` contract in `src/learning/contracts.ts`.

## Global Constraints

- Preserve owner-only learning records and authenticated route scope.
- Preserve append-only review activity and existing quality/interval policy.
- Do not call Ollama, external providers, or operational Runtime/Agent.
- Keep AI Broadcast Room deferred and preserve UNKNOWN/operational records.
- Do not change the approved UI layout; this unit is service scheduling only.

## Review Focus

- Spring-forward transition: adding two local days keeps the local clock time while UTC offset changes.
- Fall-back transition: adding local calendar days does not duplicate or skip a review date.
- Invalid/missing timezone: existing server-boundary fallback remains deterministic and does not throw from a legacy direct service caller.
- Owner isolation: another principal cannot reschedule a review item it cannot load.
- Activity provenance: the existing verified review event remains emitted exactly once for the completed review.

### Task 1: Add the failing DST behavior test

**Files:**
- Modify: `tests/learning-review-flow.test.ts`

**Interfaces:**
- Consumes: `createLearningService`, `ReviewItem`, and the existing direct service test helper.
- Produces: a regression test proving a timezone-aware principal receives a local-calendar-day due timestamp.

- [x] **Step 1: Add a test with a literal spring-forward fixture**

Use `America/New_York`, review time `2026-03-07T17:00:00.000Z` (12:00 local), quality `5`, and assert the two-day due timestamp is the hand-derived `2026-03-09T16:00:00.000Z` rather than a fixed-48-hour result.

- [x] **Step 2: Run the focused test and verify it fails for the UTC-24-hour reason**

Run: `node --import tsx --test tests/learning-review-flow.test.ts`

Expected: the existing review scheduling test passes, and the new DST test fails because the current implementation returns `2026-03-09T17:00:00.000Z`.

### Task 2: Implement timezone-aware local-day scheduling

**Files:**
- Modify: `src/learning/service.ts:principal timezone helpers and reviewItem`

**Interfaces:**
- Consumes: the optional `timezone` attached by `src/learning/router.ts` to authenticated principals.
- Produces: the existing `reviewItem` return shape with a dueAt timestamp aligned to local calendar-day arithmetic.

- [x] **Step 1: Add a bounded timezone offset/calendar conversion helper**

Use `Intl.DateTimeFormat` only; derive the local date/time parts and timezone offset, add calendar days in UTC date space, and convert back to an ISO timestamp. Catch invalid timezones and use the existing `addDays` fallback.

- [x] **Step 2: Replace only the `reviewItem` dueAt calculation**

Pass `principalTimezone(principal)` into the helper. Keep `createReviewItem` caller-supplied `dueAt`, interval policy, durable save, activity event, and ACL behavior unchanged.

- [x] **Step 3: Run the focused learning review suite**

Run: `node --import tsx --test tests/learning-review-flow.test.ts`

Expected: all tests pass, including the DST regression and existing provenance assertions.

### Task 3: Regression and integration verification

**Files:**
- Modify: `docs/ISEOL_FEATURE_INVENTORY.md`
- Modify: `docs/ISEOL_AUTONOMOUS_DEVELOPMENT_LOG.md`

- [x] **Step 1: Run product/root tests and both builds**

Run: `npm.cmd run test:iseol-user-product`, `npm.cmd test`, `npm.cmd run build`, and `npm.cmd run user-ui:build`.

- [x] **Step 2: Run isolated browser E2E**

Run: `npm.cmd run test:iseol-browser-e2e`; expected all existing learning, review, two-account, reload, and responsive journeys pass.

- [x] **Step 3: Recheck operational identity and diff whitespace**

Read-only check PID `1708`, Desktop Agent PID `22416`, configured dataRoot, lock PID `55000`, ports `18890/18891`, and run `git diff --check`. Do not restart or mutate any runtime.

- [x] **Step 4: Record exact evidence and the remaining live-runtime boundary**

Update the inventory/log with file paths, counts, browser evidence, and the fact that no Ollama/operational request was made.

## Verification record

- Focused `tests/learning-review-flow.test.ts`: `4/4` passed, including spring-forward and fall-back fixtures.
- `npm.cmd run test:iseol-user-product`: `301/301` passed.
- `npm.cmd test`: `675/675` passed.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; the UI build retained only existing Vite warnings.
- Full isolated browser E2E passed `learningReviewScheduling`, all existing user journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Read-only operational identity remained unchanged and `git diff --check` returned exit `0`.

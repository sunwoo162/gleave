# User Notification Stream Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve owner-scoped user notification stream events durably and replay missed changes on reconnect through `Last-Event-ID`, without exposing notification content or changing the existing REST source of truth.

**Architecture:** The notification service writes a bounded, owner-scoped event journal beside each user's durable notification records. The authenticated SSE route subscribes before replay, buffers live events while replaying, then flushes them in order; the browser sends the last received event id on reconnect and continues to refresh the durable REST snapshot on each bounded signal.

**Tech Stack:** TypeScript, Node `node:test`, Node HTTP SSE, existing atomic JSON store, React/browser Fetch stream.

**Spec:** `docs/ISEOL_FEATURE_INVENTORY.md` UI-02 and the user notification SSE contract in `src/notifications/contracts.ts`.

## Global Constraints

- Keep all notification reads and mutations authenticated and owner-scoped.
- Do not put notification title/body or private source data in the stream event payload.
- Preserve the existing REST notification list as the canonical snapshot and keep duplicate producers idempotent.
- Do not replay or modify operational Runtime, UNKNOWN requests, external providers, or AI Broadcast Room state.
- Do not add dependencies or external network calls.

## Review Focus

- A reconnect with a known cursor must receive only the authenticated user's missed `created`/`read` events.
- A reconnect cursor must not allow another user's event journal to be read.
- A live mutation racing with replay must be delivered exactly once and after the replayed events.
- A missing/unknown cursor must fail closed to a connected live stream without fabricating events.
- The browser must send the last received event id and retain the existing bounded reconnect behavior.

### Task 1: Durable notification event journal

**Files:**
- Modify: `src/notifications/contracts.ts`
- Modify: `src/notifications/store.ts`
- Modify: `src/notifications/service.ts`
- Test: `tests/user-notifications.test.ts`

**Interfaces:**
- Produces `listStreamEvents(userId: string, afterEventId?: string): Promise<NotificationStreamEvent[]>` on `NotificationService`.
- Persists only `NotificationStreamEvent` records under the authenticated user's notification scope.

- [x] Write a failing test for durable created/read event ordering, restart recovery, cursor filtering, and owner isolation.
- [x] Run the focused notification test and confirm the missing replay interface fails.
- [x] Add atomic event save/list helpers and publish each durable mutation event once.
- [x] Expose cursor-filtered replay through the service while treating an unknown cursor as an empty replay.
- [x] Run the focused notification tests and confirm they pass.

### Task 2: Authenticated SSE replay and race handling

**Files:**
- Modify: `src/web-control-plane/server.ts`
- Test: `tests/user-notifications-stream.test.ts`

**Interfaces:**
- Consumes `NotificationService.listStreamEvents` and `subscribe`.
- Reads the standard `last-event-id` request header only after authenticating the bearer token.

- [x] Write a failing HTTP test for reconnect replay and a live event arriving during replay.
- [x] Run the focused stream test and confirm the route does not yet replay.
- [x] Subscribe before replay, buffer live events during the asynchronous replay read, emit replayed events, then flush buffered events.
- [x] Keep event bodies bounded and preserve the existing connected frame, heartbeat, capacity, and cleanup behavior.
- [x] Run the focused stream tests and confirm owner isolation and replay ordering.

### Task 3: Browser cursor persistence

**Files:**
- Modify: `user-ui/src/api/userApi.ts`
- Test: `tests/user-notifications-stream.test.ts`
- Test: `tests/user-ui-notifications-contract.test.ts`

**Interfaces:**
- `openUserNotificationStream` retains the last received event id for the lifetime of the stream and sends it as `last-event-id` on reconnect.

- [x] Write a failing browser stream test asserting the second fetch receives the first event id.
- [x] Run the focused browser stream test and confirm the header is absent.
- [x] Add per-stream cursor tracking without persisting tokens or notification payloads to storage.
- [x] Run the focused stream and UI contract tests.

### Task 4: Documentation and regression verification

**Files:**
- Modify: `docs/ISEOL_FEATURE_INVENTORY.md`
- Modify: `docs/ISEOL_AUTONOMOUS_DEVELOPMENT_LOG.md`
- Modify: this plan

- [x] Record the replay boundary and exact test/build/browser evidence.
- [x] Run focused notification tests, product regression, root regression, TypeScript build, approved UI build, browser E2E, and `git diff --check` serially.
- [x] Mark this plan complete only after all outputs report zero failures.

## Verification completed

- Focused notification/service/stream/UI checks: `13/13`.
- Product regression: `288/288`; root regression: `666/666`.
- TypeScript build and approved user UI build passed; the UI build retained only existing Vite warnings.
- Focused `growth-notifications` browser journey and full isolated browser E2E passed, including `liveUserNotificationStream`, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` across 13 routes.
- `git diff --check` passed; no operational Runtime/Agent, UNKNOWN record, external provider, or deployment state was changed.

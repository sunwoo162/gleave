# Plan: durable Control Plane event replay

> **For the implementer:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan task-by-task.

**Goal:** Make the existing authenticated Control Plane `/api/events` SSE channel recover bounded project/campaign events after a reconnect without changing event payload semantics or touching the operational Runtime during verification.

**Architecture:** Keep `WebProductEventBus.publish()` synchronous for existing domain callers. When a journal root is explicitly available, append each bounded event to an atomic per-event JSON record and expose an owner-independent `replayAfter()` read. The HTTP server subscribes before replay, buffers live events, deduplicates by event id, and flushes buffered events after replay. No journal root means the existing live-only behavior remains available.

**Safety:** The journal is enabled only for a server with an explicit platform/event root; tests use temporary roots. No existing operational process, lock, durable record, UNKNOWN request, external provider, or browser profile is stopped or modified.

### Task 1: Add failing journal and SSE replay tests

- [x] Add a restart-persistence/cursor test for the event bus journal.
- [x] Extend the Control Plane SSE test to reconnect with `Last-Event-ID` and assert only events after the cursor are replayed.
- [x] Add a replay/live race test proving an event published while journal replay is pending is emitted once.
- [x] Run the focused tests and capture the RED failures before implementation.

### Task 2: Implement durable event journal

- [x] Add bounded event record validation and atomic per-event JSON persistence under the explicit journal root.
- [x] Add sorted cursor filtering with unknown/stale cursors failing closed to an empty replay.
- [x] Keep live publish/listener behavior compatible when no journal root is configured.

### Task 3: Integrate the authenticated SSE replay boundary

- [x] Subscribe before reading the cursor journal.
- [x] Emit a connected frame identifying whether replay was requested.
- [x] Buffer and deduplicate live events during replay; keep the stream live on journal read errors.
- [x] Derive the default journal only from the configured platform root, with an explicit override for isolated callers.

### Task 4: Verify and record

- [x] Run focused event-bus/server tests, TypeScript build, product regression, full regression, and isolated browser E2E.
- [x] Run diff validation and update the feature inventory/development log with exact evidence and boundaries.
- [x] Confirm no operational Runtime/Agent, UNKNOWN request, external integration, or AI Broadcast Room state changed.

### Verification summary

- RED: the new journal/reconnect tests failed because `replayAfter` and replay-aware SSE behavior were absent; the static Control Plane contract also failed before the browser cursor was added.
- GREEN: focused Control Plane server/static tests `15/15`; root TypeScript build; product regression `288/288`; root regression `668/668`; approved UI build; isolated browser E2E all reported journeys passed with two accounts, 13 responsive routes, and `[390,768,1024,1440]`.
- Safety: no operational Runtime/Agent process was stopped or restarted, no configured data root or stale lock was repaired, no UNKNOWN request was replayed, and no external AI/provider, connector, deployment, push, or AI Broadcast Room artifact was changed.

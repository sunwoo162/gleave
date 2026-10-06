# Community Comment Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the durable public Community comment flow to the owner-scoped notification inbox and approved shell navigation without exposing private content or changing Community visibility rules.

**Architecture:** Reuse the existing durable NotificationService and authenticated SSE refresh channel. CommunityService will create one idempotent `community-comment` notification for the post owner after the comment is durable, only when the owner is not the commenter and the existing `notifications.newMessage` preference allows it. The notification shell will route the bounded source to the existing `/community` surface; no external connector or moderation policy is introduced.

**Tech Stack:** TypeScript, Node test runner, React/TypeScript user UI, file-backed owner-scoped stores, isolated Playwright browser runner.

**Spec:** `docs/ISEOL_PRODUCT_SPEC.md` and the Community/notification entries in `docs/ISEOL_FEATURE_INVENTORY.md`.

## Global Constraints

- Preserve owner-scoped data and authenticated server authorization; never trust a client-supplied recipient.
- Persist the comment before creating the notification; notification failure must not roll back or hide the durable public comment.
- Do not include comment text, private profile fields, prompts, or Runtime data in the notification payload.
- Use the existing `notifications.newMessage` setting for public comment alerts; do not silently activate the intentionally unavailable weekly digest.
- Preserve the existing approved UI layout and existing notification/SSE behavior.
- Do not call external AI/providers, Discord, GitHub, or any external connector; do not touch operational Runtime/Agent, UNKNOWN records, deployment, or push state.

## Review Focus

- Duplicate delivery for the same durable comment: the NotificationService source identity must make retries idempotent — covered by the notification service test.
- Self-comment and muted owner: neither should create an inbox record — covered by the Community service test.
- Cross-user recipient spoofing: the recipient must come from the persisted post owner, not request input — covered by the Community API test.
- Reload/SSE delivery: the owner must see the durable notification after a reload and the existing stream refresh — covered by the isolated browser journey.
- Public content privacy: the notification must contain only bounded title/body/source identities, never comment text or private memory — covered by contract assertions and the service test.

---

### Task 1: Add the durable community-comment notification contract

**Files:**
- Modify: `src/notifications/contracts.ts`
- Modify: `src/notifications/service.ts`
- Modify: `user-ui/src/api/userApi.ts`
- Test: `tests/user-notifications.test.ts`

**Interfaces:**
- Consumes: existing `NotificationService` persistence, stream publication, and `notifications.newMessage` preference decision in CommunityService.
- Produces: `CommunityCommentNotificationInput` and `createCommunityCommentNotification(input)`; source `{ type: "community-comment"; id: string; postId: string; actorUserId: string; }` and `kind: "new-message"`.

- [x] **Step 1: Write the failing service test**

  Add a test that creates the same community-comment notification twice, asserts one durable notification, the exact bounded source identity, no comment text in title/body, and the second call returns the original record.

- [x] **Step 2: Run the focused test to verify RED**

  Run: `node --import tsx --test tests/user-notifications.test.ts`

  Expected: FAIL because the input type and producer method do not exist.

- [x] **Step 3: Implement the minimal notification contract and producer**

  Add the union member and method using the existing idempotency scan and stream publication pattern. Validate all IDs and timestamps; use fixed bounded copy such as `새 커뮤니티 댓글` and `게시글에 새 댓글이 도착했습니다.`.

- [x] **Step 4: Run the focused test to verify GREEN**

  Run: `node --import tsx --test tests/user-notifications.test.ts`

  Expected: PASS.

### Task 2: Produce owner-scoped notifications from Community comments

**Files:**
- Modify: `src/community/contracts.ts`
- Modify: `src/community/service.ts`
- Modify: `src/runtime/iseol-runtime-services.ts`
- Modify: `scripts/iseol-user-ui-isolated-server.ts`
- Test: `tests/community-flow.test.ts`
- Test: `tests/user-notifications-api.test.ts`

**Interfaces:**
- Consumes: Task 1 `NotificationService.createCommunityCommentNotification`, existing `SettingsService.getSettings`, persisted `CommunityPost.authorUserId`.
- Produces: optional `notificationService` and `settingsService` dependencies on `CommunityServiceOptions`; `createComment()` remains the same authenticated API and return shape.

- [x] **Step 1: Write the failing Community test**

  Add cases for owner notification after another user comments, no notification for the commenter themselves, no notification when the owner disables `notifications.newMessage`, and no recipient derived from request input.

- [x] **Step 2: Run the focused test to verify RED**

  Run: `node --import tsx --test tests/community-flow.test.ts tests/user-notifications-api.test.ts`

  Expected: FAIL because CommunityService currently has no notification dependencies or producer call.

- [x] **Step 3: Implement the minimal producer and service wiring**

  Save the comment first. Then, when configured, read the persisted post owner’s system-scoped settings, skip self/muted cases, and create the notification with the persisted comment/post identity. Keep notification failures non-fatal to the already durable public comment, matching existing notification producer boundaries.

- [x] **Step 4: Run the focused tests to verify GREEN**

  Run: `node --import tsx --test tests/community-flow.test.ts tests/user-notifications-api.test.ts`

  Expected: PASS.

### Task 3: Route the notification through the approved user shell

**Files:**
- Modify: `user-ui/src/api/userApi.ts`
- Modify: `user-ui/src/components/Navigation.tsx`
- Test: `tests/user-ui-notifications-contract.test.ts`
- Test: `tests/user-ui-community-contract.test.ts`

**Interfaces:**
- Consumes: Task 1 `UserNotification` source union and existing notification REST/SSE refresh.
- Produces: typed `community-comment` source and navigation to `/community` after the existing read transition.

- [x] **Step 1: Write the failing UI contract**

  Require the new source type and a dedicated `/community` navigation branch while preserving existing team, friends, AI, achievement, and fallback routes.

- [x] **Step 2: Run the focused contract to verify RED**

  Run: `node --import tsx --test tests/user-ui-notifications-contract.test.ts tests/user-ui-community-contract.test.ts`

  Expected: FAIL because the API type and navigation branch do not exist.

- [x] **Step 3: Implement the typed route branch**

  Add the source member to the client type and route `community-comment` notifications to `/community`; keep the existing approved bell copy and no replacement dashboard.

- [x] **Step 4: Run the focused contract to verify GREEN**

  Run: `node --import tsx --test tests/user-ui-notifications-contract.test.ts tests/user-ui-community-contract.test.ts`

  Expected: PASS.

### Task 4: Verify the real two-account browser journey and record evidence

**Files:**
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Modify: `docs/ISEOL_FEATURE_INVENTORY.md`
- Modify: `docs/ISEOL_AUTONOMOUS_DEVELOPMENT_LOG.md`
- Modify: `docs/superpowers/plans/2026-09-25-iseol-approved-ui-integrated-product.md`

- [x] **Step 1: Extend the existing Community comment journey**

  After account B comments on account A’s post, verify account A’s notification bell receives `새 커뮤니티 댓글`, opening it reads the notification and navigates to `/app/community`, and reload preserves the durable read state. Verify muted `newMessage` behavior through the API/service test rather than changing the browser’s shared account state.

- [x] **Step 2: Run focused browser verification**

  Run: `$env:ISEOL_BROWSER_FOCUS='community-comment-notification'; npm.cmd run test:iseol-browser-e2e`

  Expected: JSON reports `communityCommentNotificationUi: "passed"`.

- [x] **Step 3: Run full verification**

  Run: `npm.cmd run test:iseol-user-product`, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run user-ui:build`, and full `npm.cmd run test:iseol-browser-e2e` with the focus variable cleared.

  Expected: all suites and builds pass; full browser output includes the new journey plus the existing two-account, reload, and responsive `[390,768,1024,1440]` / 13-route matrix.

- [x] **Step 4: Record the actual results and safety boundary**

  Update the three development documents with actual counts and state that no operational process, UNKNOWN request, external provider, deployment, push, or AI Broadcast Room artifact changed.

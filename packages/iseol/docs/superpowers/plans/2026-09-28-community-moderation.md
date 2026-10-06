# Community Safety Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give authenticated users a durable, owner-scoped way to report a published community post or comment without exposing reports publicly or changing the approved visual system.

**Architecture:** Extend the existing Community domain with a separate report record rooted under the community data store. The authenticated user API validates the persisted target (post or comment), stores an idempotent intake record, and returns only a bounded confirmation envelope. The existing Community screen reuses its compact action pattern for report controls; no operator moderation queue or external service is invented in this unit.

**Tech Stack:** TypeScript, Node test runner, existing JSON durable stores, React/Vite user UI, Playwright isolated browser E2E.

**Spec:** `docs/ISEOL_PRODUCT_SPEC.md`, `docs/ISEOL_FEATURE_INVENTORY.md`, and the approved Community surface in `user-ui/src/pages/Community.tsx`.

## Global Constraints

- Keep public post/comment visibility and owner-scoped platform data boundaries unchanged.
- Reports are safety intake records, not growth evidence, mastery, or portfolio evidence.
- A report must resolve its target from persisted Community data; never trust a client-supplied content author.
- Do not expose another user's report history or private report reason through public Community reads.
- Do not call external AI/providers, mutate the operational Runtime, replay UNKNOWN requests, deploy, push, or delete data.
- Reuse the existing Community UI layout and copy style; do not declare an unprovided final design source.
- AI Broadcast Room remains deferred.

## Review Focus

- A foreign/nonexistent post or comment must fail before a report is persisted.
- A comment ID paired with a different post ID must not be accepted.
- Repeating the same reporter/target report must return one durable open report rather than duplicate intake.
- A report must not appear in public post/comment payloads or be visible to another user's API session.
- The browser must show a truthful saved state while the target content remains visible and unchanged.

---

### Task 1: Add the durable Community report contract and store

**Files:**
- Modify: `src/community/contracts.ts`
- Modify: `src/community/store.ts`
- Test: `tests/community-flow.test.ts`

**Interfaces:**
- Produces `CommunityReport`, `CommunityReportInput`, and `CommunityService.reportContent(principal, input)`.
- Stores reports below the Community root and supports lookup for idempotency without exposing a list endpoint.

- [x] **Step 1: Write the failing service test**

  Assert that a user can report one published post and one published comment, repeated submission returns the same report ID, the stored target author comes from persisted content, and a foreign/mismatched target is rejected.

- [x] **Step 2: Run the focused test to verify RED**

  Run: `node --import tsx --test tests/community-flow.test.ts`

  Expected: FAIL because the Community service has no report contract or producer.

- [x] **Step 3: Implement the minimal contract/store/service path**

  Add `loadComment`/`listReports`/`saveReport`, validate IDs and bounded reasons, accept only published persisted targets, reject self-report and mismatched comment/post pairs, and reuse an existing open report for the same reporter/target.

- [x] **Step 4: Run the focused test to verify GREEN**

  Run: `node --import tsx --test tests/community-flow.test.ts`

  Expected: PASS.

### Task 2: Expose an authenticated report route and client API

**Files:**
- Modify: `src/community/router.ts`
- Modify: `user-ui/src/api/userApi.ts`
- Test: `tests/community-flow.test.ts`
- Test: `tests/user-ui-community-contract.test.ts`

**Interfaces:**
- Consumes `CommunityService.reportContent`.
- Produces `POST /api/user/community/:postId/report` with `{ targetType, targetId, reason }` and `reportCommunityContent(postId, input)`.

- [x] **Step 1: Write failing route/client contract tests**

  Require authentication, target type validation, bounded error mapping, the client method, and no report data in the normal Community list response.

- [x] **Step 2: Run focused tests to verify RED**

  Run: `node --import tsx --test tests/community-flow.test.ts tests/user-ui-community-contract.test.ts`

  Expected: FAIL because the route and client method are absent.

- [x] **Step 3: Implement the route and typed client method**

  Parse only the bounded target fields, preserve the authenticated principal, and return `{ report }` on `201`. Do not add a public report-list route.

- [x] **Step 4: Run focused tests to verify GREEN**

  Run: `node --import tsx --test tests/community-flow.test.ts tests/user-ui-community-contract.test.ts`

  Expected: PASS.

### Task 3: Add truthful Community report controls

**Files:**
- Modify: `user-ui/src/pages/Community.tsx`
- Test: `tests/user-ui-community-contract.test.ts`

**Interfaces:**
- Consumes `reportCommunityContent` and existing post/comment data.
- Produces compact `게시글 신고`/`댓글 신고` actions, a bounded reason input, and the existing `role=status` success boundary without hiding or mutating content.

- [x] **Step 1: Write the failing UI contract**

  Require report controls for both post and comment targets, a reason input, and a saved status copy.

- [x] **Step 2: Run the UI contract to verify RED**

  Run: `node --import tsx --test tests/user-ui-community-contract.test.ts`

  Expected: FAIL because Community has no report controls.

- [x] **Step 3: Implement the minimal existing-pattern UI**

  Keep report drafts keyed by target identity, disable empty submissions, surface API errors, clear the draft after success, and preserve the current approved page structure.

- [x] **Step 4: Run the UI contract to verify GREEN**

  Run: `node --import tsx --test tests/user-ui-community-contract.test.ts`

  Expected: PASS.

### Task 4: Verify two-account isolation and record evidence

**Files:**
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Modify: `docs/ISEOL_FEATURE_INVENTORY.md`
- Modify: `docs/ISEOL_AUTONOMOUS_DEVELOPMENT_LOG.md`

- [x] **Step 1: Extend the Community browser journey**

  Have account B report account A's post and comment, verify the saved status and reload-safe target content, and verify account A's Community payload does not expose B's private reason.

- [x] **Step 2: Run focused browser verification**

  Run: `$env:ISEOL_BROWSER_FOCUS='community-moderation'; npm.cmd run test:iseol-browser-e2e`

  Expected: JSON reports `communityModerationUi: "passed"`.

- [x] **Step 3: Run the focused, product, root, build, and full browser checks**

  Run the Community contracts, `npm.cmd run test:iseol-user-product`, `npm.cmd test`, both builds, `git diff --check`, and the full isolated browser E2E with the focus variable cleared.

- [x] **Step 4: Record actual counts and safety boundaries**

  Update the inventory and development log with evidence and retain the explicit boundary that this is intake only, not an operator moderation queue.

## Verification completed

- Focused Community service/UI tests: `9/9` (including target-specific report draft/busy-state isolation).
- Product suite: `287/287`; root suite: `666/666`.
- TypeScript build and approved user UI build passed; the UI build retained only existing Vite warnings.
- Focused browser `community-moderation`: passed; full isolated browser E2E passed all journeys, two-user isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes.

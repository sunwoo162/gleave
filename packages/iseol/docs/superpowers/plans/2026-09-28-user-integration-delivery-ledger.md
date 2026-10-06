# User Integration Delivery Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the user product to the existing Calendar, GitHub, and Discord integration boundary with explicit per-user opt-in, durable delivery identity, and truthful no-resend handling without contacting external accounts.

**Architecture:** Add a small owner-scoped integration delivery service under the existing platform root. The service persists one delivery record per `(user, provider, source, event, version)`, dispatches only through explicitly injected adapters, and preserves `unknown`/`not-configured` outcomes as terminal observations for this unit. The composed Runtime has no live adapters by default; the user Settings surface exposes consent and truthful readiness only.

**Tech Stack:** Existing TypeScript/Node JSON durable stores, `Principal`/scope authorization, current Settings service, Node test runner, React/Vite user UI.

**Spec:** `docs/ISEOL_PRODUCT_SPEC.md`, `docs/ISEOL_ARCHITECTURE.md`, Task 8 of `docs/superpowers/plans/2026-09-25-iseol-integrated-product-development.md`, and the user-provided integrated product prompt at `C:/Users/user/.codex/attachments/cd7d4930-8949-4562-80ec-a997dfbf26fb/붙여넣은 텍스트.txt`.

## Global Constraints

- External account calls, live provider credentials, UNKNOWN replay, operational Runtime/Agent mutation, deployment, and push are out of scope.
- Every delivery is owner-bound and contains no credentials or raw provider response.
- `unknown`, `not-configured`, and `blocked` records are never silently retried by a later request with the same source identity.
- Existing operator Calendar, GitHub, and Discord commands remain unchanged.
- The user UI must not display a provider as connected unless a configured adapter reports it.

## Review Focus

- Cross-user delivery lookup or mutation must fail closed; test two principals against the same source identity.
- Repeated enqueue/dispatch must be idempotent; test identity conflict and duplicate calls.
- A provider exception must become durable `unknown` and a second dispatch must not call the adapter.
- Disabled consent and missing adapters must never call a provider; test the call count and persisted reason.
- Existing Settings fields and legacy records must normalize safely after adding the integration preference group.

### Task 1: Durable provider delivery contract

**Files:**
- Create: `src/integrations/contracts.ts`
- Create: `src/integrations/store.ts`
- Create: `src/integrations/service.ts`
- Test: `tests/integrations-delivery.test.ts`

**Interfaces:**
- `createIntegrationService(root, { now, adapters, isOptedIn })`
- `enqueueDelivery(principal, input)` creates or returns the deterministic owner-scoped record.
- `dispatchDelivery(principal, deliveryId)` performs at most one adapter attempt and persists the outcome.
- `listDeliveries(principal)` returns only the principal's records.

- [x] **Step 1: Write RED tests** for durable enqueue/idempotency, owner isolation, blocked consent, missing adapter, delivered adapter, and unknown no-retry behavior.
- [x] **Step 2: Run `node --import tsx --test tests/integrations-delivery.test.ts` and verify the failure is caused by the missing integration service.
- [x] **Step 3: Implement bounded contracts, atomic owner-scoped JSON storage, deterministic identity, and one-attempt dispatch.**
- [x] **Step 4: Re-run the focused integration suite and verify all cases pass.**
- [x] **Step 5: Commit `feat: add user integration delivery ledger`.**

### Task 2: Persist user integration consent and expose status API

**Files:**
- Modify: `src/settings/contracts.ts`
- Modify: `src/settings/service.ts`
- Modify: `src/settings/router.ts`
- Create: `src/integrations/router.ts`
- Modify: `src/runtime/iseol-runtime-services.ts`
- Modify: `src/web-control-plane/server.ts`
- Test: `tests/integrations-api.test.ts`

**Interfaces:**
- `UserSettings.integrations` contains independent `calendar`, `github`, and `discord` booleans, defaulting to `false`.
- `GET /api/user/integrations` returns provider status, consent, and last owner-scoped delivery state.
- `POST /api/user/integrations/:provider/deliveries` accepts only bounded source/event metadata and returns the durable delivery state.

- [x] **Step 1: Add RED API/settings tests** for default consent, persistence, two-user isolation, and truthful `not-configured` status.
- [x] **Step 2: Run the focused API tests and observe the missing route/field failure.**
- [x] **Step 3: Add backward-compatible settings normalization and compose the integration service with no live adapters.**
- [x] **Step 4: Add authenticated routes with provider/source validation and owner-bound delivery lookup.**
- [x] **Step 5: Run focused API/settings and existing user-product tests.**
- [x] **Step 6: Commit `feat: expose user integration consent status`.**

### Task 3: Connect the approved Settings surface and verify regression

**Files:**
- Modify: `user-ui/src/api/userApi.ts`
- Modify: `user-ui/src/pages/Settings.tsx`
- Modify: `tests/user-ui-integrations-contract.test.ts`
- Modify: `scripts/iseol-user-ui-e2e.ts`
- Modify: `docs/ISEOL_FEATURE_INVENTORY.md`
- Modify: `docs/ISEOL_AUTONOMOUS_DEVELOPMENT_LOG.md`

- [x] **Step 1: Add a RED UI contract** for Calendar, GitHub, and Discord consent controls and `연동 API 미연결` truthfulness.
- [x] **Step 2: Implement the API-backed consent controls without changing the approved layout or enabling external calls.**
- [x] **Step 3: Run the focused UI contract, TypeScript build, and user UI build.**
- [x] **Step 4: Run isolated browser verification for consent persistence, second-account isolation, and `not-configured` status.**
- [x] **Step 5: Run the full user-product/root/browser regression, update evidence docs, and commit `feat: wire user integration settings`.**

## Completion boundary

This plan proves the local user-scoped consent and delivery ledger only. It does not claim live Calendar/GitHub/Discord OAuth, provider delivery, deployment, or completion of the deferred AI Broadcast Room.

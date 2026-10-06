# Learning coding-attempt activity provenance plan

> **For the implementer:** REQUIRED SUB-SKILL: Use test-driven development. Preserve the distinction between user activity and verified coding correctness.

## Goal

Connect a submitted coding-learning answer to the owner-scoped activity ledger so learning, growth, Personal AI context, and portfolio evidence can distinguish that the user practiced without claiming that the answer is correct or mastered.

## Architecture

- Keep `CodingAttempt` as the durable source of the answer and verifier receipt.
- Record one idempotent `learning.coding.attempt.submitted` ActivityEvent keyed by the attempt id.
- Mark the event `actorType=user` and `verificationStatus=unverified`; only the existing verified service-owned evidence can affect Growth/XP.
- Record only bounded exercise/practice metadata, never the submitted source text.
- Backfill the event on an idempotent repeated submission when an older attempt exists without the provenance edge.

## Specification constraints

- `environment-required` remains honest when no execution environment is available.
- `syntax-verified` remains syntax-only and is not a correctness or mastery assertion.
- Owner ACL, user isolation, durable persistence, and request idempotency remain unchanged.
- Do not invoke external AI/providers, the operational Runtime/Agent, or any unapproved code execution.

## Tasks

- [x] Add a failing owner-scoped/idempotent activity provenance test.
- [x] Record the activity event after the final durable attempt/verifier state.
- [x] Verify activity payload does not contain answer content and unverified evidence does not grant Growth/XP.
- [x] Surface the coding-attempt event with a user-facing label in the existing Activity Timeline.
- [x] Run focused tests, product/root regressions, builds, browser E2E, and diff validation.
- [x] Record the result and remaining coding-execution boundary in the product inventory and autonomous log.

## Verification record

- TDD RED: the new test observed zero coding-attempt activity events before implementation.
- Focused learning/coding/activity coverage: `9/9` passed; Activity Timeline UI contract: `1/1` passed.
- User product regression: `305/305` passed.
- Root regression: `675/675` passed.
- Root TypeScript build and approved user UI build passed; existing Vite native-config and chunk-size warnings remain.
- Full isolated browser E2E passed all journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Operational Runtime/Agent, UNKNOWN records, external providers, deployment/push state, and deferred AI Broadcast Room were unchanged.

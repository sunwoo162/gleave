# Learning answer verifier-artifact linkage plan

> **For the implementer:** REQUIRED SUB-SKILL: Use test-driven development. Preserve the separation between execution evidence and correctness/mastery.

## Goal

Keep the `PracticeResult.artifactRefs` produced by a coding verifier attached to the durable Learning Answer Receipt so evaluator, progress, report, and portfolio flows can consume the same evidence identity.

## Architecture

- The server derives the verifier refs from the owner-bound `CodingAttempt` and merges them with optional user-supplied artifact refs.
- Repeated answer submission remains idempotent; a legacy receipt missing newly available verifier refs is repaired without changing the answer identity.
- The UI passes the returned attempt refs but the server remains authoritative, so a client cannot invent a verifier result by omitting or replacing refs.
- `environment-required` still carries no verifier refs and remains evaluation-pending.

## Tasks

- [x] Add failing service and UI contract tests for verifier artifact propagation.
- [x] Merge and validate owner-bound verifier refs in `submitLearningAnswer`.
- [x] Pass actual attempt refs from Learning UI and verify the HTTP API path.
- [x] Run focused tests, product/root regressions, builds, browser E2E, and diff validation.
- [x] Record the evidence and remaining evaluator/execution boundary.

## Verification record

- TDD RED reproduced an empty receipt and missing UI propagation before implementation.
- Focused learning/action/coding/verifier/UI coverage: `15/15` passed.
- User product regression: `306/306` passed.
- Root regression: `675/675` passed.
- Root TypeScript build and approved user UI build passed; existing Vite native-config and chunk-size warnings remain.
- Full isolated browser E2E passed all journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Operational Runtime/Agent, UNKNOWN records, external providers, deployment/push state, and deferred AI Broadcast Room were unchanged.

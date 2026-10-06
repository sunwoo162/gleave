# Learning syntax-only evidence boundary

## Goal

Prevent a syntax-only coding receipt from being promoted to verified correctness or mastery feedback. A local syntax check proves only that the submitted JavaScript parses; it is not a correctness test or a hidden-test result.

## Scope

- Keep the existing `environment-required` and `syntax-only` practice states durable and honest.
- Treat `local-syntax-verifier` evidence as insufficient for `verification: "verified"` in `completeLearningFeedback`.
- Preserve owner scope, evaluator callbacks, dispute/re-evaluation history, artifact references, and existing UI wording.
- Do not add a correctness executor or external/local model call in this unit.

## TDD record

1. RED: added `tests/learning-feedback-evaluator.test.ts` coverage with a valid JavaScript syntax receipt and an evaluator requesting `verification: "verified"`; the pre-fix service returned `verified` instead of `tentative`.
2. GREEN: `src/learning/service.ts` now separates artifact presence from verifier kind and excludes `local-syntax-verifier` from `canVerify`; the blocker now states that correctness verifier evidence is absent.
3. Regression: evaluator, dispute, re-evaluation, coding answer/artifact, API, and UI contract tests remain green.

## Verification acceptance

- Focused feedback regression: `5/5`.
- Learning/coding/action/API/UI focused coverage: `21/21`.
- ISEOL product regression: `307/307`.
- Root regression: `675/675`.
- Root TypeScript build and approved user UI build pass; UI build retains only existing Vite warnings.
- Full isolated browser E2E passes all journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across 13 routes. The first concurrent run had a transient approval-journey timeout; the focused project journey and a fresh full run both passed.

## Safety boundary

No operational Runtime/Agent restart, stale-lock repair, UNKNOWN replay, external AI/provider request, connector mutation, deployment, push, data deletion, or AI Broadcast Room implementation occurred. Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale PID `55000`, UNKNOWN records, and durable operational data remained untouched.

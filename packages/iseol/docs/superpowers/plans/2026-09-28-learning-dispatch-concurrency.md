# Learning Runtime per-user dispatch concurrency

## Goal

Honor the learning specification's initial `per-user concurrency 1` boundary for local learning Runtime dispatches while allowing different users to make progress concurrently.

## Scope

- Serialize plan, lesson-content, learning-action, and feedback dispatcher calls by authenticated user ID.
- Preserve the existing durable request/action/feedback state and owner callbacks.
- Use FIFO ordering for requests waiting behind the same user's active dispatcher.
- Never serialize different users together and never fabricate a Runtime response.

## Safety boundaries

- This is an in-process coordination gate for the composed local service; it is not evidence of operational Runtime throughput or cross-process distributed scheduling.
- No external provider/model call, operational Runtime/Agent change, UNKNOWN replay, data deletion, deployment, push, or AI Broadcast Room work.

## TDD checklist

- [x] RED: reproduce same-user concurrent learning dispatch overlap.
- [x] GREEN: add a per-user FIFO gate around all learning dispatchers.
- [x] Verify different users remain concurrent and durable callbacks/state are unchanged.
- [x] Run focused learning tests, builds, product/root regressions, and full isolated browser E2E.
- [x] Record evidence and the in-process boundary in the inventory and development log.

## Verification record

- `tests/learning-actions-answers.test.ts` plus the learning content, evaluator, re-evaluation, and plan-preview suites passed `16/16`. RED first reproduced same-user overlap; the final suite verifies same-user FIFO serialization and different-user concurrency.
- `npm.cmd run test:iseol-user-product`: `288/288` passed; `npm.cmd test`: `668/668` passed.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed. The UI build retained only existing Vite warnings.
- Full isolated browser E2E passed all journeys, including learning Runtime response, learning plan/content/action/feedback/completion/review flows, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.
- Safety boundary held: no operational Runtime/Agent restart, external AI/provider call, UNKNOWN replay, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation.

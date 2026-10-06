# Learning coding-practice report evidence

## Goal

Keep coding-practice submissions visible in the owner-scoped Learning progress and local evidence report without treating syntax checks, unavailable execution, or pending evaluation as correctness or mastery.

## Scope

- Count durable coding attempts separately from legacy question attempts in `LearningProgress`.
- Project coding attempts that belong to the report's goal sessions into `unverifiedOutcomes` using the attempt id as evidence.
- Keep verified outcomes restricted to existing verified study attempts; do not add XP, mastery, portfolio eligibility, or evaluator claims.
- Update the approved Learning copy so the report's count is not mislabeled as only self-reports.

## TDD sequence

1. Add progress/report regressions for a coding attempt with both environment-required and syntax-only receipt states.
2. Run the focused tests and confirm RED against the current omission.
3. Add the additive contract fields and owner/session/date filtering.
4. Run focused, product, root, build, and isolated browser regressions.

## Safety boundary

No external AI/provider request, operational Runtime/Agent restart, UNKNOWN replay, data migration, design change, deployment, or AI Broadcast Room work is in scope.

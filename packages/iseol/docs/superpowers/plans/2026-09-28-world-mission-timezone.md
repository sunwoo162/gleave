# World mission calendar-date plan

> **For the implementer:** REQUIRED SUB-SKILL: Use test-driven development. Write the failing timezone tests before implementation and verify the full regression before completion.

## Goal

Make the My World daily mission identity use the authenticated user's calendar date instead of the browser's UTC date, while preserving the existing unverified self-report boundary and date-scoped idempotency.

## Architecture

- Keep mission completion as an owner-scoped `world.mission.completed` ActivityEvent.
- Derive `YYYY-MM-DD` in the user UI from the persisted platform-user timezone.
- Keep the API payload and deterministic `missionId:occurrenceDate` source identity unchanged.
- Fall back to the browser timezone for an unavailable profile and preserve existing callers.

## Tech stack

- TypeScript, React user UI, Node `Intl.DateTimeFormat`.
- Node test runner with `tsx`.
- Existing isolated browser E2E and product/root regression suites.

## Specification constraints

- A mission self-report remains `actorType=user`, `verificationStatus=unverified` and never grants XP.
- Do not alter verified activity, growth, notification, operational Runtime, UNKNOWN, or external integration behavior.
- Preserve stable mission IDs and same-day retry idempotency.

## Tasks

- [x] Add fixed-instant timezone tests for the calendar-date helper and confirm the current behavior fails.
- [x] Implement timezone-aware user profile propagation and mission date derivation.
- [x] Update the UI contract and focused tests.
- [x] Run focused tests, product/root regressions, both builds, browser E2E, and diff validation.
- [x] Record evidence and safety boundaries in the inventory and autonomous development log.

## Verification record

- Focused timezone/World Mission tests: `7/7` (including the existing World Mission contract tests).
- Product regression: `304/304`.
- Root regression: `675/675`.
- Root and approved user UI builds passed.
- Full isolated browser E2E passed with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- Operational Runtime/Agent, stale lock, UNKNOWN records, external providers, deployment, push, and deferred AI Broadcast Room were unchanged.

# Gleave Desktop shell implementation plan

> **Execution note:** Use the TDD loop for each task: add a failing test, run
> the focused test to observe the failure, implement the smallest coherent
> change, then run focused and full verification.

## Goal

Turn the existing PySide6 pet shell into the primary EEEE Desktop console while
keeping the local-first, loopback-only ownership model and leaving Mobile alone.

## Tasks

### Task 1 — Add the local Desktop control-plane API

- Add failing route tests for redacted Desktop state, event cursor, local-only
  pairing issuance, and a selected project profile/state.
- Add `/api/desktop/state`, `/api/desktop/events`, and `/api/desktop/pairing/code`.
- Reuse the existing durable MobileBridge journal and TrustGate health payload;
  do not duplicate persistence or expose tokens.
- Verify API tests and existing mobile/assistant route tests.

### Task 2 — Add a typed Desktop client and session facade

- Add failing client/session tests for health, snapshot refresh, assistant route,
  pairing-code handling, and API error normalization.
- Implement canonical EEEE methods on the desktop client and a headless
  `DesktopSession` that stores only the latest redacted view model.
- Preserve the legacy project-task client methods.
- Verify focused Desktop tests and type/compile checks.

### Task 3 — Upgrade the PySide6 Desktop surface

- Add failing widget-contract tests for EEEE input, trust/project status,
  pairing-code action, and recent event rendering.
- Add the controls and wire them through `QtTaskRunner`; no blocking network
  call may execute on the GUI thread.
- Keep the existing task-flow controls and tray behavior working.
- Verify offscreen widget tests and the workspace verification smoke flow.

### Task 4 — Harden launch and operator documentation

- Add a Desktop launch command/configuration smoke test where practical.
- Update Desktop and local-runtime docs with the actual Desktop-first flow,
  loopback security boundary, pairing-code behavior, and ClaimLatch display.
- Do not change Mobile implementation or claim native mobile packaging.

### Task 5 — Final verification and audit

- Run focused Desktop/API tests, the full EEEE suite, repository hygiene, and
  the unified verification script.
- Review for secret leakage, non-loopback pairing issuance, regressions in the
  legacy project flow, and accidental Mobile changes.
- Record exact verification output in the SDD ledger.

## Completion criteria

- Desktop can start the local API, send a canonical EEEE request, and display
  the resulting project/trust/event state.
- Desktop can issue a short-lived pairing code without owning or exposing a
  Mobile access token.
- Existing project execution remains usable and responsive.
- Mobile source is unchanged and the complete verification suite passes.

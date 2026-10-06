# AI Team Runtime dispatcher injection

## Goal

Close the composed local Runtime wiring gap for AI team proposal and technical-discussion dispatches without enabling a default provider or changing the operational Runtime.

## Scope

- Add explicit optional proposal and discussion dispatcher inputs to `startIseolRuntimeServices`.
- Forward those inputs into the existing owner-scoped AI team services through the shared per-user dispatch gate.
- Preserve the default waiting state when no dispatcher is supplied.
- Verify durable proposal/discussion outcomes and keep proposal acceptance separate from project execution.

## Safety boundaries

- This is dependency injection at the local composed Runtime boundary; it is not evidence of operational Runtime ownership, throughput, or external model availability.
- No default AI/provider call is introduced. No operational Runtime/Agent restart, UNKNOWN replay, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room work.

## TDD checklist

- [x] RED: reproduce that composed Runtime input could not provide an explicit AI team proposal/discussion dispatcher.
- [x] GREEN: add optional dispatcher inputs and forward them to both AI team services while retaining the shared user gate.
- [x] Verify proposal and discussion dispatchers receive the correct owner-scoped requests and persist their outcomes.
- [x] Verify the no-dispatcher default remains waiting and no implicit provider call is created.
- [x] Run focused Runtime tests, builds, product/root regressions, and full isolated browser E2E.
- [x] Record evidence and the process-local/operational safety boundary in the inventory and development log.

## Verification record

- Focused composed Runtime coverage passed `36/36`, including explicit proposal/discussion dispatcher injection and durable result assertions.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; the UI build retained only existing Vite warnings.
- `npm.cmd run test:iseol-user-product`: `295/295` passed; `npm.cmd test`: `670/670` passed.
- Full isolated browser E2E passed AI team proposal/discussion Runtime and approval journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.
- Safety boundary held: no operational Runtime/Agent restart, external AI/provider call, UNKNOWN replay, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room work.

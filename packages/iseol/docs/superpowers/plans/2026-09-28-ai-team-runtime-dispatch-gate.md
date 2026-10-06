# AI Team Runtime per-user dispatch gate

## Goal

Extend the composed local Runtime's per-user concurrency-1 boundary to AI team proposal and technical discussion dispatches while preserving team membership, capability, approval, and durable provenance rules.

## Scope

- Accept an injected `UserRuntimeDispatchGate` in AI team proposal and discussion services.
- Serialize same-user AI team dispatcher calls with the already shared Personal AI/learning gate.
- Keep different users concurrent, and keep proposal acceptance separate from work execution.
- Preserve waiting/proposed/completed states, request idempotency, owner/team ACL, and activity evidence.

## Safety boundaries

- This is process-local composition; it is not evidence of operational Runtime throughput or cross-process scheduling.
- No external provider/model call, operational Runtime/Agent change, UNKNOWN replay, data deletion, deployment, push, or AI Broadcast Room work.

## TDD checklist

- [x] RED: reproduce same-user AI team proposal/discussion dispatcher overlap.
- [x] GREEN: inject the shared gate into both AI team services and the Runtime compositions.
- [x] Verify different users remain concurrent and proposal/discussion durable boundaries are unchanged.
- [x] Run focused AI team/Runtime tests, builds, product/root regressions, and full isolated browser E2E.
- [x] Record evidence and the process-local boundary in the inventory and development log.

## Verification record

- RED reproduced overlapping same-user AI team proposal/discussion dispatcher calls. Focused AI team service/API/UI coverage passed `9/9`, including the shared-gate test.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; the UI build retained only existing Vite warnings.
- `npm.cmd run test:iseol-user-product`: `294/294` passed; `npm.cmd test`: `669/669` passed.
- Full isolated browser E2E passed AI team permissions, proposal Runtime/approval, discussion Runtime, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes.
- Safety boundary held: no operational Runtime/Agent restart, external AI/provider call, UNKNOWN replay, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room work.

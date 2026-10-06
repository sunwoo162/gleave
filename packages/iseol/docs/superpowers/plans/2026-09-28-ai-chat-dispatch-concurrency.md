# Shared Personal AI/Learning Runtime per-user dispatch concurrency

## Goal

Protect the local Personal AI and learning Runtime boundary with one shared per-user concurrency-1 gate, while allowing different users to dispatch concurrently.

## Scope

- Serialize local Personal AI `runtimeDispatcher` and learning dispatcher calls for the same authenticated user within one composed Runtime service instance.
- Inject one shared gate from the Runtime composition into Personal AI and learning; direct service construction still receives a private gate by default.
- Keep each user message durably persisted before dispatch and preserve owner-bound asynchronous completion callbacks.
- Keep different users concurrent and preserve truthful `waiting_runtime` behavior for accepted/waiting/failing dispatches.
- Do not serialize context reads or unrelated users, and do not fabricate assistant responses.

## Safety boundaries

- This is an in-process coordination gate, not evidence of operational Runtime throughput or cross-process distributed scheduling.
- No external provider/model call, operational Runtime/Agent change, UNKNOWN replay, data deletion, deployment, push, or AI Broadcast Room work.

## TDD checklist

- [x] RED: reproduce same-user Personal AI Runtime dispatch overlap.
- [x] GREEN: add a shared per-user FIFO gate around Personal AI and learning Runtime dispatchers.
- [x] Verify different users remain concurrent, messages persist before dispatch, and async completion/acceptance states remain unchanged.
- [x] Run focused AI Chat tests, builds, product/root regressions, and full isolated browser E2E.
- [x] Record evidence and the in-process boundary in the inventory and development log.

## Verification record

- RED reproduced overlapping same-user Personal AI Runtime dispatcher calls and cross-domain learning/Personal AI overlap before shared injection. The final AI Chat/runtime/UI focused suite passed `40/40`, plus composed Runtime coverage passed `35/35`.
- `npm.cmd run test:iseol-user-product`: `293/293` passed; `npm.cmd test`: `669/669` passed.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed. The UI build retained only existing Vite warnings.
- Full isolated browser E2E passed all journeys, including private AI persistence/isolation, Runtime response, attachments, context selection, execution-plan approval, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` across `13` routes; the isolated server now composes Personal AI and learning with one shared gate.
- Safety boundary held: no operational Runtime/Agent restart, external AI/provider call, UNKNOWN replay, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room implementation.

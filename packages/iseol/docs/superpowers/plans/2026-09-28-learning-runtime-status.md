# Learning Runtime readiness surface

## Goal

Expose the explicitly configured local Learning AI dispatcher set through the existing authenticated Runtime status endpoint and Settings integration surface.

## Scope

- Add a truthful `learningAi` capability to `/api/user/runtime-status`.
- Derive readiness from all four learning dispatchers: plan, content, action, and feedback.
- Pass deterministic isolated-server readiness into the same endpoint.
- Reuse the existing Settings integration layout with no external-provider claims.

## Safety boundaries

- Configuration/readiness only; do not contact Ollama or external providers.
- Preserve deterministic local learning, syntax verification, durable waiting states, user isolation, and existing Runtime/Agent state.

## TDD checklist

- [x] RED: extend API and UI contract tests for the Learning AI readiness field.
- [x] GREEN: implement server/runtime wiring and the Settings status row.
- [x] Verify focused tests, product/root regressions, builds, isolated browser E2E, and operational identity.
- [x] Record exact evidence and remaining live-model boundary in inventory and development log.

## Verification record

- Focused API/UI contract coverage passed `3/3`.
- `npm.cmd run test:iseol-user-product`: `299/299` passed.
- `npm.cmd test`: `675/675` passed.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; the UI build retained only existing Vite warnings.
- Full isolated browser E2E passed `truthfulWorldAndIntegrationStates`, `runtimeStatusSurface`, Learning Runtime, AI Team proposal/discussion, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes. The default isolated server showed `학습 AI 미연결` truthfully.
- Operational Runtime/Agent identity remained untouched; no live Ollama request was made.

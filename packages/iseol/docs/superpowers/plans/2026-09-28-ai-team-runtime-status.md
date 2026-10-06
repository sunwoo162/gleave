# AI Team Runtime readiness surface

## Goal

Expose the explicitly configured local AI Team proposal/discussion capability through the existing authenticated Runtime status endpoint and the existing Settings integration surface.

## Scope

- Add a truthful `aiTeam` capability to `/api/user/runtime-status`.
- Derive the composed Runtime value from both AI Team proposal and discussion dispatchers.
- Pass deterministic isolated-server readiness into the same endpoint.
- Show the capability in the existing Settings integration cards without changing the approved layout or inventing external-provider connectivity.

## Safety boundaries

- Configuration/readiness only; do not contact Ollama or external providers.
- Do not change operational Runtime/Agent state, durable operational records, UNKNOWN requests, or external integrations.
- Preserve existing Personal AI, project execution, Agent, user authentication, and tenant isolation behavior.

## TDD checklist

- [x] RED: extend API and UI contract tests for the AI Team readiness field.
- [x] GREEN: implement server/runtime wiring and the Settings status row.
- [x] Verify focused tests, product/root regressions, builds, isolated browser E2E, and operational identity.
- [x] Record exact evidence and remaining live-model boundary in inventory and development log.

## Verification record

- Focused API/UI contract coverage passed `3/3`.
- `npm.cmd run test:iseol-user-product`: `299/299` passed.
- `npm.cmd test`: `675/675` passed.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; the UI build retained only existing Vite warnings.
- Full isolated browser E2E passed `truthfulWorldAndIntegrationStates`, `runtimeStatusSurface`, AI Team proposal/discussion journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes. The new `AI 팀 미연결` Settings assertion passed in the default deterministic isolated server.
- Operational Runtime/Agent identity remained untouched; no live Ollama request was made.

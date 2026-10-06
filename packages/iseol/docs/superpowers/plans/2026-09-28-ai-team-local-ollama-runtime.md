# AI Team local Ollama Runtime adapter

## Goal

Connect AI Team proposal and technical-discussion services to the existing explicitly enabled loopback Ollama Runtime, while keeping external providers and implicit execution out of scope.

## Scope

- Add bounded local Ollama adapters for AI Team proposal and discussion response envelopes.
- Reuse the existing `ISEOL_LOCAL_AI_RUNTIME_ENABLED`, loopback URL, model, and timeout configuration family.
- Wire the adapters into `startIseolRuntimeServices` only when local AI Runtime is explicitly enabled; explicit injected dispatchers remain higher priority.
- Keep owner/team authorization, shared per-user dispatch gate, proposal acceptance, Work Request approval, and durable waiting fallbacks unchanged.

## Safety boundaries

- The adapter accepts only loopback `127.0.0.1`, `localhost`, or `::1` URLs and never calls a remote provider.
- No Ollama process is started, stopped, or contacted by the test suite; tests use injected fetch implementations.
- No operational Runtime/Agent restart, UNKNOWN replay, external connector mutation, deployment, push, data deletion, approved-design change, or AI Broadcast Room work.

## TDD checklist

- [x] RED: add adapter/config tests for proposal/discussion envelopes and fail-closed malformed/unavailable responses.
- [x] GREEN: implement the bounded loopback Ollama adapters and config resolver.
- [x] Wire enabled local configuration into composed Runtime while preserving explicit dispatcher injection and disabled waiting behavior.
- [x] Run focused tests, builds, product/root regressions, isolated browser E2E, and operational-state checks.
- [x] Record exact evidence and remaining live-model/operational boundary in inventory and development log.

## Verification record

- Focused adapter/composed Runtime coverage passed `41/41`, including valid proposal/discussion envelopes, markdown-fenced JSON, malformed/unavailable responses, loopback rejection, and composed local configuration wiring.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; the UI build retained only existing Vite warnings.
- `npm.cmd run test:iseol-user-product`: `299/299` passed; `npm.cmd test`: `675/675` passed.
- Full isolated browser E2E passed all existing AI/project/learning/collaboration/growth/portfolio journeys with two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes. The browser uses deterministic isolated dispatchers; it does not claim live Ollama quality.
- Operational safety check confirmed Runtime PID `1708` and Desktop Agent PID `22416` remained running with the configured dataRoot unchanged; stale lock PID `55000` and its codeVersion mismatch were preserved.

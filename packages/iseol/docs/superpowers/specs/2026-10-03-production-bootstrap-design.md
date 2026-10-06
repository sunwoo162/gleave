# Production Bootstrap Design

## Goal

Make the self-hosted web product startable and diagnosable by a first-time operator. A clean installation must either start the web/runtime service or explain the exact safe recovery action required. The design keeps the existing operator safety model and does not silently delete or bypass runtime locks.

## Scope

This slice covers:

- runtime startup diagnostics for stale locks;
- an explicit, operator-authenticated stale-lock recovery path;
- a machine-readable health/readiness check for Docker and local operators;
- a smoke test that exercises the production web entrypoint without Discord credentials;
- README and Docker documentation for the supported startup path.

This slice does not change the authentication model, replace file persistence, add SaaS tenancy, or enable external integrations by default. Those are separate follow-up slices.

## Startup behavior

`iseol:runtime start` remains fail-closed when a stale lock exists. The error must include the runtime data root and recovery fingerprint, but never include credentials. The operator can use the existing recovery command only after the runtime verifies the configured operator credential and the confirmation text matches the observed fingerprint.

The status command remains read-only and returns JSON with a stable state (`absent`, `running`, or `stale`) plus bounded diagnostic metadata. The recovery command remains explicit and does not run as a hidden startup side effect.

## Health behavior

The web control plane exposes a public, read-only health endpoint suitable for a reverse proxy and Docker healthcheck. It reports process liveness separately from runtime readiness. Readiness is false when required runtime services are unavailable, while the endpoint itself remains available for diagnosis. Responses must not expose bearer tokens, filesystem secrets, or provider credentials.

## Verification

Tests will cover:

1. stale-lock startup errors contain actionable, bounded diagnostics;
2. recovery still requires operator authentication and exact confirmation;
3. health reports liveness and readiness independently;
4. unauthenticated health works on loopback/publicly configured control planes without exposing secrets;
5. the Docker healthcheck and production build use the same endpoint;
6. the documented Docker/local startup path passes a smoke test with integrations disabled.

## Acceptance criteria

- `npm run build` and `npm run user-ui:build` pass.
- `npm run check:release` passes.
- `npm test` passes.
- A fresh local runtime can be started or produces a copy-pasteable recovery instruction.
- Docker healthcheck no longer depends on a Discord token.
- No credentials or raw command output are added to durable status, logs, or test fixtures.

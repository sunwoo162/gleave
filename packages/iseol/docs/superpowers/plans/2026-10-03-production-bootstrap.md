# Production Bootstrap Implementation Plan

## Goal

Make the self-hosted web/runtime path startable and diagnosable without requiring Discord credentials, while preserving fail-closed operator recovery for stale runtime locks.

## Files and responsibilities

- `src/web-control-plane/server.ts`: expose the unauthenticated, bounded health endpoint and keep static/API routing behavior unchanged.
- `src/web-control-plane/router.ts`: add the health response contract if routing-level tests need it.
- `scripts/iseol-runtime-host.ts`: improve stale-lock diagnostics and keep recovery explicit.
- `scripts/docker-healthcheck.mjs`: use the same health endpoint as Docker.
- `tests/web-control-plane.test.ts` or the existing focused web test file: prove liveness/readiness separation, response sanitization, and routing.
- `tests/iseol-runtime-host.test.ts` or the existing runtime test file: prove stale-lock diagnostics and recovery guard behavior.
- `scripts/production-bootstrap-smoke.mjs`: start the supported web/runtime path with isolated temporary roots and verify health/static responses without provider credentials.
- `package.json`: expose a focused smoke command.
- `README.md`, `docker-compose.example.yml`: document local and Docker startup, health URL, and explicit stale-lock recovery.

## Tasks

### 1. Establish failing contracts (RED)

1. Add a health test that expects a 200 response for liveness and a distinct readiness field when runtime dependencies are unavailable.
2. Add tests that assert health output contains no configured token or filesystem secret.
3. Add a stale-lock diagnostic test that expects the observed data root and fingerprint but not credential material.
4. Run each focused test and confirm it fails for the missing behavior.

### 2. Implement the minimum contracts (GREEN)

1. Add `GET /healthz` and `GET /readyz` or one documented health endpoint with explicit `live` and `ready` fields; choose the smallest API consistent with the current Docker healthcheck.
2. Make the Docker healthcheck call the endpoint and classify non-2xx or invalid JSON as unhealthy.
3. Bound and sanitize startup diagnostics for stale locks.
4. Add the focused smoke command and isolated temporary-root cleanup.
5. Update local/Docker documentation with copy-pasteable commands.

### 3. Verify and refactor

1. Run the focused tests and confirm green.
2. Run `npm run build`, `npm run user-ui:build`, `npm run check:release`, and the full `npm test` suite.
3. Run the smoke command with integrations disabled and inspect the actual HTTP responses.
4. Review the diff for secrets, destructive cleanup, and accidental changes outside the approved scope.

### 4. Integrate

1. Commit implementation and tests on `codex/production-bootstrap`.
2. Push the branch and create a PR using the repository's Korean PR template with actual line breaks.
3. Request/review the PR, address findings, merge to `main`, and delete the feature branch after verification.

## Acceptance checks

- Health is available without a bearer token and never leaks secrets.
- Readiness can be false without making liveness unavailable.
- A stale lock never gets silently deleted or bypassed.
- Docker and local smoke checks use the same supported health contract.
- All existing tests and release checks remain green.

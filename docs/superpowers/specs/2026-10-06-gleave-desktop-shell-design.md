# Gleave Desktop Shell Design

## Goal

Make Desktop the primary local EEEE surface. Desktop owns the embedded loopback
API, SQLite-backed state, the EEEE assistant entry point, project status, the
ClaimLatch health signal, and the action that creates a short-lived Mobile
pairing code. Mobile remains a thin remote client and is not expanded in this
change.

## User flow

```text
Desktop launch
  -> embedded FastAPI on 127.0.0.1
  -> local Desktop snapshot
  -> user asks EEEE
  -> capability/project result is persisted by EEEE
  -> Desktop refreshes project profile, state, trust, and recent events
  -> user may issue a short-lived Mobile pairing code
```

## Boundaries

- `DesktopSession` is the testable control-plane facade. It owns no business
  state; it reads and commands the local API through a typed client.
- `PetApiClient` keeps the existing project-task endpoints for compatibility and
  adds canonical EEEE/Desktop endpoints.
- Desktop API routes are read/command surfaces for a local Desktop process. They
  expose redacted health and event metadata only; provider tokens and full
  prompts never appear in the snapshot.
- The PySide6 window is a presentation layer. Blocking HTTP calls stay in the
  existing Qt worker pool.
- The current legacy project-task controls remain available while the EEEE
  assistant field becomes the primary Desktop entry point.
- Mobile source files are not changed. Desktop only calls the existing pairing
  issue endpoint.

## Desktop snapshot contract

`GET /api/desktop/state?projectId=...` returns:

- local transport and application status;
- `claimLatch` health (`status`, `mode`, profile version, engine version);
- redacted `mobileBridge` status and paired-device count;
- selected project profile and project task state, when a project is selected;
- recent redacted lifecycle events and the latest event cursor.

`GET /api/desktop/events?cursor=...` returns the durable event journal for the
Desktop UI. `POST /api/desktop/pairing/code` issues the existing short-lived
pairing code from a loopback-only Desktop caller.

`POST /api/assistant/route` remains the canonical EEEE command endpoint. The
Desktop client refreshes its snapshot after a successful route and preserves
the route result for presentation.

## Failure behavior

- Embedded API startup failure is rendered as a blocked Desktop state.
- API errors are shown as actionable local errors and do not silently claim
  success.
- Unknown snapshot state fails closed to the existing blocked presentation.
- Pairing-code issuance failure never exposes an access token or secret.

## Acceptance criteria

1. A headless test can refresh a Desktop snapshot and route an EEEE request
   without importing PySide6.
2. Desktop API endpoints expose ClaimLatch health, project profile/state, event
   cursor, and pairing-code issuance without leaking secrets.
3. The PySide6 window has an EEEE command input, project/trust status, pairing
   action, recent-event display, and preserves non-blocking behavior.
4. Existing pet/workspace verification tests continue to pass.
5. Mobile tests and source remain unchanged.

# Local runtime

EEEE is the local entrypoint. It starts a FastAPI coordinator bound to `127.0.0.1`, stores project state, ClaimLatch verification audits, and durable memory in one SQLite database, and can launch the PySide6 desktop companion without a login or hosted control plane.

From the repository root:

```powershell
python -m pip install -e ".\apps\eeee[desktop]"
.\scripts\dev-up.ps1
```

The widget is always-on-top, draggable, interactive, and can hide to or restore from the system tray. It talks only to the local EEEE API. Notion, Google Calendar, and GitHub CI/code review are optional provider adapters; ISEOL runs locally and Discord is not a required runtime dependency.

Desktop is the authoritative runtime. Mobile is distributed separately as a thin
remote client: it pairs with a short-lived code, sends commands through the Desktop
bridge, and subscribes to `GET /api/mobile/events/stream` for live state. Existing
secretary features remain available on Mobile because the command is executed by
EEEE on Desktop. Mobile never receives provider tokens or the local SQLite database.

For a project request, EEEE creates one durable Project Runtime. Notion receives the
specification, decisions, and execution log when configured. GitHub receives repository,
CI, and code-review integration when configured. ISEOL owns Agent decomposition,
integration, and independent QA locally. A missing provider stays
`awaiting_configuration` and is never reported as completed.

The ClaimLatch integration profile is `claimlatch-v0.2.0`. Audit records preserve that
profile separately from the bundled engine version (`0.3.86`), and `/health` exposes only
non-secret status metadata (`configured`, `advisory`, or `required`).

For a ClaimLatch client that must be trusted by EEEE, pass the coordinator's `SQLiteStore.claimlatch_audits` to `ClaimLatchClient`, configure the current project revision resolver, and keep the client fail-closed. The audit row is written only after the adapter returns a schema-valid envelope whose subject, project, and revision match the request.

Run the focused local verification:

```powershell
.\scripts\verify-all.ps1
```

Use `-Full` for the complete EEEE Python suite. The ClaimLatch adapter is a loopback/process boundary and must remain fail-closed: a transport error, malformed report, missing evidence, stale revision, replay conflict, or blocked ClaimLatch decision cannot become a released answer or memory candidate.

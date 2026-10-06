# Cross-process API Run Execution Design

## Status and intent

Conversational design approved on 2026-10-01. This design makes execution ownership durable so independent API service instances sharing one SQLite database cannot both start the same run. A process restart must not silently cause an uncertain run to execute again.

The guarantee is limited to processes using the same local SQLite database. It does not cover multiple hosts, unsupported network filesystems, or external side effects performed by an agent runtime.

## Current context

`ApiFlowService.execute` currently uses an in-memory set and lock to suppress duplicate calls within one service instance. The lock disappears on restart and is not shared across processes. `SQLiteStore.init` creates tables idempotently, while run status and events are persisted separately. The API already exposes execute and explicit retry operations, and run records already carry status and error information.

## Chosen approach

Use a durable SQLite lease, acquired and mutated under `BEGIN IMMEDIATE`. The alternatives considered were retaining a process-local lock (insufficient across service instances) and introducing an external coordinator such as Redis (unnecessary for the current single-machine SQLite deployment). SQLite keeps ownership in the existing persistence boundary and adds no service dependency.

### Lease record and atomic ownership

Add an idempotently created `run_execution_leases` table keyed by `run_id`, with an owner token, monotonically increasing generation, and lease expiry. Keep each row after release so its generation remains available to fence stale workers. Releasing clears the active owner and expiry but does not reset the generation.

An execution attempt creates a fresh unpredictable owner token. Claim, renew, expiration, retry invalidation, run-status transitions, and their corresponding run events use short `BEGIN IMMEDIATE` transactions. Every event or result write from an executing worker must match both its owner token and generation; ownership-sensitive completion also requires that the lease has not expired. This prevents an old worker from overwriting a newer attempt's database state.

Use a 60-second lease and renew it every 10 seconds. Renewal is conditional on the same owner and generation and must not resurrect an already expired lease. If ownership is lost, the worker may finish its non-cancellable runtime call, but it must not persist its events, final run status, or result bundle as the active attempt.

### Execute, expiry, and retry behavior

`POST /api/runs/{run_id}/execute` keeps its current request and response contract:

- A valid live lease means another instance owns the run; return the persisted `running` run and do not call the runtime.
- A new eligible run is claimed and changed to `running` atomically before the runtime starts.
- An expired lease is never reclaimed by an execute request. That request invalidates the old generation, marks the run `failed`, records an event and an actionable error, and does not invoke the runtime. A legacy `running` run with no lease is treated the same way on its next execute request.
- A successful or failed execution persists its terminal status/events and releases its lease atomically, provided ownership is still valid.
- If a runtime or persistence error occurs, the run remains failed and cannot be started again by an ordinary execute request.

`GET` remains read-only; it does not perform lazy expiry. Existing explicit retry is the only recovery path: for a `failed` or `unavailable` run, it atomically changes the run back to `created`, records the retry event, and invalidates any prior generation. It does not invoke the runtime itself. The next explicit execute obtains a fresh owner token and generation. The failure message/UI must advise checking the workspace for partial changes before retrying. Runtime-side effects cannot be rolled back or reliably cancelled after lease loss.

No routes, response fields, or status-code contracts are added or changed. Expiration continues to be represented by the existing failed run and error/event data.

## Storage and lifecycle boundaries

`SQLiteStore` owns lease persistence and fencing operations. `ApiFlowService` owns attempt tokens and the heartbeat lifecycle around the synchronous runtime call. The in-memory per-instance active-run set is removed as an authority; SQLite is the single source of truth for ownership.

Initialization adds only the new lease table; it does not rewrite existing run rows. Existing `running` rows without a lease are handled lazily as stale when execute is called. Deployments must not run old and new application versions concurrently against the same database, because old versions do not participate in lease fencing.

## Verification

Tests use two independent `SQLiteStore` and `ApiFlowService` instances pointing at the same database, and a blocking fake runtime, to prove only one runtime invocation occurs while the other execute request observes `running`. Additional tests cover:

- lease renewal during a long-running attempt and deterministic expiry without wall-clock sleeps;
- expiry changing a run to `failed` without starting another runtime;
- explicit retry starting a new generation and a stale prior owner being unable to append events or persist a result;
- atomic terminal status/event persistence and lease release on success and failure;
- legacy `running` rows without a lease becoming failed on execute;
- unchanged API and UI behavior, including the partial-workspace warning before retry.

Run the focused storage/API tests and the full project suite, then inspect `git diff --check` before review.

## Non-goals and limitations

- Exactly-once execution of arbitrary runtime behavior or external side effects.
- Runtime cancellation, rollback of workspace changes, or automatic retry after expiry.
- Cross-host locking, distributed consensus, or replacing SQLite.
- Changing the public API contract.

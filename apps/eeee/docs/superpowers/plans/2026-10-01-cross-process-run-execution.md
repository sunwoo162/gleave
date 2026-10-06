# Cross-process API Run Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make API run ownership durable in SQLite so independent service instances sharing one database cannot execute the same run concurrently, and stale attempts cannot overwrite a later retry.

**Architecture:** Add a `run_execution_leases` row per run and mutate it with `BEGIN IMMEDIATE`. `SQLiteStore` owns atomic claim, renewal, fencing, expiry, retry invalidation, and terminal release; `ApiFlowService` owns an attempt token and a 60-second/10-second heartbeat around the runtime call. Existing routes and `Run` responses stay unchanged; expiry becomes an explicit failed run that requires the existing retry endpoint.

**Tech Stack:** Python 3.12, SQLite via `sqlite3`, FastAPI, pytest, JavaScript browser-harness tests.

**Spec:** `docs/superpowers/specs/2026-10-01-cross-process-run-execution-design.md`

## Global Constraints

- The guarantee applies only to processes sharing the same local SQLite database; it does not provide cross-host locking or exactly-once external side effects.
- The lease lasts 60 seconds and is renewed every 10 seconds; renewal never resurrects an expired lease.
- `GET` remains read-only, and ordinary `POST /api/runs/{run_id}/execute` never reclaims an expired lease.
- Only explicit retry may move a `failed` or `unavailable` run back to `created`; retry does not invoke the runtime.
- Existing API routes, response fields, and status-code contracts remain unchanged.
- Existing `running` rows without a lease are treated as stale on their next execute request.
- The workspace and `.worktrees\\embedded-desktop-api` are out of scope.

## Review Focus

- Two independent service instances sharing one SQLite file must produce one runtime call and one `running` response: covered by Task 2's cross-instance API test.
- A lease that expires must fail the run without automatically invoking the runtime: covered by Task 1's deterministic expiry test and Task 2's execute test.
- A stale owner from an earlier generation must not append events or persist final state after retry: covered by Task 1's fencing test.
- A legacy `running` row with no lease must not be executed again: covered by Task 1's legacy-row test and Task 2's API test.
- A retry must warn about possible partial workspace changes before the user executes again: covered by Task 3's UI harness assertion.

### Task 1: SQLite Lease Primitives and Fencing

**Files:**
- Modify: `app/storage/sqlite.py:SQLiteStore.init and run persistence methods`
- Test: `tests/storage/test_sqlite.py:lease schema and lease lifecycle tests`

**Interfaces:**
- Consumes: existing `Run`, `run_events`, and `runs` storage.
- Produces: `RunExecutionClaim`, `SQLiteStore.claim_run_execution(...)`, `renew_run_execution(...)`, `complete_run_execution(...)`, and `reset_run_for_retry(...)` for `ApiFlowService`.

- [ ] **Step 1: Write all failing storage tests for schema, claims, fencing, and retry generations**

  Add tests that initialize a temporary database and assert `run_execution_leases` is created with one row per claimed run. Exercise `claim_run_execution(run_id, owner_token, now)` for a created run, a second owner while the first lease is live, and a lease whose `expires_at` is before `now`; assert respectively `acquired`, `already_running`, and `expired`, with the expired run persisted as `failed` and no new lease owner. Assert that an existing `running` run with no lease is treated as stale and failed. Also claim generation 1, reset the run for retry, claim generation 2, and assert completion from generation 1 returns `None` without changing the run or events, while generation 2 can complete and releases its active owner.

- [ ] **Step 2: Run the focused tests to verify they fail**

  Run: `pytest tests/storage/test_sqlite.py -k "lease or execution_claim" -v`

  Expected: FAIL because the lease table and storage methods do not exist.

- [ ] **Step 3: Implement the lease schema and atomic storage operations**

  In `SQLiteStore.init`, create `run_execution_leases (run_id TEXT PRIMARY KEY, owner_token TEXT, generation INTEGER NOT NULL, expires_at TEXT)` with a foreign-key-independent primary key matching the repository's existing SQLite schema style. Add a small typed result object with `acquired: bool`, `reason: Literal["acquired", "already_running", "expired", "terminal"]`, `generation: int`, and `run: Run`.

  Implement these exact methods, each opening its own connection and using `BEGIN IMMEDIATE` for state changes:

  - `claim_run_execution(self, run_id: str, owner_token: str, now: datetime, lease_seconds: int = 60) -> RunExecutionClaim`: create or advance the generation for a new claim and atomically set the run to `running`; return the persisted running run for a live competing lease; mark an expired or lease-less running run `failed`, advance the generation to invalidate its old owner, append an expiration/stale event with an actionable partial-workspace warning, clear the owner, and return the failed run without claiming it.
  - `renew_run_execution(self, run_id: str, owner_token: str, generation: int, now: datetime, lease_seconds: int = 60) -> bool`: extend expiry only when owner, generation, and current expiry are still valid.
  - `complete_run_execution(self, run_id: str, owner_token: str, generation: int, status: str, events: list[dict[str, object]], artifacts: list[dict[str, object]], error: str | None, now: datetime) -> Run | None`: in one transaction, require matching unexpired ownership, append collected runtime events, update the terminal run state, clear the lease owner/expiry while retaining generation, and return the run; return `None` for a stale owner.
  - `reset_run_for_retry(self, run_id: str) -> Run`: inside one transaction, require the persisted run status to be `failed` or `unavailable`, increment the lease generation, clear any owner/expiry, set the run to `created`, clear artifacts/error, and append the existing `retry_requested` event using the status read in the transaction.

  Use the existing UTC ISO timestamp conventions and `json.dumps` event storage. Keep `update_run` and `append_event` available for non-execution callers; execution events and terminal state use the owner-aware completion operation.

- [ ] **Step 4: Run the focused tests to verify they pass**

  Run: `pytest tests/storage/test_sqlite.py -k "lease or execution_claim" -v`

  Expected: PASS, including deterministic expired-lease and legacy-running cases.

- [ ] **Step 5: Run the complete storage suite and inspect the diff**

  Ensure every lease-sensitive mutation checks both `owner_token` and `generation`, and expiry comparisons use the injected `now` value. Run: `pytest tests/storage/test_sqlite.py -v` and `git diff --check`. Expected: PASS with no whitespace errors.

- [ ] **Step 6: Commit the storage deliverable**

  ```bash
  git add app/storage/sqlite.py tests/storage/test_sqlite.py
  git commit -m "feat: add durable run execution leases"
  ```

### Task 2: Service Heartbeat and Cross-instance Execution

**Files:**
- Modify: `app/api/service.py:ApiFlowService.__init__, execute, retry`
- Modify: `app/storage/sqlite.py:claim, renewal, and completion time sampling`
- Test: `tests/api/test_request_flow.py:cross-instance execution, expiry, and retry tests`
- Test: `tests/storage/test_sqlite.py:clock adjustment and lock-wait expiry tests`

**Interfaces:**
- Consumes: Task 1's `RunExecutionClaim` and owner-aware `SQLiteStore` methods; extends their `now` inputs to accept a clock callable as well as a fixed datetime so production time is sampled after the writer lock is acquired.
- Produces: Existing `ApiFlowService.execute(run_id: str) -> Run` and `retry(run_id: str) -> Run` behavior backed by durable ownership; no route signature changes.

- [ ] **Step 1: Write all failing service tests for cross-instance execution, heartbeat, expiry, stale rows, and retry**

  Build two `ApiFlowService` instances with independent coordinators/stores but the same database path and a shared blocking fake runtime. Start `execute` concurrently for one approved run, wait until the first runtime starts, then call the second service's `execute`; assert the second result is `running`, the runtime call count is one, and the first result is `completed` after release. Add service-level tests with an injected `clock: Callable[[], datetime]`, `lease_seconds: int`, and `heartbeat_interval_seconds: float` that assert a long-running execution renews its lease, an expired run's next execute returns `failed` without a second runtime call, a manually persisted `running` row without a lease is failed on execute, and retry returns `created`, increments the generation, and does not invoke the runtime. Add storage tests proving claim, renewal, and completion sample the clock after acquiring the SQLite writer lock and renewal never shortens an existing expiry after a backward clock adjustment.

- [ ] **Step 2: Run the focused tests to verify they fail**

  Run: `pytest tests/api/test_request_flow.py -k "cross_instance or heartbeat or expired or legacy or retry" -v`

  Expected: FAIL in the new cross-instance, heartbeat, expired-lease, and legacy-run tests because current execution has no durable ownership. Existing explicit-retry tests may pass independently.

- [ ] **Step 3: Integrate claim, heartbeat, fencing, and terminal release in `ApiFlowService`**

  Remove `_active_run_ids` and its lock as an execution authority. Extend `ApiFlowService.__init__` with `clock: Callable[[], datetime] | None = None`, `lease_seconds: int = 60`, and `heartbeat_interval_seconds: float = 10.0`; default the clock to current UTC time and retain the specified production values. Generate `owner_token = uuid4().hex`, call `claim_run_execution` before constructing the runtime request, and immediately return `claim.run` unless `claim.acquired` is true. Start a daemon heartbeat thread using `Event.wait(self.heartbeat_interval_seconds)` that calls `renew_run_execution` with the claim's generation and `self._clock` callable so storage samples time after acquiring its write lock; stop and join it in `finally`. Pass the callable to claim and completion as well. Update claim, renewal, and completion to resolve a passed `datetime | Callable[[], datetime]` only after `BEGIN IMMEDIATE`; renewal must preserve a later stored expiry and all three methods must reject an owner after expiry measured at the post-lock clock sample.

  Preserve the current runtime and artifact flow, collect runtime events until completion, then pass events and the final status/artifacts/error to `complete_run_execution` so events, terminal state, and lease release commit atomically. If ownership is lost, do not persist the stale result; return the current persisted run or raise the existing execution failure path. On runtime/artifact exceptions, complete the run as `failed` only if the owner is still valid. Keep the 60-second and 10-second defaults as service constants, with optional constructor overrides for deterministic tests; production defaults must remain exactly those values.

  Replace the current separate `update_run` plus `append_event` retry sequence with `reset_run_for_retry`; retain the approval check and let the storage transaction enforce retry eligibility and append the event atomically.

- [ ] **Step 4: Run the focused service tests to verify they pass**

  Run: `pytest tests/api/test_request_flow.py -k "cross_instance or heartbeat or expired or legacy or retry" -v`

  Expected: PASS with exactly one runtime invocation for the cross-instance case, no runtime invocation for expiry/legacy recovery, and a fresh generation after retry.

- [ ] **Step 5: Run the complete API suite and fix regressions**

  Run: `pytest tests/storage/test_sqlite.py -v` and `pytest tests/api/test_request_flow.py -v`. Expected: PASS, including lease-lock contention, backward-clock renewal, existing same-instance duplicate, post-runtime failure, explicit retry, and persisted-state tests, with unchanged route response shapes.

- [ ] **Step 6: Commit the service deliverable**

  ```bash
  git add app/api/service.py tests/api/test_request_flow.py
  git commit -m "feat: fence API run execution across processes"
  ```

### Task 3: Retry Warning and Full Verification

**Files:**
- Modify: `app/static/app.js:retry button success message`
- Test: `tests/ui_approval_selection_race.js:retry warning assertion`
- Test: `tests/api/test_request_flow.py:static UI contract assertion if needed`

**Interfaces:**
- Consumes: Task 2's unchanged retry response and persisted failed-run error.
- Produces: UI copy that makes the partial-workspace risk visible before a retried execution.

- [ ] **Step 1: Write the failing UI harness assertion**

  Extend the existing retry flow harness to assert that after a successful retry request the run summary tells the user to inspect possible partial workspace changes before executing again.

- [ ] **Step 2: Run the focused UI test to verify it fails**

  Run: `node --test tests/ui_approval_selection_race.js`

  Expected: FAIL because the current message only mentions correcting runtime configuration.

- [ ] **Step 3: Update the retry confirmation copy**

  In `app/static/app.js`, retain the existing retry action and replace the success summary with concise text that says the retry is queued and the workspace should be checked for partial changes before execution.

- [ ] **Step 4: Run the focused UI test to verify it passes**

  Run: `node --test tests/ui_approval_selection_race.js`. Expected: PASS.

- [ ] **Step 5: Run full verification**

  Run: `pytest -q`, `node --test tests/ui_approval_selection_race.js tests/ui_design_tool_races.js`, and `git diff --check`. Expected: all existing tests pass, UI harness tests pass, and no whitespace errors remain.

- [ ] **Step 6: Commit the UI and verification deliverable**

  ```bash
  git add app/static/app.js tests/ui_approval_selection_race.js
  git commit -m "fix: warn before retrying partially changed workspaces"
  ```

# Iseol Desktop Execution Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the durable Iseol Run Supervisor to a persistent outbound Desktop Agent that safely executes structured repository, process, Git, and file operations with heartbeat, leases, evidence, and reconnect recovery.

**Architecture:** Keep `HarnessStageExecutor` and existing Run/Recovery stores as the orchestration boundary. Add a versioned desktop protocol, Core-side Agent Registry + Job/Lease store, a restricted Desktop Agent runtime with workspace/policy guards, and a `DesktopExecutor` adapter that maps task outcomes back into Harness stage results. The first live proof uses a temporary Git repository only.

**Tech Stack:** TypeScript 7, Node.js 22, `ws` for Core WebSocket server/outbound Agent client, `node:child_process`, existing Harness stores/state machine/recovery, `node:test`, no unrestricted shell abstraction.

**Spec:** `docs/superpowers/specs/2026-09-08-iseol-desktop-execution-bridge-design.md`

## Global Constraints

- Read `docs/HARNESS_ENGINEERING.md` before every implementation task.
- Desktop Agent connection is persistent and outbound from the user machine to Iseol Core.
- Core remains the source of truth for Run, Job, lease, and evidence state.
- Agent may execute only versioned structured operations; no arbitrary unrestricted shell API.
- Every task pack carries `runId`, `jobId`, `stage`, `workspaceRoot`, `policyDigest`, `policySources`, `idempotencyKey`, and `leaseUntil`.
- Agent re-reads locally addressable Harness/AGENTS policy sources and verifies SHA-256 before mutation.
- Workspace access is restricted to explicitly configured roots and the requested workspace subtree.
- Disconnect/reconnect never blindly repeats a mutation; current repository/job reality is reconciled first.
- Unknown contract versions, unsafe paths, stale policy hashes, missing authorization, or conflicting leases fail closed.
- Secrets/raw tokens never enter Run evidence, job receipts, or persisted logs.
- Existing Discord/Web/Harness behavior must remain green throughout this phase.
- All commits use concise English Conventional Commit-style messages.

---
## File structure

- `src/desktop-agent/contracts.ts` — protocol versions, Agent presence, Task Pack, operation, result, and receipt contracts.
- `src/desktop-agent/agent-registry.ts` — authenticated Core-side agent presence/heartbeat registry.
- `src/desktop-agent/job-store.ts` — durable job records, leases, attempts, results, and idempotency lookup.
- `src/desktop-agent/workspace-guard.ts` — root/path/policy-source validation for local execution.
- `src/desktop-agent/runtime.ts` — structured operation execution and local result assembly.
- `src/desktop-agent/transport.ts` — message/session boundary for register, heartbeat, task, result, and reconnect messages.
- `src/desktop-agent/desktop-executor.ts` — `HarnessStageExecutor` implementation over the Agent/Job boundary.
- `src/desktop-agent/reality-inspector.ts` — Agent-backed Git/job reality for Harness recovery.
- `tests/desktop-agent-*.test.ts` — deterministic protocol, guard, lease, runtime, transport, executor, recovery, and E2E coverage.

### Task 1: Versioned Desktop Agent protocol contracts

**Files:**
- Create: `src/desktop-agent/contracts.ts`
- Create: `tests/desktop-agent-contracts.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `ISEOL_DESKTOP_PROTOCOL_VERSION`, `DesktopAgentHello`, `DesktopAgentPresence`, `DesktopTaskPack`, `DesktopOperation`, `DesktopJobResult`, `DesktopJobReceipt`, and strict version/assertion helpers.

- [x] Write failing tests proving protocol version `1` is accepted while unknown versions fail, operation unions reject unsupported operation types, Task Packs require non-empty `jobId/runId/workspaceRoot/idempotencyKey`, and mutation-capable packs require `policyDigest` plus at least one `policySource`.
- [x] Run `node --import tsx --test tests/desktop-agent-contracts.test.ts` and confirm RED because the module does not exist.
- [x] Implement the minimal versioned types and runtime assertions; use discriminated operations for `READ_FILE`, `LIST_DIRECTORY`, `APPLY_PATCH`, `RUN_PROCESS`, `GIT_STATUS`, `GIT_DIFF`, `GIT_BRANCH`, `GIT_COMMIT`, and `CHECK_HTTP` only.
- [x] Make Task Pack validation reject unsupported versions, blank identity fields, invalid lease timestamps, duplicate operation IDs, and mutation packs without policy provenance.
- [x] Run the focused test plus `npm run build` and confirm PASS.
- [x] Register the test in `npm test` and commit `feat: define desktop agent protocol`.
### Task 2: Agent Registry and heartbeat presence

**Files:**
- Create: `src/desktop-agent/agent-registry.ts`
- Create: `tests/desktop-agent-registry.test.ts`

**Interfaces:**
- Consumes: Task 1 `DesktopAgentHello`, `DesktopAgentPresence`.
- Produces: `registerDesktopAgent(root, hello, at)`, `heartbeatDesktopAgent(root, agentId, at)`, `getDesktopAgentPresence(root, agentId, now, timeoutMs)`, `listOnlineDesktopAgents(root, now, timeoutMs)`.

- [x] Write failing tests for authenticated registration metadata persistence, heartbeat timestamp updates, offline classification after timeout, deterministic online listing, and safe agent IDs that cannot escape the registry root.
- [x] Add a test proving a second registration for the same `agentId` updates capabilities/workspace roots without creating a second identity record.
- [x] Run the focused test and confirm RED.
- [x] Implement atomic JSON persistence under `<root>/agents/<agentId>.json`; presence status is derived from the latest heartbeat instead of persisted as independent truth.
- [x] Reject empty workspace-root sets and normalize each root without broadening it.
- [x] Run focused tests plus build and confirm PASS.
- [x] Register the test and commit `feat: track desktop agent presence`.

### Task 3: Durable jobs, leases, and idempotency

**Files:**
- Create: `src/desktop-agent/job-store.ts`
- Create: `tests/desktop-agent-job-store.test.ts`

**Interfaces:**
- Consumes: Task 1 `DesktopTaskPack`, `DesktopJobResult`, `DesktopJobReceipt`.
- Produces: `createDesktopJob`, `loadDesktopJob`, `acquireDesktopJobLease`, `renewDesktopJobLease`, `completeDesktopJob`, `findDesktopJobByIdempotencyKey`, `listRecoverableDesktopJobs`.

- [x] Write failing tests for atomic job creation, same idempotency key returning the existing job, conflicting payload reuse rejection, exclusive lease acquisition, expired lease takeover, lease renewal by the current owner only, and completed-job immutability.
- [x] Write a reconnect test proving a job with expired lease and no terminal result appears in `listRecoverableDesktopJobs` while completed/cancelled jobs do not.
- [x] Run focused tests and confirm RED.
- [x] Implement job files under `<root>/jobs/<jobId>/job.json` using temp-file + rename; persist attempts and lease owner/expiry inside the durable job envelope.
- [x] Compare idempotent payload identity using stable fields (`runId`, `stage`, `workspaceRoot`, `policyDigest`, `idempotencyKey`, operations) rather than timestamps.
- [x] Run focused tests plus build and confirm PASS.
- [x] Register the test and commit `feat: persist desktop agent jobs`.
### Task 4: Workspace guard and local structured runtime

**Files:**
- Create: `src/desktop-agent/workspace-guard.ts`
- Create: `src/desktop-agent/runtime.ts`
- Create: `tests/desktop-agent-runtime.test.ts`

**Interfaces:**
- Consumes: Task 1 `DesktopTaskPack` and operation/result contracts.
- Produces: `assertWorkspaceAccess`, `verifyDesktopTaskPolicy`, `executeDesktopTaskPack(pack, runtimeDeps)`.

- [x] Write failing path tests for allowed workspace descendants, sibling/parent traversal rejection, symlink-resolved escape rejection, and access outside configured agent roots.
- [x] Write failing policy tests proving locally addressable policy sources are re-read and SHA-256 verified before mutation, missing mandatory sources fail closed, and read-only operations can still run only inside guarded paths.
- [x] Write failing runtime tests for file read/list, patch application, bounded process execution, Git status/diff/branch/commit, HTTP check, stdout/stderr truncation, timeout classification, and operation-order preservation.
- [x] Run focused tests and confirm RED.
- [x] Implement canonical path resolution using realpath where existing paths allow it and parent realpath + basename checks for creation targets; never trust string-prefix checks alone.
- [x] Implement process execution using executable + args + cwd, explicit timeout, capped output, and no shell interpolation. `GIT_COMMIT` uses explicit message and fails when working tree has nothing to commit.
- [x] Verify policy hashes immediately before the first mutating operation and reject stale/unsupported Task Packs before any mutation.
- [x] Run focused tests plus build and confirm PASS.
- [x] Register the test and commit `feat: execute guarded desktop tasks`.

### Task 5: Authenticated transport/session boundary

**Files:**
- Create: `src/desktop-agent/transport.ts`
- Create: `src/desktop-agent/ws-server.ts`
- Create: `src/desktop-agent/ws-client.ts`
- Create: `tests/desktop-agent-transport.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 protocol and Task 2 Registry.
- Produces: `DesktopAgentSession`, `acceptDesktopAgentHello`, `handleDesktopAgentMessage`, transport-agnostic `sendTask`/`awaitResult` boundary plus `startDesktopAgentWebSocketServer()` and `connectDesktopAgentWebSocketClient()`.

- [x] Write failing tests for token-authenticated hello, protocol-version rejection, heartbeat registration, duplicate live-session replacement, task delivery correlation by `jobId`, unknown result rejection, and disconnect marking the session unavailable without deleting durable presence/job records.
- [x] Add a test proving authentication material is compared but never copied into persisted Agent presence or returned task results.
- [x] Run focused tests and confirm RED.
- [x] Add runtime dependency `ws` and dev dependency `@types/ws`; implement a transport-neutral session manager first, then a Core WebSocket server adapter and outbound Agent client adapter that only translate socket frames into session-manager messages.
- [x] Treat reconnect as a new ephemeral session for the same durable `agentId`; only one active session may own delivery for that agent. Add an integration test using an actual loopback WebSocket server/client proving authenticated hello, heartbeat, task, result, disconnect, and reconnect.
- [x] Run focused tests plus build and confirm PASS.
- [x] Register the test and commit `feat: authenticate desktop agent sessions`.
### Task 6: DesktopExecutor and recovery integration

**Files:**
- Create: `src/desktop-agent/desktop-executor.ts`
- Create: `src/desktop-agent/reality-inspector.ts`
- Modify: `src/harness/recovery.ts`
- Create: `tests/desktop-agent-executor.test.ts`
- Create: `tests/desktop-agent-recovery.test.ts`

**Interfaces:**
- Consumes: existing `HarnessStageExecutor`, Agent Registry, Job Store, transport session, runtime result/evidence contracts.
- Produces: `createDesktopStageExecutor(deps): HarnessStageExecutor`, `createDesktopRealityInspector(deps): HarnessRealityInspector`.

- [x] Write failing executor tests proving offline agent returns `waiting-agent`, online agent creates/leases one durable job, completed results become stage-matching Harness evidence, retryable agent failures map to `retryable-failure`, protected authorization failures map to `blocked-user`, and duplicate executor calls reuse the same idempotent job.
- [x] Write failing recovery tests proving reconnect inspects Git branch/commit and unfinished job receipt before redispatch, an already completed `GIT_COMMIT` is reconciled instead of repeated, and active foreign lease prevents duplicate dispatch.
- [x] Run focused tests and confirm RED.
- [x] Implement stage-to-task compilation only for deterministic desktop-owned work in this phase; open-ended `ANALYZE`, `PLAN`, or reasoning-dependent `IMPLEMENT` without a supplied Task Pack returns `waiting-external` for the later ChatGPT Web bridge.
- [x] Convert successful operation results into minimal secret-free Harness evidence with stable references to job/receipt IDs; keep large logs outside evidence and reference them by digest/path.
- [x] Extend reality inspection additively so existing PR/deployment recovery behavior remains unchanged while Agent/job/Git reality can prevent desktop duplicate mutations.
- [x] Run executor/recovery tests plus all existing Harness recovery/supervisor tests and build; confirm PASS.
- [x] Register tests and commit `feat: bridge desktop agent to harness runs`.

### Task 7: Fake-agent and temporary-repository E2E

**Files:**
- Create: `tests/desktop-agent-e2e.test.ts`
- Create: `src/desktop-agent/test-support/fake-agent.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: all Tasks 1-6.
- Produces: deterministic in-process fake Agent and end-to-end proof over a temporary Git repository.

- [x] Write an E2E test that creates a temporary Git repo with a harness file, registers a fake outbound agent, creates a preflight-ready Run/task, applies a file change, runs a test command, inspects Git state, commits once, and returns evidence through `HarnessStageExecutor` without directly mutating Run state outside Supervisor APIs.
- [x] Add disconnect/reconnect E2E: disconnect after commit result is locally true but before Core records terminal job result, expire the lease, reconnect, reconcile Git reality, and prove commit count remains exactly one.
- [x] Add policy-drift E2E: change the local harness file after Task Pack compilation and prove mutation is rejected before the target file changes.
- [x] Add workspace-escape E2E: request an operation outside the temporary allowed root and prove no outside file is created/read.
- [x] Run focused E2E tests and confirm RED before missing integration pieces are added.
- [x] Implement only the smallest test-support glue required to make the real production boundaries pass these scenarios; do not introduce test-only bypasses in production guards.
- [x] Run E2E tests plus build and confirm PASS.
- [x] Commit `test: verify desktop execution recovery`.
### Task 8: Production bootstrap and secure reconnect

**Files:**
- Create: `src/desktop-agent/core-service.ts`
- Create: `src/desktop-agent/agent-service.ts`
- Create: `src/desktop-agent/main.ts`
- Modify: `src/config.ts`, `src/index.ts`, `src/desktop-agent/transport.ts`, `src/desktop-agent/ws-client.ts`, `src/desktop-agent/ws-server.ts`, `package.json`
- Test: `tests/desktop-agent-bootstrap.test.ts`, `tests/desktop-agent-transport.test.ts`

**Interfaces:**
- Produces: `resolveDesktopAgentCoreConfig`, `startDesktopAgentCoreService`, `resolveDesktopAgentClientConfig`, `runPersistentDesktopAgent`, and executable npm Agent entrypoints.

- [x] Add failing tests for opt-in Core startup, loopback-only bind, token requirement, public `wss://` enforcement, bounded reconnect backoff, frame-version rejection, and production entrypoint wiring.
- [x] Add protocol `version: 1` to task/accepted/heartbeat/result frames and reject unsupported frame versions.
- [x] Start the Core WebSocket service from the normal Iseol boot path only when Desktop Agent configuration is present.
- [x] Add `desktop:agent` and compiled `desktop:agent:start` entrypoints with persistent reconnect and local Workspace Guard execution.
- [x] Keep direct public plain-WebSocket bind disabled; use loopback Core behind a TLS reverse proxy and require `wss://` for non-loopback Agent URLs.
- [x] Run bootstrap/transport/E2E/config focused tests plus build and confirm PASS.
- [x] Commit `feat: start persistent desktop agent bridge`.

## Phase verification

- [x] Re-read `docs/HARNESS_ENGINEERING.md` and the Desktop Execution Bridge spec.
- [x] Run all `tests/desktop-agent-*.test.ts` focused tests.
- [x] Run existing Harness supervisor/recovery/side-effect tests.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Run `git diff --check`.
- [x] Confirm existing Discord, Web Control Plane, Project Model, Calendar, GitHub review, Figma, and Notion tests remain green.
- [x] Confirm no raw token/auth secret appears in Agent Registry files, Job receipts, Harness evidence, or test snapshots.
- [x] Confirm no unrestricted shell command field exists in protocol/runtime contracts.
- [x] Confirm workspace escape, stale policy, duplicate commit, expired lease, foreign lease, offline agent, disconnect, reconnect, and unknown protocol-version tests all pass.
- [x] Run the temporary-repository live smoke locally with no external provider side effects and record branch/commit/job/lease/evidence observations.
- [x] Record exact verification counts and implementation notes in this plan.

## Execution notes

- Implementation ran on `feat/iseol-desktop-execution-bridge` in an isolated worktree with TDD and English Conventional Commit-style commits.
- Desktop focused verification: 42/42 tests passed, covering bootstrap, protocol, registry, jobs/leases, runtime, transport, executor, recovery, Git inspection, and temporary-repository E2E.
- Harness recovery/supervisor/side-effect verification: 13/13 tests passed.
- Fresh full repository verification: 192/192 tests passed; `npm run build` passed; `git diff --check` passed.
- Security scan confirmed no unrestricted shell/command field in the Desktop protocol, runtime process execution uses `shell: false`, and persisted Agent presence omits the authentication token.
- Existing `src/services/webhook-server.ts` remained unchanged. Core Desktop WebSocket startup is opt-in and loopback-only; non-loopback Agent endpoints require `wss://`.
- Temporary-repository E2E observed one intended commit only: the target changed, verification ran, the job reached `completed`, commit evidence was returned, and disconnect-after-commit recovery reused the existing commit without incrementing commit count again.
- Mutation result loss is persisted as `indeterminate`; it is not blindly requeued before reality reconciliation.
- An earlier full-suite run was affected by orphan E2E test processes left by timed-out tool calls. Those worktree-specific processes were removed; subsequent fresh full verification completed 192/192.

## Phase completion gate

The phase is complete only when a preflight-ready Run can delegate deterministic desktop work to an authenticated outbound Agent, enforce workspace and policy provenance locally, persist job/lease state, survive disconnect/reconnect without duplicate mutation, return structured evidence to the existing Run Supervisor, and leave all existing Iseol capabilities green. ChatGPT Web reasoning/session automation remains intentionally unimplemented until the next phase.

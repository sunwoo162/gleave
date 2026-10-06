# Iseol Desktop Execution Bridge Design

## 1. Purpose

The Desktop Execution Bridge turns the existing durable Harness from an orchestration engine with fake executors into a system that can safely perform repository, terminal, Git, test, and local verification work on an authorized user computer.

The selected architecture is a persistent outbound Desktop Agent connection. The Desktop Agent initiates and maintains an authenticated connection to Iseol Core; Iseol Core never depends on inbound access to the user's machine.

This phase does not add ChatGPT Web automation. It establishes the execution substrate that the later ChatGPT Web Bridge will use.

## 2. Goals

The phase must provide:

- authenticated Desktop Agent presence;
- durable agent identity and capability reporting;
- outbound persistent connection with heartbeat;
- bounded, structured task execution;
- workspace-root path confinement;
- process and Git execution adapters;
- task leases and idempotent job identity;
- structured result/evidence return;
- disconnect -> `WAITING_AGENT` behavior;
- reconnect -> reality inspection -> recovery of the same Run;
- a `HarnessStageExecutor` implementation backed by the Desktop Agent.

The existing Run Supervisor, state machine, checkpoint store, side-effect ledger, Project Model, Discord, and Web surfaces remain authoritative and are extended rather than replaced.
## 3. Non-goals

This phase deliberately does not implement:

- ChatGPT Web conversation launch/resume;
- browser tab/session automation;
- AI prompt compilation or model reasoning;
- Idea Lab idea generation;
- unrestricted arbitrary shell execution;
- production deployment-provider adapters beyond existing Harness contracts;
- remote desktop streaming or GUI automation.

Those are separate phases. The first production target is a reliable local execution bridge for common repository work.

## 4. Component topology

```text
Discord / Iseol Web
        |
        v
Iseol Core
  |- Run Supervisor
  |- Recovery Manager
  |- Agent Registry
  |- Job Store / Queue
  |- Lease Manager
  `- DesktopExecutor
        |
        | authenticated outbound WebSocket
        v
Iseol Desktop Agent
  |- Connection Manager
  |- Workspace Guard
  |- Task Executor
  |- Process Adapter
  |- Git Adapter
  `- Evidence Collector
        |
        v
Authorized local repositories
```

Iseol Core owns Run state, job identity, leases, policy association, and completion decisions. The Desktop Agent owns only execution of an accepted task pack and never becomes a second source of Run truth.
## 5. Agent identity and authentication

Each Desktop Agent has a stable `agentId` generated at enrollment and persisted locally. A connection advertises:

```text
agentId
protocolVersion
agentVersion
os
hostnameLabel
capabilities
workspaceRoots
connectedAt
```

Authentication uses an enrollment secret or derived agent credential configured outside Run evidence. Raw credentials must never be written into Harness checkpoints, Project History, task results, or logs.

The first implementation may use a shared server-side token plus stable `agentId`, but the protocol is versioned so per-agent credentials can replace it without changing task semantics.

Connection acceptance fails closed when:

- protocol version is unsupported;
- authentication is absent or invalid;
- `agentId` is malformed;
- no authorized workspace root is declared;
- required capabilities are unknown.

An authenticated socket registers presence; disconnect immediately marks that connection unavailable without deleting durable job or Run state.

## 6. Presence and heartbeat

The agent sends heartbeat frames periodically. Iseol Core records only operational presence metadata such as last-seen time, connection generation, and capabilities.

Presence states are:

```text
OFFLINE
ONLINE
STALE
```

`STALE` means a connection exists or recently existed but its heartbeat deadline has expired. A stale agent is never selected for new work.

A Run needing desktop work receives `waiting-agent` when no eligible online agent can execute its target workspace. Supervisor then persists `WAITING_AGENT` through the existing state machine.
## 7. Task Pack contract

Iseol Core never sends an unstructured instruction such as "run whatever command is needed". It sends a versioned `DesktopTaskPack`:

```text
version
jobId
runId
stage
attempt
agentId
workspaceRoot
policyDigest
policySources[]
idempotencyKey
leaseUntil
operations[]
```

`jobId` is durable execution identity. `idempotencyKey` identifies the intended side effect or repeatable work unit across reconnect/retry.

`policyDigest` must equal the effective Harness policy digest stored on the Run. `policySources` carries the Run preflight source paths/kinds and SHA-256 digests, not secret-bearing raw credentials.

Before any mutating operation, Core verifies that the Run is still preflight-ready and that the task pack was compiled from that exact policy snapshot. The Agent then re-reads and hashes every policy source that is locally addressable, including the target repository harness/AGENTS files, and rejects a mismatch before execution. A source that is declared mandatory but cannot be re-read fails closed.

The task pack contains only the minimum execution instructions required for one bounded stage action. Large multi-stage plans are never delegated as one opaque desktop job.

## 8. Initial operation vocabulary

The first protocol supports a deliberately small operation set:

```text
READ_FILE
LIST_DIRECTORY
APPLY_PATCH
RUN_PROCESS
GIT_STATUS
GIT_DIFF
GIT_BRANCH
GIT_INSPECT
GIT_COMMIT
CHECK_HTTP
```

Each operation is schema-validated before execution. Unknown operation kinds fail before side effects.

`RUN_PROCESS` contains structured `cwd`, executable, argument list, timeout, and optional non-secret environment overrides. It is not a raw shell script field.

The agent may internally use OS process APIs or a shell adapter where required, but the remote contract stays structured and auditable.
## 9. Workspace guard

Every filesystem, process, and Git operation passes through a local Workspace Guard before execution.

A task's `workspaceRoot` must resolve inside one of the agent's configured authorized roots. Every operation path and `cwd` is then resolved relative to that accepted workspace and checked again after normalization.

The guard rejects:

- path traversal outside the accepted workspace;
- absolute paths outside configured roots;
- symlink/junction escape when the resolved real path leaves the root;
- direct access to known credential locations such as `.ssh` outside the project;
- malformed or empty target roots.

The Core cannot override this guard merely by sending a task. Local authorization is an independent safety boundary.

Git commands are also scoped to the accepted repository. Destructive repository operations such as forced reset, branch deletion, or clean with deletion are not included in the first operation vocabulary.

## 10. Process execution boundary

`RUN_PROCESS` executes one structured program invocation with:

- normalized working directory;
- executable name/path;
- explicit argument array;
- timeout;
- bounded stdout/stderr capture;
- exit code and termination reason.

The initial implementation rejects shell-control operators embedded as executable semantics and does not expose arbitrary command concatenation.

Long output is stored or truncated according to configured limits; evidence carries a summary plus a reference/digest rather than unbounded raw logs.

Process timeout produces a structured retryable result unless stage policy says otherwise. Agent loss while a process is running produces an indeterminate job that must be reconciled on reconnect rather than blindly replayed.
## 11. Job store and leases

Desktop jobs are durable Core records, separate from transient WebSocket messages.

A job records at minimum:

```text
version
jobId
runId
stage
agentId
idempotencyKey
status
attempt
createdAt
leaseOwner
leaseUntil
startedAt
completedAt
resultSummary
```

Job status is one of `QUEUED`, `LEASED`, `RUNNING`, `SUCCEEDED`, `FAILED_RETRYABLE`, `FAILED_FINAL`, or `INDETERMINATE`.

A lease prevents two connections or reconnect generations from executing the same job concurrently. Lease acquisition is atomic in the Core job store.

A reconnect may reclaim an expired/incomplete lease only after reality inspection. A still-valid lease owned by another active connection is never stolen.

Completed jobs are immutable execution receipts. Repeated dispatch of the same idempotency key returns/reuses the completed receipt instead of executing the operation again.

## 12. Result and evidence contract

The Desktop Agent returns a versioned result containing:

```text
jobId
runId
stage
status
startedAt
finishedAt
operationResults[]
workspaceSnapshot
```

Operation results include bounded stdout/stderr summaries, exit status, changed-file information where applicable, and Git identity information for Git operations.

The Core translates accepted results into existing `HarnessEvidenceRecord` values. The agent does not decide that a stage or Run is complete.

Secrets, full environment dumps, authentication headers, and raw agent credentials are never accepted as evidence.
## 13. DesktopExecutor mapping

`DesktopExecutor` implements the existing `HarnessStageExecutor` interface. It does not introduce a second Supervisor.

Execution flow:

```text
Supervisor calls DesktopExecutor.execute(run)
  -> resolve eligible agent for run.request.targetRoot
  -> no agent: waiting-agent
  -> compile bounded task pack for current stage
  -> reserve/reuse durable job
  -> dispatch leased job
  -> accept validated result
  -> convert result to Harness evidence
  -> return completed / retryable / final result
```

The first implementation supports only stages whose desktop behavior is deterministic without ChatGPT reasoning. Reasoning-heavy stages may return `waiting-external` until the later ChatGPT Web Bridge supplies a stage plan/task pack.

This keeps the phase honest: Desktop Agent executes structured work; it does not invent development decisions.

## 14. Stage ownership before ChatGPT Web Bridge

Desktop-backed work can immediately cover deterministic activities such as repository inspection, configured tests/builds, Git status/diff, commits with already-authorized messages, and HTTP verification.

`ANALYZE`, `PLAN`, and open-ended `IMPLEMENT` are not autonomously synthesized by the Desktop Agent in this phase.

The later ChatGPT Web Bridge will produce bounded execution intents that DesktopExecutor translates into task packs.
## 15. Disconnect and reconnect recovery

Agent disconnect is a recoverable condition, not a Run failure.

When heartbeat/presence is lost during required desktop work:

1. stop assigning new jobs to that connection;
2. mark any leased/running job without a terminal receipt as `INDETERMINATE` when its lease expires or disconnect proves ownership loss;
3. return or transition the Run to `WAITING_AGENT`;
4. preserve job identity, Run checkpoints, and prior evidence.

On reconnect:

1. register a new connection generation for the same `agentId`;
2. find eligible `WAITING_AGENT` Runs and incomplete jobs;
3. inspect repository/process/Git reality through read-only operations;
4. reconcile completed effects into receipts/evidence;
5. reclaim only expired or safely recoverable jobs;
6. invoke existing Run recovery and resume the same Run.

Recovery never creates a replacement Run for a mere agent interruption.

## 16. Git reconciliation

Git reality inspection reports at minimum repository root, branch, HEAD commit, working-tree status, and relevant recent commit identity.

For a COMMIT job, the idempotency key is tied to the Run/stage/intended commit operation. If the agent disconnects after `git commit` succeeds but before the result reaches Core, reconnect inspection checks whether the intended commit already exists before any retry.
If the commit is present and corresponds to the intended operation, the job is reconciled as success and the existing commit becomes evidence. It is never blindly committed again.

Existing PR/deployment reconciliation remains owned by the current Harness side-effect ledger/recovery layer; the Desktop Bridge does not duplicate those provider-specific responsibilities.

## 17. Transport protocol

The selected transport is WebSocket initiated by the Desktop Agent to Iseol Core.

The first production bootstrap binds Core to loopback only. Public Internet access is expected to terminate TLS at a reverse proxy and forward to the loopback WebSocket server; the Agent rejects non-loopback `ws://` endpoints and requires `wss://` for public connections. A direct public plain-WebSocket bind is rejected.

Core-to-agent message families are:

```text
hello-accepted
job-offer
job-cancel
ping
```

Agent-to-core message families are:

```text
hello
heartbeat
job-accepted
job-started
job-result
job-failed
pong
```

Every message carries a protocol version and correlation identity. Unknown message versions/types fail closed.

The transport layer only moves validated domain messages. Job state transitions are persisted before or immediately around delivery so socket loss cannot erase ownership history.

The first implementation uses one active connection per `agentId`; a newer authenticated generation supersedes a stale disconnected generation, but not an actively leased healthy connection.
## 18. Core persistence boundaries

The bridge introduces three durable Core records:

- agent enrollment/registry metadata;
- desktop job records and leases;
- optional compact connection/recovery events.

Transient WebSocket objects, process handles, and heartbeat timers are never treated as durable truth.

The existing Harness Run store remains the authoritative execution state. Project History receives meaningful Run outcomes through existing evidence/history paths rather than storing low-level heartbeat noise.

## 19. Desktop Agent local state

The agent persists only what is required to reconnect safely:

```text
agentId
protocolVersion
authorized workspace roots
server endpoint
enrollment credential reference
last accepted job identity where useful
```

Credentials should use OS-protected storage when available; plaintext credential storage is not a long-term target.

The agent starts automatically only when the user configures that behavior. Reconnect uses bounded exponential backoff with jitter and never spins aggressively while the Core is unavailable.

## 20. Failure classification

Failures map to existing Harness meanings:

- no eligible online agent -> `waiting-agent`;
- temporary transport/process failure -> `retryable-failure`;
- unsupported protocol/capability -> `final-failure` for that task until configuration changes;
- unauthorized workspace/policy mismatch -> `blocked-user` or final configuration failure, never silent override;
- external service wait -> `waiting-external`.
## 21. Repository layout

The first implementation stays in the current Iseol repository:

```text
src/desktop-agent/
  contracts.ts
  agent-registry.ts
  job-store.ts
  workspace-guard.ts
  runtime.ts
  transport.ts
  ws-server.ts
  ws-client.ts
  desktop-executor.ts
  reality-inspector.ts
  core-service.ts
  agent-service.ts
  main.ts
```

The Core and Agent share only versioned protocol contracts. Agent runtime modules must not import Run-store mutation functions or Project Model write logic.

The initial transport implementation may add the maintained `ws` package because Node's built-in client capability does not provide the required server abstraction. Dependency scope is limited to transport; domain logic remains independently testable.

The agent is initially launched through explicit npm scripts for development/testing. OS service/auto-start installers are deferred until the protocol and recovery behavior are proven stable.
## 22. Security and authorization invariants

The following rules are mandatory:

- Core authentication never disables local Workspace Guard checks.
- Task packs cannot grant themselves new workspace roots.
- A Run policy digest mismatch blocks execution before mutation.
- Unknown protocol or operation versions fail closed.
- Secret values are never copied into evidence/history.
- Raw environment enumeration is not an operation.
- Destructive filesystem primitives are absent from the initial protocol.
- Git force/reset/clean/delete-branch operations are absent initially.
- Job retries are bounded and lease-protected.
- A reconnect never assumes an indeterminate side effect failed; it inspects reality first.

The agent trusts only authenticated Core messages that also satisfy local capability and path policy.

## 23. Testing strategy

Testing is layered before live E2E:

1. protocol contract/schema tests;
2. workspace path/realpath escape tests;
3. agent registry and heartbeat tests;
4. atomic job/lease/idempotency tests;
5. process adapter timeout/output tests using harmless commands;
6. Git adapter tests in temporary repositories;
7. fake WebSocket transport tests;
8. DesktopExecutor -> Supervisor integration tests;
9. disconnect/reconnect recovery tests;
10. live local loopback Core + Agent smoke test in a temporary repository.

Production repositories are not used for the first live execution tests.
## 24. Required recovery scenarios

The test suite must explicitly prove:

- agent offline before dispatch -> Run waits without creating duplicate jobs;
- disconnect after job lease but before start -> expired lease can be safely reclaimed;
- disconnect during a harmless process -> job becomes indeterminate and is reconciled before retry;
- disconnect after Git commit but before receipt -> existing commit is detected and reused;
- reconnect of the same agent resumes the same Run;
- a second connection cannot concurrently execute a live leased job;
- stale connection generations cannot submit a late result that overwrites a newer terminal receipt.

## 25. Observability

Core logs and status views may expose:

- agent online/offline/stale state;
- last seen time;
- capabilities;
- current Run/job/stage IDs;
- lease status;
- operation summaries and exit state.

They must not expose enrollment tokens, arbitrary environment content, or unbounded command output.

Discord should receive concise agent/run availability notifications. Detailed job traces belong in Web/Run artifacts rather than chat spam.

## 26. Compatibility

Existing bot, Web Control Plane, Project Model, and Harness tests must remain green. Desktop Bridge is additive.

Runs not configured to use a Desktop Agent retain existing fake/test executor behavior. This lets migration proceed incrementally and keeps deterministic tests independent of live machines.
## 27. Implementation sequence

The implementation order is:

1. protocol/task/result contracts;
2. agent registry and heartbeat presence;
3. durable job store and leases;
4. local Workspace Guard;
5. process and Git adapters;
6. operation executor and evidence normalization;
7. WebSocket Core/Agent transport;
8. DesktopExecutor integration with Supervisor;
9. reconnect reality inspector and recovery reconciliation;
10. local Core+Agent smoke/E2E and hardening.

Each unit is developed in an isolated worktree with TDD and English Conventional Commit messages.

## 28. Phase completion criteria

The Desktop Execution Bridge phase is complete when all of the following are proven:

- an authenticated agent can connect outbound and appear online;
- an unauthorized or stale agent cannot receive new work;
- a task outside authorized workspace roots is rejected locally;
- a structured process/test operation runs in a temporary repository and returns evidence;
- structured Git inspection works and commit recovery prevents duplicate commits;
- Supervisor returns `WAITING_AGENT` when the required agent is unavailable;
- disconnect/reconnect resumes the same durable Run after reality reconciliation;
- duplicate/concurrent execution is prevented by job identity and leases;
- all prior project tests remain green;
- live loopback E2E succeeds without touching a production repository.

## 29. Next phase boundary

After this phase, the ChatGPT Web Bridge can safely produce reasoning and bounded execution intents while Iseol Core owns durable orchestration and Desktop Agent performs the physical repository work.

That next phase must reuse this task protocol rather than bypass it with direct unrestricted shell or filesystem access.

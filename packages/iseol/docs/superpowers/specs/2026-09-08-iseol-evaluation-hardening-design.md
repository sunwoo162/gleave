# Iseol Evaluation and Hardening Design

> Date: 2026-09-08
> Status: approved design, pending implementation plan
> Parent architecture: `docs/superpowers/specs/2026-09-07-iseol-product-architecture-design.md`

## 1. Purpose

Evaluation and Hardening is the final architecture phase for proving that Iseol is not only functionally correct, but remains correct under interruption, duplication, partial failure, long-running execution, and hostile inputs.

This phase does not create a replacement execution engine. It evaluates the existing Iseol Core, Harness Run Supervisor, ChatGPT Web Bridge, Desktop Agent, Project Model, Idea Lab, and provider adapters by running normal durable Runs through controlled fault boundaries.

The primary output is a durable evaluation record with structured metrics, invariant results, and reproducible scenario evidence.

## 2. Goals

- deterministically inject controlled failures at known execution boundaries;
- measure recovery success instead of relying on anecdotal test outcomes;
- prove duplicate external side effects remain zero after interruption;
- prove workspace, policy, credential, and authorization boundaries fail closed;
- expose retry exhaustion and unreconciled indeterminate work explicitly;
- detect long-running resource leaks, stale leases, orphan processes, and stale sessions;
- preserve provider lifecycle timestamps separately from Iseol recording time;
- produce quick deterministic merge-gate evaluation and longer soak evaluation;
- keep evaluation noise separate from normal Project History.
## 3. Non-goals

- replacing existing unit/integration tests;
- using production repositories or irreversible provider actions for chaos testing;
- introducing a second Run state machine;
- introducing unrestricted shell or arbitrary browser automation for testing;
- deploying a full observability platform such as Prometheus/OpenTelemetry in this phase;
- estimating provider/model cost when the provider does not expose reliable usage data;
- weakening human-intervention, credential, deployment, or workspace safety rules for evaluation convenience.

## 4. High-level topology

```text
Evaluation Runner
      |
      v
Evaluation Scenario + Seed
      |
      v
Normal Iseol Run / Campaign
      |
      +--> Fault Injection Boundary
      |       |- ChatGPT Web adapter
      |       |- Desktop transport/runtime
      |       |- GitHub/provider adapter
      |       `- Deploy adapter
      |
      v
Existing durable Run / Job / Effect stores
      |
      v
Evaluation Reducer
      |
      v
Evaluation Report + Invariant Results
```
## 5. Core design principle

The Evaluation Harness observes and perturbs the normal system; it never owns product truth.

- Harness Run store remains authoritative for development Run state.
- Desktop Job/lease store remains authoritative for Desktop execution state.
- Project Model remains authoritative for project/tree/history state.
- Idea Lab stores remain authoritative for Campaign/Production state.
- Provider side-effect ledger remains authoritative for idempotent external effects.
- Evaluation stores only evaluation identity, injected faults, snapshots, metrics, invariant results, and report summaries.

An evaluation failure must not silently mutate product state to make the benchmark pass.

## 6. Versioned evaluation contracts

Introduce `ISEOL_EVALUATION_VERSION = 1` and strict version validation.

Primary contracts:

```text
EvaluationSuite
EvaluationScenario
EvaluationRun
InjectedFault
EvaluationObservation
EvaluationMetrics
InvariantResult
EvaluationReport
```

Unknown contract versions fail before starting a target Run or injecting any fault.
## 7. EvaluationSuite

An `EvaluationSuite` defines a named deterministic collection of scenarios.

```text
version
suiteId
name
mode: quick | soak
scenarioIds[]
defaultSeed
createdAt
```

`quick` is deterministic and intended for routine merge-gate use. `soak` is longer-running and intended for repeated recovery/race/resource validation.

The suite never contains credentials, provider tokens, raw browser state, or unrestricted commands.

## 8. EvaluationScenario

A scenario defines what normal work is executed, where faults may occur, and what must remain true.

```text
version
scenarioId
category
name
targetMode
maxDurationMs
faultPlan[]
expectedInvariants[]
requiredCapabilities[]
```

`targetMode` is either `project-workspace` or `idea-lab`. A scenario may use a synthetic temporary project or Campaign, but must still execute through the production Harness boundaries being evaluated.
## 9. Deterministic fault plan

Fault injection is seed-driven and replayable. Random behavior without a recorded seed is not accepted as evaluation evidence.

Each `InjectedFault` identifies a semantic execution point:

```text
faultId
scenarioId
seed
boundary
point
occurrence
action
injectedAt
```

Examples:

```text
boundary: desktop
point: after-side-effect-before-receipt
action: disconnect

boundary: chatgpt-web
point: after-prompt-before-result
action: lose-session

boundary: deploy
point: after-provider-success-before-core-receipt
action: drop-response
```

A scenario must record the exact seed and fault plan so a failed evaluation can be replayed without guessing timing.
## 10. Fault injection boundaries

Faults are injected only through typed adapter boundaries or explicit test hooks. Evaluation code must not patch arbitrary production functions at runtime.

Supported initial boundaries:

- Harness stage executor result boundary;
- ChatGPT Web browser/worker adapter boundary;
- Desktop transport send/receive/session boundary;
- Desktop process/result boundary;
- Git commit result boundary;
- GitHub/provider adapter response boundary;
- CI status/provider polling boundary;
- preview deployment adapter boundary;
- Core checkpoint/restart boundary;
- Idea Lab proposal/production advancement boundary.

Production behavior is unchanged when no fault injector is installed.

## 11. Fault actions

Initial bounded actions:

```text
drop-response
disconnect
lose-session
return-retryable
return-final-failure
return-permission-denied
return-rate-limit
return-timeout
restart-core
stale-late-result
corrupt-transient-copy
```

`corrupt-transient-copy` may only target disposable evaluation-owned transient artifacts, never canonical Run evidence or user files.
## 12. EvaluationRun lifecycle

An `EvaluationRun` represents one scenario execution and references the real target Run/Campaign it evaluated.

```text
version
evaluationId
suiteId
scenarioId
seed
targetRunId?
targetCampaignId?
status
startedAt
completedAt?
injectedFaults[]
metrics
invariants[]
summary
```

Status values:

```text
queued
running
passed
failed
blocked-external
cancelled
```

`blocked-external` is used when a scenario genuinely requires unavailable live authorization/capability. It is never converted to `passed`.

## 13. Durable evaluation persistence

Evaluation state lives under a separate evaluation root and must not pollute Project History or normal Harness Run event streams.

Mutable evaluation records use atomic JSON replacement. Scenario observations and fault events are append-oriented. Completed reports are immutable by evaluation identity.
## 14. Metrics model

Metrics are derived from durable Run/job/effect/evaluation observations, not conversational prose.

Initial metrics:

```text
completionRate
recoverySuccessRate
humanInterventionCount
duplicateSideEffectCount
unexpectedMutationCount
verificationPassRate
recoveryLatencyMs
runDurationMs
stageRetryCount
staleSessionResultCount
providerCallCount
toolInvocationCount
```

Optional usage fields such as model/provider cost are recorded only when the source exposes reliable measurements. Otherwise the field is omitted or explicitly `unknown`.

## 15. Duplicate side-effect accounting

Duplicate side effects are evaluated independently for:

- Git commits;
- pull requests;
- merges;
- deployments;
- provider notifications/actions where a stable semantic key exists.

The hardening gate requires duplicate commit, PR, merge, and deployment counts to remain zero.
## 16. Global invariants

Every deterministic recovery scenario evaluates these invariants when applicable:

```text
same canonical Run ID retained
same canonical Desktop job identity retained
same canonical Idea Lab production retained
duplicate commit count = 0
duplicate PR count = 0
duplicate deployment count = 0
workspace-outside mutation count = 0
secret leakage count = 0
policy-bypass mutation count = 0
unverified completion count = 0
```

A single security invariant violation fails the evaluation even if the target Run eventually reaches `DONE`.

## 17. Recovery correctness

Recovery success means more than "the Run continued".

For a recovery to pass:

1. external reality is inspected before replay;
2. completed effects are reconciled instead of repeated;
3. durable identity remains stable;
4. stale generation/session results cannot overwrite newer terminal state;
5. the Run reaches a valid terminal/waiting state under its configured evidence gates;
6. no hidden mutation occurred outside the authorized workspace/policy snapshot.
## 18. Required Desktop scenarios

Initial Desktop scenarios:

- agent offline before dispatch -> `WAITING_AGENT`, no job duplication;
- disconnect after lease before start -> safe reclaim only after lease/reality rules permit;
- disconnect during harmless process -> indeterminate/reconcile before replay;
- commit succeeds before result receipt -> existing commit reconciled, no second commit;
- stale connection sends a late result -> late result rejected;
- heartbeat/presence storage transient failure -> bounded retry, no false healthy session;
- workspace parent traversal -> rejected before mutation;
- symlink/junction escape -> rejected before mutation;
- unsupported destructive Git operation -> rejected by protocol;
- process timeout -> bounded retry/final classification without orphan process leakage.

## 19. Required ChatGPT Web scenarios

- browser/session loss after prompt submission;
- new generation recovers the same Run from durable context;
- old generation result arrives late and is discarded;
- malformed structured output consumes bounded rejection budget;
- repeated invalid intent exhausts bounded retry without Desktop mutation;
- Harness policy changes after prompt compilation -> output rejected before mutation;
- browser driver unavailable -> explicit external blocker/fail-closed;
- credential-shaped browser data never enters durable reasoning/evidence records.
## 20. Required provider and CI scenarios

Initial provider scenarios:

- pull request created successfully but response is lost;
- repeated PR request resolves to the existing semantic effect;
- CI reports failure and the Run does not advance as successful;
- CI remains pending until configured timeout/wait policy;
- provider returns permission denied -> protected blocker, no retry storm;
- provider returns rate limit -> bounded wait/retry behavior;
- deployment succeeds but response is lost -> reconcile same deployment;
- deployment points to the wrong commit -> verification fails;
- production verification times out -> Run cannot claim completion;
- duplicate provider callback/event delivery -> append/idempotency rules prevent duplicate history/effects.

Live provider scenarios require explicit test repositories/accounts and authorization. Fake adapters remain the default deterministic evaluation surface.

## 21. Required Core restart scenarios

Core restart evaluation occurs only at durable boundaries or explicitly modeled indeterminate points.

Required restart points:

- immediately after stage checkpoint;
- after side-effect reservation before provider call;
- after provider success before receipt completion;
- after Desktop mutation before result receipt;
- while waiting for ChatGPT Web generation recovery;
- during Idea Lab Campaign production advancement.

After restart, recovery must derive behavior from persisted state plus inspected external reality, never from in-memory assumptions.
## 22. Required Idea Lab scenarios

- duplicate proposal storm consumes bounded proposal budget;
- candidate final failure triggers replenishment without replacing successful canonical Runs;
- Desktop Agent loss during candidate implementation preserves the same production/Run identity;
- preview deployment response loss reconciles without duplicate deployment;
- Campaign supervisor restart resumes stored productions;
- blocked external authorization stops Campaign honestly;
- promotion imports only the selected candidate's exact origin and Run history.

## 23. Security hardening scenarios

Security scenarios are deterministic negative tests and are merge-gate critical.

Required cases:

- path traversal outside workspace;
- symlink/junction realpath escape;
- raw shell/command field injection;
- destructive Git operation request;
- stale/changed Harness policy source;
- missing mandatory Harness source;
- secret/token/cookie/password-shaped evidence;
- unauthorized public control-plane mutation;
- malformed/unknown contract version;
- task/result identity mismatch;
- stale browser/agent generation attempting to overwrite newer state.

No evaluation configuration may disable the underlying local Workspace Guard or Harness policy verification.
## 24. Provider lifecycle timestamp semantics

Iseol recording time and provider occurrence time are separate concepts and must never be conflated.

Required provider timestamps where available:

```text
commit.committedAt
pullRequest.openedAt
pullRequest.mergedAt
pullRequest.closedAt
deployment.deployedAt
deployment.verifiedAt
```

Project History may also retain its own `recordedAt`, but `recordedAt` must not overwrite or masquerade as the provider lifecycle timestamp.

Evaluation must include delayed-ingestion scenarios where the provider action occurred earlier than Iseol recorded it. The report fails if the rendered/history model loses the original provider time.

If a provider does not expose a lifecycle time, the field remains absent/unknown rather than being fabricated from ingestion time.

## 25. Project Tree and History hardening

Evaluation verifies that GitHub commit and PR lineage can be rendered with both identity and occurrence time.

A delayed or retried history write must remain idempotent and must preserve the original provider lifecycle timestamps for the same semantic event.
## 26. Quick evaluation runner

Add a deterministic CLI entrypoint intended for routine development/merge gates:

```text
npm run eval:quick
```

Properties:

- uses temporary repositories/workspaces and fake providers by default;
- executes a bounded catalog of high-value recovery and security scenarios;
- uses fixed scenario seeds committed with the suite;
- exits non-zero on any failed invariant or unexpected blocker;
- emits a durable JSON report and concise terminal summary;
- does not require production credentials.

A scenario that explicitly requires unavailable live capability is excluded from the deterministic quick pass and represented separately in live-smoke status.

## 27. Soak evaluation runner

Add a longer-running runner:

```text
npm run eval:soak
```

The soak runner repeats deterministic scenario families across multiple seeds and controlled interruption schedules. It may run dozens or hundreds of sandbox Runs, but it must remain bounded by configured iteration/time budgets.
## 28. Soak resource observations

Soak evaluation records resource/state observations before, during, and after execution where locally observable:

```text
active WebSocket sessions
Desktop job count
active/expired leases
indeterminate jobs
open child processes
orphan evaluation-owned processes
temporary file count
Run/event store growth
process memory usage
```

The first implementation does not promise machine-wide leak accounting. It measures evaluation-owned/Iseol-owned resources that can be attributed safely.

Soak completion requires:

- orphan evaluation-owned child processes = 0;
- live expired leases = 0;
- unreconciled indeterminate mutating jobs = 0;
- stale sessions presented as healthy = 0;
- evaluation temporary artifacts either removed or explicitly retained as failed-scenario evidence.

## 29. Reproducibility

Every failed quick/soak scenario prints and stores:

```text
suiteId
scenarioId
evaluationId
seed
targetRunId / targetCampaignId
fault point
last durable checkpoint
failed invariant
```

This tuple must be sufficient to replay the deterministic scenario locally.
## 30. Evaluation report

JSON is the durable source of truth. The report contains aggregate metrics plus per-scenario results.

Example human-readable summary:

```text
Evaluation eval-17
Runs                    100
Completed                98
Recovered               41/42
Human blocks               3
Duplicate commits          0
Duplicate PRs              0
Duplicate deployments      0
Security violations        0
Recovery p50            420ms
Recovery p95           1800ms
```

Failed scenarios include the reproducibility tuple and bounded failure summary. Raw credentials, environment dumps, browser cookies, and unbounded logs are excluded.

## 31. Web visibility

The existing Iseol Web may expose a read-only Evaluation section backed by the separate evaluation store.

Initial view:

- latest quick/soak status;
- pass/fail/blocked counts;
- key duplicate/security invariants;
- recovery latency summary;
- failed scenario identifiers and replay seed;
- live-smoke blockers.

Evaluation controls that trigger long soak runs remain local/authorized operations in the first implementation rather than unauthenticated public actions.
## 32. Evaluation events and observability

Evaluation-specific event types may include:

```text
evaluation-started
fault-injected
recovery-observed
invariant-violated
scenario-completed
evaluation-completed
```

These events live in the evaluation store and are not appended to normal Project History unless a real product Run independently records its own normal event.

The evaluator may read existing Harness/Job/provider evidence but must not rewrite it to simplify reporting.

## 33. Live smoke policy

Live smoke is separate from deterministic evaluation.

Current known live blockers:

- no authenticated production `ChatGptBrowserDriver` is bundled/configured;
- no real Idea Lab preview deployment provider adapter/authorization is configured.

A live scenario requiring either capability reports `blocked-external`. It must never use a fake result and label that result live success.

When live capability becomes available, smoke uses dedicated test repositories/accounts and non-destructive preview surfaces before any production target.
## 34. Proposed repository layout

```text
src/evaluation/
  contracts.ts
  suite-store.ts
  evaluation-store.ts
  observation-store.ts
  fault-injector.ts
  scenario-runner.ts
  metrics-reducer.ts
  invariant-evaluator.ts
  quick-runner.ts
  soak-runner.ts
  report.ts
  test-support/

tests/
  evaluation-contracts.test.ts
  evaluation-fault-injector.test.ts
  evaluation-metrics.test.ts
  evaluation-recovery.test.ts
  evaluation-security.test.ts
  evaluation-timestamps.test.ts
  evaluation-soak.test.ts
```

The module may import existing domain readers/adapters but must not become a second owner of Run or Project state.

## 35. Compatibility

All existing `npm test` behavior remains valid. Evaluation commands are additive.

Existing fake/test Harness executors remain usable. Existing Discord/Web/Project Model/Idea Lab behavior must remain green when no evaluator is active.
## 36. Known hardening risk hypotheses

These are hypotheses to test, not assumed bugs:

- Harness side-effect receipt replacement uses atomic rename and may need the same bounded Windows transient retry discipline already proven necessary for Desktop presence files;
- simultaneous recovery/supervisor attempts may expose store-level races even when each individual transition is valid;
- append-only event/history writes must remain idempotent under duplicated provider delivery;
- repeated WebSocket reconnects may leave stale session/job observations if cleanup ownership is incomplete;
- long-running evaluation may expose temporary-file retention not visible in short E2E tests;
- provider lifecycle occurrence timestamps may currently be unavailable in some Project History records and require additive schema/model support.

Each hypothesis must first receive a deterministic failing evaluation/regression test before production behavior is changed.

## 37. Concurrent recovery policy

Evaluation includes two callers attempting to recover/resume the same Run.

The accepted result must preserve one canonical state progression and must not duplicate side effects. If the current store cannot provide that guarantee, hardening may add a bounded Run-level coordination primitive, but it must not create an independent state machine.

Late writes from an older recovery attempt must not overwrite newer terminal/checkpoint state.

## 38. Hardening fix discipline

When evaluation discovers a defect:

1. retain the scenario seed/fault point;
2. reduce it to the smallest deterministic regression test possible;
3. confirm RED without changing production behavior;
4. implement the minimum fix;
5. run the focused scenario repeatedly;
6. rerun `eval:quick`, full tests, build, and relevant soak family;
7. preserve the regression permanently.
## 39. Implementation order

1. versioned evaluation contracts and durable stores;
2. deterministic fault injector and replay identity;
3. metrics reducer and invariant evaluator;
4. Desktop/ChatGPT Web recovery scenario catalog;
5. provider/CI/deploy failure scenarios;
6. Project History provider lifecycle timestamp model and tests;
7. quick evaluation runner and report;
8. soak runner and resource observations;
9. concurrent recovery/race scenarios and defect fixes;
10. additive Web evaluation summary and controlled live-smoke status.

Implementation uses isolated git worktrees and TDD. Every new implementation task re-reads the effective Harness policy before mutation.

## 40. Quick-gate success criteria

`npm run eval:quick` passes only when all deterministic required scenarios satisfy their invariants.

Hard failures include:

```text
duplicate commit > 0
duplicate PR > 0
duplicate merge > 0
duplicate deployment > 0
workspace escape mutation > 0
secret leak > 0
policy-bypass mutation > 0
unverified completion > 0
unreconciled canonical identity conflict > 0
```

Expected external blockers belonging only to live scenarios do not convert deterministic quick evaluation to success or failure; they are reported separately.
## 41. Soak-gate success criteria

A configured soak run succeeds only when:

- all scenario iterations terminate within configured budgets;
- recovery success meets the suite's explicit threshold;
- duplicate/security invariant counts remain zero;
- orphan evaluation-owned processes are zero at shutdown;
- live expired leases are zero;
- unreconciled indeterminate mutating jobs are zero;
- stale sessions are not reported as healthy;
- report generation succeeds from durable observations after the runner process exits/restarts.

The initial threshold for deterministic safety invariants is absolute zero violations, not a percentage target.

## 42. Phase completion criteria

Evaluation / Hardening is complete when:

- `eval:quick` exists and passes its committed deterministic catalog;
- representative Desktop, ChatGPT Web, provider, Core restart, Idea Lab, and security faults are covered;
- duplicate commit/PR/deployment recovery is explicitly proven;
- provider lifecycle timestamps are preserved independently from `recordedAt` where provider data exists;
- a bounded soak run completes with no attributable orphan/lease/indeterminate mutation leak;
- all discovered defects have permanent regression coverage;
- full repository tests pass;
- TypeScript build passes;
- `git diff --check` passes;
- live browser/deployment availability is reported honestly without fake success.

## 43. Next boundary after hardening

After this phase, new autonomous capabilities should be admitted only with corresponding deterministic recovery/security scenarios or an explicit reason why the capability cannot yet be safely evaluated.

# Iseol Evaluation and Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a durable, reproducible evaluation harness that injects controlled faults into normal Iseol execution, measures recovery/security invariants, exposes quick and soak gates, and hardens only defects proven by deterministic RED tests.

**Architecture:** Evaluation is a separate observer/runner over the existing Harness, ChatGPT Web, Desktop Agent, Idea Lab, Project Model, and provider boundaries. Product stores remain authoritative; evaluation persists only suite/scenario identity, injected faults, observations, metrics, invariant results, and immutable reports. Faults are seed-driven and injected through typed boundaries, never arbitrary runtime monkey patches.

**Tech Stack:** TypeScript 7, Node.js test runner, existing atomic JSON/JSONL stores, existing Harness/Desktop/Web/Idea Lab fakes, `tsx`, existing Web Control Plane.

**Spec:** `docs/superpowers/specs/2026-09-08-iseol-evaluation-hardening-design.md`

## Global Constraints

- `ISEOL_EVALUATION_VERSION = 1`; unknown versions fail before target Run creation or fault injection.
- Evaluation must never become a second owner of Harness Run, Desktop Job, Project, Idea Lab, or side-effect truth.
- Quick evaluation uses temporary repositories/workspaces and fake providers; no production credentials are required.
- Fault injection is deterministic from committed scenario IDs, seeds, semantic points, and occurrence counts.
- Duplicate commit, PR, merge, and deployment counts must remain zero.
- Workspace escape, secret leakage, policy-bypass mutation, and unverified completion counts must remain zero.
- Live ChatGPT browser and preview deployment scenarios report `blocked-external` when their real adapters/authorization are unavailable.
- Provider occurrence timestamps remain distinct from Iseol `recordedAt` and are never fabricated from ingestion time.
- Existing `npm test`, Discord, Web, Project Model, Harness, ChatGPT Web, Desktop Agent, and Idea Lab behavior remains green when no evaluator is active.

---
## File Structure

- Create `src/evaluation/contracts.ts` for strict versioned suite/scenario/run/observation/metrics/report contracts.
- Create `src/evaluation/store-utils.ts`, `suite-store.ts`, `evaluation-store.ts`, `observation-store.ts`, `report-store.ts` for isolated durable evaluation state.
- Create `src/evaluation/fault-injector.ts` for deterministic semantic fault matching and replay identity.
- Create `src/evaluation/metrics-reducer.ts` and `invariant-evaluator.ts` for evidence-derived metrics and hard failure rules.
- Create `src/evaluation/scenario-runner.ts` and `src/evaluation/scenarios/*` for reusable normal-Iseol evaluation scenarios.
- Create `src/evaluation/quick-runner.ts`, `soak-runner.ts`, `resource-observer.ts`, `report.ts` for CLI gates and summaries.
- Modify `src/project-model/contracts.ts` and history fact builders only if timestamp RED tests prove the additive lifecycle model is required.
- Modify `src/harness/side-effect-ledger.ts` only if deterministic transient-rename RED reproduces the hypothesized defect.
- Modify `src/web-control-plane/contracts.ts`, `view-model.ts`, router/static assets for read-only Evaluation summaries.
- Modify `package.json` to add `eval:quick`, `eval:soak`, and evaluation tests to the normal suite.

### Task 1: Versioned evaluation contracts and isolated durable stores

**Files:**
- Create: `src/evaluation/contracts.ts`, `src/evaluation/store-utils.ts`, `src/evaluation/suite-store.ts`, `src/evaluation/evaluation-store.ts`, `src/evaluation/observation-store.ts`, `src/evaluation/report-store.ts`
- Test: `tests/evaluation-contracts.test.ts`, `tests/evaluation-stores.test.ts`

**Interfaces:**
- Produces `ISEOL_EVALUATION_VERSION`, `EvaluationSuite`, `EvaluationScenario`, `EvaluationRun`, `InjectedFault`, `EvaluationObservation`, `EvaluationMetrics`, `InvariantResult`, `EvaluationReport`.
- Produces `save/load/listEvaluationSuite`, `save/load/listEvaluationRun`, `append/listEvaluationObservation`, `save/loadEvaluationReport`.
- [ ] **Write failing contract tests** for version mismatch, unsafe IDs, invalid status/mode, negative metrics, missing seed, unknown fields, and credential-shaped public fields.

```ts
assert.throws(() => assertEvaluationVersion(2));
assert.throws(() => assertEvaluationId("../escape"));
assert.throws(() => assertEvaluationRun({ ...validRun, status: "done" }));
```

- [ ] **Write failing store tests** proving deterministic listing, missing record `null`, atomic mutable writes, append-only observation order, duplicate observation semantic idempotency, and immutable completed report identity.
- [ ] **Run RED:** `node --import tsx --test tests/evaluation-contracts.test.ts tests/evaluation-stores.test.ts` and confirm production modules are missing.
- [ ] **Implement strict contracts and isolated stores** using the existing bounded atomic JSON/JSONL patterns; evaluation paths must be rooted under the supplied evaluation root and never under Project History.
- [ ] **Run GREEN + build**, register both tests in `npm test`, run the full suite, then commit `feat: persist evaluation hardening state`.

### Task 2: Deterministic fault injector and replay identity

**Files:**
- Create: `src/evaluation/fault-injector.ts`, `src/evaluation/test-support/scripted-fault-boundary.ts`
- Test: `tests/evaluation-fault-injector.test.ts`

**Interfaces:**
- Produces `FaultPoint = { boundary; point; occurrence }`, `FaultPlanEntry`, `EvaluationFaultInjector`.
- Produces `createDeterministicFaultInjector({ scenarioId, seed, plan, recordFault })` with `hit(point): Promise<FaultDecision>`.
- `FaultDecision` is either `{ action: "none" }` or the exact configured bounded fault action and fault ID.
- [ ] **Write failing deterministic replay tests** proving identical `scenarioId + seed + plan` produces the same injected fault sequence and different occurrence counts do not collide.

```ts
const a = createDeterministicFaultInjector(config);
const b = createDeterministicFaultInjector(config);
assert.deepEqual(await replay(a, points), await replay(b, points));
```

- [ ] **Write failing boundary tests** proving unknown boundary/point/action, negative occurrence, unrecorded random fault, and unrestricted callback/code execution are rejected.
- [ ] **Run RED.**
- [ ] **Implement semantic matching only**; no `Math.random()` decisions, arbitrary function patching, shell commands, filesystem paths, or production mutation APIs belong in the injector.
- [ ] **Run GREEN + build; register and commit:** `feat: add deterministic evaluation faults`.

### Task 3: Metrics reducer, invariant evaluator, and immutable report

**Files:**
- Create: `src/evaluation/metrics-reducer.ts`, `src/evaluation/invariant-evaluator.ts`, `src/evaluation/report.ts`
- Test: `tests/evaluation-metrics.test.ts`

**Interfaces:**
- Consumes durable Harness events/evidence, Desktop jobs, side-effect receipts, evaluation observations, and optional provider-call counters.
- Produces `reduceEvaluationMetrics(input): EvaluationMetrics`.
- Produces `evaluateEvaluationInvariants(input): InvariantResult[]` and `buildEvaluationReport(input): EvaluationReport`.

- [ ] **Write failing reducer tests** for completion/recovery rates, human intervention count, retry count, stale-result count, provider/tool counts, run duration, and recovery latency percentiles from explicit observations.
- [ ] **Write failing hard-invariant tests** where a target Run reaches `DONE` but duplicate deployment, workspace escape, secret leakage, policy bypass, or unverified completion is nonzero; report must still fail.
```ts
const report = buildEvaluationReport({
  metrics: { ...zeroMetrics, duplicateSideEffectCount: 1 },
  invariants: evaluateEvaluationInvariants(input),
});
assert.equal(report.status, "failed");
```

- [ ] **Write failing sanitization tests** proving report summaries redact token/cookie/secret/password-shaped values and cap per-scenario diagnostic text.
- [ ] **Run RED.**
- [ ] **Implement pure deterministic reducers** with no live provider calls and no conversational inference; unknown optional cost/usage remains absent or `unknown`.
- [ ] **Run GREEN + build; register and commit:** `feat: evaluate recovery and safety invariants`.

### Task 4: Recovery and security scenario catalog through normal Iseol boundaries

**Files:**
- Create: `src/evaluation/scenario-runner.ts`, `src/evaluation/scenarios/desktop.ts`, `src/evaluation/scenarios/chatgpt-web.ts`, `src/evaluation/scenarios/security.ts`
- Create: `src/evaluation/test-support/evaluation-fixtures.ts`
- Test: `tests/evaluation-recovery.test.ts`, `tests/evaluation-security.test.ts`

**Interfaces:**
- Produces `EvaluationScenarioDefinition` with `scenario`, `execute(context)`, and deterministic expected invariants.
- `runEvaluationScenario(input)` creates one `EvaluationRun`, executes the production Harness/fake-worker/loopback Desktop paths, records observations/faults, reduces metrics, evaluates invariants, and writes an immutable report.

- [ ] **Write failing Desktop scenarios** for offline-before-dispatch, disconnect-after-lease, harmless-process result loss, commit receipt loss, stale late result, process timeout, and heartbeat transient failure.
- [ ] **Write failing ChatGPT Web scenarios** for prompt/session loss, old-generation late result, malformed output budget exhaustion, repeated invalid intent, and policy drift before Desktop mutation.
- [ ] **Write failing security scenarios** for traversal, symlink/junction escape, raw shell field, destructive Git operation, stale/missing harness source, secret-shaped evidence, malformed contract version, and task/result identity mismatch.
- [ ] **Run RED** against the new catalog while preserving all existing Harness/Desktop/Web tests.
- [ ] **Implement only test-support boundary wrappers** around existing typed adapters/transports; production code paths stay unchanged when no evaluator is installed.
- [ ] **Run each recovery scenario three times**, then run focused Desktop/Web/Harness regressions + build.
- [ ] **Commit:** `test: add deterministic recovery evaluation scenarios`.

### Task 5: Provider/CI/deploy evaluation and provider lifecycle timestamps

**Files:**
- Create: `src/evaluation/scenarios/provider.ts`, `tests/evaluation-provider.test.ts`, `tests/evaluation-timestamps.test.ts`
- Modify if RED requires: `src/project-model/contracts.ts`, `src/project-model/history-store.ts`, Discord/provider fact builders that create GitHub/commit/PR/deploy history events, Web history view contracts.

**Interfaces:**
- Adds optional additive provider lifecycle metadata to `ProjectHistoryEvent`, e.g. `occurredAt?: string` plus typed lifecycle fields when the source supplies them; `at` remains Iseol ingestion/recording time for compatibility.
- Produces provider scenarios for PR response loss/dedupe, CI fail/pending/timeout, permission denied, rate limit, deploy response loss, wrong-commit verification, and duplicate callbacks.

- [ ] **Write failing delayed-ingestion timestamp tests** where provider `openedAt`/`committedAt` precedes Iseol recording time and round-trip/rendering preserves both values exactly.
- [ ] **Write failing idempotency tests** proving retrying the same semantic history event with the same provider occurrence time is deduped, while conflicting lifecycle identity is rejected.
- [ ] **Write failing provider scenarios** for lost PR response, repeated PR request, failing/pending CI, permission/rate-limit classification, lost deployment response, wrong commit, verify timeout, and duplicate callbacks.
- [ ] **Run RED.** If existing history cannot preserve occurrence time, implement the smallest additive schema/fact-builder/view change; do not rewrite legacy `at` semantics.
- [ ] **Run GREEN + Project Model/Discord/Web regressions + build; commit:** `feat: preserve provider lifecycle timestamps`.
### Task 6: Quick evaluation runner, committed scenario catalog, and CLI report

**Files:**
- Create: `src/evaluation/quick-runner.ts`, `src/evaluation/scenario-catalog.ts`
- Modify: `package.json`
- Test: `tests/evaluation-quick-runner.test.ts`

**Interfaces:**
- Produces `QUICK_EVALUATION_SUITE` with committed scenario IDs/seeds.
- Produces `runQuickEvaluation({ root, now? }): Promise<EvaluationReport>`.
- Adds `npm run eval:quick` that exits non-zero on failed invariant/unexpected blocker and prints the replay tuple for every failure.

- [ ] **Write failing runner tests** proving deterministic scenario ordering, committed seed reuse, durable report creation, nonzero exit semantics on one failed invariant, and concise output containing `suiteId/scenarioId/evaluationId/seed`.
- [ ] **Write failing live-separation test** proving unavailable `ChatGptBrowserDriver` and real preview provider are reported under live-smoke blockers but do not masquerade as deterministic quick PASS scenarios.
- [ ] **Run RED.**
- [ ] **Implement the quick catalog** from the recovery/security/provider scenarios using temp repositories and fake providers only.
- [ ] **Add `eval:quick` package script** using a direct TypeScript CLI entrypoint and no production secrets.
- [ ] **Run `npm run eval:quick` three times**, then full focused evaluation tests + build.
- [ ] **Commit:** `feat: add quick evaluation gate`.

### Task 7: Soak runner, resource observations, and side-effect atomic-write hypothesis

**Files:**
- Create: `src/evaluation/resource-observer.ts`, `src/evaluation/soak-runner.ts`
- Modify only if RED reproduces defect: `src/harness/side-effect-ledger.ts`
- Modify: `package.json`
- Test: `tests/evaluation-soak.test.ts`, `tests/harness-side-effect-ledger.test.ts`

**Interfaces:**
- Produces `EvaluationResourceSnapshot` and `observeEvaluationResources(context)` scoped to evaluator/Iseol-owned jobs, leases, sessions, child processes, temp files, store counts, and process memory.
- Produces `runSoakEvaluation({ root, iterations, seeds, maxDurationMs }): Promise<EvaluationReport>` and `npm run eval:soak`.
- [ ] **Write failing bounded-soak tests** for repeated committed scenario families, iteration/time budgets, deterministic seed expansion, report-after-runner-restart, and end-state zero orphan process/expired live lease/unreconciled mutating indeterminate/stale-healthy-session counts.
- [ ] **Write a deterministic side-effect rename regression probe** that injects `EPERM`/`EBUSY`/`EACCES` into receipt replacement and proves behavior. Do not change production code if the probe stays green under existing semantics.
- [ ] **If the probe is RED, implement bounded transient rename retry** by reusing the proven atomic-file discipline; non-transient errors must still fail immediately and temporary files must be cleaned.
- [ ] **Run RED/GREEN** for soak/resource + any reproduced ledger defect, then run the relevant soak family repeatedly.
- [ ] **Add `eval:soak` package script** with conservative bounded defaults suitable for local/manual use, not the normal `npm test` path.
- [ ] **Commit:** `feat: add bounded evaluation soak runner` or, when a real ledger defect is fixed in the same TDD unit, `fix: harden evaluation soak side effects`.

### Task 8: Concurrent recovery race evaluation and proven defect fixes

**Files:**
- Create: `src/evaluation/scenarios/concurrent-recovery.ts`
- Test: `tests/evaluation-concurrent-recovery.test.ts`
- Modify only after deterministic RED identifies a defect: existing Harness Run/event/checkpoint/store coordination modules.

**Interfaces:**
- Scenario starts two recovery/resume callers against one canonical Run and observes durable state, checkpoints, evidence, and side-effect ledger.
- Success requires one valid canonical progression, stable Run/job/effect identity, zero duplicate side effects, and no late older recovery write overwriting a newer terminal/checkpoint state.

- [ ] **Write failing-or-passing race characterization tests** at COMMIT receipt-loss, PR receipt-loss fake provider, and post-checkpoint restart boundaries using explicit barriers instead of timing sleeps.
- [ ] **If a race is reproduced, reduce it to the smallest RED regression** before modifying production behavior.
- [ ] **Implement only the minimum coordination primitive necessary**—for example a bounded Run-level compare/reload/serialization guard—without introducing another state machine or globally locking unrelated Runs.
- [ ] **Repeat the focused race scenario at least 20 times**, then run Harness recovery/supervisor/effect regressions and `eval:quick`.
- [ ] **Commit:** `test: verify concurrent recovery safety` when no defect exists, otherwise a precise `fix:` commit naming the proven race.

### Task 9: Read-only Evaluation Web summary and final phase gate
**Files:**
- Modify: `src/web-control-plane/contracts.ts`, `src/web-control-plane/view-model.ts`, `src/web-control-plane/router.ts`, `web/index.html`, `web/app.js`, `web/styles.css`, `package.json`
- Test: `tests/evaluation-web-control-plane.test.ts`, existing Web Control Plane tests

**Interfaces:**
- Adds a read-only Evaluation summary to the existing Iseol Web: latest quick/soak status, pass/fail/blocked counts, duplicate/security invariant summary, recovery latency summary, failed scenario IDs/seeds, and live-smoke blockers.
- No public endpoint starts soak runs in this phase; runner control remains local/authorized CLI.

- [ ] **Write failing view/router/static tests** proving Evaluation data is read-only, deterministic, bounded, secret-redacted, and absent/missing roots render an empty state rather than leaking filesystem details.
- [ ] **Write failing UI tests** proving failed scenarios show replay identity (`scenarioId`, `seed`) and live blockers are visually distinct from deterministic failures.
- [ ] **Run RED.**
- [ ] **Implement additive Web summary** over the evaluation store; do not append evaluation events to normal Project History.
- [ ] **Run GREEN + all Web regressions + build.**
- [ ] **Run phase gate fresh:** all `evaluation-*` tests; `npm run eval:quick`; a bounded `npm run eval:soak`; full `npm test`; `npm run build`; `git diff --check`; secret/shell/path scans.
- [ ] **Verify live smoke honestly:** authenticated ChatGPT browser and real preview provider remain `blocked-external` unless actually configured; no fake live success.
- [ ] **Record exact final counts and discovered/fixed regressions** in this plan's Execution Notes and commit `docs: record evaluation hardening verification`.
- [ ] **Run committed feature-branch gate again**, then locally fast-forward merge into `feat/calendar-code-review`, rerun the full merged-parent gate, and remove the child worktree/branch only after green verification.

## Phase Completion Evidence

Record exact numbers only from fresh committed-branch verification:

- evaluation focused test count;
- quick scenario pass/fail/blocked counts and report ID;
- bounded soak iteration count, seeds, duration, and resource-leak observations;
- full repository test count and TypeScript build;
- duplicate commit/PR/merge/deployment counts;
- workspace/secret/policy/unverified-completion invariant counts;
- concurrent recovery repeat count and outcome;
- provider lifecycle timestamp delayed-ingestion proof;
- live ChatGPT browser/preview deploy blocker state;
- every production hardening defect found, its RED regression, fix commit, and fresh GREEN evidence.

## Locked Interface Details

The implementation tasks above use these exact contract decisions from the spec:

```ts
export type EvaluationRunStatus =
  | "queued" | "running" | "passed" | "failed" | "blocked-external" | "cancelled";
export type EvaluationEventType =
  | "evaluation-started" | "fault-injected" | "recovery-observed"
  | "invariant-violated" | "scenario-completed" | "evaluation-completed";
export type EvaluationMode = "quick" | "soak";
```

`EvaluationObservation` carries `evaluationId`, `scenarioId`, `at`, `type`, a bounded `summary`, and optional stable references; it never carries raw credentials/environment/browser state. A completed `EvaluationReport` contains aggregate `metrics`, per-scenario status/replay tuples, invariant results, and live-smoke blockers, but no product-state mutation methods.

Provider occurrence time is additive and exact:

```ts
export type ProjectHistoryProviderLifecycle = {
  committedAt?: string;
  openedAt?: string;
  mergedAt?: string;
  closedAt?: string;
  deployedAt?: string;
  verifiedAt?: string;
};
```

`ProjectHistoryEvent.at` remains Iseol recording time. Add optional `providerLifecycle?: ProjectHistoryProviderLifecycle`; history idempotency compares supplied lifecycle fields so a conflicting timestamp for the same event ID fails closed rather than being silently ignored.

Evaluation events remain in evaluation storage. They are never forwarded into `appendProjectHistoryEvent*()` merely because a benchmark observed a product Run.

## Execution Notes

### Final committed feature-branch gate — 2026-09-08

- Branch: `feat/iseol-evaluation-hardening`; implementation HEAD before these notes: `d59f15a feat: add evaluation web summary`.
- Evaluation focused suite: **43/43 passed**, 0 failed.
- Quick gate: **31 passed / 0 failed / 0 blocked**, report `quick-20260908T095913489Z`, recovery latency p95 **60000 ms**.
- Bounded soak: **2 iterations**, seeds `soak-final-a` and `soak-final-b`; **62 passed / 0 failed / 0 blocked**, report `soak-20260908T095915540Z`, wall time **3361 ms**, recovery latency p95 **60000 ms**.
- Soak resource end state: `orphan=0, expiredLease=0, indeterminate=0, staleSession=0, temp=0`.
- Full repository suite: **316/316 passed**, 0 failed; TypeScript build exited 0; `git diff --check` exited 0.
- Quick and soak invariant actuals were all **0** for duplicate commit, duplicate PR, duplicate merge, duplicate deployment, workspace escape, secret leakage, policy bypass, and unverified completion.
- Concurrent recovery characterization was repeated **20/20** times successfully on the committed branch.
- Provider delayed-ingestion proof remains covered by `evaluation-timestamps`: provider occurrence time survives storage/Web round-trip, same occurrence dedupes despite different ingestion `at`, and conflicting lifecycle identity fails closed.
- ChatGPT Web live smoke is **blocked-external**: a production Playwright `ChatGptBrowserDriver` is now installed in Iseol Core, but `npm run chatgpt:web:smoke` exits **2** because the dedicated browser/profile capability is not configured/authenticated in this environment.
- Real preview deployment live smoke remains **blocked-external**: a production Vercel `PrototypeDeployAdapter` exists, but Vercel token/project authorization and the live orchestration binding are not configured, so no real provider smoke has been claimed.
- Raw HEAD scan produced two credential-shaped and seven traversal-shaped matches; inspection showed the credential matches were deliberate redaction-test fixtures and traversal matches were TypeScript `../` imports. Re-running the scan over production-added lines with imports/test fixtures excluded produced **0 credential literals, 0 raw shell/command fields, 0 runtime traversal literals, 0 absolute Windows paths**.

### Production hardening defects proven by RED tests

- `ce55914 test: add deterministic recovery evaluation scenarios`
  - Desktop operation contracts accepted unknown execution fields and destructive Git through generic `RUN_PROCESS`; RED contract/security scenarios now reject both before execution.
  - ChatGPT Web reasoning results could carry credential-shaped durable string values; RED contract/security scenarios now fail closed before persistence.
  - Desktop Job completion accepted mismatched Run/agent identity; RED job-store/security scenarios now reject mismatched result identity before mutation.
- `6a6462c feat: preserve provider lifecycle timestamps`
  - Project History could not preserve provider occurrence time separately from Iseol ingestion time, and same-ID conflicting lifecycle identity could silently dedupe; delayed-ingestion/idempotency RED tests drove additive `providerLifecycle` identity checks while retaining legacy `at` semantics.
- `a707c3f fix: harden evaluation soak side effects`
  - Side-effect receipt replacement did not retry transient Windows `EPERM`/`EBUSY`/`EACCES` rename failures and ignored the injected rename dependency; deterministic RED probes drove bounded transient retry and temporary-file cleanup while non-transient errors still fail immediately.
- `4625a40 fix: prevent stale recovery run overwrite`
  - Explicit barrier race reproduced a late older recovery overwriting canonical `run.json` from newer `CI` back to `PR` while the latest checkpoint remained `CI`; Run-level serialized compare-and-save prevents stale recovery writes without globally locking unrelated Runs.
- `d59f15a feat: add evaluation web summary`
  - Added a read-only `/api/evaluation` view and third Web mode for bounded latest quick/soak summaries, replay tuples, invariant metrics, and distinct live blockers; mutation methods remain unavailable.

### Evaluation hardening commit sequence

`5015300` → `f1fc9cd` → `9742328` → `ce55914` → `6a6462c` → `dc473b1` → `a707c3f` → `4625a40` → `d59f15a`.

### Independent review fixes — 2026-09-08

- Codex review against `feat/calendar-code-review` found two valid gaps before merge.
- P1: generic Git `RUN_PROCESS` policy only inspected `args[0]`, so valid global options could hide a destructive subcommand (`git -C C:/repo reset --hard`, `git -c core.autocrlf=false clean -fd`). RED regression reproduced the bypass; `af4dce2 fix: reject option-prefixed destructive git` now resolves the real subcommand after value-taking global options. Focused desktop contract test: **6/6 passed**.
- P2: soak time-budget early exit built a report without calling the resource observer, so evaluator-owned leaks could be omitted. RED regression placed `leaked.tmp` under the evaluation root and observed no `soak-resource-end-state`; `28a1976 fix: observe resources on soak budget failure` now records the resource invariant on budget exhaustion. Focused soak test: **4/4 passed**.
- Review-fix regression gate: desktop contracts + evaluation security + soak **12/12 passed**; TypeScript build exited 0; `git diff --check` exited 0.
- Both fixes followed RED → minimal production change → GREEN and were committed separately for traceability.


### ChatGPT Playwright follow-up ? 2026-09-09

- The prior missing-driver blocker is resolved in code: production Playwright driver + resolver + bootstrap wiring now exist.
- Deterministic ChatGPT/Playwright focused verification is **46/46 passed** and current full repository verification is **340/340 passed**.
- Live status remains **blocked-external** because no dedicated browser/profile environment is configured/authenticated; no fake smoke was promoted to live success.


### ChatGPT browser lifecycle review fix ? 2026-09-09

- Independent review found that closing the only owned Playwright page made the singleton driver unusable for later conversations and that the persistent context lacked explicit disposal.
- `5715765 fix: preserve chatgpt browser lifecycle` recreates the owned page lazily after per-conversation close and exposes explicit disposal through backend/driver/service; the smoke CLI disposes in both success and failure paths.
- Final focused verification: **46/46 passed**; full repository: **340/340 passed**; build and `git diff --check` passed; re-review found no actionable regression.

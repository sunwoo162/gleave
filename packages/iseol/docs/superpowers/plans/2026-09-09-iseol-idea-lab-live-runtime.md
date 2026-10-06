# Iseol Idea Lab Live Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Web-created Idea Lab Campaigns to the real ChatGPT, Harness, Desktop Agent, and Vercel production path with durable restart-safe execution.

**Architecture:** Add an opt-in in-process runtime with one process-wide Campaign worker, a production Desktop Task compiler, and a production Campaign driver that reuses existing Campaign/Harness/Desktop/deploy state machines. A testable composition service owns one shared ChatGPT driver and one Desktop Core transport, then injects only a narrow runtime capability into the Web Control Plane.

**Tech Stack:** TypeScript, Node.js 22+, Node test runner, existing Harness, Desktop Agent WebSocket transport, Playwright ChatGPT driver, Vercel REST adapter.

**Spec:** `docs/superpowers/specs/2026-09-09-iseol-idea-lab-live-runtime-design.md`

## Global Constraints

- Runtime is opt-in; storage-only Campaign creation remains valid when disabled.
- Never guess or implicitly use the Iseol repository as the prototype target.
- One Playwright persistent driver is shared by all ChatGPT consumers in one process.
- One Desktop Agent Core transport is started and shared; no direct-shell fallback.
- Runtime-wide Campaign execution concurrency is exactly one initially.
- `blocked`, `cancelled`, and `complete` Campaigns are not recovered automatically.
- Production Run, Production, deployment, and candidate identities are deterministic and reconciled before creation.
- Test executable/args are trusted runtime config; never guess `npm test` or another command.
- Vercel deploy/verify must use the canonical Production commit.
- No live external service is used by normal tests.

---

### Task 1: Strict live runtime configuration

**Files:**
- Create: `src/idea-lab/runtime-config.ts`
- Modify: `src/config.ts`
- Modify: `.env.example`
- Test: `tests/idea-lab-runtime-config.test.ts`
- Modify: `package.json` test command

**Interfaces:**
- Produces `IdeaLabRuntimeRoots`.
- Produces `IdeaLabRuntimeConfig = { enabled: false } | { enabled: true; repositoryRoot; repositoryUrl; baseRef; sandboxRoot; agentId; testExecutable; testArgs; testTimeoutMs }`.
- Produces `resolveIdeaLabRuntimeConfig(env, roots)`.
- Exact envs: `ISEOL_IDEA_LAB_RUNTIME_ENABLED`, `ISEOL_IDEA_LAB_REPOSITORY_ROOT`, `ISEOL_IDEA_LAB_REPOSITORY_URL`, `ISEOL_IDEA_LAB_BASE_REF`, `ISEOL_IDEA_LAB_SANDBOX_ROOT`, `ISEOL_IDEA_LAB_AGENT_ID`, `ISEOL_IDEA_LAB_TEST_EXECUTABLE`, `ISEOL_IDEA_LAB_TEST_ARGS_JSON`, `ISEOL_IDEA_LAB_TEST_TIMEOUT_MS`.

- [ ] **Step 1: Write RED config tests.** Cover disabled default, strict boolean parsing, every required enabled field, JSON string-array parsing for test args, positive timeout, GitHub HTTPS repository URL, and normalized path safety.

```ts
assert.deepEqual(resolveIdeaLabRuntimeConfig({}, roots), { enabled: false });
assert.throws(() => resolveIdeaLabRuntimeConfig({ ISEOL_IDEA_LAB_RUNTIME_ENABLED: "true" }, roots), /repository/i);
assert.throws(() => resolveIdeaLabRuntimeConfig(enabledEnv({ ISEOL_IDEA_LAB_SANDBOX_ROOT: roots.modelRoot }), roots), /sandbox/i);
assert.deepEqual(resolveIdeaLabRuntimeConfig(enabledEnv(), roots).testArgs, ["test", "--", "--runInBand"]);
```

- [ ] **Step 2: Run focused test and verify RED.**
Run: `node --import tsx --test tests/idea-lab-runtime-config.test.ts`
Expected: module/function missing.

- [ ] **Step 3: Implement strict resolver.** Resolve paths before comparison; reject sandbox equal to or inside Iseol repository/model/run/web/browser-profile roots; reject malformed test args and unsupported repository URLs.

- [ ] **Step 4: Register env values in `src/config.ts` and `.env.example`.** Do not add credentials beyond existing ChatGPT/Desktop/Vercel settings.

- [ ] **Step 5: Run config tests + build + diff check.**
Run: `node --import tsx --test tests/idea-lab-runtime-config.test.ts && npm run build && git diff --check`
Expected: PASS.

- [ ] **Step 6: Commit.**
```bash
git add src/idea-lab/runtime-config.ts src/config.ts .env.example tests/idea-lab-runtime-config.test.ts package.json
git commit -m "feat: configure idea lab live runtime"
```

### Task 2: Production Desktop stage compiler

**Files:**
- Create: `src/idea-lab/production-desktop-compiler.ts`
- Test: `tests/idea-lab-production-desktop-compiler.test.ts`
- Modify: `package.json` test command

**Interfaces:**
- Consumes enabled `IdeaLabRuntimeConfig` from Task 1.
- Produces `createIdeaLabProductionDesktopTaskCompiler(config, options?): DesktopTaskCompiler`.
- Uses existing `DesktopTaskPack`, Harness policy digest/sources, and canonical Run target root.

- [ ] **Step 1: Write RED compiler tests.** Verify exact stable packs for `CONTEXT`, `TEST`, and `COMMIT`; all other stages return `null`.

```ts
const compile = createIdeaLabProductionDesktopTaskCompiler(config, { now: () => NOW });
assert.equal((await compile(runAt("CONTEXT"), "agent-live"))?.operations[0]?.type, "GIT_INSPECT");
assert.deepEqual((await compile(runAt("TEST"), "agent-live"))?.operations[0], {
  id: "test", type: "RUN_PROCESS", cwd: ".", executable: config.testExecutable,
  args: config.testArgs, timeoutMs: config.testTimeoutMs,
});
```

- [ ] **Step 2: Verify RED.**
Run: `node --import tsx --test tests/idea-lab-production-desktop-compiler.test.ts`
Expected: module missing.

- [ ] **Step 3: Implement bounded pack compiler.** Stable ids/keys are `${runId}:context|test|commit`; `workspaceRoot` is `run.request.targetRoot`; policy fields come from `run.preflight.policy`; lease expiry derives only from injected `now` + lease duration.

`CONTEXT`: one `GIT_INSPECT` with `cwd: "."`.

`TEST`: one configured `RUN_PROCESS` with `cwd: "."`; no shell string interpolation.

`COMMIT`: one `GIT_COMMIT` with `cwd: "."` and deterministic message `feat: build idea lab prototype`; do not invent an `expectedHead` unavailable from durable state.

- [ ] **Step 4: Verify compiler + Desktop regressions.**
Run: `node --import tsx --test tests/idea-lab-production-desktop-compiler.test.ts tests/desktop-agent-contracts.test.ts tests/desktop-agent-executor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/idea-lab/production-desktop-compiler.ts tests/idea-lab-production-desktop-compiler.test.ts package.json
git commit -m "feat: compile idea lab desktop stages"
```

### Task 3: Durable in-process Campaign runtime

**Files:**
- Create: `src/idea-lab/runtime-service.ts`
- Test: `tests/idea-lab-runtime-service.test.ts`
- Modify: `package.json` test command

**Interfaces:**
- Produces `IdeaLabRuntimeService` with `enqueue(campaignId): void`, `recover(): Promise<void>`, `idle(): Promise<void>`, `dispose(): Promise<void>`.
- Factory: `createIdeaLabRuntimeService({ modelRoot, superviseCampaign, onError?, concurrency?: 1 })`.
- `superviseCampaign(campaignId)` is an injected closure that owns production dependencies.

- [ ] **Step 1: Write RED scheduler tests.** Duplicate active/pending enqueue collapses; two Campaign ids execute serially; locks release after success and rejection.

```ts
runtime.enqueue("camp-a");
runtime.enqueue("camp-a");
runtime.enqueue("camp-b");
await runtime.idle();
assert.deepEqual(calls, ["camp-a", "camp-b"]);
```

- [ ] **Step 2: Add RED recovery/disposal tests.** Seed `generating`, `producing`, `complete`, `blocked`, `cancelled`; only the first two schedule. `dispose()` stops future enqueue and waits for the current worker.

- [ ] **Step 3: Verify RED.**
Run: `node --import tsx --test tests/idea-lab-runtime-service.test.ts`
Expected: runtime module missing.

- [ ] **Step 4: Implement one-worker scheduler.** Use one FIFO queue plus a `Set` covering pending+active ids. `recover()` only scans/list-enqueues; it does not await worker completion. `idle()` awaits queue drain. `dispose()` flips accepting=false then awaits drain. The runtime does not override Campaign `productionConcurrency`; that remains owned by `superviseIdeaLabCampaign()`.

- [ ] **Step 5: Bound error reporting.** `onError(campaignId, safeSummary)` receives a redacted/truncated message; it never receives prompt bodies, credentials, profile paths, or raw payloads.

- [ ] **Step 6: Verify focused + campaign regressions.**
Run: `node --import tsx --test tests/idea-lab-runtime-service.test.ts tests/idea-lab-stores.test.ts tests/idea-lab-campaign-supervisor.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit.**
```bash
git add src/idea-lab/runtime-service.ts tests/idea-lab-runtime-service.test.ts package.json
git commit -m "feat: add durable idea lab runtime"
```

### Task 4: Production Campaign driver

**Files:**
- Create: `src/idea-lab/production-runtime-driver.ts`
- Test: `tests/idea-lab-production-runtime-driver.test.ts`
- Modify: `package.json` test command

**Interfaces:**
- Consumes configured roots/repository/agent, `PrototypeSandboxAdapter`, `DesktopExecutionTransport`, `ChatGptWebBrowserAdapter`, `PrototypeDeployAdapter`, and Task 2 `DesktopTaskCompiler`.
- Produces `createIdeaLabProductionRuntimeDriver(input)` returning `{ createProduction, advanceProduction }` with the exact Campaign supervisor callback signatures.
- Production id: `${campaignId}-prod-${ordinal}`. Run id: `run-${productionId}`.

- [ ] **Step 1: Write RED identity/reconciliation tests.** Calling `createProduction()` twice for the same proposal/ordinal reuses the same durable Run and sandbox allocation identity and never overwrites an advanced Run.

```ts
const first = await driver.createProduction(proposal, 1);
await advanceRunFixture(first.runId);
const second = await driver.createProduction(proposal, 1);
assert.equal(second.runId, first.runId);
assert.equal((await loadHarnessRun(runRoot, first.runId))?.state.stage, "TEST");
```

- [ ] **Step 2: Write RED configured-target tests.** Sandbox allocation receives only configured repository root/url/base ref/agent id and `targetRoot = resolve(sandboxRoot, campaignId, productionId)`; mismatched existing Run/Production identities throw.

- [ ] **Step 3: Implement `createProduction`.** Load canonical Run first. If absent, call `createDevelopmentRun(..., { policyRoot: repositoryRoot })`; if present, verify mode/objective/target identity before reuse. Call sandbox `inspect()` before `allocate()` to reconcile an existing worktree.

- [ ] **Step 4: Write RED advancement tests.** Cover Harness DONE -> one candidate, final failure -> same Production with bounded failure, missing proposal/run -> fail closed, and lost Vercel response -> one deploy call via reconcile.

- [ ] **Step 5: Implement Web/Desktop/provider executors.** Web uses `createWebReasoningExecutor`; Web Desktop intents use `compileDesktopIntentToTaskPack()` through shared transport; Desktop stages use Task 2 compiler; provider owns only `DEPLOY` and `PRODUCTION_VERIFY`; combine with `createHybridStageExecutor()` and run `superviseHarnessRun()` on the persisted Run id.

- [ ] **Step 6: Materialize only after verified DONE.** Use `deployPrototypeProduction`, `verifyPrototypeProductionDeployment`, and `materializePrototypeCandidate`; persist exact commit/deployment fields in returned Production.

- [ ] **Step 7: Verify driver + E2E regressions.**
Run: `node --import tsx --test tests/idea-lab-production-runtime-driver.test.ts tests/idea-lab-production-service.test.ts tests/idea-lab-e2e.test.ts tests/idea-lab-vercel-deploy-adapter.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit.**
```bash
git add src/idea-lab/production-runtime-driver.ts tests/idea-lab-production-runtime-driver.test.ts package.json
git commit -m "feat: bind idea lab production runtime"
```

### Task 5: Web Control Plane runtime capability

**Files:**
- Modify: `src/web-control-plane/router.ts`
- Modify: `src/web-control-plane/server.ts`
- Test: `tests/idea-lab-web-control-plane.test.ts`
- Test: `tests/web-control-plane-server.test.ts`

**Interfaces:**
- Extend router/server dependencies with `ideaLabRuntime?: { state: "disabled" | "ready" | "blocked"; enqueue?(campaignId: string): void }`.
- Web modules do not import the runtime implementation.

- [ ] **Step 1: Write RED route tests.** Ready runtime persists then calls enqueue exactly once; disabled runtime preserves storage-only behavior; blocked runtime returns `503` before persistence; unauthorized request never persists/enqueues.

```ts
const response = await routeWebControlPlaneRequest(postCampaign, {
  ...deps,
  ideaLabRuntime: { state: "ready", enqueue: (id) => enqueued.push(id) },
});
assert.equal(response.status, 201);
assert.deepEqual(enqueued, [(response.body as IdeaLabCampaign).id]);
```

- [ ] **Step 2: Prove non-blocking response semantics.** `enqueue` is synchronous scheduling only; the test injects a runtime whose worker promise never resolves and verifies POST still returns `201` immediately.

- [ ] **Step 3: Implement narrow capability handling.** For blocked state, return `{ error: "idea lab runtime unavailable" }` with 503 before calling `createWebIdeaLabCampaign()`.

- [ ] **Step 4: Pass capability through `startWebControlPlaneServer()` options.** No env reads are added to router/server.

- [ ] **Step 5: Verify Web regressions.**
Run: `node --import tsx --test tests/idea-lab-web-control-plane.test.ts tests/web-control-plane-router.test.ts tests/web-control-plane-server.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit.**
```bash
git add src/web-control-plane/router.ts src/web-control-plane/server.ts tests/idea-lab-web-control-plane.test.ts tests/web-control-plane-server.test.ts
git commit -m "feat: enqueue live idea lab campaigns"
```

### Task 6: Testable process composition and shared capability ownership

**Files:**
- Create: `src/runtime/iseol-runtime-services.ts`
- Modify: `src/index.ts`
- Modify: `src/chatgpt-web/browser-service.ts` only if ownership API needs a non-owning adapter/service path
- Test: `tests/iseol-runtime-services.test.ts`
- Modify: `package.json` test command

**Interfaces:**
- Produces `startIseolRuntimeServices(input)` returning a service bundle with Web server, Desktop Core service, optional ChatGPT bridge, optional Idea Lab runtime, `ideaLabCapability`, and `dispose()`.
- Composition owns process-level disposal of the one shared `ChatGptBrowserDriver`.

- [ ] **Step 1: Write RED shared-browser tests.** When Web bridge + Idea Lab runtime are enabled, browser factory is called once and the exact same driver object reaches bridge adapter and `createChatGptIdeaProposalProvider()`.

- [ ] **Step 2: Write RED Idea-Lab-only browser test.** With `ISEOL_CHATGPT_WEB_ENABLED=false` but live Idea Lab enabled, browser still resolves once because proposal generation + Harness Web reasoning require it.

- [ ] **Step 3: Write RED Desktop/Vercel readiness tests.** Runtime enabled without Desktop Core, browser, or Vercel adapter yields `ideaLabCapability.state === "blocked"`; it does not construct production driver or call recovery.

- [ ] **Step 4: Write RED recovery ordering test.** `runtime.recover()` finishes its scan before capability becomes `ready` and before Web server receives ready capability.

- [ ] **Step 5: Implement composition.** Resolve roots/configs first, start Desktop Core once, resolve shared browser once, create non-owning Web adapter and proposal provider from it, resolve Vercel adapter, construct production driver/runtime, call `recover()`, then start Web server.

- [ ] **Step 6: Implement single-owner shutdown.** `dispose()` stops Web intake, disposes Idea Lab runtime, closes Desktop Core, then disposes shared browser exactly once. A Web bridge created from the shared driver must not independently own final driver disposal.

- [ ] **Step 7: Replace detached startup fragments in `src/index.ts`.** Keep Discord bot startup behavior intact; call composition once from `ClientReady` and retain its lifecycle handle.

- [ ] **Step 8: Verify bootstrap regressions.**
Run: `node --import tsx --test tests/iseol-runtime-services.test.ts tests/chatgpt-web-browser-service.test.ts tests/web-control-plane-server.test.ts tests/desktop-agent-bootstrap.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit.**
```bash
git add src/runtime/iseol-runtime-services.ts src/index.ts src/chatgpt-web/browser-service.ts tests/iseol-runtime-services.test.ts package.json
git commit -m "feat: compose live idea lab services"
```

### Task 7: Controlled smoke, final verification, and review

**Files:**
- Create: `scripts/idea-lab-live-smoke.ts`
- Test: `tests/idea-lab-live-smoke.test.ts`
- Modify: `package.json`
- Modify: `docs/superpowers/plans/2026-09-09-iseol-idea-lab-live-runtime.md` with verification evidence

**Interfaces:**
- CLI exits `0` only for one verified READY prototype, `2` for missing external prerequisites, and `1` for domain/internal failure.
- Normal tests inject fakes and never launch real ChatGPT/Desktop/Vercel.

- [ ] **Step 1: Write RED smoke CLI tests.** Missing runtime/browser/Desktop/Vercel settings => exit 2 and `blocked-external`; deterministic injected success => exit 0; domain failure => exit 1.

- [ ] **Step 2: Implement bounded one-prototype smoke.** Use targetReadyCount=1, explicit configured repository/sandbox/agent, existing Web Campaign route, `runtime.idle()`, then assert one READY Production + matching PrototypeCandidate + canonical Run DONE with `PRODUCTION_VERIFY` evidence.

- [ ] **Step 3: Ensure smoke cleanup uses composition `dispose()` in `finally`.** Never print tokens, profile root, prompt body, assistant payload, or raw Desktop result.

- [ ] **Step 4: Run deterministic focused gate.**
Run: `node --import tsx --test tests/idea-lab-runtime-config.test.ts tests/idea-lab-production-desktop-compiler.test.ts tests/idea-lab-runtime-service.test.ts tests/idea-lab-production-runtime-driver.test.ts tests/idea-lab-web-control-plane.test.ts tests/iseol-runtime-services.test.ts tests/idea-lab-live-smoke.test.ts`
Expected: all PASS.

- [ ] **Step 5: Run full repository verification.**
Run: `npm test`
Expected: zero failures.
Run: `npm run build`
Expected: exit 0.
Run: `git diff --check`
Expected: exit 0.

- [ ] **Step 6: Run controlled live smoke only if every prerequisite is explicitly present.**
Run: `npm run idea-lab:live:smoke`
Expected with missing prerequisites: exit 2 / `blocked-external`; never fake success.

- [ ] **Step 7: Security scan.** Confirm no credential/cookie/profile-path logging, coordinate clicking, direct-shell fallback, implicit repository target, or second ChatGPT/Desktop service construction.

- [ ] **Step 8: Request independent review against the pre-feature base.** Fix every critical/important finding with RED->GREEN regression tests, rerun full verification, and record exact counts/live blocker status in this plan.

- [ ] **Step 9: Commit final smoke/docs.**
```bash
git add scripts/idea-lab-live-smoke.ts tests/idea-lab-live-smoke.test.ts package.json docs/superpowers/plans/2026-09-09-iseol-idea-lab-live-runtime.md
git commit -m "test: verify idea lab live runtime"
```

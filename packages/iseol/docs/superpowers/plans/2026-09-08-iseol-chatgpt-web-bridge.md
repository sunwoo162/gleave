# Iseol ChatGPT Web Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect durable Iseol Runs to ChatGPT Web as a replaceable reasoning worker that emits validated Desktop intents while preserving Core as execution truth and Desktop Agent as the only repository execution hand.

**Architecture:** Add versioned Web-worker contracts and durable coordination stores, compile deterministic prompts from Run state, validate structured reasoning results and Desktop intents, compile accepted intents into existing `DesktopTaskPack` values, and route stages through one `HybridStageExecutor`. Browser-specific UI automation remains behind a narrow adapter and never writes Harness/Desktop state directly.

**Tech Stack:** TypeScript 7, Node.js 22, existing Harness/Project Model/Desktop Agent modules, `node:test`, SHA-256 via `node:crypto`, JSON/JSONL stores, no unrestricted shell or browser-to-filesystem contract.

**Spec:** `docs/superpowers/specs/2026-09-08-iseol-chatgpt-web-bridge-design.md`

## Global Constraints

- Read `docs/HARNESS_ENGINEERING.md` before every implementation task.
- `HarnessStageExecutor` remains the only Run Supervisor execution boundary.
- ChatGPT Web is reasoning-only; repository/process/Git mutation must pass through existing Desktop Agent contracts and Workspace Guard.
- Every accepted Web result is bound to `runId`, `stage`, `generation`, and current `policySha256`.
- Unknown contract versions, stale generations, stale policy digests, unsafe intents, or workspace mismatches fail closed before Desktop job creation.
- Browser cookies, auth tokens, raw hidden reasoning, unrestricted prompt dumps, and secrets never enter Harness evidence or Project History.
- Same-stage reasoning loops are bounded; repeated malformed/rejected results cannot loop indefinitely.
- GitHub lineage timestamps preserve provider times: commit `committedAt`, PR `openedAt`, `mergedAt`, and `closedAt` when available.
- Existing Discord, Web Control Plane, Project Model, Harness, and Desktop Agent behavior must remain green.
- All commits use concise English Conventional Commit-style messages.

---
## File structure

- `src/chatgpt-web/contracts.ts` — protocol version, worker session, reasoning result, turn, and DesktopIntent contracts/assertions.
- `src/chatgpt-web/session-store.ts` — atomic durable session generations and active-session lookup.
- `src/chatgpt-web/turn-store.ts` — append-only accepted reasoning turns.
- `src/chatgpt-web/intent-store.ts` — idempotent accepted/rejected intent envelopes.
- `src/chatgpt-web/prompt-compiler.ts` — deterministic initial/feedback/recovery prompt payloads and SHA-256 digests.
- `src/chatgpt-web/intent-compiler.ts` — active Run/session/policy validation and `DesktopIntent -> DesktopTaskPack` compilation.
- `src/chatgpt-web/browser-adapter.ts` — narrow browser worker interface; no Harness/Desktop writes.
- `src/chatgpt-web/web-reasoning-executor.ts` — bounded same-stage reasoning/Desktop feedback loop.
- `src/chatgpt-web/hybrid-executor.ts` — `HarnessStageExecutor` router for Web/Desktop/provider owners.
- `src/chatgpt-web/recovery.ts` — lost-generation replacement and late-result rejection helpers.
- `src/chatgpt-web/test-support/fake-browser-adapter.ts` — deterministic scripted Web worker for tests.
- `tests/chatgpt-web-*.test.ts` — contract, store, prompt, compiler, executor, recovery, and E2E coverage.

### Task 1: Versioned Web worker and DesktopIntent contracts

**Files:**
- Create: `src/chatgpt-web/contracts.ts`
- Create: `tests/chatgpt-web-contracts.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `ISEOL_CHATGPT_WEB_PROTOCOL_VERSION`, `WebWorkerSession`, `ReasoningTurn`, `ReasoningTurnResult`, `DesktopIntent`, `assertReasoningTurnResult()`, `assertDesktopIntent()`.

- [x] Write failing tests proving protocol version `1` only, safe non-empty IDs, valid ISO timestamps, supported reasoning outcomes, and exact DesktopIntent union `READ_CONTEXT | PROPOSE_PATCH | RUN_TEST | RUN_BUILD | GIT_INSPECT | REQUEST_COMMIT | CHECK_HTTP`.
- [x] Add failing tests proving an intent must carry `runId`, `stage`, `workspaceRoot`, `policySha256`, and must not accept `command`, `shell`, `env`, `token`, `force`, or unknown operation fields.
- [x] Run `node --import tsx --test tests/chatgpt-web-contracts.test.ts` and confirm RED because the module does not exist.
- [x] Implement discriminated TypeScript contracts and runtime assertions with `ISEOL_CHATGPT_WEB_PROTOCOL_VERSION = 1`.
- [x] Make result validation require `blockerReason` only for `blocked-user`, reject duplicate intent IDs, and reject intents whose `runId/stage` disagrees with the containing result; `generation` is validated on the result/session envelope before any intent is accepted.
- [x] Run the focused test plus `npm run build` and confirm PASS.
- [x] Register the test in `npm test` and commit `feat: define chatgpt web reasoning contracts`.
### Task 2: Durable session, turn, and intent stores

**Files:**
- Create: `src/chatgpt-web/session-store.ts`
- Create: `src/chatgpt-web/turn-store.ts`
- Create: `src/chatgpt-web/intent-store.ts`
- Create: `tests/chatgpt-web-stores.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts.
- Produces: `createWebWorkerSession()`, `loadWebWorkerSession()`, `getActiveWebWorkerSession()`, `replaceLostWebWorkerSession()`, `appendReasoningTurn()`, `listReasoningTurns()`, `recordDesktopIntent()`, `loadDesktopIntent()`.

- [x] Write failing tests for atomic session creation, one active generation per `(runId, stage)`, generation increment on replacement, safe IDs, and old-generation status becoming `lost` before the replacement becomes active.
- [x] Write failing append-only turn tests proving duplicate `turnId` with identical semantic content is idempotent while conflicting reuse fails.
- [x] Write failing intent-store tests proving duplicate `intentId` does not create two records, acceptance/rejection status is durable, and browser credentials/raw prompt bodies cannot be persisted through the public store input.
- [x] Run `node --import tsx --test tests/chatgpt-web-stores.test.ts` and confirm RED.
- [x] Implement sessions under `<root>/web-workers/sessions/<sessionId>.json`, active lookup under run/stage metadata, turns as `<root>/web-workers/runs/<runId>/turns.jsonl`, and intents as atomic JSON envelopes.
- [x] Use deterministic semantic identity for retry-safe writes and temp-file + rename for mutable JSON.
- [x] Run focused tests plus build and confirm PASS.
- [x] Register the test and commit `feat: persist chatgpt web worker state`.

### Task 3: Deterministic Prompt Compiler

**Files:**
- Create: `src/chatgpt-web/prompt-compiler.ts`
- Create: `tests/chatgpt-web-prompt-compiler.test.ts`

**Interfaces:**
- Consumes: `HarnessRuntimeRunEnvelope`, active `WebWorkerSession`, prior `ReasoningTurn[]`, optional summarized Desktop evidence.
- Produces: `CompiledWebPrompt { version: 1; kind: "initial" | "feedback" | "recovery"; runId; stage; generation; policySha256; body; sha256 }`, `compileWebPrompt(input)`.

- [x] Write failing deterministic tests: identical durable inputs produce byte-identical canonical body and SHA-256; changing stage, generation, policy digest, prior decision, or accepted Desktop evidence changes the digest.
- [x] Add tests proving the prompt includes objective, stage, completion target, policy digest, allowed intent vocabulary, prior decisions, bounded evidence summaries, and recovery marker when `kind === "recovery"`.
- [x] Add secret-redaction tests using sentinel token/cookie/environment values and prove none appear in `body`.
- [x] Run the focused test and confirm RED.
- [x] Implement stable ordered serialization and bounded context construction without depending on conversation history or current wall-clock time.
- [x] Keep policy source bodies out of the prompt by default; include only policy summary/invariants already present on the Run plus `effectiveSha256`.
- [x] Run focused tests plus build and confirm PASS.
- [x] Register the test and commit `feat: compile durable chatgpt web prompts`.
### Task 4: Intent validation and DesktopTaskPack compilation

**Files:**
- Create: `src/chatgpt-web/intent-compiler.ts`
- Create: `tests/chatgpt-web-intent-compiler.test.ts`

**Interfaces:**
- Consumes: active Run, active `WebWorkerSession`, Task 1 `DesktopIntent`, existing `DesktopTaskPack`/policy-source contracts.
- Produces: `validateDesktopIntent(context, intent)`, `compileDesktopIntentToTaskPack(context, intent, agentId, now): DesktopTaskPack`.

- [x] Write failing tests for run/stage/generation/policy/workspace mismatch rejection and stage-allowed intent matrix: reasoning stages may use context/patch/test/build/inspect; `REQUEST_COMMIT` is accepted only for an explicitly commit-authorized flow; unknown kinds fail closed.
- [x] Add failing compilation tests: `PROPOSE_PATCH -> APPLY_PATCH`, `RUN_TEST/RUN_BUILD -> RUN_PROCESS`, `GIT_INSPECT -> GIT_INSPECT`, `REQUEST_COMMIT -> GIT_COMMIT`, `CHECK_HTTP -> CHECK_HTTP`; assert the compiler never creates operations absent from the source intent.
- [x] Add tests proving mutation packs copy the Run preflight policy digest/source hashes, use workspace-relative paths, stable `idempotencyKey = web-intent:<runId>:<intentId>`, and reject raw shell/eval flags or target paths outside `run.request.targetRoot`.
- [x] Run the focused test and confirm RED.
- [x] Implement validation before any job-store call and reuse the existing Desktop protocol types/assertions instead of adding a second execution vocabulary.
- [x] For `RUN_TEST/RUN_BUILD`, accept only a structured executable/args/cwd payload already present in the intent contract; never parse prose into shell text.
- [x] Run focused tests plus build and confirm PASS.
- [x] Register the test and commit `feat: compile web reasoning into desktop tasks`.

### Task 5: Browser adapter boundary, WebReasoningExecutor, and generation recovery

**Files:**
- Create: `src/chatgpt-web/browser-adapter.ts`
- Create: `src/chatgpt-web/web-reasoning-executor.ts`
- Create: `src/chatgpt-web/recovery.ts`
- Create: `src/chatgpt-web/test-support/fake-browser-adapter.ts`
- Create: `tests/chatgpt-web-reasoning-executor.test.ts`
- Create: `tests/chatgpt-web-recovery.test.ts`

**Interfaces:**
- Produces `ChatGptWebBrowserAdapter` with `openOrResumeSession`, `submitTurn`, `awaitStructuredResult`, `probeSession`, `closeSession`.
- `createWebReasoningExecutor(deps): HarnessStageExecutor` consumes prompt/session/turn/intent stores, browser adapter, and a Desktop intent runner callback.
- `recoverWebWorkerSession(input)` replaces lost generation and compiles a recovery prompt without changing Run identity.

- [x] Write failing executor tests proving first reasoning stage creates generation 1, submits a deterministic prompt, accepts a structured turn, records summary/decisions, and returns `completed` only on `stage-complete` with stage-matching reasoning evidence.
- [x] Add same-stage loop test: turn 1 emits a Desktop intent, fake Desktop runner returns evidence, turn 2 receives that feedback and emits `stage-complete`; assert no direct Desktop transport method exists on the browser adapter.
- [x] Add bounded-loop tests for max turn count, repeated malformed result, repeated rejected intent, `blocked-user`, and Desktop `waiting-agent` propagation.
- [x] Write recovery tests for lost session -> mark generation N lost -> generation N+1 created -> recovery prompt includes prior accepted decisions/evidence -> same Run/stage continues.
- [x] Add stale result tests proving an old generation or old policy digest cannot append a turn or dispatch an intent after replacement.
- [x] Run focused tests and confirm RED.
- [x] Implement the adapter interface and scripted fake only; browser-specific selectors/authentication remain outside executor/store code.
- [x] Implement bounded loop defaults (`maxTurnsPerStage = 8`, `maxRejectedIntents = 3`) and preserve accepted intent identity across adapter retry.
- [x] Run focused tests plus build and confirm PASS.
- [x] Register tests and commit `feat: recover chatgpt web reasoning sessions`.
### Task 6: HybridStageExecutor routing and fake-worker + real Desktop E2E

**Files:**
- Create: `src/chatgpt-web/hybrid-executor.ts`
- Create: `tests/chatgpt-web-hybrid-executor.test.ts`
- Create: `tests/chatgpt-web-e2e.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `createHybridStageExecutor({ webExecutor, desktopExecutor, providerExecutor? }): HarnessStageExecutor`.
- Reasoning ownership: `ANALYZE`, `PLAN`, `IMPLEMENT`, `SELF_REVIEW` -> Web executor.
- Deterministic desktop ownership: configured `CONTEXT`, `TEST`, `COMMIT` -> Desktop executor.
- Provider ownership: `PR`, `CI`, `MERGE`, `DEPLOY`, `PRODUCTION_VERIFY` -> existing/injected provider executor; absent provider returns `waiting-external` rather than inventing side effects.

- [x] Write failing routing tests proving exactly one owner executes each stage and Hybrid executor never mutates Run state itself.
- [x] Add tests proving an unsupported/unconfigured owner returns `waiting-external` with no browser/Desktop/provider call.
- [x] Write E2E using a temporary Git repo, real Desktop WebSocket transport/runtime, fake ChatGPT browser worker, real Prompt/Intent compilers, and existing Run Supervisor.
- [x] E2E sequence: `IMPLEMENT` turn proposes guarded patch + test intent, Desktop Agent applies/executes, second Web turn sees evidence and marks stage complete; later deterministic TEST/COMMIT paths still use Desktop executor.
- [x] Add interruption E2E: browser generation dies after intent creation while Desktop mutation result is in flight; reconnect/recovery reuses the same intent/job identity and commit/file mutation occurs once.
- [x] Add stale-policy E2E: mutate harness policy after prompt compilation and prove stale Web output cannot create a Desktop mutation job.
- [x] Run focused Hybrid/E2E tests and confirm RED before missing glue is implemented.
- [x] Implement only integration glue required by production boundaries; no fake-only bypass in policy/session/Desktop guards.
- [x] Run focused E2E, all Desktop Agent tests, Harness supervisor/recovery tests, and build; confirm PASS.
- [x] Register tests and commit `test: verify chatgpt web reasoning recovery`.

### Task 7: Production browser adapter shell and controlled smoke boundary

**Files:**
- Create: `src/chatgpt-web/production-browser-adapter.ts`
- Create: `src/chatgpt-web/browser-service.ts`
- Create: `tests/chatgpt-web-browser-service.test.ts`
- Modify: `src/config.ts`
- Modify: `src/index.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `ChatGptBrowserDriver` narrow driver interface, `createProductionChatGptWebAdapter(driver)`, `resolveChatGptWebBridgeConfig(env)`, and opt-in Core bootstrap for a configured driver.

- [x] Write failing tests proving Web bridge bootstrap is opt-in, missing browser/auth capability fails closed, session references never persist cookies/profile paths/tokens, and browser driver exposes only conversation open/resume, prompt submit, structured-result read, probe, and close operations.
- [x] Add adapter tests proving selector/navigation failures classify as recoverable session loss without mutating Run/intent/Desktop stores.
- [x] Add configuration tests proving no live browser bridge starts merely because Iseol Web or Desktop Agent is enabled.
- [x] Run focused tests and confirm RED.
- [x] Implement a production adapter shell over an injected `ChatGptBrowserDriver`; do not add generic browser eval, arbitrary click scripts, shell, file access, or credential extraction APIs.
- [x] Wire the service into normal Iseol boot only when explicit ChatGPT Web bridge configuration is present; preserve all existing boot paths when absent.
- [x] Add `chatgpt:web:smoke` script that runs a read/reasoning-only controlled smoke against the configured driver and refuses repository mutation intents unless an explicit temporary test workspace is configured.
- [x] Run focused browser/config tests plus build and confirm PASS.
- [x] If a usable authenticated browser driver is available, run the controlled smoke and record the session/generation/structured-result evidence; if authentication/driver capability is unavailable, leave the code green and report the live smoke as the only external blocker rather than bypassing auth.
- [x] Commit `feat: bootstrap chatgpt web reasoning bridge`.

## Phase verification

- [x] Re-read `docs/HARNESS_ENGINEERING.md` and the ChatGPT Web Bridge spec.
- [x] Run all `tests/chatgpt-web-*.test.ts` focused tests.
- [x] Run all Desktop Agent tests and existing Harness supervisor/recovery/side-effect tests.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Run `git diff --check`.
- [x] Confirm existing Discord, Web Control Plane, Project Model, Calendar, GitHub review, Figma, Notion, and Desktop bootstrap tests remain green.
- [x] Confirm Web contracts contain no unrestricted shell/browser/file mutation field and production browser adapter has no Harness/Project/Desktop store write dependency.
- [x] Confirm browser auth material, raw hidden reasoning, tokens, cookies, and profile secrets do not appear in durable session/turn/intent fixtures.
- [x] Confirm stale generation, stale policy, duplicate intent, browser loss, Desktop loss, indeterminate mutation, and late result tests all pass.
- [x] Confirm fake-worker + real Desktop temporary-repository E2E records one mutation/job only across interruption recovery.
- [x] Record exact verification counts, implementation deviations, live-browser smoke state, and GitHub lineage timestamp follow-up status in this plan.

## Execution Notes

- ChatGPT Web focused verification: `37/37 PASS`.
- Desktop Agent + Harness supervisor/recovery/side-effect verification after the atomic-rename regression: `58/58 PASS`.
- Full repository verification after the Windows presence-write fix: `232/232 PASS`.
- TypeScript build and `git diff --check`: PASS.
- Fake-worker + real Desktop temporary-repository E2E proves `IMPLEMENT -> Desktop patch/test -> SELF_REVIEW -> TEST -> COMMIT -> PR waiting` and reuses one mutation job across browser generation recovery.
- Production browser bridge is opt-in and fail-closed. A concrete Playwright-backed `ChatGptBrowserDriver` is now implemented and wired; `npm run chatgpt:web:smoke` exits `2` in the current environment because the dedicated browser/profile capability is not configured. Authentication was not bypassed and no fake result is counted as live.
- Implementation deviation: full parallel verification exposed transient Windows `EPERM/EBUSY/EACCES` rename failures in Desktop Agent presence writes. Added bounded atomic rename retry plus temp cleanup and a dedicated regression test; ChatGPT Web E2E then passed five consecutive runs and the full suite.
- Security scans found no unrestricted `command`, `shell`, `env`, `token`, `force`, cookie, or profile-path field in Web reasoning contracts, and no Harness/Project/Desktop store dependency in the production browser adapter/service.
- GitHub lifecycle timestamp requirement remains a recorded Project History follow-up: preserve commit `committedAt` and PR `openedAt`/`mergedAt`/`closedAt` provider times. This phase records the requirement but does not extend the Project History schema/UI for those fields.
## Phase completion gate

The deterministic bridge is complete when a preflight-ready reasoning stage can create a durable Web worker session, compile a policy-bound prompt, accept a structured fake-Web result, validate/record Desktop intents, execute mutation only through the existing Desktop Agent, feed Desktop evidence into a later reasoning turn, survive generation replacement without duplicate mutation, and leave all existing Iseol capabilities green. Production live-browser smoke additionally requires an authenticated configured browser driver; missing external authentication/driver availability is surfaced as a blocker and never bypassed.


### Playwright production-driver follow-up ? 2026-09-09

- Production driver/config/resolver, exact conversation resume, bounded submit/result extraction, and controlled smoke CLI are implemented behind the existing adapter.
- Focused production-driver/bridge/recovery/lifecycle verification: **46/46 passed**; full repository: **340/340 passed**; build and diff-check passed.
- Live ChatGPT browser remains **blocked-external** only because no dedicated authenticated profile/browser env is configured on this machine; the adapter itself is no longer the missing capability.


### ChatGPT browser lifecycle review fix ? 2026-09-09

- Independent review found that closing the only owned Playwright page made the singleton driver unusable for later conversations and that the persistent context lacked explicit disposal.
- `5715765 fix: preserve chatgpt browser lifecycle` recreates the owned page lazily after per-conversation close and exposes explicit disposal through backend/driver/service; the smoke CLI disposes in both success and failure paths.
- Final focused verification: **46/46 passed**; full repository: **340/340 passed**; build and `git diff --check` passed; re-review found no actionable regression.

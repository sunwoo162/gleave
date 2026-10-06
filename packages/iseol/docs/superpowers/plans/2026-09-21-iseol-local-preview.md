# Local Preview Execution Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an explicit `local-preview` Idea Lab deployment mode that starts and verifies a trusted local preview process without weakening Vercel mode, while enforcing a durable external-request budget.

**Architecture:** Extend the Idea Lab runtime config with a deployment mode and trusted preview command. Implement a process-backed `PrototypeDeployAdapter` that receives the production workspace, allocates a loopback port, starts only the configured executable, verifies process ownership and HTTP readiness, persists a `local-preview` receipt, and disposes owned processes. Add a shared WebWorker-root durable request budget that reserves before every browser submission and refuses further submissions after exhaustion while binding identities to their campaign or Run. Existing Vercel deployments remain selected only in `vercel` mode; local preview never calls Vercel.

**Tech Stack:** TypeScript, Node `child_process`, existing JSON durable stores, Node test runner, tsx, TypeScript compiler.

**Spec:** User-approved local-preview design in the current task.

## Global Constraints

- Do not change or restart production or isolated Runtime processes.
- Do not create campaigns, execute Runs, submit ChatGPT requests, dispatch Desktop jobs, or deploy externally.
- Existing Vercel configuration and durable Vercel records remain compatible and are never reinterpreted as local-preview.
- Local preview starts only a configured executable with configured arguments; no AI-provided command or URL is executed.
- Preview evidence is distinct from browser acceptance; HTTP 200 never counts as Todo acceptance.
- Request budgets are durable in one shared WebWorker-root record, identity-bound to a campaign or Run, and reserved before submission; UNKNOWN responses are not retried automatically.
- All tests use temporary roots, synthetic repos, and loopback ports.

## Review Focus

- Vercel mode without Vercel credentials still blocks exactly as before; local-preview does not silently fall back to it.
- Preview command path, arguments, workspace, and port are rejected when outside the configured boundary.
- Process exits, timeout, HTTP failure, and UNKNOWN never produce verified deployment evidence.
- A duplicate or concurrent request cannot reserve more than the durable budget.
- A result from another Run or old request identity cannot satisfy the current Run budget.
- Existing deployment receipts and materialization remain readable without migration.

### Task 1: Define deployment mode and local-preview configuration

**Files:**
- Modify: `src/idea-lab/runtime-config.ts`
- Modify: `src/idea-lab/contracts.ts`
- Modify: `src/idea-lab/deploy-adapter.ts`
- Test: `tests/idea-lab-runtime-config.test.ts`
- Test: `tests/idea-lab-local-preview.test.ts`

**Interfaces:**
- `IdeaLabRuntimeConfig.enabled` includes `deploymentMode: "vercel" | "local-preview"`.
- Local-preview config includes `previewExecutable`, `previewArgs`, `previewHost`, `previewPortRange`, and `previewTimeoutMs`.
- `PrototypeDeployRequest` carries `workspaceRoot` and `runId`; receipts use `provider: "local-preview"`.

- [ ] Write failing config tests for explicit mode, required local command, workspace boundary and default rejection.
- [ ] Run the focused config test and confirm it fails because the new mode/fields are absent.
- [ ] Add strict parsing with `vercel` as the backward-compatible default only when the Idea Lab runtime is explicitly enabled and no mode is supplied; never reinterpret saved records.
- [ ] Add failing receipt/request type tests for workspace/run identity.
- [ ] Implement the minimum type extensions and runtime validation.
- [ ] Run config/type focused tests and record green output.

### Task 2: Implement process-backed local-preview adapter

**Files:**
- Create: `src/idea-lab/local-preview-deploy-adapter.ts`
- Modify: `src/idea-lab/production-service.ts`
- Test: `tests/idea-lab-local-preview.test.ts`

**Interfaces:**
- `createLocalPreviewDeployAdapter(options): PrototypeDeployAdapter & { dispose(): Promise<void> }`.
- `options` contains allowed workspace root, executable, args factory, host, port range, readiness timeout, process factory, fetch, and clock.
- `deploy` starts one owned child process, records PID/start time/port in an in-memory ownership map, and returns a `local-preview` receipt only after process identity and readiness checks.
- `verify` re-checks owned process identity, URL host/port, and HTTP response; it returns `verifiedAt` only on verified readiness.
- `dispose` terminates only owned preview processes and waits for exit; it never kills unrelated PIDs.

- [ ] Add failing tests for successful process start/readiness/receipt, command/path/port rejection, process exit, timeout, HTTP failure, UNKNOWN, wrong identity, duplicate deployment, and safe disposal.
- [ ] Run the focused test and verify expected red failures.
- [ ] Implement process ownership, loopback port allocation, trusted command invocation, readiness polling, receipt identity binding, and fail-closed cleanup.
- [ ] Modify deployment request creation to pass production workspace and Run identity.
- [ ] Run local-preview tests until green.

### Task 3: Select local-preview without weakening Vercel and dispose safely

**Files:**
- Modify: `src/runtime/iseol-runtime-services.ts`
- Modify: `src/idea-lab/production-runtime-driver.ts`
- Test: `tests/iseol-runtime-services.test.ts`
- Test: `tests/idea-lab-production-runtime-driver.test.ts`

**Interfaces:**
- Resolver chooses `createLocalPreviewDeployAdapter` when `deploymentMode === "local-preview"`.
- Vercel resolver is used only for `deploymentMode === "vercel"`.
- Runtime dispose invokes optional adapter disposal before owned browser/Desktop resources.
- Provider receipt/evidence keeps `provider` and URL distinct; no Vercel evidence is synthesized.

- [ ] Add failing tests for local mode with no Vercel credentials, Vercel mode preserving credential requirements, and disposal.
- [ ] Run those tests red.
- [ ] Implement resolver selection and disposal with no production side effects.
- [ ] Run focused runtime/driver tests green.

### Task 4: Add durable external request budget

**Files:**
- Create: `src/chatgpt-web/request-budget.ts`
- Modify: `src/chatgpt-web/web-reasoning-executor.ts`
- Modify: `src/idea-lab/chatgpt-proposal-provider.ts`
- Modify: `src/idea-lab/proposal-provider.ts`
- Modify: `src/idea-lab/campaign-supervisor.ts`
- Modify: `src/runtime/iseol-runtime-services.ts`
- Modify: `src/idea-lab/production-runtime-driver.ts`
- Test: `tests/idea-lab-request-budget.test.ts`
- Test: `tests/chatgpt-web-reasoning-executor.test.ts`
- Test: `tests/idea-lab-chatgpt-proposal-provider.test.ts`

**Interfaces:**
- `RequestBudgetStore` persists one shared JSON record with `limit`, `reserved`, `consumed`, `unknown`, and request identities bound to their campaign or Run.
- `reserve(runId, requestId, metadata): Promise<"reserved" | "already-reserved" | "exhausted">`.
- Reservation happens before `submitTurn`; failed pre-submit reservations can be released, while submitted UNKNOWN responses remain consumed and are never auto-resubmitted.
- Budget identity includes `runId`, stage, session generation and turn attempt.

- [ ] Add failing tests for sequential exhaustion, concurrent reservation, duplicate reservation, UNKNOWN no-resubmit, and wrong Run identity.
- [ ] Run the focused tests red.
- [ ] Implement atomic durable read/modify/write using the existing JSON store conventions and wire reservation into every external submission path.
- [ ] Return a safe waiting-external result when exhausted or UNKNOWN; do not retry automatically.
- [ ] Run budget and reasoning tests green.

### Task 5: Preserve completion/acceptance distinctions and document operation

**Files:**
- Modify: `src/idea-lab/completion-profile.ts`
- Modify: `src/idea-lab/contracts.ts`
- Create: `docs/ISEOL_LOCAL_PREVIEW.md`
- Test: `tests/idea-lab-completion-profile.test.ts`
- Test: `tests/idea-lab-local-preview.test.ts`

**Interfaces:**
- Local-preview evidence records `DEPLOY` and `PRODUCTION_VERIFY` with `provider: "local-preview"`.
- Browser acceptance is a separate durable record/field and remains `unverified` until real browser interactions cover add/edit/complete/delete/persistence/empty-state/input-validation/responsive checks.
- Existing Runs without acceptance remain unchanged and are never auto-completed.

- [ ] Add failing tests proving HTTP readiness cannot mark acceptance complete and old records remain compatible.
- [ ] Implement only the minimal acceptance state contract and completion guard.
- [ ] Write the local-preview configuration, safety, evidence, and operator procedure document.
- [ ] Run focused completion tests green.

### Task 6: Full verification and commit

**Files:**
- All files above only.

- [ ] Run focused Idea Lab, runtime, reasoning, and desktop regression tests.
- [ ] Run `npm.cmd test`.
- [ ] Run `npm.cmd run build`.
- [ ] Run `node --check web/app.js`.
- [ ] Run `git diff --check`.
- [ ] Verify no Runtime processes, locks, operating data, or external services were touched.
- [ ] Commit only this implementation with an English Conventional Commit.
- [ ] Re-check `git status --short --branch` and `git rev-parse HEAD`.

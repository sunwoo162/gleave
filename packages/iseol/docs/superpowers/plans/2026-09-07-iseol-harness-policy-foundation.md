# Iseol Harness Policy Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add the enforceable policy foundation that every Iseol development Run must load before any development side effect.

**Architecture:** Keep existing Discord/GitHub/Figma/Calendar behavior unchanged. Add a focused `src/harness/` boundary that resolves global and project-local guidance, hashes the effective policy, validates versioned Run contracts, and persists a preflight snapshot that future Run Supervisor stages must consume.

**Tech Stack:** TypeScript 7, Node.js 22, `node:test`, `node:crypto`, `node:fs/promises`, existing JSON file persistence patterns.

**Spec:** `docs/superpowers/specs/2026-09-07-iseol-product-architecture-design.md`

## Global Constraints

- Every Iseol development Run, including Idea Lab prototype production and Project Workspace development, must complete harness preflight before analysis or mutation.
- The Iseol global `docs/HARNESS_ENGINEERING.md` is mandatory.
- A target repository's `docs/HARNESS_ENGINEERING.md`, when present, is additive project policy and must be read completely.
- A target repository's `AGENTS.md`, when present, is additive project policy and must be read completely.
- Missing mandatory global guidance fails closed before side effects.
- Loaded policy source paths and SHA-256 digests are persisted for audit/recovery.
- Existing bot behavior must remain working throughout this phase.
- Secrets and credentials must never be persisted in policy snapshots or evidence.

---
## File structure

- `docs/HARNESS_ENGINEERING.md` — Iseol-wide execution invariants, independent of Bloom-specific product rules.
- `src/harness/contracts.ts` — versioned Run/preflight/policy snapshot types and validators.
- `src/harness/policy-resolver.ts` — read global/project harness guidance and `AGENTS.md`, compute digests, produce effective policy snapshot.
- `src/harness/preflight.ts` — mandatory gate that creates a Run preflight record and refuses execution when required policy is unavailable.
- `src/harness/run-store.ts` — durable JSON persistence for request/preflight state under `data/runs/`.
- `tests/harness-contracts.test.ts` — contract validation coverage.
- `tests/harness-policy-resolver.test.ts` — global/project policy loading and hashing coverage.
- `tests/harness-preflight.test.ts` — fail-closed and successful preflight coverage.
- `tests/harness-run-store.test.ts` — durable snapshot/reload coverage.
- `package.json` — include new focused tests in the existing test command.

### Task 1: Global Iseol harness guidance and versioned contracts

**Files:**
- Create: `docs/HARNESS_ENGINEERING.md`
- Create: `src/harness/contracts.ts`
- Create: `tests/harness-contracts.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `ISEOL_HARNESS_CONTRACT_VERSION`, `DevelopmentRunRequest`, `HarnessPolicySource`, `HarnessPolicySnapshot`, `HarnessPreflightRecord`, `assertHarnessContractVersion(version)`.
- Consumes: no new runtime dependency.
- [x] **Step 1: Write the failing contract test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  ISEOL_HARNESS_CONTRACT_VERSION,
  assertHarnessContractVersion,
} from "../src/harness/contracts.js";

test("harness contract version is strict", () => {
  assert.equal(ISEOL_HARNESS_CONTRACT_VERSION, 1);
  assert.doesNotThrow(() => assertHarnessContractVersion(1));
  assert.throws(() => assertHarnessContractVersion(2), /Unsupported Iseol Harness contract version/);
});
```

- [x] **Step 2: Add `tests/harness-contracts.test.ts` to `npm test`, run it, and confirm RED**

Run: `node --import tsx --test tests/harness-contracts.test.ts`
Expected: FAIL because `src/harness/contracts.ts` does not exist.

- [x] **Step 3: Create the global harness guidance**

`docs/HARNESS_ENGINEERING.md` must state: preflight-first execution, durable checkpoints, evidence-backed completion, idempotent external side effects, fail-closed permission/policy behavior, bounded retries, recovery before repetition, and the distinction between Iseol global rules and target-project rules. Do not copy BloomBouquet-specific path/build invariants.
- [x] **Step 4: Implement the minimal contract module**

```ts
export const ISEOL_HARNESS_CONTRACT_VERSION = 1 as const;

export type DevelopmentRunRequest = {
  version: 1;
  runId: string;
  mode: "idea-lab" | "project-workspace";
  objective: string;
  targetRoot: string;
};

export type HarnessPolicySource = {
  kind: "iseol-global" | "project-harness" | "project-agents";
  path: string;
  sha256: string;
  content: string;
};

export type HarnessPolicySnapshot = {
  version: 1;
  loadedAt: string;
  sources: HarnessPolicySource[];
  effectiveSha256: string;
};
```

Also define `HarnessPreflightRecord` with `runId`, `status: "ready" | "blocked"`, `policy`, and optional `reason`, plus `assertHarnessContractVersion(version: number)`.

- [x] **Step 5: Run focused test and build**

Run: `node --import tsx --test tests/harness-contracts.test.ts && npm run build`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add docs/HARNESS_ENGINEERING.md src/harness/contracts.ts tests/harness-contracts.test.ts package.json
git commit -m "feat: define iseol harness contracts"
```
### Task 2: Policy resolver

**Files:**
- Create: `src/harness/policy-resolver.ts`
- Create: `tests/harness-policy-resolver.test.ts`

**Interfaces:**
- Consumes: `HarnessPolicySource`, `HarnessPolicySnapshot`.
- Produces: `resolveHarnessPolicy(input: { iseolRoot: string; targetRoot: string; loadedAt?: string }): Promise<HarnessPolicySnapshot>`.

- [x] **Step 1: Write failing tests with temporary repositories**

```ts
const snapshot = await resolveHarnessPolicy({ iseolRoot, targetRoot, loadedAt: "2026-09-07T00:00:00.000Z" });
assert.deepEqual(snapshot.sources.map((source) => source.kind), [
  "iseol-global",
  "project-harness",
  "project-agents",
]);
assert.equal(snapshot.sources.every((source) => /^[a-f0-9]{64}$/.test(source.sha256)), true);
assert.equal(/^[a-f0-9]{64}$/.test(snapshot.effectiveSha256), true);
```

Add cases proving project files are optional and the global file is mandatory.

- [x] **Step 2: Run the focused test and confirm RED**

Run: `node --import tsx --test tests/harness-policy-resolver.test.ts`
Expected: FAIL because the resolver module does not exist.

- [x] **Step 3: Implement deterministic policy loading**

Use `readFile`, `stat`, `resolve`, and `createHash("sha256")`. Always read `<iseolRoot>/docs/HARNESS_ENGINEERING.md`; then read `<targetRoot>/docs/HARNESS_ENGINEERING.md` and `<targetRoot>/AGENTS.md` only when they exist. Preserve complete UTF-8 content. Compute `effectiveSha256` from ordered `kind + path + sha256` tuples so the same policy set resolves identically.

- [x] **Step 4: Run focused test and build**

Run: `node --import tsx --test tests/harness-policy-resolver.test.ts && npm run build`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/harness/policy-resolver.ts tests/harness-policy-resolver.test.ts package.json
git commit -m "feat: resolve harness policy before runs"
```
### Task 3: Mandatory development preflight

**Files:**
- Create: `src/harness/preflight.ts`
- Create: `tests/harness-preflight.test.ts`

**Interfaces:**
- Consumes: `DevelopmentRunRequest`, `HarnessPreflightRecord`, `resolveHarnessPolicy(...)`.
- Produces: `prepareDevelopmentRun(request, options): Promise<HarnessPreflightRecord>` where `options` contains `iseolRoot` and optional `loadedAt`.

- [x] **Step 1: Write the failing preflight tests**

```ts
const ready = await prepareDevelopmentRun(request, { iseolRoot });
assert.equal(ready.status, "ready");
assert.equal(ready.runId, request.runId);
assert.ok(ready.policy?.sources.some((source) => source.kind === "iseol-global"));
```

Add a missing-global-guidance case that expects a `blocked` record and proves no target policy result is fabricated.

- [x] **Step 2: Run focused test and confirm RED**

Run: `node --import tsx --test tests/harness-preflight.test.ts`
Expected: FAIL because `prepareDevelopmentRun` does not exist.

- [x] **Step 3: Implement fail-closed preflight**

Validate `version === 1`, non-empty `runId`, `objective`, and `targetRoot`. Call `resolveHarnessPolicy` before returning `ready`. Convert a missing/unreadable mandatory global harness file into `{ status: "blocked", reason }`; do not convert unrelated programmer errors into success.

- [x] **Step 4: Add an explicit side-effect gate helper**

Export `assertPreflightReady(record: HarnessPreflightRecord): asserts record is HarnessPreflightRecord & { status: "ready"; policy: HarnessPolicySnapshot }` and test that blocked records throw `Development Run preflight is not ready`.

- [x] **Step 5: Run focused tests and build**

Run: `node --import tsx --test tests/harness-preflight.test.ts && npm run build`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/harness/preflight.ts tests/harness-preflight.test.ts package.json
git commit -m "feat: require harness preflight for development runs"
```
### Task 4: Durable preflight Run store

**Files:**
- Create: `src/harness/run-store.ts`
- Create: `tests/harness-run-store.test.ts`

**Interfaces:**
- Consumes: `DevelopmentRunRequest`, `HarnessPreflightRecord`.
- Produces: `HarnessRunEnvelope`, `saveHarnessRun(root, envelope)`, `loadHarnessRun(root, runId)`.

- [x] **Step 1: Write the failing persistence test**

```ts
await saveHarnessRun(storeRoot, {
  version: 1,
  request,
  preflight,
  updatedAt: "2026-09-07T00:00:01.000Z",
});

const reloaded = await loadHarnessRun(storeRoot, request.runId);
assert.deepEqual(reloaded, {
  version: 1,
  request,
  preflight,
  updatedAt: "2026-09-07T00:00:01.000Z",
});
```

Also assert that an unknown Run ID returns `null` and path traversal characters in a Run ID are rejected by validation.

- [x] **Step 2: Run focused test and confirm RED**

Run: `node --import tsx --test tests/harness-run-store.test.ts`
Expected: FAIL because `run-store.ts` does not exist.

- [x] **Step 3: Implement atomic JSON persistence**

Store Runs at `<root>/<runId>/run.json`. Create directories recursively, write JSON to a sibling temporary file, then `rename` it over `run.json`. Persist only request/preflight metadata and policy content/digests; never environment variables or provider tokens.

- [x] **Step 4: Run focused tests and build**

Run: `node --import tsx --test tests/harness-run-store.test.ts && npm run build`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/harness/run-store.ts tests/harness-run-store.test.ts package.json
git commit -m "feat: persist harness preflight state"
```
### Task 5: Single safe Run creation entry point

**Files:**
- Create: `src/harness/run-service.ts`
- Create: `tests/harness-run-service.test.ts`

**Interfaces:**
- Consumes: `prepareDevelopmentRun`, `saveHarnessRun`.
- Produces: `createDevelopmentRun(request, options): Promise<HarnessRunEnvelope>` with `options: { iseolRoot: string; storeRoot: string; loadedAt?: string }`.

- [x] **Step 1: Write failing integration tests**

```ts
const run = await createDevelopmentRun(request, { iseolRoot, storeRoot });
assert.equal(run.preflight.status, "ready");
assert.deepEqual(await loadHarnessRun(storeRoot, request.runId), run);
```

Add a blocked case proving the blocked preflight is persisted for diagnosis and `assertPreflightReady(run.preflight)` rejects it before any future worker side effect.

- [x] **Step 2: Run focused test and confirm RED**

Run: `node --import tsx --test tests/harness-run-service.test.ts`
Expected: FAIL because `run-service.ts` does not exist.

- [x] **Step 3: Implement Run creation orchestration**

`createDevelopmentRun` must execute in this order only: validate request -> resolve/prepare preflight -> persist durable envelope -> return envelope. It must never expose a separate code path that marks the Run ready without the policy snapshot.

- [x] **Step 4: Run all new harness tests, then project regressions**

Run: `node --import tsx --test tests/harness-*.test.ts`
Expected: all new harness tests PASS.

Run: `npm test && npm run build && git diff --check`
Expected: existing bot tests PASS, TypeScript build exits 0, and no whitespace errors are reported.

- [x] **Step 5: Commit**

```bash
git add src/harness/run-service.ts tests/harness-run-service.test.ts package.json
git commit -m "feat: create preflighted development runs"
```

## Phase completion gate

This phase is complete only when a future caller has one obvious safe entry point (`createDevelopmentRun`) and a Run cannot be asserted ready without a recorded global harness source and digest. No Discord command, Web route, ChatGPT bridge, Desktop Agent execution, Figma budget manager, or deployment mutation is wired in this phase; those consume this foundation in later plans.

## Execution notes

- Implemented in isolated worktree branch `feat/iseol-harness-policy-foundation`.
- The Desktop Commander environment had an empty Windows `ComSpec`; npm 10.9.3 therefore failed while spawning `@google/genai`'s preinstall script. Setting `ComSpec=C:\Windows\System32\cmd.exe` for setup/test processes restored normal npm execution without repository changes.
- A fresh isolated worktree has no ignored `.env`; baseline/full tests were run with dummy values for the five required configuration variables and no external provider calls.
- Focused harness suite passes 12/12 tests.
- Full project suite passes 54/54 tests and TypeScript build passes.

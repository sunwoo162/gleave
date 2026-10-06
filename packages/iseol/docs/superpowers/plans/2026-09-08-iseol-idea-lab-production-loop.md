# Iseol Idea Lab Production Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce multiple distinct, verified web prototypes through durable Campaign orchestration and independent Harness Runs, then expose only READY candidates for explicit promotion.

**Architecture:** Add a separate Idea Lab Campaign/Proposal/Production domain above the existing Harness Run Supervisor. Candidate repository work stays behind typed Desktop Agent operations, preview deployment stays behind a typed deploy adapter, and the existing `PrototypeCandidate`/`promotePrototype()` path is reused only after commit-matching production verification succeeds.

**Tech Stack:** TypeScript 7, Node.js 22, existing Harness/ChatGPT Web/Desktop Agent/Project Model/Web Control Plane modules, `node:test`, atomic JSON + JSONL, existing `ws` transport, no unrestricted shell.

**Spec:** `docs/superpowers/specs/2026-09-08-iseol-idea-lab-production-loop-design.md`

## Global Constraints

- Read `docs/HARNESS_ENGINEERING.md` before every implementation task.
- Default Campaign target is `targetReadyCount = 3`; default production concurrency is `1`.
- Every accepted proposal gets one canonical `PrototypeProduction` and one canonical `mode = "idea-lab"` Harness Run.
- Production-in-progress state never masquerades as a valid `PrototypeCandidate`.
- `PR`, `CI`, and `MERGE` may be skipped only by the explicit Idea Lab completion profile; Project Workspace requirements remain unchanged.
- Repository/worktree mutation must pass through Desktop Agent typed operations and Workspace Guard.
- Preview deployment must pass through `PrototypeDeployAdapter` and use stable idempotency identity `prototype:<campaignId>:<productionId>:<commitSha>`.
- Missing live browser/deployment authorization is `WAITING_EXTERNAL`/Campaign `blocked`, never fabricated success.
- All commits use concise English Conventional Commit-style messages.

---

## File Structure

- `src/idea-lab/contracts.ts` — versioned Campaign/Proposal/Production contracts and safe-ID assertions.
- `src/idea-lab/campaign-store.ts` — atomic Campaign persistence and deterministic listing.
- `src/idea-lab/proposal-store.ts` — atomic Proposal persistence.
- `src/idea-lab/production-store.ts` — atomic Production persistence and status updates.
- `src/idea-lab/event-store.ts` — append-only Campaign events.
- `src/idea-lab/distinctness.ts` — deterministic normalization/fingerprint/rejection rules.
- `src/idea-lab/proposal-provider.ts` — bounded proposal-provider interface.
- `src/idea-lab/completion-profile.ts` — Idea Lab delivery profile and stage-skip policy.
- `src/idea-lab/sandbox-adapter.ts` — typed candidate branch/worktree allocation boundary.
- `src/idea-lab/deploy-adapter.ts` — typed preview deployment/reconciliation boundary.
- `src/idea-lab/production-service.ts` — create Run, capture commit/deploy verification, materialize candidate.
- `src/idea-lab/campaign-supervisor.ts` — durable orchestration/replenishment/concurrency.
- `src/idea-lab/test-support/*` — deterministic fake proposal/sandbox/deploy adapters.
- `src/project-model/contracts.ts`, `promotion.ts` — additive Idea Lab origin/Genesis snapshot.
- `src/web-control-plane/{contracts,view-model,router}.ts`, `web/*` — Campaign/gallery API and UI.
- `src/desktop-agent/{contracts,runtime}.ts` — bounded `GIT_WORKTREE_CREATE` operation only.

### Task 1: Idea Lab contracts, stores, and events

**Files:**
- Create: `src/idea-lab/contracts.ts`
- Create: `src/idea-lab/campaign-store.ts`
- Create: `src/idea-lab/proposal-store.ts`
- Create: `src/idea-lab/production-store.ts`
- Create: `src/idea-lab/event-store.ts`
- Test: `tests/idea-lab-stores.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `ISEOL_IDEA_LAB_VERSION = 1`, `IdeaLabCampaign`, `IdeaProposal`, `PrototypeProduction`, `IdeaLabCampaignEvent`, `assertIdeaLabId()`.
- Produces `save/load/listIdeaLabCampaigns`, `save/loadIdeaProposal`, `save/load/listPrototypeProductions`, `append/listIdeaLabCampaignEvents`.

- [x] **Write failing contract/store tests** proving safe IDs reject traversal/slashes/leading dots, Campaign defaults can be represented exactly, one production owns one `runId`, and secret-shaped fields are absent from public contracts.

```ts
const campaign: IdeaLabCampaign = {
  version: 1, id: "camp-1", seed: "student focus tools", constraints: [],
  targetReadyCount: 3, productionConcurrency: 1,
  proposalIds: [], productionIds: [], status: "generating",
  createdAt: NOW, updatedAt: NOW,
};
await saveIdeaLabCampaign(root, campaign);
assert.deepEqual(await loadIdeaLabCampaign(root, "camp-1"), campaign);
assert.throws(() => assertIdeaLabId("../escape"));
```

- [x] **Add failing persistence tests** for atomic update/list ordering, missing record `null`, append-only event order, duplicate event semantic idempotency, and conflicting event-ID reuse rejection.
- [x] **Run RED:** `node --import tsx --test tests/idea-lab-stores.test.ts` and confirm missing production modules.
- [x] **Implement minimal contracts/stores** using atomic temp-file + rename for mutable JSON and JSONL for Campaign events; reuse bounded Windows rename retry helper where applicable.
- [x] **Run GREEN:** focused test + `npm run build`.
- [x] **Register test in `npm test` and commit:** `feat: persist idea lab production state`.

### Task 2: Deterministic distinctness and proposal-provider boundary

**Files:**
- Create: `src/idea-lab/distinctness.ts`
- Create: `src/idea-lab/proposal-provider.ts`
- Create: `src/idea-lab/test-support/fake-proposal-provider.ts`
- Test: `tests/idea-lab-distinctness.test.ts`

**Interfaces:**
- Produces `normalizeProposalField()`, `proposalFingerprint()`, `evaluateProposalDistinctness(candidate, accepted)`.
- Produces `IdeaProposalProvider.generate(input): Promise<IdeaProposalDraft[]>`; input contains seed, constraints, requested count, accepted bounded summaries, and attempt number only.

- [x] **Write failing distinctness tests** proving case/whitespace/punctuation normalization is deterministic and cosmetic title/color changes cannot produce a new fingerprint when product fields match.

```ts
const base = proposalDraft({
  problemDomain: "Study Planning",
  targetUser: "High school students",
  jobToBeDone: "Plan focused study blocks",
  coreInteractionLoop: "plan -> focus -> review",
  primaryDifferentiator: "adaptive focus review",
});
assert.equal(proposalFingerprint(base), proposalFingerprint({ ...base, title: "Blue Focus" }));
```

- [x] **Add failing provider-boundary tests** proving malformed proposal count, empty structural fields, raw `reasoning`, `token`, `cookie`, `prompt`, or browser state are rejected before persistence.
- [x] **Add bounded-attempt tests** proving repeated duplicates return explicit rejection reasons and caller can stop after a configured proposal attempt budget.
- [x] **Run RED:** `node --import tsx --test tests/idea-lab-distinctness.test.ts`.
- [x] **Implement deterministic distinctness + fake provider** with no model/network dependency.
- [x] **Run GREEN + build; register and commit:** `feat: validate distinct idea lab proposals`.

### Task 3: Mode-aware Harness completion profile and explicit stage skipping

**Files:**
- Create: `src/idea-lab/completion-profile.ts`
- Modify: `src/harness/completion-gates.ts`
- Modify: `src/harness/run-supervisor.ts`
- Test: `tests/idea-lab-completion-profile.test.ts`
- Test: existing `tests/harness-completion-gates.test.ts`, `tests/harness-run-supervisor.test.ts`

**Interfaces:**
- Produces `completionProfileForMode(mode)` returning required evidence stages and skippable stages.
- `assertRunCompletionEvidence(evidence, mode)` becomes mode-aware while preserving the current Project Workspace default exactly.
- Supervisor automatically records `stage-skipped` for `PR`, `CI`, `MERGE` only when `run.request.mode === "idea-lab"` and the profile explicitly permits it.

- [x] **Write failing regression tests** proving Project Workspace still requires `pull-request` and `ci` evidence and cannot silently skip PR/CI/MERGE.
- [x] **Write failing Idea Lab tests** proving TEST/SELF_REVIEW/COMMIT/DEPLOY/PRODUCTION_VERIFY remain mandatory while PR/CI/MERGE are recorded in `skippedStages` with a non-empty preview-policy reason.

```ts
const profile = completionProfileForMode("idea-lab");
assert.deepEqual(profile.skippableStages, ["PR", "CI", "MERGE"]);
assert.doesNotThrow(() => assertRunCompletionEvidence(ideaLabEvidence, "idea-lab"));
assert.throws(() => assertRunCompletionEvidence(ideaLabEvidence, "project-workspace"));
```

- [x] **Run RED** on completion-profile + current Harness tests.
- [x] **Implement minimal profile wiring** without changing `HARNESS_STAGE_ORDER`; the Supervisor must checkpoint each automatic skip before advancing.
- [x] **Run GREEN:** new tests + all Harness state/supervisor/completion tests + build.
- [x] **Commit:** `feat: add idea lab completion profile`.

### Task 4: Typed sandbox worktree allocation through Desktop Agent

**Files:**
- Modify: `src/desktop-agent/contracts.ts`
- Modify: `src/desktop-agent/runtime.ts`
- Modify: `src/harness/preflight.ts`
- Modify: `src/harness/run-service.ts`
- Create: `src/idea-lab/sandbox-adapter.ts`
- Create: `src/idea-lab/test-support/fake-sandbox-adapter.ts`
- Test: `tests/idea-lab-sandbox.test.ts`
- Test: existing Desktop protocol/runtime/preflight tests

**Interfaces:**
- Adds `GitWorktreeCreateOperation = { id; type: "GIT_WORKTREE_CREATE"; cwd; branch; worktreePath; baseRef }` as a mutation requiring policy provenance.
- Runtime executes fixed argv equivalent to `git worktree add -b <branch> <worktreePath> <baseRef>` with `shell: false`; `worktreePath` must resolve under the Task Pack sandbox `workspaceRoot` and Desktop allowed roots.
- Adds optional preflight `policyRoot` support so the candidate Run can be created against its planned worktree path while the allocation mutation is governed by the existing sandbox repository's project harness; immediately after allocation, `refreshDevelopmentRunPreflight()` re-resolves policy from the real worktree before CONTEXT/implementation continues.
- Produces `PrototypeSandboxAdapter.allocate(input): Promise<{ repositoryUrl; branch; worktreeRoot; baseRef }>` and `inspect(input)` for recovery.

- [x] **Write failing Desktop protocol tests** proving unsafe branch names, worktree targets outside Task Pack sandbox root, unsupported flags, and unknown fields are rejected.
- [x] **Write failing preflight tests** proving planned missing targetRoot may use an explicit existing `policyRoot` for allocation, then refreshed preflight includes the worktree-local harness/AGENTS before any code mutation.
- [x] **Write failing runtime test** using a temporary Git repo and approved sandbox root; verify exactly one branch/worktree is created and duplicate semantic allocation reconciles/reuses rather than creating a second worktree.
- [x] **Write failing adapter tests** proving production branch is deterministically `idea/<campaignId>/<productionId>` and Campaign code never calls Git/process directly.
- [x] **Run RED** on sandbox + Desktop + preflight focused tests.
- [x] **Implement bounded worktree operation + preflight refresh + sandbox adapter** using existing Desktop task/lease/idempotency machinery; do not add generic Git or shell execution.
- [x] **Run GREEN:** sandbox test + all Desktop Agent/preflight tests + build.
- [x] **Commit:** `feat: allocate isolated idea lab worktrees`.

### Task 5: Production service, preview deployment, and candidate materialization

**Files:**
- Create: `src/idea-lab/deploy-adapter.ts`
- Create: `src/idea-lab/production-service.ts`
- Create: `src/idea-lab/test-support/fake-deploy-adapter.ts`
- Modify: `src/project-model/contracts.ts`
- Test: `tests/idea-lab-production-service.test.ts`

**Interfaces:**
- Produces `PrototypeDeployAdapter.deploy(input)`, `reconcile(input)`, and `verify(input)` with typed commit/deployment identity.
- Adds optional `PrototypeCandidate.ideaLabOrigin = { campaignId; proposalId; productionId }` without breaking legacy candidates.
- Produces `createPrototypeProduction()`, `reconcilePrototypeProduction()`, `materializePrototypeCandidate()`.

- [x] **Write failing deployment-idempotency tests** proving stable key `prototype:<campaignId>:<productionId>:<commitSha>` and lost deploy response reconciles the same preview instead of issuing a second deploy.
- [x] **Write failing READY tests** proving candidate materialization requires: Run mode `idea-lab`, Run completion through `PRODUCTION_VERIFY`, captured commit SHA, verified deployment commit equal to captured commit, and non-empty preview URL.

```ts
await assert.rejects(() => materializePrototypeCandidate({
  production: { ...production, commitSha: "aaa" },
  deployment: { ...verified, commitSha: "bbb" },
}), /commit mismatch/i);
```

- [x] **Add idempotency/conflict tests** proving repeat materialization returns the same candidate, while an existing candidate with different repository/deployment identity fails closed.
- [x] **Run RED.**
- [x] **Implement fake deploy adapter + production service** without real provider credentials.
- [x] **Run GREEN + Project Model regression + build; commit:** `feat: materialize verified idea lab prototypes`.

### Task 6: Durable Campaign supervisor and replenishment

**Files:**
- Create: `src/idea-lab/campaign-supervisor.ts`
- Test: `tests/idea-lab-campaign-supervisor.test.ts`

**Interfaces:**
- Produces `superviseIdeaLabCampaign(input)` with injected proposal provider, sandbox adapter, Run factory/supervisor, deploy adapter, and candidate materializer.
- Supervisor owns orchestration only; all worker/provider side effects stay behind injected boundaries.

- [x] **Write failing scheduling tests** for default target `3`, concurrency `1`, no duplicate production for one proposal, and Campaign `complete` only when READY count reaches target.
- [x] **Add replenishment test:** candidate A READY, B `FAILED_FINAL`, C READY; supervisor generates D and completes only after D READY without recreating A/C Runs.
- [x] **Add blocker tests** for missing proposal provider, no eligible Desktop Agent/sandbox allocation, missing deployment authorization, and protected Run blocker; Campaign becomes `blocked` with bounded safe summary.
- [x] **Add restart test** proving reloading persisted Campaign/Productions continues canonical Run IDs and deployment identities without duplicate side effects.
- [x] **Run RED.**
- [x] **Implement Campaign supervisor** with max-step/proposal-attempt budgets and durable Campaign events before transitions.
- [x] **Run GREEN + build; commit:** `feat: supervise idea lab production campaigns`.

### Task 7: Promotion Genesis origin backfill and archive rules

**Files:**
- Modify: `src/project-model/contracts.ts`
- Modify: `src/project-model/promotion.ts`
- Modify: `src/project-model/prototype-store.ts`
- Create: `src/idea-lab/prototype-actions.ts`
- Test: `tests/idea-lab-promotion.test.ts`
- Test: existing Project Model promotion tests

**Interfaces:**
- Adds optional immutable `ProjectGenesis.ideaLabOrigin` snapshot for Idea Lab-produced candidates.
- Produces `archivePrototypeCandidate(modelRoot, prototypeId, at)` that rejects promoted candidates and preserves Campaign/Run history.

- [x] **Write failing promotion tests** proving only the selected candidate's campaign/proposal/production metadata is copied, exact branch/commit/deployment remain unchanged, and legacy/manual candidates without origin still promote unchanged.
- [x] **Write failing archive tests** proving candidate -> archived is allowed, promoted -> archived is rejected, archive does not delete candidate Run/Campaign state, and archived candidates cannot be promoted until explicitly restored by a future policy.
- [x] **Run RED.**
- [x] **Implement additive Genesis origin lookup/snapshot and archive action** without importing rejected sibling histories.
- [x] **Run GREEN + existing Project Model tests + build; commit:** `feat: preserve idea lab genesis origin`.

### Task 8: Web Control Plane Campaign/gallery API and UI

**Files:**
- Modify: `src/web-control-plane/contracts.ts`
- Modify: `src/web-control-plane/view-model.ts`
- Modify: `src/web-control-plane/router.ts`
- Modify: `web/index.html`
- Modify: `web/app.js`
- Modify: `web/styles.css`
- Test: `tests/idea-lab-web-control-plane.test.ts`
- Test: existing Web Control Plane router/view/static tests

**Interfaces:**
- Extends `IdeaLabView` with safe Campaign summaries and production summaries while preserving `prototypes`.
- Adds authenticated mutations `POST /api/idea-lab/campaigns`, `POST /api/idea-lab/campaigns/:id/cancel`, and `POST /api/prototypes/:id/archive`.
- Existing `POST /api/prototypes/:id/promote` remains unchanged in URL and authorization behavior.

- [x] **Write failing API tests** for Campaign creation defaults, custom bounded target/concurrency, cancel idempotency, archive eligibility, malformed IDs/body, and mutation token authorization.
- [x] **Write failing view tests** proving READY prototype cards remain separate from in-progress production cards, Run stage/status is summarized safely, and blocker summaries contain no credential/provider raw payloads.
- [x] **Write failing static UI tests** for `Create Campaign`, `Make More`, Campaign progress, production status, `Open prototype`, `Promote`, and `Archive`; in-progress productions must not expose Promote.
- [x] **Run RED** on new Web tests plus existing router/view/static tests.
- [x] **Implement additive API/view/UI** using the current two-mode dashboard; do not create a second web app.
- [x] **Run GREEN + build; commit:** `feat: expose idea lab production campaigns`.

### Task 9: End-to-end recovery, three READY candidates, and phase verification

**Files:**
- Create: `tests/idea-lab-e2e.test.ts`
- Modify: `package.json`
- Modify: this plan execution notes/checklist after evidence exists.

**Interfaces:**
- Uses real Harness Run store/supervisor, real ChatGPT Web fake-worker path, real Desktop Agent loopback transport/runtime against temporary Git sandbox, deterministic fake proposal provider, fake preview deploy adapter, Project Model promotion, and Web view model.

- [x] **Write E2E happy path:** create one Campaign with target 3, generate three structurally distinct proposals, allocate three isolated branches/worktrees sequentially, execute candidate Runs, verify three previews, materialize three candidates, and assert Campaign `complete`.
- [x] **Write failure replacement E2E:** second candidate final-fails; successful first/third Run IDs remain unchanged; replacement fourth candidate is produced and Campaign still reaches three READY.
- [x] **Write interruption E2E:** browser generation loss, Desktop disconnect after mutation, deploy response loss, and Core/supervisor restart all reconcile same canonical production/Run/job/deployment identities with no duplicate mutation/deploy.
- [x] **Write promotion E2E:** promote exactly one READY candidate and assert exact commit/deployment plus only its Idea Lab origin/Run history appear in Genesis.
- [x] **Run focused E2E repeatedly** to expose race/flakiness before full suite.
- [x] **Run phase gate:** all `idea-lab-*` tests, all ChatGPT Web/Desktop/Harness/Project Model/Web Control Plane tests, `npm test`, `npm run build`, `git diff --check`, secret/shell/path invariant scans.
- [x] **Run controlled live smoke only when both authenticated ChatGPT browser driver and real preview deploy adapter are configured; otherwise record those as external blockers without bypass.**
- [x] **Commit verification docs:** `docs: record idea lab production verification`.

## Phase Completion Evidence

Record exact counts only after fresh committed-branch verification. Required evidence includes:

- Idea Lab focused test count;
- ChatGPT Web + Desktop + Harness focused count;
- full repository test count;
- TypeScript build and `git diff --check`;
- three READY candidates in deterministic E2E;
- one failure-replenishment proof;
- one interrupted deploy reconciliation proof;
- one exact promotion/Genesis proof;
- live browser/deployment smoke state and blocker reason if unavailable.

## Execution Notes

- Final pre-doc committed branch: `8eecdfb test: verify idea lab production recovery`.
- Idea Lab focused verification: **36/36 PASS**.
- ChatGPT Web + Desktop Agent + Harness + Project Model + Web Control Plane focused verification: **157/157 PASS**.
- Full repository verification: **268/268 PASS**.
- TypeScript build: **PASS**. `git diff --check`: **PASS**.
- Task 9 E2E was run three consecutive times before registration: **4/4 PASS on every run**.
- Happy path produced exactly three READY candidates through real Harness, ChatGPT Web fake-worker, loopback Desktop Agent runtime, verified fake previews, and exact promotion/Genesis import.
- Failure replenishment proved candidate 2 can final-fail while successful canonical Run IDs remain unchanged and candidate 4 replenishes the Campaign to three READY candidates.
- Restart/recovery proved browser generation replacement and a lost preview deployment response reuse the same production/deployment identity with exactly one deploy side effect.
- Desktop disconnect recovery proved a lost result after patch + Git commit is reconciled after reconnect without a duplicate mutation or commit.
- Live ChatGPT smoke is intentionally blocked: `npm run chatgpt:web:smoke` exits **2** because no authenticated production `ChatGptBrowserDriver` is bundled/configured.
- Live preview deployment smoke remains intentionally **blocked-external**: a production Vercel `PrototypeDeployAdapter` now exists, but no Vercel token/project authorization is configured and no live Campaign orchestration path selects it yet; no fake deployment is counted as live success.
- Security boundary scan: `src/idea-lab` contains no direct child-process/shell execution; credential-word scan found only the bounded redaction regex in `campaign-supervisor.ts`.

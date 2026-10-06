# Iseol Idea Lab Production Loop Design

**Date:** 2026-09-08
**Status:** Approved in-chat design, written specification pending user review
**Parent architecture:** `docs/superpowers/specs/2026-09-07-iseol-product-architecture-design.md`

## 1. Purpose

Idea Lab must turn a broad idea seed or set of constraints into multiple substantially different, runnable web-product prototypes that a user can actually open and try.

This phase connects the already-built Harness, ChatGPT Web Bridge, Desktop Agent, Project Model, Web Control Plane, and promotion path into one production loop.

The core invariant is:

```text
Idea seed
  -> Campaign
  -> distinct Proposals
  -> independent durable Runs
  -> implementation/test/review/commit
  -> preview deployment/verification
  -> READY PrototypeCandidate
  -> user experience
  -> explicit promotion
```

A prototype becomes a `PrototypeCandidate` only after repository identity and verified preview deployment are known. Production-in-progress state is not stored as a partially valid `PrototypeCandidate`.
## 2. Goals

1. Produce multiple meaningfully different web products from one campaign.
2. Reuse the existing durable Run state machine instead of inventing a second execution engine.
3. Isolate every prototype implementation so one failed candidate cannot corrupt another.
4. Keep Idea Lab project-management overhead lightweight until explicit promotion.
5. Make retries safe across browser loss, Desktop Agent loss, process failure, and deployment retries.
6. Prevent repository/project explosion while still preserving exact Git identity per candidate.
7. Surface only verified runnable candidates as normal Idea Lab gallery items.
8. Preserve the exact selected codebase, Run history, commit, and deployment when promoted.

## 3. Non-goals

- Idea Lab does not automatically convert every experiment into a full Project Workspace.
- It does not create a new GitHub repository for every candidate.
- It does not require a PR/merge lifecycle for disposable preview prototypes.
- It does not treat visual color/layout variants as separate product ideas.
- It does not bypass missing ChatGPT Web authentication or deployment credentials.
- It does not let browser automation mutate repositories directly.
- It does not silently promote or delete a candidate without explicit user action.

## 4. Selected architecture

Use a **Campaign + independent Candidate Runs** model.
```text
IdeaLabCampaign
  |- Proposal A -> Production A -> Harness Run A
  |- Proposal B -> Production B -> Harness Run B
  `- Proposal C -> Production C -> Harness Run C
```

The Campaign is orchestration state. Harness Runs remain execution truth.

Rejected alternatives:

- **One giant Run for all candidates:** recovery and external side-effect identity become coupled; rejected.
- **Completely independent Runs with no Campaign:** simple but cannot reliably enforce batch size, distinctness, replacement, or campaign completion; rejected.

## 5. Core contracts

Introduce a separate Idea Lab production domain rather than expanding `PrototypeCandidate` into an ambiguous draft object.

```ts
type IdeaLabCampaignStatus =
  | "generating"
  | "producing"
  | "complete"
  | "blocked"
  | "cancelled";
```

A Campaign has a safe ID, seed/constraints, target ready count, concurrency limit, proposal IDs, production IDs, timestamps, and status.
```ts
type IdeaProposal = {
  version: 1;
  id: string;
  campaignId: string;
  title: string;
  concept: string;
  problemDomain: string;
  targetUser: string;
  jobToBeDone: string;
  coreInteractionLoop: string;
  dataModel: string;
  primaryDifferentiator: string;
  whyMateriallyDifferent: string;
  status: "proposed" | "accepted" | "rejected";
  createdAt: string;
};
```

Proposal text is bounded product metadata, not hidden chain-of-thought. Raw model reasoning is never persisted.

`PrototypeProduction` tracks execution before a candidate becomes promotion-ready.

```ts
type PrototypeProductionStatus =
  | "queued" | "running" | "testing" | "deploying"
  | "verifying" | "ready" | "failed" | "blocked" | "cancelled";
```
Each production record contains at minimum:

- `id`, `campaignId`, `proposalId`
- one canonical `runId`
- sandbox repository/worktree identity
- branch name
- current commit SHA when known
- preview deployment reference when known
- status and last failure/blocker summary
- created/updated timestamps

It must not contain OAuth tokens, browser cookies, deployment secrets, raw environment dumps, or unrestricted shell commands.

## 6. Campaign lifecycle

Default first-production settings:

```text
targetReadyCount = 3
productionConcurrency = 1
```

Concurrency is deliberately conservative for the first production target. The contract allows later increases without changing candidate identity.

Campaign completion is based on READY candidates, not attempted candidates.

```text
while readyCount < targetReadyCount:
  generate/accept sufficiently distinct proposals
  queue production up to concurrency limit
  supervise each candidate Run
  replace failed-final candidates when policy allows
```
A campaign becomes `complete` when the configured READY count is reached. A single candidate reaching `failed` must not automatically fail the whole campaign.

A campaign becomes `blocked` only when progress cannot safely continue, for example:

- no authenticated ChatGPT Web driver when idea generation requires it;
- no eligible Desktop Agent for implementation;
- missing required sandbox repository access;
- missing deployment provider authorization;
- protected human decision required by Harness policy.

## 7. Product distinctness gate

Idea Lab exists to discover different products, not cosmetic variants.

Every proposal is compared against accepted proposals in the same campaign using normalized fields:

- `problemDomain`
- `targetUser`
- `jobToBeDone`
- `coreInteractionLoop`
- `primaryDifferentiator`

Exact or near-identical normalized fingerprints are rejected before production allocation.

ChatGPT Web must also provide `whyMateriallyDifferent` as bounded rationale. This field is reviewable product metadata and is not accepted as proof by itself.

The first implementation should use deterministic normalization/fingerprint rules plus explicit field comparisons. Semantic/model-based similarity may be added later as an advisory layer, never as the only identity gate.
## 8. Candidate Run and completion profile

Every accepted proposal receives one durable Harness Run with:

```text
mode = idea-lab
objective = implement this exact proposal into a runnable preview
```

The Run still performs mandatory preflight and uses the same Supervisor, ChatGPT Web worker, Desktop Agent, recovery, evidence, and side-effect ledger.

Idea Lab needs a separate completion profile because preview experiments should not require a permanent PR/merge lifecycle.

Required candidate path:

```text
PREFLIGHT
CONTEXT
ANALYZE
PLAN
IMPLEMENT
TEST
SELF_REVIEW
COMMIT
DEPLOY
PRODUCTION_VERIFY
DONE
```

`PR`, `CI`, and `MERGE` are skippable only under an explicit Idea Lab preview completion policy recorded on the Run. They are not globally weakened for Project Workspace Runs.

The existing full Project Workspace delivery profile remains unchanged.
## 9. Sandbox repository and worktree strategy

Idea Lab must not create one GitHub repository per candidate.

Use one configured sandbox repository for prototype production. Each production receives a unique branch and isolated worktree.

Recommended branch identity:

```text
idea/<campaignId>/<productionId>
```

The branch is derived from safe Iseol IDs and validated before Git mutation.

Candidate implementation happens only inside its assigned worktree. Cross-candidate path access is rejected by the existing Desktop Workspace Guard.

On successful COMMIT, the production record captures the exact commit SHA. No later promotion is allowed to substitute a different branch head implicitly.

Failed or archived candidate branches may be cleaned by a separate bounded cleanup policy after their durable production/history records are safe. `main`, `develop`, configured protected branches, promoted candidate branches, and branches referenced by active Runs are never cleanup targets.

The sandbox repository itself may be local-only during deterministic testing. Live preview production requires a configured remote/provider path appropriate to the deployment adapter.

## 10. Preview deployment adapter

Introduce a narrow `PrototypeDeployAdapter` boundary owned by Iseol Core/provider integration, not ChatGPT Web.
The adapter accepts bounded deployment identity such as candidate ID, repository/branch/commit, and provider configuration reference. It never accepts arbitrary shell text from the browser worker.

A successful adapter result provides:

- provider name
- deployment ID/reference when available
- preview URL
- deployed commit SHA
- provider timestamps when available

Deployment side-effect identity is stable across retry:

```text
prototype:<campaignId>:<productionId>:<commitSha>
```

Before redeploying after interruption, recovery reconciles provider reality by that identity/reference. If the provider already has the exact commit deployed, the existing deployment is reused.

The first deterministic implementation uses a fake/in-memory deployment adapter for tests. A real preview adapter is introduced only behind the same contract.

Missing provider credentials or capability results in `WAITING_EXTERNAL`/campaign `blocked`; Iseol must not fabricate a preview URL or mark the candidate READY.

## 11. Production verification and PrototypeCandidate materialization

A production becomes `ready` only when both are true:

1. the Harness Run has required Idea Lab completion evidence through `PRODUCTION_VERIFY`;
2. the verified deployment resolves to the same captured commit SHA.
Only then does Core create/save the existing `PrototypeCandidate`:

```ts
{
  id: productionId,
  title: proposal.title,
  concept: proposal.concept,
  repository: {
    url: sandboxRepositoryUrl,
    branch: productionBranch,
    commitSha: verifiedCommitSha,
  },
  deployment: {
    url: verifiedPreviewUrl,
    provider,
    deploymentId,
  },
  runIds: [runId],
  status: "candidate",
  createdAt,
  updatedAt,
}
```

Materialization is idempotent. Re-running reconciliation for an already materialized READY production must produce the same candidate identity and must not overwrite a conflicting repository/deployment snapshot.

## 12. Promotion integration

Promotion continues to use the existing `promotePrototype()` path.
Promotion must freeze the exact existing candidate repository/branch/commit and deployment snapshot; it must not regenerate the prototype or rebuild from a new branch head.

The selected candidate's Run history is imported as Genesis exactly as the current Project Model already does.

Promotion is explicit user action. Campaign completion alone never promotes a candidate.

Non-selected READY candidates remain lightweight `candidate` records until archived or promoted. Archiving removes them from the normal active gallery but does not erase their durable campaign/Run evidence.

## 13. Campaign supervisor

Add an `IdeaLabCampaignSupervisor` above the existing Harness Run Supervisor.

Its responsibilities are limited to orchestration:

1. load durable Campaign state;
2. reconcile current proposal/production/candidate reality;
3. request new proposals when READY + viable queued/running supply is insufficient;
4. apply the distinctness gate;
5. create one production + one preflighted Run per accepted proposal;
6. supervise no more than configured concurrency;
7. materialize READY `PrototypeCandidate` records after verified deployment;
8. replenish after `FAILED_FINAL` until target READY count or a real blocker is reached;
9. persist Campaign checkpoints/events before moving on.

It must not directly edit files, run Git, invoke unrestricted browser actions, or perform deployment outside existing worker/provider boundaries.
## 14. Recovery and idempotency

Campaign recovery always inspects durable truth before creating or repeating work.

Required stable identities:

- proposal ID — generated once and persisted;
- production ID — one per accepted proposal;
- Run ID — one canonical Run per production;
- branch/worktree identity — derived from production ID;
- Desktop job/intent IDs — existing Web/Desktop idempotency rules;
- deployment side-effect key — campaign/production/commit;
- PrototypeCandidate ID — production ID.

Recovery examples:

- ChatGPT Web generation dies: resume/replace the same Run session generation.
- Desktop Agent disconnects after mutation: reconcile the same job/commit before retry.
- process/test fails retryably: Run Supervisor handles bounded retry/replan.
- deploy response is lost: query provider reality before issuing another deployment.
- candidate materialization crashes after save: load existing candidate and verify exact snapshot.
- Core restarts between candidates: reload Campaign and continue toward the same target READY count.

A production in an indeterminate mutation state is not replaced with a new production until reconciliation proves the old side effect safe or final-failed.

## 15. Proposal generation boundary

Proposal generation is a reasoning task performed through the ChatGPT Web Bridge or another explicitly configured bounded reasoning provider.
The generated structured result contains only proposal metadata necessary for production and distinctness checks. It does not persist hidden reasoning, browser DOM dumps, authentication state, or arbitrary prompt transcripts.

Proposal generation is bounded by a maximum attempts budget. Repeated malformed or duplicate proposals eventually block/replan rather than looping forever.

When no authenticated ChatGPT Web driver is installed, deterministic tests may use a fake proposal provider, but live Campaign production must surface the missing provider as an external blocker.

## 16. Web Control Plane and Idea Lab UI

Extend the existing Idea Lab view rather than creating a second web application.

The view should expose:

- active/recent Campaign summaries;
- target READY count and current READY count;
- per-production status and associated Run summary;
- READY prototype cards with preview URL;
- failure/blocker summaries without credentials or raw provider payloads;
- explicit Promote and Archive controls for eligible candidates;
- a `Create Campaign` / `Make More` action.

Suggested API surface:

```text
GET  /api/idea-lab
POST /api/idea-lab/campaigns
GET  /api/idea-lab/campaigns/:id
POST /api/idea-lab/campaigns/:id/cancel
POST /api/prototypes/:id/promote   (existing)
POST /api/prototypes/:id/archive
```
Campaign/prototype mutations reuse the existing Web Control Plane mutation authorization boundary. A public bind without configured authentication remains forbidden.

Cancel is non-destructive: it stops new proposal/production scheduling. Active Runs are only cancelled through normal Harness state transitions; indeterminate external mutations are reconciled before cleanup.

The default gallery continues to prioritize READY `PrototypeCandidate` cards. In-progress productions are visibly separate and cannot show a Promote action.

## 17. Persistence and events

Use atomic JSON for mutable Campaign/proposal/production records and append-only events for orchestration history.

Recommended layout:

```text
<dataRoot>/idea-lab/campaigns/<campaignId>.json
<dataRoot>/idea-lab/proposals/<proposalId>.json
<dataRoot>/idea-lab/productions/<productionId>.json
<dataRoot>/idea-lab/campaign-events/<campaignId>.jsonl
```

All IDs use the existing safe-ID discipline or a stricter Idea Lab equivalent; no path separators or traversal values are accepted.

Useful event types include:

- `campaign-created`
- `proposal-generated`
- `proposal-rejected`
- `production-created`
- `run-attached`
- `production-status-changed`
- `prototype-ready`
- `campaign-blocked`
- `campaign-completed`
- `campaign-cancelled`
Campaign events remain Idea Lab history until promotion; they are not written into unrelated Project Workspace histories.

## 18. Genesis backfill on promotion

Promotion must preserve more than the final commit/deployment. The selected prototype's origin should remain explainable after it becomes a Project Workspace.

Add optional origin metadata to the promotion-ready candidate or equivalent canonical lookup:

```ts
ideaLabOrigin?: {
  campaignId: string;
  proposalId: string;
  productionId: string;
}
```

Promotion resolves that origin and adds an immutable Idea Lab Genesis snapshot containing bounded fields such as:

- campaign seed/constraints summary;
- selected proposal title/concept and distinctness fields;
- production ID and canonical Run ID;
- final repository/commit/deployment identity;
- relevant candidate Run evidence/events already imported by current promotion;
- promotion/selection timestamp.

This is additive to the existing Genesis contract. Existing legacy/manual `PrototypeCandidate` records without Idea Lab origin remain promotable.

Rejected/unselected candidate histories are not copied into the selected project's Genesis.
## 19. Failure and human-intervention boundaries

Routine candidate failure is handled automatically where safe.

Automatic actions:

- generate a replacement proposal after a final-failed candidate;
- retry bounded reasoning/test/build failures under existing Harness policy;
- reconnect ChatGPT Web/Desktop workers;
- reconcile an existing deployment before retry;
- continue other candidates after one candidate fails;
- materialize an already verified candidate after a Core restart.

User intervention is required for:

- material change to campaign product constraints;
- destructive/irreversible sandbox cleanup outside configured policy;
- paid resource creation or unexpectedly paid deployment action;
- missing credentials/authorization that Core cannot obtain;
- ambiguous promotion/rebind identity;
- any existing Harness protected boundary.

A campaign never treats an external authorization blocker as a successful candidate.

## 20. Security invariants

- Global/project harness preflight remains mandatory for every candidate Run.
- ChatGPT Web remains reasoning-only and receives no repository write primitive.
- Repository/process/Git execution continues only through Desktop Agent contracts.
- Branch/worktree paths are derived from validated IDs and remain inside configured sandbox roots.
- Deployment adapters accept typed bounded input and never generic shell/browser-eval payloads.
- Browser cookies, profile paths, OAuth tokens, deployment credentials, raw environment values, and hidden reasoning are not stored in Campaign/Proposal/Production/Prototype/Genesis records.
- Web APIs return safe summaries only; provider raw payloads remain adapter-local.
- Unknown contract versions or stale production/Run/deployment identities fail closed before mutation.
- Campaign concurrency must not bypass Desktop Agent leases or provider rate limits.

## 21. Testing strategy

Deterministic tests come before live provider automation.

Required unit/contract coverage:

- Campaign/proposal/production safe IDs and version validation;
- atomic store round trips and append-only Campaign events;
- deterministic proposal distinctness fingerprints;
- duplicate/near-identical proposal rejection;
- target READY count and replacement scheduling;
- concurrency limit enforcement;
- one canonical Run per production;
- Idea Lab completion profile skips only explicitly configured PR/CI/MERGE stages;
- Project Workspace completion requirements remain unchanged;
- exact commit/deployment match before READY materialization;
- idempotent candidate materialization and conflict rejection;
- archive/promote eligibility rules;
- safe cancel semantics.
Required integration/E2E coverage:

- fake proposal provider -> Campaign -> three distinct productions;
- real temporary Git repository/worktrees through Desktop Agent;
- fake ChatGPT Web structured reasoning through current Web executor;
- fake deployment adapter with stable provider identities;
- one candidate final-fails and Campaign replenishes without restarting successful candidates;
- browser session loss recovers the same candidate Run;
- Desktop disconnect after mutation does not duplicate file/Git effects;
- deployment response loss reconciles without duplicate deploy;
- Core restart resumes Campaign from durable state;
- three READY candidates appear in Idea Lab view;
- promoting one candidate preserves exact code/deployment and imports only its Genesis origin/history.

Live smoke is a separate final gate and requires both:

1. authenticated `ChatGptBrowserDriver` capability;
2. configured real preview deployment adapter/authorization.

If either is unavailable, deterministic code remains testable but live production is reported as externally blocked.

## 22. Expected implementation modules

Likely new modules:

- `src/idea-lab/contracts.ts`
- `src/idea-lab/campaign-store.ts`
- `src/idea-lab/proposal-store.ts`
- `src/idea-lab/production-store.ts`
- `src/idea-lab/event-store.ts`
- `src/idea-lab/distinctness.ts`
- `src/idea-lab/proposal-provider.ts`
- `src/idea-lab/campaign-supervisor.ts`
- `src/idea-lab/production-service.ts`
- `src/idea-lab/deploy-adapter.ts`
- `src/idea-lab/test-support/fake-proposal-provider.ts`
- `src/idea-lab/test-support/fake-deploy-adapter.ts`

Likely modified modules:

- Harness completion-gate/profile logic;
- Project Model `PrototypeCandidate`/Genesis additive origin metadata;
- prototype promotion import path;
- Web Control Plane contracts/view model/router/static UI;
- Core bootstrap/configuration for Idea Lab provider/sandbox/deploy settings;
- `package.json` test registration and controlled smoke scripts.

Exact filenames may change after implementation planning inspects current boundaries; the contracts and ownership rules above are authoritative.

## 23. Implementation sequence

1. Idea Lab contracts, stores, events, and distinctness gate.
2. Campaign scheduling/replenishment without execution side effects.
3. Idea Lab Harness completion profile with Project Workspace regression proof.
4. Proposal provider boundary and fake provider.
5. sandbox production/Run creation and Desktop-backed candidate E2E.
6. deployment adapter boundary, fake deploy, verification, candidate materialization.
7. Promotion Genesis origin backfill.
8. Web Campaign/gallery controls.
9. deterministic interruption/recovery E2E and full regression.
10. real preview adapter/browser smoke only when external capability is available.

## 24. Success criteria

The phase is complete when all of the following are true:

1. one authorized Campaign can target three READY prototypes without repeated user `continue` prompts;
2. produced proposals are structurally distinct and cosmetic duplicates are rejected before production;
3. each candidate uses its own durable Run, branch, and isolated worktree;
4. one failed candidate can be replaced without restarting successful candidates;
5. browser/Desktop/Core interruption resumes durable Campaign/Run state without duplicate mutations;
6. deployment retry/recovery cannot produce duplicate external side effects for the same candidate commit;
7. only verified commit-matching previews become normal `PrototypeCandidate` gallery entries;
8. Idea Lab Web displays in-progress and READY state clearly and opens actual preview URLs;
9. explicit promotion reuses the exact candidate code/deployment and imports selected Idea Lab origin + Run history as Genesis;
10. existing Discord, Project Workspace, Web Control Plane, Calendar, GitHub review, Figma, Notion, Harness, Desktop Agent, and ChatGPT Web tests remain green;
11. missing live browser/deployment authorization is surfaced honestly as an external blocker rather than bypassed.

## 25. Current external dependencies

At specification time, deterministic implementation can proceed with fakes, but live end-to-end production still depends on:

- an authenticated production `ChatGptBrowserDriver` implementation/capability;
- a configured preview deployment provider adapter and authorization.

Neither dependency changes the deterministic Core contracts or permits bypassing authentication.

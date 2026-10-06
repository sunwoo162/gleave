# Iseol Idea Lab Live Runtime Design

## Purpose

Connect the existing durable Idea Lab campaign model to the real Iseol execution stack so a campaign created from the Web Control Plane can progress through proposal generation, Harness production, Desktop mutation/testing, Vercel preview deployment, verification, and prototype materialization.

The runtime must reuse the production ChatGPT Playwright driver added previously and the production `ChatGptIdeaProposalProvider` added in `d152226`. It must not introduce a second campaign state machine or replace existing Harness, Desktop Agent, or deployment identity rules.

## Current State

Already implemented:
- Durable Idea Lab Campaign, Proposal, Production, event, and candidate stores.
- `superviseIdeaLabCampaign()` with restart-safe proposal/production identity.
- `ChatGptIdeaProposalProvider` backed by the production browser driver contract.
- Production ChatGPT Playwright driver and bridge.
- Desktop prototype sandbox allocation.
- Harness hybrid Web/Desktop/provider execution primitives.
- Vercel production deploy adapter with reconcile/verify behavior.
- E2E proof of the complete flow using deterministic fake proposal/browser/deploy providers.

Missing in production:
- A runtime that owns active campaign execution.
- Production `createProduction` / `advanceProduction` binding.
- Web campaign creation enqueueing.
- Startup recovery of unfinished campaigns.
- Shared ownership of the one persistent ChatGPT browser driver.

## Scope

In scope:
- Add a production Idea Lab runtime service.
- Add production campaign driver bindings for proposal generation and prototype production.
- Enqueue newly-created campaigns without blocking the HTTP request on completion.
- Recover unfinished campaigns on process startup.
- Reuse one production ChatGPT browser driver across the Web bridge and proposal provider.
- Bind the real Desktop Agent transport and Vercel adapter.
- Fail closed when required external capabilities are unavailable.
- Preserve existing campaign, production, Run, commit, deployment, and candidate identities.

Out of scope:
- New queue infrastructure or a separate worker process.
- Parallel execution across multiple Iseol processes.
- Changing Idea Lab Campaign schema solely to track runtime process state.
- Auto-login, CAPTCHA, MFA, or browser credential handling.
- Creating or guessing a target repository when production settings are absent.
- Replacing Harness stages or Desktop mutation policy.
- Auto-promoting a READY prototype into a Project.

## Recommended Architecture

Use one in-process durable runtime whose volatile scheduler state is reconstructible from durable Campaign/Production/Run stores.

The Web request writes the Campaign first. After persistence succeeds, it signals the runtime with the campaign id and returns `201` immediately. The runtime executes `superviseIdeaLabCampaign()` asynchronously. On restart it scans durable campaigns and re-enqueues any status that can still progress.

```text
Web POST /api/idea-lab/campaigns
        |
        v
persist Campaign
        |
        +----> HTTP 201
        |
        v
IdeaLabRuntime.enqueue(campaignId)
        |
        v
superviseIdeaLabCampaign()
   | proposal             | production
   v                      v
ChatGptIdeaProposal   ProductionDriver
Provider                 |
                    Harness Run
                    Web reasoning
                    Desktop mutation/test/git
                    Vercel deploy/verify
                         |
                         v
                 READY PrototypeCandidate
```

`IdeaLabRuntime` is orchestration only. It does not own proposal distinctness, production state transitions, Run state transitions, deployment reconciliation, or candidate materialization logic; those remain in existing modules.

## Runtime Service Contract

Add a narrow service, expected near `src/idea-lab/runtime-service.ts`, with an interface conceptually equivalent to:

```ts
interface IdeaLabRuntimeService {
  enqueue(campaignId: string): void;
  recover(): Promise<void>;
  idle(): Promise<void>; // test/controlled shutdown support
  dispose(): Promise<void>;
}
```

`enqueue()` must be idempotent per process. The runtime keeps only a `Map<campaignId, Promise<void>>` or equivalent in-flight set. If the same campaign is enqueued while already active, it returns without starting another supervisor. The durable stores remain the source of truth after restart.

A campaign worker loads current state immediately before supervision. Terminal states `complete`, `cancelled`, and `blocked` are not advanced automatically. Progressable states such as `generating` and `producing` are eligible for execution and startup recovery.

The runtime must never turn an exception into a successful campaign state. Unexpected internal errors are logged in bounded/redacted form and the in-flight lock is released. Existing `IdeaLabCampaignBlockedError` and supervisor blocking behavior remain authoritative for known external blockers.

`dispose()` stops accepting new enqueue requests and waits for already-started workers to settle; it does not delete durable state. Tests may use `idle()` to await all current campaign tasks deterministically.

## Production Campaign Driver

Add a production campaign driver near `src/idea-lab/production-runtime-driver.ts`. It provides the existing supervisor callbacks:

```ts
createProduction(proposal, ordinal)
advanceProduction(production)
```

`createProduction` must:
- Derive deterministic production and Run ids from Campaign identity and ordinal.
- Create/reconcile one `idea-lab` Harness Run using the configured production repository as policy context.
- Allocate one Desktop prototype sandbox/worktree with the existing sandbox adapter.
- Persist repository URL, base ref, branch, worktree root, and canonical Run id in the returned `PrototypeProduction`.
- Reject identity conflicts rather than allocating a replacement production.

No production path may use `process.cwd()` as an implicit project repository simply because Iseol itself is running there.

`advanceProduction` reuses the proven E2E production flow but with real dependencies:
- Load the durable proposal and canonical Run.
- Create a Hybrid Stage Executor using the shared ChatGPT Web adapter, Desktop Agent transport, and provider executor.
- Supervise the canonical Harness Run rather than creating a new one on retry/restart.
- At `DEPLOY`, call `deployPrototypeProduction()` with the production Vercel adapter.
- At `PRODUCTION_VERIFY`, call `verifyPrototypeProductionDeployment()` and record provider evidence.
- When the Run is DONE, persist commit/deployment fields and materialize the candidate with `materializePrototypeCandidate()`.
- When the Run reaches final failure, return the same Production identity with `failed` status and a bounded failure summary.

The driver may create ephemeral executor objects per advancement, but all durable identity comes from existing stores. Lost Vercel responses must reconcile through the existing deployment key; Desktop retry must reuse existing job/idempotency keys through existing Harness/Desktop stores.

## External Capability Configuration

The live runtime is opt-in and requires explicit target settings. Add configuration equivalent to:

- `ISEOL_IDEA_LAB_RUNTIME_ENABLED=true|false`
- `ISEOL_IDEA_LAB_REPOSITORY_ROOT`
- `ISEOL_IDEA_LAB_REPOSITORY_URL`
- `ISEOL_IDEA_LAB_BASE_REF`
- `ISEOL_IDEA_LAB_SANDBOX_ROOT`
- `ISEOL_IDEA_LAB_AGENT_ID`
- `ISEOL_IDEA_LAB_TEST_EXECUTABLE`
- `ISEOL_IDEA_LAB_TEST_ARGS_JSON` (JSON string array)
- `ISEOL_IDEA_LAB_TEST_TIMEOUT_MS` (optional; defaults to 120000)

When runtime is enabled, repository root, repository URL, sandbox root, base ref, and agent id are required and must be validated before campaign execution starts.

Repository URL must be a supported Git remote URL for the existing sandbox/deploy path. Repository root and sandbox root must resolve to safe explicit paths; sandbox root must not equal or contain the Iseol repository/model/run/web/browser-profile roots. `repositoryRoot` is the trusted local source checkout used by the Desktop `GIT_WORKTREE_CREATE` operation and is intentionally contained by `sandboxRoot`, because the Desktop task `workspaceRoot` is the sandbox boundary and neither the source checkout nor allocated worktree may escape it. This production `repositoryRoot` is distinct from Iseol's own repository root.

The test executable and arguments are configuration-owned and are compiled into the canonical `TEST` Desktop Task Pack; the runtime must not guess `npm test`, a package manager, or any repository-specific command. `CONTEXT` uses bounded Git inspection and `COMMIT` uses one deterministic Git commit operation in the isolated production worktree.

Vercel credentials/project configuration continue to use the existing Vercel resolver. ChatGPT browser settings continue to use the existing browser resolver. Desktop Agent connection/configuration continues to use the existing Desktop Agent Core settings.

## Shared ChatGPT Driver Ownership

Only one production Playwright persistent browser driver may be launched for one configured profile in the Iseol process.

Bootstrap resolves the driver once, then shares that same instance with:
- `startChatGptWebBridgeService()` for Harness Web reasoning.
- `createChatGptIdeaProposalProvider()` for Campaign proposal generation.

The proposal provider closes only its owned conversation page after each generation. It must never call driver `dispose()`.

The process-level bootstrap owns driver disposal exactly once during shutdown. The Web bridge service may expose a disposal handle, but bootstrap must avoid double-closing the shared driver by using one explicit ownership layer.

If ChatGPT Web bridge is disabled but Idea Lab live runtime is enabled, the runtime still requires the browser driver because proposal generation and Harness Web reasoning require it. Configuration resolution therefore considers all consumers, not only `ISEOL_CHATGPT_WEB_ENABLED`.

## Desktop Agent Ownership

The current Desktop Agent Core startup returns a service containing the shared `transport`. Live Idea Lab needs that exact transport for sandbox allocation/execution.

Bootstrap must retain the started Desktop Agent Core service instead of discarding the resolved value inside a detached promise. The runtime receives the transport explicitly; it does not create a second WebSocket server or a second transport registry.

If Idea Lab live runtime is enabled and Desktop Agent Core is unavailable, misconfigured, or no configured agent can satisfy execution, the runtime fails closed. It must not mutate the repository through a direct shell fallback.

## Web Control Plane Integration

Extend Web router dependencies with an optional narrow enqueue capability rather than importing the runtime singleton directly:

```ts
ideaLabRuntime?: { enqueue(campaignId: string): void }
```

After `createWebIdeaLabCampaign()` successfully persists a Campaign, the POST route calls `enqueue(campaign.id)` and returns `201` without awaiting campaign completion.

The enqueue call is synchronous and only schedules work; asynchronous execution failures do not alter the already-sent HTTP response.

Runtime capability must be explicit to avoid silently accepting live campaigns when the user intended execution but prerequisites failed. The Web layer distinguishes:
- runtime disabled: preserve storage-only Campaign creation behavior;
- runtime ready: persist, enqueue, return `201`;
- runtime configured but blocked during bootstrap: reject new live Campaign creation with `503` before persistence.

This capability state should be passed as a router/server dependency. The router must not read browser, Vercel, Desktop, or runtime environment variables directly.

Cancellation remains durable through the existing cancel action. A running worker checks durable Campaign state each time the supervisor reloads it; once cancelled, no new proposal/production work should be scheduled.

## Startup Recovery

After all required runtime dependencies are successfully constructed, bootstrap calls `runtime.recover()`.

Recovery lists durable Campaigns and enqueues only progressable non-terminal campaigns. The recovery scan itself performs no side effects other than scheduling by canonical campaign id.

Duplicate recovery plus Web enqueue is safe because the in-process active map admits only one worker per campaign. Cross-restart duplication is prevented by existing durable Proposal/Production/Run/deployment identity and reconciliation rules.

The first recovery pass must finish scanning before startup is reported as runtime-ready. Individual Campaign execution continues asynchronously afterward.

## Bootstrap Composition

Introduce a testable composition boundary instead of adding more detached startup fragments directly to `src/index.ts`.

Expected responsibilities:
1. Resolve Web Control Plane, Desktop Agent Core, ChatGPT browser, Vercel, and Idea Lab runtime configs.
2. Start or resolve each enabled external capability once.
3. Create the shared ChatGPT driver once.
4. Create the ChatGPT Web bridge adapter/service from that driver.
5. Create `ChatGptIdeaProposalProvider` from that same driver.
6. Create the production campaign driver using Desktop transport, Harness roots, repository settings, and Vercel adapter.
7. Start Idea Lab runtime and recover unfinished campaigns.
8. Start Web Control Plane with runtime capability injected.

Shutdown reverses ownership without duplication:
- stop accepting new Web/Idea Lab work;
- dispose Idea Lab runtime after current workers settle or bounded shutdown policy is reached;
- stop Web Control Plane;
- stop Desktop Agent Core server;
- dispose the shared ChatGPT driver once.

The exact process signal integration may reuse the repository's existing shutdown style, but cleanup logic should live in the composition service so tests can invoke it without OS signals.

## Failure Semantics

Configuration errors are capability errors, not campaign successes.

Before runtime-ready:
- missing explicit Idea Lab target repository/sandbox/agent configuration -> runtime blocked;
- missing ChatGPT browser configuration/profile -> runtime blocked;
- missing Desktop Agent Core configuration -> runtime blocked;
- missing Vercel adapter configuration -> runtime blocked.

A blocked Idea Lab capability means no Idea Lab production driver, runtime worker, recovery pass, or live Campaign enqueue capability is constructed or used. It does not require the process composition to tear down an independently enabled shared Desktop Core, ChatGPT browser, or Web bridge that may serve non-Idea-Lab consumers; those resources remain composition-owned and are disposed normally on shutdown.

During execution:
- ChatGPT authentication/session failures propagate through existing provider/bridge classification and block or retry according to supervisor/Harness rules;
- Desktop disconnects use existing durable task reconciliation and never fall back to direct mutation;
- Vercel lost responses reconcile by deployment key before any second deploy;
- malformed ChatGPT proposal output is rejected by provider validation and cannot become an accepted Proposal;
- identity mismatches fail closed and never allocate replacement Runs, productions, or deployments.

Errors written to events/logs must remain bounded and redacted. Do not log browser profile paths, credentials, prompt bodies, full assistant payloads, Desktop tokens, or Vercel bearer tokens.

## Concurrency

Campaign-level concurrency is one active supervisor worker per campaign in one process.

`productionConcurrency` remains enforced by the existing Campaign supervisor semantics; the runtime does not add an independent competing concurrency controller.

Different Campaigns may execute concurrently only if existing shared dependencies can safely support them. Initial implementation should prefer a small runtime-wide campaign concurrency limit of one unless tests prove shared browser/Desktop behavior is safe with more. This is intentionally conservative for the first live production binding.

## Security and Path Safety

The live runtime introduces no new raw shell interface and no arbitrary model-selected repository target.

Required invariants:
- repository root, sandbox root, model root, run root, web root, and browser profile root are normalized before comparison;
- sandbox allocation cannot escape its configured sandbox root;
- browser profile must remain outside repository/model/run/web/sandbox roots;
- ChatGPT model output cannot select a repository path, branch base, agent id, deployment project, or arbitrary URL;
- production repository URL/base ref/agent id come only from trusted runtime configuration;
- destructive git operations remain subject to existing Desktop/Harness policy;
- Vercel only deploys the commit produced by the canonical Production Run;
- candidate materialization still requires DONE + `PRODUCTION_VERIFY` evidence.

## Deterministic Test Strategy

All normal tests run without a real ChatGPT account, Desktop machine, or Vercel account.

Runtime service tests:
- duplicate enqueue starts one supervisor invocation;
- separate Campaign ids are queued under the configured runtime-wide concurrency limit;
- worker lock is released after success and after failure;
- `recover()` enqueues only progressable Campaigns;
- recovery plus concurrent Web enqueue does not duplicate execution;
- `dispose()` rejects new enqueue work and waits for current work;
- cancelled/complete/blocked Campaigns are not restarted automatically.

Web tests:
- Campaign POST persists then enqueues when runtime is ready;
- HTTP response does not wait for Campaign completion;
- runtime-disabled mode preserves current storage-only behavior;
- configured-but-blocked runtime returns `503` without persisting a new Campaign;
- unauthorized requests still never enqueue.

Production driver tests:
- deterministic Production/Run identity and restart reconciliation;
- existing sandbox allocation is used and receives only configured repository/agent settings;
- retry never allocates a replacement canonical Run;
- Harness DONE materializes exactly one candidate;
- Harness final failure preserves Production identity and records bounded failure;
- Vercel lost response reconciles without duplicate deploy;
- deployment verification commit mismatch fails closed;
- missing proposal/Run/configured agent blocks rather than mutating elsewhere.

Bootstrap tests:
- shared browser factory is called once when both Web bridge and Idea Lab need ChatGPT;
- the exact same driver instance reaches Web bridge and proposal provider;
- Idea Lab can require the browser even when standalone Web bridge flag is false;
- Desktop Core transport is started once and shared with the production driver;
- runtime is not marked ready if any mandatory live dependency is absent;
- runtime recovery runs after dependencies are resolved and before ready status is exposed;
- shutdown disposes the shared browser once.

Regression gates:
- existing Idea Lab Campaign supervisor tests;
- existing Idea Lab E2E tests;
- ChatGPT browser/provider tests;
- Desktop Agent E2E/recovery tests;
- Vercel deploy adapter tests;
- Web Control Plane tests;
- full repository test suite, TypeScript build, and `git diff --check`.

## Controlled Live Verification

No normal test may silently use real external services.

A controlled live path is allowed only when all explicit Idea Lab runtime, ChatGPT browser, Desktop Agent, repository, and Vercel configuration is present. It should create a bounded one-prototype Campaign against the explicitly configured target repository/sandbox.

The live verification must prove:
- one Web-created Campaign is durably persisted;
- runtime enqueues it without holding the HTTP request open;
- proposal generation uses the production ChatGPT provider;
- one canonical Harness Run is created and reused;
- Desktop Agent performs mutation/test/git work in the configured sandbox worktree;
- Vercel deploy/verify uses the canonical commit;
- one READY Production and one matching PrototypeCandidate are persisted;
- a process restart can resume the same Campaign/Production/Run identities.

If any required external prerequisite is absent, live verification reports `blocked-external` and does not substitute a fake result.

## Expected Modules

Likely new modules:
- `src/idea-lab/runtime-config.ts`
- `src/idea-lab/runtime-service.ts`
- `src/idea-lab/production-runtime-driver.ts`
- `src/idea-lab/production-desktop-compiler.ts`
- optionally `src/runtime/iseol-runtime-services.ts` for testable process composition
- controlled runtime smoke script only if useful after deterministic wiring is complete

Likely modifications:
- `src/web-control-plane/router.ts`
- `src/web-control-plane/server.ts`
- `src/index.ts`
- `src/config.ts`
- `.env.example`
- `package.json` only if a smoke command is added
- focused Idea Lab/Web/bootstrap tests

The implementation plan may adjust filenames after code inspection, but it must preserve the boundaries in this spec.

## Explicit Design Decisions

1. Campaign durable stores remain authoritative; no queue database is introduced.
2. Web POST returns after persistence/enqueue, not after prototype completion.
3. One process executes at most one Campaign worker at a time initially.
4. Duplicate enqueue is collapsed by campaign id in memory; restart safety comes from durable identities.
5. One Playwright persistent driver is shared by all ChatGPT consumers in the process.
6. Desktop Agent transport is shared from the existing Core service; no second transport/server is created.
7. Production repository, sandbox, base ref, agent id, and Vercel project are configuration-owned, never model-owned.
8. Missing mandatory live capability blocks runtime readiness; no fake or direct-shell fallback is permitted.
9. Existing Harness stage machine, Idea Lab supervisor, Vercel reconciliation, and candidate materialization remain authoritative.
10. `blocked`, `cancelled`, and `complete` Campaigns are not automatically resumed by startup recovery.
11. Auto-promotion of a prototype is out of scope; READY candidates remain user-selectable.

## Success Criteria

Implementation is complete when:
- enabling Idea Lab live runtime with valid dependencies creates one testable runtime service;
- a Web-created Campaign is enqueued without waiting for completion;
- process-local duplicate enqueue cannot start two workers for the same Campaign;
- startup recovery resumes progressable durable Campaigns without changing canonical identities;
- real proposal generation uses `ChatGptIdeaProposalProvider` and the shared production browser driver;
- real Production execution uses one canonical Harness Run, Desktop sandbox worktree, and configured agent;
- Vercel deployment reconciles and verifies the exact canonical commit;
- successful completion materializes one READY candidate per successful Production;
- missing or unsafe external configuration fails closed and never mutates an implicit repository;
- deterministic focused tests and the full repository suite pass;
- TypeScript build and `git diff --check` pass;
- independent review finds no unresolved critical or important issue;
- live external validation, when prerequisites are unavailable, is reported only as `blocked-external`.

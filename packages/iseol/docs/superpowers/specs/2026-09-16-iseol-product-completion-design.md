# Iseol Product Completion Design

## Product statement

Iseol turns an idea into runnable prototypes, lets the user choose one prototype as the real project, and then keeps developing, testing, committing, deploying, and recording that project over time.

The product has two user modes:

1. **Idea Lab** — generate and run multiple materially different prototypes from one seed, inspect their progress and live previews, then promote one candidate.
2. **Project Workspace** — continue one promoted project as a long-running software project with structured work requests, Harness runs, commits, deployments, Discord control, and a durable tree history.

The product boundary is intentionally narrow: Iseol is a development automation system, not a generic shell, not a general-purpose remote desktop, and not a harness product exposed directly to users.

## Purpose-driven execution and portfolio evidence

Users choose a project purpose in product language—such as rapid prototype, operational service, portfolio project, or existing-project improvement. They do not select Harness, Agent Pack, Skill, or reasoning-loop internals. Iseol maps the selected purpose, project scale, and request to a bounded execution profile containing the required plan scope, policy, specialist roles, verification gates, documentation requirements, and approval boundaries.

The execution profile is explicit durable metadata on the project or work request. It is resolved by the Orchestrator and recorded with the Run; it never grants an agent capabilities beyond the existing policy and Desktop intent validators. Specialist roles are selected by dependency and evidence needs rather than started indiscriminately. Current role adapters remain authoritative, and unsupported roles are represented as planned capability rather than implied execution.

For portfolio-purpose work, the same durable evidence used to operate the project is organized into a portfolio document: project context, stack decisions, feature implementation, verified technical decisions, troubleshooting sequence, tests/builds/commits/deployments, and limitations. Documentation, Portfolio Structure, Humanizer, and Evidence Grounding are bounded transformations over Project/Run/Evidence records. They must cite durable evidence, distinguish facts from interpretation, avoid invented metrics, and allow the user to edit or exclude sections. No artificial defect or unnecessary complexity may be introduced to manufacture a portfolio story.

The user-facing Web flow presents purpose selection and a plain-language progress tree. Harness and agent configuration remains an internal projection. The durable tree is `Project -> Area -> Feature -> Task -> Run -> Stage/Attempt -> Commit/Test/Build/Diff/Evidence`, with Korean summaries generated from bounded records and detailed artifacts available on demand.

## Current architecture and decision

The repository already has the correct domain boundaries:

- `src/idea-lab` — campaigns, proposals, productions, candidates, deployment, campaign supervision.
- `src/project-model` — prototype promotion, project workspace, history, project tree, work context.
- `src/harness` — durable staged runs, state machine, events, checkpoints, evidence, recovery.
- `src/chatgpt-web` — structured reasoning and Desktop intent generation.
- `src/desktop-agent` — guarded local process/filesystem execution.
- `src/web-control-plane` — HTTP API, actions, view models, static serving.
- `src/discord-project` — Discord/project binding, project actions, status cards, history recording.
- `src/runtime` — composition and lifecycle of the runtime services.

The completion design therefore **does not replace the backend architecture**. The existing Node/TypeScript runtime remains canonical. Product work adds a React/Vite client and a small number of domain actions/read models to the existing control plane.

### Chosen approach

Use:

- existing Node + TypeScript runtime and stores;
- existing Web Control Plane as the only API boundary for the browser UI;
- existing Discord integration as a remote-control and notification surface;
- a new React + Vite SPA under `apps/iseol-web`;
- REST for mutations/read snapshots;
- SSE for live status updates;
- durable model state as the single source of truth.

Do not migrate the backend to Next.js and do not split the process into separately deployed services during this completion effort.

## Architectural invariants

1. **Durable state is canonical.** Browser and Discord render projections of the same persisted Campaign, Production, Candidate, Workspace, History, and Harness Run records.
2. **Web and Discord never execute shell commands directly.** They invoke bounded domain actions. Runtime/Harness/Desktop Agent remain the execution boundary.
3. **All mutating actions are idempotent or reject duplicate/conflicting identity safely.**
4. **Reasoning text is not the user-facing product state.** User-facing progress comes from stage, status, bounded summaries, and durable evidence.
5. **A promoted project preserves its Idea Lab origin.** Promotion is not a copy-and-forget operation.
6. **The runtime may retry transient protocol/provider failures without turning them into permanent product failure.** Known structurally unsafe conditions remain fail-closed.
7. **Once the final live smoke passes, engine work freezes.** New work should be product-facing unless a reproduced blocker violates an acceptance criterion.

## Top-level runtime flow

```text
Iseol Web ─────────────┐
                      ├──> Web Control Plane ───> Domain Actions / View Models
Discord Bot ──────────┘                                  │
                                                        ▼
                 ┌──────────────────────────────────────────────┐
                 │          Durable Iseol Domain State          │
                 │ Campaign / Production / Candidate / Project │
                 │ History / Harness Run / Evidence / Events   │
                 └──────────────────────────────────────────────┘
                                  │
                                  ▼
                      Iseol Runtime / Harness
                         │       │       │
                         ▼       ▼       ▼
                    ChatGPT   Desktop   Provider
                     Web       Agent    adapters
                                  │
                                  ▼
                             GitHub/Vercel
```

## Phase 0: engine hardening exit gate

Product work starts only after the current live-smoke blocker is closed.

### Current known state

The structured-result retry regression test was added in commit `cf6002fe5440ab60bfcfec86b96c566cd2db8198`.

The production policy was narrowed in commit `89e08f1511fde28897aedd274c90672ea8082b67` so generic malformed structured output remains retryable while repeated broken patch transport remains fail-closed.

Latest targeted verification result:

- 24 tests passed.
- 1 test failed: `tests/idea-lab-reasoning-budget-retry.test.ts`.
- Failure is a fixture-policy digest mismatch inside `recoverWebWorkerSession()`, not the original permanent-failure behavior.
- The fixture manually overwrites the preflight policy with `effectiveSha256: "policy"`; recovery correctly checks the policy against disk and rejects that fake digest.

### Required fix

The regression test must create a real `docs/HARNESS_ENGINEERING.md`, let `createProduction()` produce the real preflight policy, and only move the Run state to `IMPLEMENT / READY`. The test must not replace the real policy snapshot with a fake digest.

### Engine freeze gate

All of the following must be fresh and green:

1. targeted structured-result retry tests;
2. `npm test`;
3. `npm run build`;
4. `git diff --check`;
5. a fresh `npm run idea-lab:live:smoke` from new model/run/chatgpt roots;
6. exact pass output containing `restart=verified`;
7. `EXIT_CODE=0`.

After that point, runtime/harness changes require a reproduced acceptance blocker and a failing regression test first.

## Idea Lab product design

### Primary user journey

```text
Enter idea
  ↓
Campaign created
  ↓
Proposals generated
  ↓
Productions run concurrently within configured bound
  ↓
ANALYZE → PLAN → IMPLEMENT → TEST → COMMIT → DEPLOY → VERIFY
  ↓
Candidate cards appear as they become ready
  ↓
User opens preview and development trace
  ↓
User promotes one candidate
```

### Idea Lab pages

#### `/idea-lab`

Purpose: start a campaign and browse recent campaigns.

Required UI:

- idea text input;
- optional constraints list;
- target prototype count;
- production concurrency;
- create button;
- recent campaign cards with status, ready count, production count, last updated time;
- clear empty/loading/error states.

Defaults must match the existing action contract: target ready count `3`, production concurrency `1`.

#### `/idea-lab/:campaignId`

Purpose: live campaign execution surface.

Required UI:

- campaign seed and constraints;
- campaign progress summary;
- per-production cards;
- current Harness stage/status for each production;
- bounded blocker/retry text;
- ready prototype cards;
- deployment/preview link when available;
- cancel campaign action when legal.

Production display states map to user language:

- `running`/Harness `RUNNING` → **Running**;
- Harness `FAILED_RETRYABLE` or transient retry state → **Retrying**;
- `WAITING_EXTERNAL`, `WAITING_AGENT`, `BLOCKED_USER` → **Needs action**;
- `FAILED_FINAL`/production `failed` → **Failed**;
- candidate materialized → **Ready**.

Do not expose raw internal chain-of-thought. Show only durable summary/evidence fields already intentionally persisted.

#### `/prototypes/:prototypeId`

Purpose: evaluate one result before promotion.

Required UI:

- title and concept;
- repository branch and commit;
- deployment provider and URL;
- preview iframe when the target permits embedding;
- fallback “Open preview” action when framing is blocked;
- genesis run summary;
- Idea Lab origin;
- “Promote to project” action;
- promoted-project link after promotion.

### Idea Lab read model

Extend the Web Control Plane with a campaign-specific projection rather than making the client filter the full global payload.

Required shape:

```ts
export type WebIdeaLabCampaignDetail = {
  campaign: WebIdeaLabCampaignSummary;
  productions: WebIdeaLabProductionSummary[];
  prototypes: WebPrototypeCard[];
};
```

Add:

```text
GET /api/idea-lab/campaigns/:campaignId
GET /api/prototypes/:prototypeId
```

The existing global `GET /api/idea-lab` remains for dashboard/recent-list use.

## Live updates with SSE

The browser must not poll every second.

Add:

```text
GET /api/events
```

using `text/event-stream`.

The server emits bounded product events derived from durable state changes. Minimum event names:

```text
campaign.created
campaign.updated
campaign.completed
production.updated
run.updated
prototype.ready
project.promoted
project.updated
history.appended
```

Payload rules:

- contain identifiers and safe summaries only;
- never contain tokens/cookies/passwords/raw environment values;
- include `occurredAt`;
- include an event id so the client can de-duplicate;
- SSE is a refresh signal, not canonical state. After receiving an event, the client re-fetches the relevant REST resource.

This keeps correctness in the durable stores and makes reconnection simple.

## Promotion design

The existing `promotePrototype()` operation remains the canonical promotion transaction.

Promotion must preserve:

- Candidate id;
- repository URL, branch, commit SHA;
- deployment identity;
- Idea Lab campaign/proposal/production origin;
- all genesis Run snapshots and events;
- promoted timestamp.

Promotion produces exactly one active `ProjectWorkspace` for a candidate and is idempotent when repeated with the same identity.

Browser flow:

```text
POST /api/prototypes/:prototypeId/promote
        ↓
ProjectWorkspace
        ↓
navigate /projects/:projectId
```

## Project Workspace product design

### Project pages

#### `/projects`

Display active projects with:

- name;
- current status;
- repository;
- latest deployment;
- latest activity timestamp.

#### `/projects/:projectId`

Project overview contains:

- project identity;
- Idea Lab origin;
- current deployment;
- current/most recent work request;
- current Harness Run state;
- recent history;
- primary “Start work” action.

#### `/projects/:projectId/history`

Render the project tree and chronological history together.

Tree nodes are durable `ProjectTreeNode` objects. Selecting a node displays attached Runs and history events.

#### `/projects/:projectId/runs/:runId`

Display:

- objective;
- stage and status;
- stage events;
- evidence grouped by stage;
- commit/deployment references;
- safe failure/retry reason;
- timestamps.

### Project work requests

Add a dedicated subsystem `src/project-work` rather than mixing mutable work execution into `project-model`.

Contract:

```ts
export type ProjectWorkRequestStatus =
  | "queued"
  | "running"
  | "needs-action"
  | "failed"
  | "completed"
  | "cancelled";

export type ProjectWorkRequest = {
  version: 1;
  id: string;
  projectId: string;
  nodeId: string;
  objective: string;
  runId: string;
  status: ProjectWorkRequestStatus;
  createdAt: string;
  updatedAt: string;
};
```

Actions:

```text
POST /api/projects/:projectId/work
POST /api/projects/:projectId/work/:workId/retry
POST /api/projects/:projectId/work/:workId/cancel
```

Initial completion scope does not require arbitrary pause/resume mid-process. Retry/cancel are sufficient for the first complete product because Harness already has durable restart/recovery semantics. Pause/resume can be added after final acceptance if it is still useful.

### Project work lifecycle

A work request creates one `project-workspace` Harness Run against the promoted repository/worktree context.

Required stage flow:

```text
CONTEXT
ANALYZE
PLAN
IMPLEMENT
TEST
SELF_REVIEW
COMMIT
DEPLOY (when configured)
PRODUCTION_VERIFY (when configured)
DONE
```

PR/CI/MERGE remain optional provider stages and are not required for the first final acceptance demo unless the project policy explicitly enables them.

On successful completion:

- attach the run to the selected project tree node;
- append history events for run attachment;
- record canonical commit evidence;
- record deployment/verification lifecycle events when present;
- update node status to `done` only when the work request completes.

## Project history design

History is a product feature, not raw logging.

The tree answers **where the work belongs**. History answers **what happened and when**.

Required history sources:

- project promotion;
- work request creation/completion;
- Harness run attachment;
- commits;
- pull request lifecycle when available;
- deployment lifecycle;
- production verification;
- Discord project binding/actions;
- existing GitHub/Figma/Notion/calendar integrations where already supported.

Add project-work event types without replacing existing event types:

```text
work-request-created
work-request-completed
work-request-failed
```

The browser may derive grouped sections, but durable append-only history remains canonical.

## Discord product design

Discord is a remote-control surface, not a second dashboard implementation.

Minimum user-facing actions:

```text
/iseol idea
/iseol projects
/iseol status
/iseol history
```

Core buttons:

```text
New idea
Open Web
Status
Preview
Promote project
Retry work
Cancel work
```

Discord actions call the same domain services/control-plane actions used by Web. They must never create parallel state models.

Notifications are sent only for meaningful transitions:

- campaign started;
- production entered needs-action/failed;
- prototype ready;
- project promoted;
- project work started;
- tests completed;
- canonical commit recorded;
- deployment verified;
- work failed/needs action.

Notification content uses project/campaign name, run id, state, test/build summary, and safe references. No secrets and no raw model response text.

## Web frontend structure

Create `apps/iseol-web`.

```text
apps/iseol-web/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  src/
    main.tsx
    app.tsx
    router.tsx
    api/client.ts
    api/events.ts
    components/
      AppShell.tsx
      StatusBadge.tsx
      RunStageList.tsx
      PrototypeCard.tsx
      ProjectTree.tsx
      EmptyState.tsx
      ErrorState.tsx
    pages/
      DashboardPage.tsx
      IdeaLabPage.tsx
      IdeaLabCampaignPage.tsx
      PrototypePage.tsx
      ProjectsPage.tsx
      ProjectPage.tsx
      ProjectHistoryPage.tsx
      RunPage.tsx
    styles/
      tokens.css
      global.css
      components.css
```

Frontend state rules:

- `fetch` for REST;
- `EventSource` for invalidation/live refresh;
- component/local state for forms;
- no Redux, Zustand, or React Query in the completion scope;
- route loaders or page hooks must cancel/ignore stale requests on unmount;
- every page must implement loading, empty, and error states.

The Vite build output is copied into the existing Control Plane static root. The production server remains `src/web-control-plane/server.ts`.

## Control Plane security

Existing bearer-token behavior remains.

Rules:

- loopback may run without a token;
- non-loopback requires `ISEOL_WEB_TOKEN`;
- all mutations require the configured token;
- GET projections contain sanitized bounded text only;
- no endpoint accepts an arbitrary command, path traversal, executable, raw git command, or environment mutation;
- preview URLs come only from persisted deployment receipts;
- iframe uses restrictive sandbox attributes and the client falls back to a normal external link if embedding fails.

## Reliability and idempotency

- Campaign creation uses durable unique identity.
- Promotion remains idempotent for the same Candidate.
- Project work creation accepts an explicit client request id/idempotency key and returns the existing work request when safely repeated.
- Retry never creates a second canonical Run for the same retryable work request; it resumes/re-enters the existing durable Run unless a documented terminal re-run action explicitly creates a new request.
- SSE loss cannot lose state because clients re-fetch canonical resources.
- Service restart must reconstruct current product status entirely from disk.

## Failure UX

Map technical state to four user-facing classes:

1. **Running** — active work.
2. **Retrying** — transient failure being retried or safely resumable.
3. **Needs action** — external auth/capability/user/agent action required.
4. **Failed** — terminal domain failure.

Examples:

```text
IMPLEMENT — Retrying
The response format was invalid. Iseol is retrying safely.
```

```text
DEPLOY — Needs action
Deployment authorization is unavailable.
```

```text
TEST — Failed
Tests failed. Open the run for evidence and retry options.
```

## Testing strategy

Every new domain behavior follows RED → GREEN → regression.

Required layers:

- pure contract/view-model tests;
- router/action tests;
- server/SSE tests;
- React component/page tests for critical interaction state;
- browser E2E for Idea Lab → promotion → Project Workspace;
- final live acceptance using real runtime/browser/Desktop/provider capabilities.

The full existing `npm test` remains a release gate.

## Delivery phases

### Phase 0 — Engine freeze

Close current structured-result regression fixture, full verification, fresh live smoke, freeze engine.

### Phase 1 — Idea Lab Web

React shell, campaign creation/detail, live status, candidates, preview.

### Phase 2 — Promotion

Prototype detail and promotion into Project Workspace.

### Phase 3 — Project work

Work request domain, Run execution, retry/cancel, project overview.

### Phase 4 — Tree history

Tree navigation, run detail, commit/deployment/history projections.

### Phase 5 — Discord remote control

Idea/status/project/work actions and meaningful notifications.

### Phase 6 — Reliability and product polish

SSE reconnect, idempotency, restart recovery, responsive/loading/error states, security review.

### Phase 7 — Final acceptance

One uninterrupted scenario must demonstrate:

1. user enters an idea;
2. Iseol produces multiple runnable prototypes;
3. user previews them;
4. user promotes one;
5. Project Workspace appears;
6. user requests a new feature;
7. Iseol changes real code;
8. tests/build run;
9. canonical commit is created;
10. deployment is produced and verified when configured;
11. Discord receives meaningful status notifications;
12. Web Tree History contains the work;
13. the process is restarted;
14. the same project, run, history, and deployment identities are recovered.

Success message for the product demo:

> 아이디어를 입력하면 이설이 여러 실행 가능한 결과물을 만들고, 마음에 드는 하나를 프로젝트로 확정하면 이후 개발·테스트·커밋·배포의 전 과정을 계속 수행하고 기록한다.

## Non-goals for completion

The following are deliberately excluded until after final acceptance:

- multi-tenant accounts and billing;
- arbitrary remote shell UI;
- replacing the existing file stores with a database;
- Kubernetes/service decomposition;
- collaborative multi-user editing;
- mobile-native client;
- full IDE/editor inside Iseol Web;
- mandatory PR/CI/MERGE for every work request;
- speculative engine refactors after the live-smoke gate passes.

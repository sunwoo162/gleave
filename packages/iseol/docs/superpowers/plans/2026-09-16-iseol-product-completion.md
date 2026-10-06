# Iseol Product Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Iseol as a usable product that generates runnable Idea Lab prototypes, promotes one into a Project Workspace, continues real development work, records the complete history, and exposes the same state through Web and Discord.

**Architecture:** Keep the existing Node/TypeScript runtime, durable stores, Harness, ChatGPT Web, Desktop Agent, and provider adapters. Add a React/Vite SPA under `apps/iseol-web`, extend the existing Web Control Plane with product read models/actions/SSE, and add an isolated `src/project-work` subsystem for long-running promoted-project work. Web and Discord remain projections/controllers over the same durable domain state.

**Tech Stack:** Node.js, TypeScript, `node:test`, React, Vite, React Router, native `fetch`, `EventSource`, Discord.js, existing Harness/Desktop Agent/ChatGPT Web/GitHub/Vercel adapters.

**Spec:** `docs/superpowers/specs/2026-09-16-iseol-product-completion-design.md`

## Global Constraints

- Work on branch `feat/calendar-code-review`; do not open or merge a PR unless the user explicitly asks.
- Use RED → GREEN → regression for every behavior change.
- Use English Conventional Commit messages.
- The existing Node/TypeScript runtime remains canonical; do not migrate the backend to Next.js.
- Durable Campaign/Production/Candidate/Workspace/History/Harness state is the single source of truth.
- Browser and Discord actions must be bounded domain actions; never add an arbitrary shell/command execution API.
- Never expose chain-of-thought or raw model response text in product UI/API/Discord messages.
- `web/` is runtime state for ChatGPT Web workers/sessions and must never be emptied by the frontend build.
- Frontend production assets live only in `apps/iseol-web/dist` and are served from that dedicated static root.
- Frontend completion scope uses native `fetch` + `EventSource`; do not add Redux, Zustand, or React Query.
- Non-loopback Web Control Plane still requires `ISEOL_WEB_TOKEN`; every mutation remains bearer-token protected.
- After Phase 0 live smoke passes with `restart=verified` and `EXIT_CODE=0`, do not refactor engine/runtime code unless a reproduced acceptance blocker has a failing regression test.
- Purpose selection is a user-facing product choice; Harness, Agent, and Skill composition is resolved internally from explicit purpose/profile metadata.
- Portfolio output must be grounded in durable Project/Run/Evidence records, must not invent work or metrics, and must support user edits/exclusions.
- Specialist agents are selected by dependency and evidence needs; role names alone do not imply an implemented or independently verified agent.

---

## File Structure Map

### Existing backend files to extend

- `src/web-control-plane/contracts.ts` — public browser-safe read-model types.
- `src/web-control-plane/view-model.ts` — projections from durable stores to browser-safe views.
- `src/web-control-plane/router.ts` — bounded REST routes only.
- `src/web-control-plane/server.ts` — HTTP body parsing, static assets, SSE connection handling.
- `src/project-model/contracts.ts` — workspace/tree/history domain contracts.
- `src/project-model/project-tree.ts` — tree mutation helpers.
- `src/project-model/history-store.ts` — append-only project history.
- `src/project-model/workspace-store.ts` — durable Project Workspace state.
- `src/discord-project/project-command-actions.ts` — Discord project actions against canonical domain state.
- `src/discord-project/status-card.ts` — product-safe Discord status rendering.
- `src/runtime/iseol-runtime-services.ts` — compose project-work runtime only after its contract/service tests exist.

### New backend files

- `src/web-control-plane/event-stream.ts` — safe SSE event hub and event serialization.
- `src/project-work/contracts.ts` — Project Work Request contract and validation.
- `src/project-work/store.ts` — isolated durable work-request store.
- `src/project-work/service.ts` — create/retry/cancel work-request domain operations.
- `src/project-work/runtime-driver.ts` — maps a work request to one durable `project-workspace` Harness Run and reconciles terminal state/history.
- `src/project-work/runtime-service.ts` — bounded queue/reconciliation loop for project work.

### New frontend

- `apps/iseol-web/package.json`
- `apps/iseol-web/index.html`
- `apps/iseol-web/tsconfig.json`
- `apps/iseol-web/vite.config.ts`
- `apps/iseol-web/src/main.tsx`
- `apps/iseol-web/src/app.tsx`
- `apps/iseol-web/src/router.tsx`
- `apps/iseol-web/src/api/client.ts`
- `apps/iseol-web/src/api/events.ts`
- `apps/iseol-web/src/components/AppShell.tsx`
- `apps/iseol-web/src/components/StatusBadge.tsx`
- `apps/iseol-web/src/components/RunStageList.tsx`
- `apps/iseol-web/src/components/PrototypeCard.tsx`
- `apps/iseol-web/src/components/ProjectTree.tsx`
- `apps/iseol-web/src/components/EmptyState.tsx`
- `apps/iseol-web/src/components/ErrorState.tsx`
- `apps/iseol-web/src/pages/DashboardPage.tsx`
- `apps/iseol-web/src/pages/IdeaLabPage.tsx`
- `apps/iseol-web/src/pages/IdeaLabCampaignPage.tsx`
- `apps/iseol-web/src/pages/PrototypePage.tsx`
- `apps/iseol-web/src/pages/ProjectsPage.tsx`
- `apps/iseol-web/src/pages/ProjectPage.tsx`
- `apps/iseol-web/src/pages/ProjectHistoryPage.tsx`
- `apps/iseol-web/src/pages/RunPage.tsx`
- `apps/iseol-web/src/styles/tokens.css`
- `apps/iseol-web/src/styles/global.css`
- `apps/iseol-web/src/styles/components.css`

## Follow-on product work: purpose, agents, and portfolio

These follow-on tasks are product scope after the engine gate; they do not change the current DOGFOOD-01 identity or its durable state.

### Purpose profiles

- Add a validated closed purpose enum and profile contract for prototype, operational service, portfolio, and existing-project improvement.
- Add bounded profile resolution from the user request, project scale, and explicit approvals. Persist the selected profile with the Project Workspace/work request and record the resolved policy, roles, gates, and artifact requirements in the Run evidence.
- Expose purpose selection and plain-language consequences through Web and preserve the existing API token and mutation guards.

### Dependency-aware specialist roles

- Inventory the actually registered role/skill adapters before adding contracts. Represent unavailable roles as planned or blocked capability rather than silently executing a substitute.
- Add an Orchestrator profile planner that selects only roles required by the dependency graph: planning, implementation, design, review, QA, documentation, user validation, and governance where evidence requires them.
- Preserve worktree/branch isolation, concurrency limits, bounded retry budgets, independent review evidence, and existing Desktop policy validation.

### Evidence tree and summaries

- Extend Project Workspace read models to expose `Project -> Area -> Feature -> Task -> Run -> Stage/Attempt -> Commit/Test/Build/Diff/Evidence` without duplicating durable records.
- Add bounded Korean summaries derived from stage/status/evidence records, with drill-down links to safe diffs and verification artifacts. Never expose raw model output or chain-of-thought.

### Portfolio documents

- Add a durable portfolio request and generated-document record linked to Project Workspace evidence.
- Implement evidence collection, portfolio structure selection, humanized drafting, and evidence-grounding checks as bounded stages. Claims without supporting records must be omitted or marked unresolved; metrics must come only from recorded measurements.
- Support user edits, section exclusion, regeneration, and provenance links without mutating historical Run evidence.

---

### Task 1: Close the Engine Hardening Gate and Freeze It

**Files:**
- Modify: `tests/idea-lab-reasoning-budget-retry.test.ts`
- Verify only: `src/idea-lab/production-runtime-driver.ts`
- Verify only: `scripts/idea-lab-live-smoke.ts`

**Interfaces:**
- Consumes: current `createIdeaLabProductionRuntimeDriver()` behavior from commit `89e08f1511fde28897aedd274c90672ea8082b67`.
- Produces: a verified Phase 0 checkpoint where malformed non-patch structured output is retryable, malformed patch transport remains fail-closed, and fresh live smoke passes across restart.

- [ ] **Step 1: Fix only the regression-test policy fixture**

Change the imports and fixture setup so the test creates a real Harness policy file before `createProduction()` and preserves the generated preflight snapshot.

```ts
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";

const root = await mkdtemp(join(tmpdir(), "iseol-driver-structured-retry-"));
await mkdir(join(root, "docs"), { recursive: true });
await writeFile(
  join(root, "docs", "HARNESS_ENGINEERING.md"),
  "# Test Harness\n\nOnly operate inside this fixture.\n",
  "utf8",
);
```

Replace the manual `preflight` override with the real preflight:

```ts
await saveHarnessRun(root, {
  ...run,
  state: {
    ...run.state,
    stage: "IMPLEMENT",
    status: "READY",
    completedStages: ["PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN"],
  },
});
```

Do not change production code in this step.

- [ ] **Step 2: Run the two targeted regression suites**

Run:

```powershell
node --import tsx --test `
  tests/idea-lab-reasoning-budget-retry.test.ts `
  tests/idea-lab-production-runtime-driver.test.ts
```

Expected: all tests pass, including both:

```text
Idea Lab retries after structured-result rejection budget instead of permanently failing
Idea Lab fails one production after the Web reasoning retry budget is exhausted
```

- [ ] **Step 3: Run complete non-live verification**

Run:

```powershell
npm.cmd test
npm.cmd run build
git diff --check
```

Expected: zero test failures, TypeScript build exit code `0`, and no `git diff --check` errors.

- [ ] **Step 4: Commit the fixture correction**

```powershell
git add tests/idea-lab-reasoning-budget-retry.test.ts
git commit -m "test: use real policy for reasoning retry recovery"
```

- [ ] **Step 5: Run one fresh live smoke from isolated roots**

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$base = Join-Path $PWD "data\v1-e2e-final-$stamp"
$env:ISEOL_MODEL_ROOT = Join-Path $base "model"
$env:ISEOL_RUN_ROOT = Join-Path $base "runs"
$env:ISEOL_CHATGPT_WEB_ROOT = Join-Path $base "chatgpt"
npm.cmd run idea-lab:live:smoke
Write-Host "EXIT_CODE=$LASTEXITCODE"
```

Expected exact success class:

```text
Idea Lab live smoke passed: campaign=...; production=...; candidate=...; run=...; restart=verified
EXIT_CODE=0
```

If this does not pass, stop product work and add exactly one failing regression for the reproduced blocker before changing engine code.

---

### Task 2: Add Product Read Models and Separate Static UI Storage

**Files:**
- Modify: `src/web-control-plane/contracts.ts`
- Modify: `src/web-control-plane/view-model.ts`
- Modify: `src/web-control-plane/router.ts`
- Modify: `src/web-control-plane/server.ts`
- Modify: `tests/web-control-plane-view-model.test.ts`
- Modify: `tests/web-control-plane-router.test.ts`
- Modify: `tests/web-control-plane-server.test.ts`

**Interfaces:**
- Consumes: existing `IdeaLabView`, `WebPrototypeCard`, `ProjectWorkspaceView`.
- Produces:

```ts
export type WebIdeaLabCampaignDetail = {
  campaign: WebIdeaLabCampaignSummary;
  productions: WebIdeaLabProductionSummary[];
  prototypes: WebPrototypeCard[];
};

export type WebProjectCard = {
  id: string;
  name: string;
  status: "active" | "archived";
  repositoryUrl: string;
  branch: string;
  commitSha: string;
  deploymentUrl: string;
  updatedAt: string;
};

export type WebPrototypeDetail = WebPrototypeCard & {
  origin?: { campaignId: string; proposalId: string; productionId: string };
  runIds: string[];
};
```

- [ ] **Step 1: Write failing view-model tests for campaign detail, prototype detail, and project list**

Test these exact rules:

```ts
assert.equal(detail.campaign.id, campaign.id);
assert.deepEqual(detail.productions.map((item) => item.campaignId), [campaign.id]);
assert.deepEqual(detail.prototypes.map((item) => item.id), [candidate.id]);
assert.equal(prototype.origin?.campaignId, campaign.id);
assert.equal(projects[0]?.repositoryUrl, workspace.genesis.repository.url);
```

Run:

```powershell
node --import tsx --test tests/web-control-plane-view-model.test.ts
```

Expected: FAIL because the new projections do not exist.

- [ ] **Step 2: Implement the new view-model functions**

Add exact exports:

```ts
export async function buildIdeaLabCampaignDetail(
  modelRoot: string,
  harnessRoot: string,
  campaignId: string,
): Promise<WebIdeaLabCampaignDetail | null>;

export async function buildPrototypeDetail(
  modelRoot: string,
  prototypeId: string,
): Promise<WebPrototypeDetail | null>;

export async function buildProjectList(
  modelRoot: string,
): Promise<WebProjectCard[]>;
```

Use existing stores only. Sanitize blocker/reason text through the same bounded-safe text rules already used by `buildIdeaLabView()`.

Run the view-model test again and require PASS.

- [ ] **Step 3: Write failing router tests for the new GET routes**

Required routes:

```text
GET /api/idea-lab/campaigns/:campaignId
GET /api/prototypes/:prototypeId
GET /api/projects
```

Assertions:

```ts
assert.equal(response.status, 200);
assert.equal((response.body as WebIdeaLabCampaignDetail).campaign.id, campaign.id);
```

Unknown ids must return `404`.

Run:

```powershell
node --import tsx --test tests/web-control-plane-router.test.ts
```

Expected: FAIL until routes are implemented.

- [ ] **Step 4: Implement routes and separate static root from runtime `web/`**

Change server config to a dedicated field:

```ts
export type WebControlPlaneConfig = {
  host: string;
  port: number;
  token: string;
  modelRoot: string;
  harnessRoot: string;
  staticRoot: string;
};
```

Default:

```ts
staticRoot: resolve(process.cwd(), "apps", "iseol-web", "dist")
```

Update static serving calls to use `options.staticRoot`.

Never delete or repurpose `resolve(process.cwd(), "web")`; that path may contain ChatGPT Web worker/session state.

Run:

```powershell
node --import tsx --test `
  tests/web-control-plane-view-model.test.ts `
  tests/web-control-plane-router.test.ts `
  tests/web-control-plane-server.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/web-control-plane tests/web-control-plane-*.test.ts
git commit -m "feat: expose product read models"
```

---

### Task 3: Add Safe SSE Product Events

**Files:**
- Create: `src/web-control-plane/event-stream.ts`
- Modify: `src/web-control-plane/server.ts`
- Modify: `src/runtime/iseol-runtime-services.ts`
- Create: `tests/web-control-plane-events.test.ts`
- Modify: `tests/iseol-runtime-services.test.ts`

**Interfaces:**
- Produces:

```ts
export type WebProductEventType =
  | "campaign.created"
  | "campaign.updated"
  | "campaign.completed"
  | "production.updated"
  | "run.updated"
  | "prototype.ready"
  | "project.promoted"
  | "project.updated"
  | "history.appended";

export type WebProductEvent = {
  id: string;
  type: WebProductEventType;
  entityId: string;
  occurredAt: string;
  summary?: string;
};

export interface WebProductEventHub {
  publish(event: WebProductEvent): void;
  subscribe(listener: (event: WebProductEvent) => void): () => void;
}
```

- [ ] **Step 1: Write event-hub RED tests**

Verify publish/subscribe, unsubscribe, duplicate id suppression, and secret redaction:

```ts
hub.publish({
  id: "event-1",
  type: "run.updated",
  entityId: "run-1",
  occurredAt: "2026-09-16T00:00:00.000Z",
  summary: "token=secret status changed",
});
assert.doesNotMatch(JSON.stringify(received), /secret/);
```

Run:

```powershell
node --import tsx --test tests/web-control-plane-events.test.ts
```

Expected: FAIL because the hub does not exist.

- [ ] **Step 2: Implement `event-stream.ts`**

Use an in-process listener set and a bounded de-duplication set of recent event ids. Sanitize summaries with the same token/cookie/secret/password and Bearer redaction used by browser-safe projections. Event payloads are invalidation signals only.

- [ ] **Step 3: Add `GET /api/events` streaming in the HTTP server**

Response headers:

```text
content-type: text/event-stream; charset=utf-8
cache-control: no-cache
connection: keep-alive
```

Wire format:

```text
id: event-1
event: run.updated
data: {"id":"event-1","type":"run.updated","entityId":"run-1","occurredAt":"..."}

```

Send one comment heartbeat at a bounded interval such as `: keep-alive\n\n`; do not persist heartbeat events.

- [ ] **Step 4: Publish events from runtime/domain transition boundaries**

Publish after durable writes, never before them. Minimum transitions for this task:

- campaign enqueue/create completion;
- production status change reconciliation;
- candidate ready;
- promotion completion;
- project history append.

Runtime composition owns one hub instance and passes it to Web server/domain integration. If the runtime restarts, no event replay is required because the client re-fetches canonical REST state.

Run:

```powershell
node --import tsx --test `
  tests/web-control-plane-events.test.ts `
  tests/iseol-runtime-services.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/web-control-plane/event-stream.ts src/web-control-plane/server.ts src/runtime/iseol-runtime-services.ts tests/web-control-plane-events.test.ts tests/iseol-runtime-services.test.ts
git commit -m "feat: stream product state events"
```

---

### Task 4: Build the React/Vite Shell and Idea Lab Experience

**Files:**
- Create all `apps/iseol-web` shell/API/component/Idea Lab files listed in the File Structure Map.
- Modify: root `package.json`
- Modify: `tests/web-control-plane-static.test.ts`

**Interfaces:**
- Consumes REST routes from Task 2 and `GET /api/events` from Task 3.
- Produces browser routes `/`, `/idea-lab`, `/idea-lab/:campaignId`, `/prototypes/:prototypeId`.

- [ ] **Step 1: Scaffold the isolated frontend package**

Run:

```powershell
New-Item -ItemType Directory -Force apps\iseol-web | Out-Null
npm.cmd --prefix apps/iseol-web init -y
npm.cmd --prefix apps/iseol-web install react react-dom react-router-dom
npm.cmd --prefix apps/iseol-web install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom vitest jsdom @testing-library/react @testing-library/user-event
```

Set scripts in `apps/iseol-web/package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run"
  }
}
```

Add root scripts:

```json
{
  "web:dev": "npm --prefix apps/iseol-web run dev",
  "web:build": "npm --prefix apps/iseol-web run build",
  "web:test": "npm --prefix apps/iseol-web run test"
}
```

Vite must use its default package-local `dist` output. Do not configure output to `web/`.

- [ ] **Step 2: Implement typed API and event clients first**

`src/api/client.ts` must expose:

```ts
export async function getIdeaLab(): Promise<IdeaLabView>;
export async function getCampaign(id: string): Promise<WebIdeaLabCampaignDetail>;
export async function createCampaign(input: {
  seed: string;
  constraints: string[];
  targetReadyCount: number;
  productionConcurrency: number;
}): Promise<{ id: string }>;
export async function cancelCampaign(id: string): Promise<void>;
export async function getPrototype(id: string): Promise<WebPrototypeDetail>;
export async function promotePrototype(id: string): Promise<{ id: string }>;
```

All non-2xx responses throw an `ApiError` containing `status` and safe server `error` text.

`src/api/events.ts` exposes:

```ts
export function subscribeProductEvents(
  onEvent: (event: WebProductEvent) => void,
): () => void;
```

- [ ] **Step 3: Write component/page RED tests**

Minimum tests:

```tsx
expect(screen.getByRole("button", { name: /create campaign/i })).toBeEnabled();
expect(screen.getByText("Retrying")).toBeInTheDocument();
expect(screen.getByRole("link", { name: /open preview/i })).toHaveAttribute("href", candidate.deployment.url);
```

Also verify a campaign SSE event triggers one re-fetch rather than mutating canonical data client-side.

Run:

```powershell
npm.cmd run web:test
```

Expected: FAIL until pages/components exist.

- [ ] **Step 4: Implement Idea Lab pages and shared components**

Use the exact status mapping:

```ts
export type ProductDisplayStatus = "Running" | "Retrying" | "Needs action" | "Failed" | "Ready";
```

Map Harness `FAILED_RETRYABLE` to `Retrying`; `WAITING_EXTERNAL`, `WAITING_AGENT`, and `BLOCKED_USER` to `Needs action`; terminal failure to `Failed`; candidate to `Ready`.

The Prototype preview iframe must use a restrictive sandbox such as:

```tsx
<iframe sandbox="allow-scripts allow-forms allow-popups" src={deploymentUrl} />
```

Always render an external “Open preview” link as fallback.

- [ ] **Step 5: Build and static-serve verification**

Run:

```powershell
npm.cmd run web:test
npm.cmd run web:build
node --import tsx --test tests/web-control-plane-static.test.ts
```

Expected: frontend tests/build pass and the Control Plane serves `apps/iseol-web/dist/index.html` without touching `web/web-workers`.

- [ ] **Step 6: Commit**

```powershell
git add apps/iseol-web package.json package-lock.json tests/web-control-plane-static.test.ts
git commit -m "feat: add idea lab web experience"
```

---

### Task 5: Complete Prototype Promotion and Project Browser Views

**Files:**
- Modify: `src/web-control-plane/contracts.ts`
- Modify: `src/web-control-plane/view-model.ts`
- Modify: `src/web-control-plane/router.ts`
- Modify: `tests/web-control-plane-view-model.test.ts`
- Modify: `tests/web-control-plane-router.test.ts`
- Create/Modify frontend: `ProjectsPage.tsx`, `ProjectPage.tsx`, `PrototypePage.tsx`, router tests.

**Interfaces:**
- Consumes: canonical `promotePrototype()` from `src/project-model/promotion.ts`.
- Produces: browser-visible project list/detail after promotion; no duplicate Workspace on repeated promotion.

- [ ] **Step 1: Add failing backend tests for promotion read-after-write**

Verify:

```ts
const first = await promotePrototype(...);
const second = await promotePrototype(...);
assert.equal(second.id, first.id);
assert.equal((await buildProjectList(root)).filter((p) => p.id === first.id).length, 1);
assert.equal((await buildPrototypeDetail(root, candidate.id))?.promotedProjectId, first.id);
```

Run relevant promotion + control-plane tests and confirm RED for missing list/detail projection behavior.

- [ ] **Step 2: Implement `GET /api/projects` and enriched project detail**

Project detail must include repository/deployment genesis plus current history/tree/runs. Do not duplicate genesis data into a second store.

- [ ] **Step 3: Implement frontend promotion navigation**

After successful:

```text
POST /api/prototypes/:prototypeId/promote
```

navigate directly to:

```text
/projects/:projectId
```

Repeated click after successful promotion disables mutation and shows an “Open project” action.

- [ ] **Step 4: Verify**

Run:

```powershell
node --import tsx --test `
  tests/project-model-promotion.test.ts `
  tests/web-control-plane-view-model.test.ts `
  tests/web-control-plane-router.test.ts
npm.cmd run web:test
npm.cmd run web:build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/web-control-plane apps/iseol-web tests
git commit -m "feat: promote prototypes from web"
```

---

### Task 6: Add Durable Project Work Requests and Runtime Execution

**Files:**
- Create: `src/project-work/contracts.ts`
- Create: `src/project-work/store.ts`
- Create: `src/project-work/service.ts`
- Create: `src/project-work/runtime-driver.ts`
- Create: `src/project-work/runtime-service.ts`
- Modify: `src/project-model/contracts.ts`
- Modify: `src/project-model/project-tree.ts`
- Modify: `src/project-model/history-store.ts`
- Modify: `src/runtime/iseol-runtime-services.ts`
- Create: `tests/project-work-contracts.test.ts`
- Create: `tests/project-work-store.test.ts`
- Create: `tests/project-work-service.test.ts`
- Create: `tests/project-work-runtime-driver.test.ts`
- Create: `tests/project-work-runtime-service.test.ts`

**Interfaces:**
- Produces the exact contract from the spec:

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

Service interface:

```ts
export async function createProjectWorkRequest(input: {
  root: string;
  projectId: string;
  nodeId: string;
  objective: string;
  requestId: string;
  at: string;
}): Promise<ProjectWorkRequest>;

export async function retryProjectWorkRequest(...): Promise<ProjectWorkRequest>;
export async function cancelProjectWorkRequest(...): Promise<ProjectWorkRequest>;
```

- [ ] **Step 1: RED contract/store tests**

Require safe ids, objective length `1..1000`, atomic JSON write behavior, isolated project/work paths, and idempotent repeated `requestId`.

Example:

```ts
const first = await createProjectWorkRequest(input);
const second = await createProjectWorkRequest(input);
assert.deepEqual(second, first);
assert.equal(first.runId, `run-work-${first.id}`);
```

Run:

```powershell
node --import tsx --test tests/project-work-contracts.test.ts tests/project-work-store.test.ts tests/project-work-service.test.ts
```

Expected: RED.

- [ ] **Step 2: Implement contracts/store/service minimally**

A work request may target only an existing active Workspace and existing tree node. `requestId` is the idempotency identity and must map deterministically to one work-request id. Cancelled/completed terminal requests cannot be mutated into another identity.

Append `work-request-created` to project history after the durable request write.

- [ ] **Step 3: RED runtime-driver tests**

Test one work request against a fake Harness executor and fake provider boundaries. Required behavior:

```ts
assert.equal(run.request.mode, "project-workspace");
assert.equal(run.request.objective, work.objective);
assert.equal(result.status, "completed");
assert.ok(updatedNode.runIds.includes(work.runId));
assert.ok(history.some((event) => event.type === "work-request-completed"));
```

Also test retryable → `needs-action`/`running` mapping and `FAILED_FINAL` → `failed`.

- [ ] **Step 4: Implement runtime driver/service**

Reuse `createDevelopmentRun()` and `superviseHarnessRun()`. Do not implement a second state machine.

The driver reconciles Harness status to product status:

```ts
function projectWorkStatus(runStatus: string): ProjectWorkRequestStatus {
  if (runStatus === "DONE") return "completed";
  if (runStatus === "FAILED_FINAL") return "failed";
  if (["WAITING_EXTERNAL", "WAITING_AGENT", "BLOCKED_USER"].includes(runStatus)) return "needs-action";
  return "running";
}
```

On `DONE`, attach `runId` to the selected node once, append completion history once, and import canonical commit/deployment lifecycle evidence through history events.

- [ ] **Step 5: Compose service and verify restart reconciliation**

Create a queued request, start runtime, advance, dispose, reconstruct runtime from the same roots, and assert the same work-request/run identity is resumed rather than duplicated.

Run all new project-work tests plus `tests/iseol-runtime-services.test.ts`.

- [ ] **Step 6: Commit**

```powershell
git add src/project-work src/project-model src/runtime tests/project-work-*.test.ts tests/iseol-runtime-services.test.ts
git commit -m "feat: run durable project work requests"
```

---

### Task 7: Expose Project Work API, History, and Run Detail in Web

**Files:**
- Modify: `src/web-control-plane/contracts.ts`
- Modify: `src/web-control-plane/view-model.ts`
- Modify: `src/web-control-plane/router.ts`
- Modify: `src/web-control-plane/server.ts`
- Modify: control-plane tests.
- Modify frontend: `ProjectPage.tsx`, `ProjectHistoryPage.tsx`, `RunPage.tsx`, `ProjectTree.tsx`.

**Interfaces:**
- Adds:

```text
POST /api/projects/:projectId/work
POST /api/projects/:projectId/work/:workId/retry
POST /api/projects/:projectId/work/:workId/cancel
GET  /api/projects/:projectId/work
GET  /api/projects/:projectId/runs/:runId
```

Mutation body:

```ts
{
  requestId: string;
  nodeId: string;
  objective: string;
}
```

- [ ] **Step 1: RED router tests for auth, identity, idempotency, and 404/409 behavior**

Verify mutation bearer token behavior remains identical to existing campaign/promotion routes.

Repeated same `requestId` must return the same work request. Same `requestId` with conflicting objective/node must return `409`.

- [ ] **Step 2: Implement browser-safe work/run projections**

Run detail may expose persisted evidence/event summaries and references, but must sanitize assignment-like secrets and Bearer text before response serialization.

- [ ] **Step 3: Implement project UI work form**

Form fields:

- objective textarea;
- selected project tree node;
- generated browser request id persisted for the duration of the submission.

Disable duplicate submission while the same request is pending.

- [ ] **Step 4: Implement tree/history/run screens**

`ProjectTree` renders node hierarchy from `parentId`. Selecting a node filters attached runs/history without changing durable data.

Run stages render in canonical order:

```ts
const STAGES = [
  "CONTEXT", "ANALYZE", "PLAN", "IMPLEMENT", "TEST",
  "SELF_REVIEW", "COMMIT", "DEPLOY", "PRODUCTION_VERIFY", "DONE",
] as const;
```

- [ ] **Step 5: Verify backend + frontend**

Run:

```powershell
node --import tsx --test `
  tests/project-work-*.test.ts `
  tests/web-control-plane-view-model.test.ts `
  tests/web-control-plane-router.test.ts `
  tests/web-control-plane-server.test.ts
npm.cmd run web:test
npm.cmd run web:build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/web-control-plane apps/iseol-web tests
git commit -m "feat: manage project work from web"
```

---

### Task 8: Add Discord Remote Control and Transition Notifications

**Files:**
- Modify: `src/register-commands.ts`
- Modify/add command modules under `src/commands`
- Modify: `src/discord-project/project-command-actions.ts`
- Modify: `src/discord-project/status-card.ts`
- Modify: `src/discord-project/history-recorder.ts`
- Add: `src/discord-project/notification-service.ts`
- Modify: Discord interaction/runtime tests.

**Interfaces:**
- Required slash command surface:

```text
/iseol idea
/iseol projects
/iseol status
/iseol history
```

Domain action helpers consume the same Campaign/Workspace/ProjectWork services used by Web.

- [ ] **Step 1: RED command/action tests**

Test that `/iseol idea` creates/enqueues the same campaign contract as Web, `/iseol projects` lists active Workspaces, `/iseol status` resolves the bound Workspace, and promotion/work buttons call canonical domain services exactly once.

- [ ] **Step 2: Implement commands and bounded buttons**

Buttons may represent only domain actions:

```text
new-idea
open-web
status
preview
promote-project
retry-work
cancel-work
```

No custom executable/path/command payload may be encoded in a Discord custom id.

- [ ] **Step 3: RED notification tests**

Only emit notifications on meaningful transitions. Given repeated polling/reconciliation of the same durable state, the same transition event id must not send twice.

Notification rendering example:

```text
Iseol · Schema Workbench
IMPLEMENT completed
TEST started
Run: run-...
```

- [ ] **Step 4: Implement notification service from durable transition events**

Consume canonical event/history identities; do not infer transitions from in-memory previous state alone. Sanitize all summaries before Discord rendering.

- [ ] **Step 5: Verify**

Run the full Discord project/interaction test set plus project-work tests.

- [ ] **Step 6: Commit**

```powershell
git add src/commands src/register-commands.ts src/discord-project tests
git commit -m "feat: control iseol projects from discord"
```

---

### Task 9: Reliability, Restart Recovery, Security, and Product Polish

**Files:**
- Modify: project-work runtime/service tests and implementation.
- Modify: Web server/router/event tests.
- Modify frontend shared components/styles/tests.
- Modify: `src/config.ts` only if a new documented config value is required.

**Interfaces:**
- Consumes every subsystem from Tasks 1–8.
- Produces release-grade behavior under duplicate requests, restart, dropped SSE, loading/error states, and unsafe input attempts.

- [ ] **Step 1: Add cross-subsystem restart E2E test**

The test must persist Campaign/Candidate/Workspace/ProjectWork/Run state, recreate runtime services from the same roots, and assert identity equality:

```ts
assert.equal(after.project.id, before.project.id);
assert.equal(after.work.id, before.work.id);
assert.equal(after.work.runId, before.work.runId);
assert.equal(after.project.genesis.repository.commitSha, before.project.genesis.repository.commitSha);
```

- [ ] **Step 2: Add duplicate-action/idempotency tests**

Cover campaign request, promotion, project-work creation, work retry, history append, Discord notification event, and SSE duplicate event id.

- [ ] **Step 3: Add security regression tests**

Reject:

```text
../ path ids
encoded slash/backslash ids
non-loopback server without token
mutation with wrong bearer token
unknown mutation fields
arbitrary executable/command fields in Web bodies
secret-like text leaking through API/SSE/Discord summaries
```

- [ ] **Step 4: Finish responsive/loading/empty/error frontend states**

All primary pages must render deterministic states for:

```text
loading
empty
request error
needs action
terminal failure
ready/completed
```

Use CSS media queries only; do not introduce a UI framework solely for responsive behavior.

- [ ] **Step 5: Run full release verification**

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run web:test
npm.cmd run web:build
git diff --check
```

Expected: all exit `0`.

- [ ] **Step 6: Commit**

```powershell
git add src apps/iseol-web tests package.json package-lock.json
git commit -m "test: harden iseol product recovery"
```

---

### Task 10: Final Product Acceptance and Handoff

**Files:**
- Create: `docs/iseol-product-acceptance.md`
- Modify only if acceptance finds a reproduced defect with its own RED test.

**Interfaces:**
- Produces the final evidence that the product statement is true end to end.

- [ ] **Step 1: Write the acceptance checklist before running it**

`docs/iseol-product-acceptance.md` must contain checkboxes for these exact actions:

```text
[ ] Create one Idea Lab campaign from Web
[ ] Produce multiple materially different runnable prototypes
[ ] Open each available preview
[ ] Promote one candidate
[ ] Confirm exactly one Project Workspace exists
[ ] Create one project work request
[ ] Observe real repository modification
[ ] Observe tests/build evidence
[ ] Observe canonical commit evidence
[ ] Observe deployment + production verification when configured
[ ] Observe meaningful Discord status notification
[ ] Observe project tree/history/run detail in Web
[ ] Restart Iseol services
[ ] Confirm the same project/work/run/deployment identities after restart
```

- [ ] **Step 2: Run fresh automated release gates**

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run web:test
npm.cmd run web:build
git diff --check
```

Record counts and exit codes in the acceptance document.

- [ ] **Step 3: Run a fresh Idea Lab live smoke again**

Use new isolated roots exactly as in Task 1. Require `restart=verified` and `EXIT_CODE=0`.

- [ ] **Step 4: Run the user-facing acceptance flow through Web + Discord**

Do not inspect/mutate active runtime state files while the scenario is running. Use only product surfaces and post-run durable evidence.

If any step fails, create one regression test for the specific failed acceptance criterion before changing code.

- [ ] **Step 5: Record final evidence and freeze completion scope**

The acceptance document records:

- tested commit SHA;
- full backend test result;
- TypeScript build result;
- frontend test/build result;
- live-smoke campaign/production/candidate/run identities;
- promoted project id;
- project work id/run id;
- canonical commit SHA;
- deployment URL/id when configured;
- restart verification result.

Do not include credentials, cookies, tokens, or private environment values.

- [ ] **Step 6: Commit documentation**

```powershell
git add docs/iseol-product-acceptance.md
git commit -m "docs: record iseol product acceptance"
```

## Final Definition of Done

The implementation is complete only when a fresh run demonstrates this statement without manual state repair:

> 아이디어를 입력하면 이설이 여러 실행 가능한 결과물을 만들고, 마음에 드는 하나를 프로젝트로 확정하면 이후 개발·테스트·커밋·배포의 전 과정을 계속 수행하고 기록한다.

The final run must survive process restart and recover the same durable project, work-request, Harness Run, history, commit, and deployment identities.

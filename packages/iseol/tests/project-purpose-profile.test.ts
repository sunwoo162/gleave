import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveExecutionProfile,
  type AgentRoleRegistration,
} from "../src/project-model/execution-profile.js";
import {
  buildPortfolioDraft,
  collectProjectEvidence,
  verifyPortfolioGrounding,
} from "../src/project-model/portfolio.js";
import type { ProjectWorkspace } from "../src/project-model/contracts.js";
import { loadProjectWorkspace, saveProjectWorkspace, setProjectPurpose } from "../src/project-model/workspace-store.js";
import { withDurableProjectWorkspaceLock } from "../src/project-model/workspace-lock.js";
import { appendProjectHistoryEvent, loadProjectHistory } from "../src/project-model/history-store.js";
import { saveHarnessRun } from "../src/harness/run-store.js";
import type { HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";
import { loadHarnessRun } from "../src/harness/run-store.js";
import { routeWebControlPlaneRequest } from "../src/web-control-plane/router.js";
import { createProjectWorkRequest, loadProjectWorkRequest } from "../src/project-model/work-request.js";

test("purpose profile selects executable stage adapters and labels unsupported specialists as planned", () => {
  const roles: AgentRoleRegistration[] = [
    { id: "orchestrator", kind: "stage-adapter", status: "registered" },
    { id: "planning", kind: "stage-adapter", status: "registered" },
    { id: "frontend", kind: "stage-adapter", status: "registered" },
    { id: "qa", kind: "stage-adapter", status: "registered" },
    { id: "documentation", kind: "specialist", status: "planned" },
  ];
  const result = resolveExecutionProfile({
    purpose: "portfolio",
    objective: "학생용 공부 기록 웹 서비스",
    roles,
  });
  assert.deepEqual(result.executableRoles, ["orchestrator", "planning", "frontend", "qa"]);
  assert.deepEqual(result.plannedRoles, ["review", "design-system", "documentation", "user"]);
  assert.match(result.koreanSummary, /포트폴리오/);
});

test("purpose profile fails closed for empty requirements and unsupported purpose", () => {
  assert.throws(() => resolveExecutionProfile({ purpose: "portfolio", objective: "", roles: [] }), /objective/i);
  assert.throws(() => resolveExecutionProfile({ purpose: "unknown" as never, objective: "x", roles: [] }), /purpose/i);
});

test("project purpose selection waits for the durable Workspace mutation lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-purpose-lock-"));
  const at = "2026-09-19T00:00:00.000Z";
  await saveProjectWorkspace(root, {
    version: 1,
    id: "project-purpose-lock",
    name: "Purpose lock",
    status: "active",
    genesis: { prototypeId: "prototype-purpose-lock", repository: { url: "local://pending", branch: "main" }, deployment: { url: "local://pending" }, runs: [], promotedAt: at },
    tree: [],
    createdAt: at,
    updatedAt: at,
  });
  const profile = resolveExecutionProfile({ purpose: "portfolio", objective: "Purpose lock test", roles: [] });
  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurableProjectWorkspaceLock(root, "project-purpose-lock", async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    });
  });
  await holderStarted;
  let settled = false;
  const selection = setProjectPurpose(root, "project-purpose-lock", profile, at).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  releaseHolder();
  const updated = await selection;
  assert.equal(updated.purposeSelection?.purpose, "portfolio");
});

test("control plane exposes purpose selection without exposing internal registries", async () => {
  const profile = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/execution-profile", headers: {},
    body: { purpose: "rapid-prototype", objective: "학생용 공부 기록 서비스" },
  }, { modelRoot: "unused", harnessRoot: "unused" });
  assert.equal(profile.status, 200);
  assert.deepEqual((profile.body as { executableRoles: string[] }).executableRoles, ["orchestrator", "planning", "frontend", "qa"]);
  assert.equal("roles" in (profile.body as Record<string, unknown>), false);
});

test("portfolio draft is grounded in durable workspace and run evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-portfolio-"));
  const at = "2026-09-19T00:00:00.000Z";
  const run: HarnessRuntimeRunEnvelope = {
    version: 1,
    request: { version: 1, runId: "run-portfolio", mode: "project-workspace", objective: "공부 기록 서비스", targetRoot: root },
    preflight: { version: 1, runId: "run-portfolio", status: "ready", policy: { version: 1, loadedAt: at, sources: [], effectiveSha256: "a".repeat(64) } },
    state: { version: 1, stage: "TEST", status: "DONE", completedStages: ["PREFLIGHT", "TEST"], skippedStages: [], updatedAt: at },
    evidence: [
      { version: 1, id: "ev-test", kind: "test", stage: "TEST", recordedAt: at, summary: "npm test passed", reference: "test-run" },
      { version: 1, id: "ev-run-credential", kind: "deployment", stage: "DEPLOY", recordedAt: at, summary: "preview deployed", reference: "https://preview.example/?access_token=secret" },
      { version: 1, id: "ev-nested-credential", kind: "deployment", stage: "DEPLOY", recordedAt: at, summary: "nested preview deployed", reference: "github:issue:https://preview.example/?access_token=secret" },
      { version: 1, id: "ev-summary-credential", kind: "deployment", stage: "DEPLOY", recordedAt: at, summary: "Authorization: Bearer portfolio-bearer api_key=portfolio-key" },
    ],
    updatedAt: at,
  };
  await saveHarnessRun(join(root, "runs"), run);
  const workspace: ProjectWorkspace = {
    version: 1, id: "project-study", name: "Study Log", status: "active",
    genesis: { prototypeId: "prototype-study", repository: { url: "https://user:password@example.test/study?access_token=secret", branch: "main", commitSha: "abc" }, deployment: { url: "https://study.test/?token=secret" }, runs: [], promotedAt: at },
    tree: [
      { id: "root", kind: "root", title: "Study Log", status: "in-progress", runIds: ["run-portfolio"], createdAt: at, updatedAt: at },
      { id: "feature-timer", parentId: "root", kind: "feature", title: "공부 시간 기록", status: "done", runIds: ["run-portfolio"], createdAt: at, updatedAt: at },
    ], createdAt: at, updatedAt: at,
  };
  await saveProjectWorkspace(root, workspace);
  const purposeSaved = await routeWebControlPlaneRequest({
    method: "PUT", path: "/api/projects/project-study/purpose", headers: {},
    body: { purpose: "portfolio", objective: "학생용 공부 기록 웹 서비스" },
  }, { modelRoot: root, harnessRoot: join(root, "runs"), now: () => at });
  assert.equal(purposeSaved.status, 200);
  const savedView = purposeSaved.body as { purposeSelection?: { purpose: string; profile: { executableRoles: string[] } }; executionPlan?: { documentationRequired: boolean } };
  assert.equal(savedView.purposeSelection?.purpose, "portfolio");
  assert.equal(savedView.executionPlan?.documentationRequired, true);
  assert.deepEqual(savedView.purposeSelection?.profile.executableRoles, ["orchestrator", "planning", "frontend", "qa"]);
  const history = await loadProjectHistory(root, "project-study");
  assert.equal(history.at(-1)?.type, "purpose-selected");
  const reloadedView = await routeWebControlPlaneRequest({
    method: "GET", path: "/api/projects/project-study", headers: {},
  }, { modelRoot: root, harnessRoot: join(root, "runs") });
  assert.equal((reloadedView.body as typeof savedView).purposeSelection?.purpose, "portfolio");
  await appendProjectHistoryEvent(root, {
    version: 1,
    id: "history-credential",
    projectId: "project-study",
    type: "deployment-created",
    at,
    summary: "preview deployment recorded",
    reference: "https://preview.example/#oauth_token=secret",
  });
  await appendProjectHistoryEvent(root, {
    version: 1,
    id: "history-nested-credential",
    projectId: "project-study",
    type: "deployment-created",
    at,
    summary: "nested preview deployment recorded",
    reference: "desktop-job:job-1:https://preview.example/#oauth_token=secret",
  });
  const evidence = await collectProjectEvidence(root, join(root, "runs"), "project-study");
  assert.equal(evidence.repository.url, undefined);
  assert.equal(evidence.deployment.url, undefined);
  const deploymentEvidence = evidence.evidence.find((item) => item.kind === "deployment");
  assert.ok(deploymentEvidence);
  assert.equal(deploymentEvidence.summary.includes("token=secret"), false);
  assert.equal(evidence.evidence.find((item) => item.id === "ev-run-credential")?.reference, undefined);
  assert.equal(evidence.evidence.find((item) => item.id === "ev-nested-credential")?.reference, undefined);
  assert.equal(evidence.evidence.find((item) => item.id === "history-credential")?.reference, undefined);
  assert.equal(evidence.evidence.find((item) => item.id === "history-nested-credential")?.reference, undefined);
  const summaryCredential = evidence.evidence.find((item) => item.id === "ev-summary-credential")?.summary ?? "";
  assert.equal(summaryCredential.includes("portfolio-bearer"), false);
  assert.equal(summaryCredential.includes("portfolio-key"), false);
  const draft = buildPortfolioDraft(evidence);
  assert.match(draft.overview, /Study Log/);
  assert.match(draft.readme, /공부 시간 기록/);
  assert.equal(draft.claims.every((claim) => claim.evidenceIds.length > 0), true);
  assert.deepEqual(verifyPortfolioGrounding(draft, evidence), { grounded: true, ungroundedClaimIds: [] });
  assert.equal(JSON.stringify(draft).includes("abc"), true);
  assert.equal(JSON.stringify(draft).includes("password"), false);
  assert.equal(JSON.stringify(draft).includes("secret"), false);

  const portfolio = await routeWebControlPlaneRequest({
    method: "GET", path: "/api/projects/project-study/portfolio", headers: {},
  }, { modelRoot: root, harnessRoot: join(root, "runs"), now: () => at });
  assert.equal(portfolio.status, 200);
  assert.equal((portfolio.body as { grounding: { grounded: boolean; documentGrounded: boolean } }).grounding.grounded, true);
  assert.equal((portfolio.body as { grounding: { documentGrounded: boolean } }).grounding.documentGrounded, true);
  assert.equal((portfolio.body as { evidence: Array<{ id: string }> }).evidence.some((item) => item.id === "ev-test"), true);
  assert.equal(JSON.stringify(portfolio.body).includes("token=secret"), false);
  const document = (portfolio.body as { document: { sections: Array<{ id: string; content: string; generatedContent: string; included: boolean }>; readme: string } }).document;
  const edited = await routeWebControlPlaneRequest({
    method: "PUT", path: "/api/projects/project-study/portfolio", headers: {},
    body: { sections: [{ id: "features", content: "사용자 편집 기능", included: true }, { id: "technology", content: "", included: false }], readme: "# Study Log\n\n사용자 편집 README" },
  }, { modelRoot: root, harnessRoot: join(root, "runs"), now: () => at });
  assert.equal(edited.status, 200);
  const saved = (edited.body as { document: typeof document }).document;
  assert.equal(saved.sections.find((section) => section.id === "features")?.content, "사용자 편집 기능");
  assert.equal(saved.sections.find((section) => section.id === "features")?.generatedContent, document.sections.find((section) => section.id === "features")?.generatedContent);
  assert.equal(saved.sections.find((section) => section.id === "technology")?.included, false);
  const reloaded = await routeWebControlPlaneRequest({
    method: "GET", path: "/api/projects/project-study/portfolio", headers: {},
  }, { modelRoot: root, harnessRoot: join(root, "runs"), now: () => at });
  assert.equal((reloaded.body as { document: typeof document }).document.readme, "# Study Log\n\n사용자 편집 README");
  assert.equal((reloaded.body as { grounding: { documentGrounded: boolean; needsReview: string[] } }).grounding.documentGrounded, false);
  assert.equal((reloaded.body as { grounding: { needsReview: string[] } }).grounding.needsReview.includes("features"), true);
});

test("purpose selection is included in a new project run preparation without creating a run", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-purpose-preparation-"));
  const at = "2026-09-19T00:00:00.000Z";
  await saveProjectWorkspace(root, {
    version: 1, id: "project-prep", name: "Prepared project", status: "active",
    genesis: { prototypeId: "prototype-prep", repository: { url: "https://example.test/repo", branch: "main" }, deployment: { url: "https://example.test" }, runs: [], promotedAt: at },
    tree: [], createdAt: at, updatedAt: at,
  });
  const saved = await routeWebControlPlaneRequest({
    method: "PUT", path: "/api/projects/project-prep/purpose", headers: {},
    body: { purpose: "portfolio", objective: "실제 프로젝트를 포트폴리오로 정리" },
  }, { modelRoot: root, harnessRoot: join(root, "runs"), now: () => at });
  assert.equal(saved.status, 200);
  const prepared = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/projects/project-prep/execution-preparation", headers: {},
    body: { runId: "run-prep", objective: "실제 프로젝트를 포트폴리오로 정리", targetRoot: root },
  }, { modelRoot: root, harnessRoot: join(root, "runs"), now: () => at });
  assert.equal(prepared.status, 200);
  const body = prepared.body as { request: { runId: string; purposeProfile: { purpose: string; executableRoles: string[] } }; plan: { plannedRoles: string[] } };
  assert.equal(body.request.runId, "run-prep");
  assert.equal(body.request.purposeProfile.purpose, "portfolio");
  assert.deepEqual(body.request.purposeProfile.executableRoles, ["orchestrator", "planning", "frontend", "qa"]);
  assert.ok(body.plan.plannedRoles.includes("documentation"));
  assert.equal(await loadHarnessRun(join(root, "runs"), "run-prep"), null);
});

test("run preparation refuses legacy workspaces without an explicit purpose", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-purpose-legacy-"));
  const at = "2026-09-19T00:00:00.000Z";
  await saveProjectWorkspace(root, {
    version: 1, id: "legacy-project", name: "Legacy", status: "active",
    genesis: { prototypeId: "prototype-legacy", repository: { url: "https://example.test/repo", branch: "main" }, deployment: { url: "https://example.test" }, runs: [], promotedAt: at },
    tree: [], createdAt: at, updatedAt: at,
  });
  const prepared = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/projects/legacy-project/execution-preparation", headers: {},
    body: { runId: "run-legacy", objective: "legacy", targetRoot: root },
  }, { modelRoot: root, harnessRoot: join(root, "runs"), now: () => at });
  assert.equal(prepared.status, 409);
});

test("Project Workspace routes use isolated model and Run roots instead of Idea Lab roots", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-isolation-"));
  const projectModelRoot = join(root, "project-model");
  const projectHarnessRoot = join(root, "project-runs");
  const ideaLabModelRoot = join(root, "idea-lab-model");
  const ideaLabHarnessRoot = join(root, "idea-lab-runs");
  const at = "2026-09-19T00:00:00.000Z";
  await saveProjectWorkspace(projectModelRoot, {
    version: 1, id: "isolated-project", name: "Isolated", status: "active",
    genesis: { prototypeId: "prototype-isolated", repository: { url: "https://example.test/repo", branch: "main" }, deployment: { url: "https://example.test" }, runs: [], promotedAt: at },
    tree: [{ id: "root", kind: "root", title: "Isolated", status: "in-progress", runIds: [], createdAt: at, updatedAt: at }],
    createdAt: at, updatedAt: at,
  });
  const deps = { modelRoot: ideaLabModelRoot, harnessRoot: ideaLabHarnessRoot, projectModelRoot, projectHarnessRoot, now: () => at };
  const saved = await routeWebControlPlaneRequest({
    method: "PUT", path: "/api/projects/isolated-project/purpose", headers: {},
    body: { purpose: "rapid-prototype", objective: "Build an isolated prototype" },
  }, deps);
  assert.equal(saved.status, 200);
  assert.equal((await loadProjectWorkspace(projectModelRoot, "isolated-project"))?.purposeSelection?.purpose, "rapid-prototype");
  assert.equal(await loadProjectWorkspace(ideaLabModelRoot, "isolated-project"), null);
  const prepared = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/projects/isolated-project/execution-preparation", headers: {},
    body: { runId: "run-isolated", objective: "Build an isolated prototype", targetRoot: root },
  }, deps);
  assert.equal(prepared.status, 200);
  assert.equal(await loadHarnessRun(projectHarnessRoot, "run-isolated"), null);
  assert.equal(await loadHarnessRun(ideaLabHarnessRoot, "run-isolated"), null);
});

test("project start creates one purpose-bound Harness Run and reuses it on duplicate requests", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-start-"));
  const at = "2026-09-19T00:00:00.000Z";
  const targetRoot = await mkdtemp(join(tmpdir(), "iseol-project-target-"));
  await saveProjectWorkspace(root, {
    version: 1, id: "project-start", name: "Start project", status: "active",
    genesis: { prototypeId: "prototype-start", repository: { url: "https://example.test/repo", branch: "main" }, deployment: { url: "https://example.test" }, runs: [], promotedAt: at },
    tree: [{ id: "root", kind: "root", title: "Start", status: "in-progress", runIds: [], createdAt: at, updatedAt: at }],
    purposeSelection: {
      version: 1, purpose: "rapid-prototype", selectedAt: at, source: "user",
      profile: resolveExecutionProfile({ purpose: "rapid-prototype", objective: "Build a study timer", roles: [
        { id: "orchestrator", kind: "stage-adapter", status: "registered" },
        { id: "planning", kind: "stage-adapter", status: "registered" },
        { id: "frontend", kind: "stage-adapter", status: "registered" },
        { id: "qa", kind: "stage-adapter", status: "registered" },
      ] }),
    },
    createdAt: at, updatedAt: at,
  });
  const executions: string[] = [];
  const deps = { modelRoot: root, harnessRoot: join(root, "runs"), iseolRoot: root, policyRoot: root, now: () => at,
    ideaLabRuntime: { state: "ready" as const, enqueueProjectRun: async (runId: string) => { executions.push(runId); return "accepted" as const; } } };
  const first = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/projects/project-start/execution-start", headers: {},
    body: { runId: "run-start", objective: "Build a study timer", targetRoot },
  }, deps);
  assert.equal(first.status, 201);
  const firstBody = first.body as { status: string; run: { request: { projectId?: string; purposeProfile?: { purpose: string } } } };
  assert.equal(firstBody.status, "created");
  assert.equal(firstBody.run.request.projectId, "project-start");
  assert.equal(firstBody.run.request.purposeProfile?.purpose, "rapid-prototype");
  assert.deepEqual(executions, ["run-start"]);
  const second = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/projects/project-start/execution-start", headers: {},
    body: { runId: "run-start", objective: "Build a study timer", targetRoot },
  }, deps);
  assert.equal(second.status, 200);
  assert.equal((second.body as { status: string }).status, "already-active");
  const workspace = (await routeWebControlPlaneRequest({ method: "GET", path: "/api/projects/project-start", headers: {} }, deps)).body as { tree: Array<{ runIds: string[] }>; history: Array<{ type: string; runId?: string }> };
  assert.deepEqual(workspace.tree[0]?.runIds, ["run-start"]);
  assert.equal(workspace.history.filter((event) => event.type === "run-attached" && event.runId === "run-start").length, 1);
  assert.equal(((await loadHarnessRun(join(root, "runs"), "run-start"))?.request as { projectId?: string }).projectId, "project-start");
});

test("linked work request remains waiting when Project Runtime enqueue is unavailable", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-start-waiting-"));
  const at = "2026-09-19T00:00:00.000Z";
  const targetRoot = await mkdtemp(join(tmpdir(), "iseol-project-waiting-target-"));
  await saveProjectWorkspace(root, {
    version: 1, id: "project-waiting", name: "Waiting project", status: "active",
    genesis: { prototypeId: "prototype-waiting", repository: { url: "https://example.test/repo", branch: "main" }, deployment: { url: "https://example.test" }, runs: [], promotedAt: at },
    tree: [{ id: "root", kind: "root", title: "Waiting", status: "in-progress", runIds: [], createdAt: at, updatedAt: at }],
    purposeSelection: {
      version: 1, purpose: "rapid-prototype", selectedAt: at, source: "user",
      profile: resolveExecutionProfile({ purpose: "rapid-prototype", objective: "Build a waiting project", roles: [
        { id: "orchestrator", kind: "stage-adapter", status: "registered" },
        { id: "planning", kind: "stage-adapter", status: "registered" },
        { id: "frontend", kind: "stage-adapter", status: "registered" },
        { id: "qa", kind: "stage-adapter", status: "registered" },
      ] }),
    },
    createdAt: at, updatedAt: at,
  });
  await createProjectWorkRequest({ root, projectId: "project-waiting", title: "Waiting task", objective: "Build a waiting project", idempotencyKey: "waiting-task", at, id: "work-waiting" });
  const result = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/projects/project-waiting/execution-start", headers: {},
    body: { runId: "run-waiting", objective: "Build a waiting project", targetRoot, workRequestId: "work-waiting" },
  }, { modelRoot: root, harnessRoot: join(root, "runs"), iseolRoot: root, policyRoot: root, now: () => at });
  assert.equal(result.status, 201);
  const request = await loadProjectWorkRequest(root, "project-waiting", "work-waiting");
  assert.equal(request?.status, "waiting");
  assert.equal(request?.runId, "run-waiting");
  assert.equal(request?.blocker, "Project Runtime is not configured");
});

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";
import { saveHarnessRun } from "../src/harness/run-store.js";
import { loadIdeaLabCampaign, saveIdeaLabCampaign } from "../src/idea-lab/campaign-store.js";
import { withDurableIdeaLabCampaignLock } from "../src/idea-lab/campaign-lock.js";
import { savePrototypeProduction } from "../src/idea-lab/production-store.js";
import { listIdeaLabCampaignEvents } from "../src/idea-lab/event-store.js";
import type { PrototypeCandidate } from "../src/project-model/contracts.js";
import { loadPrototypeCandidate, savePrototypeCandidate } from "../src/project-model/prototype-store.js";
import { routeWebControlPlaneRequest } from "../src/web-control-plane/router.js";
import { buildIdeaLabView } from "../src/web-control-plane/view-model.js";
import { createWebIdeaLabCampaign } from "../src/web-control-plane/idea-lab-actions.js";

const NOW = "2026-09-08T07:00:00.000Z";

async function fixture(token = "secret-token") {
  const root = await mkdtemp(join(tmpdir(), "iseol-idea-web-"));
  return { modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), token };
}

function auth() { return { authorization: "Bearer secret-token" }; }

test("Campaign creation uses defaults and enforces authenticated bounded input", async () => {
  const deps = await fixture();
  const unauthorized = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/idea-lab/campaigns", headers: {}, body: { seed: "focus tools" },
  }, deps);
  assert.equal(unauthorized.status, 401);

  const created = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/idea-lab/campaigns", headers: auth(), body: { seed: "focus tools" },
  }, { ...deps, now: () => NOW, campaignIdFactory: () => "camp-web-1" });
  assert.equal(created.status, 201);
  assert.equal((created.body as any).targetReadyCount, 3);
  assert.equal((created.body as any).productionConcurrency, 1);
  assert.equal((await loadIdeaLabCampaign(deps.modelRoot, "camp-web-1"))?.status, "generating");
  assert.equal((await listIdeaLabCampaignEvents(deps.modelRoot, "camp-web-1"))[0]?.type, "campaign-created");

  const invalid = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/idea-lab/campaigns", headers: auth(),
    body: { seed: "x", targetReadyCount: 999, productionConcurrency: 0 },
  }, { ...deps, campaignIdFactory: () => "camp-web-2" });
  assert.equal(invalid.status, 400);
});

test("Campaign creation waits for the durable cross-service campaign lock", async () => {
  const deps = await fixture();
  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurableIdeaLabCampaignLock(deps.modelRoot, "camp-web-create-lock-1", async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    });
  });
  await holderStarted;
  let settled = false;
  const creation = createWebIdeaLabCampaign({
    root: deps.modelRoot,
    body: { seed: "focus tools" },
    at: NOW,
    idFactory: () => "camp-web-create-lock-1",
  });
  void creation.then(() => { settled = true; }, () => { settled = true; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  releaseHolder();
  assert.equal((await creation).id, "camp-web-create-lock-1");
});

test("Campaign cancel is authenticated, idempotent, and rejects malformed ids", async () => {
  const deps = await fixture();
  await saveIdeaLabCampaign(deps.modelRoot, {
    version: 1, id: "camp-web-1", seed: "focus", constraints: [], targetReadyCount: 3,
    productionConcurrency: 1, proposalIds: [], productionIds: [], status: "producing",
    createdAt: NOW, updatedAt: NOW,
  });
  const first = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/idea-lab/campaigns/camp-web-1/cancel", headers: auth(), body: {},
  }, { ...deps, now: () => NOW });
  const second = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/idea-lab/campaigns/camp-web-1/cancel", headers: auth(), body: {},
  }, { ...deps, now: () => NOW });
  assert.equal(first.status, 200);
  assert.deepEqual(second.body, first.body);
  assert.equal((await loadIdeaLabCampaign(deps.modelRoot, "camp-web-1"))?.status, "cancelled");

  const malformed = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/idea-lab/campaigns/%2E%2E%2Fescape/cancel", headers: auth(), body: {},
  }, deps);
  assert.equal(malformed.status, 404);
});

test("Campaign cancel waits for the durable cross-service campaign lock", async () => {
  const deps = await fixture();
  await saveIdeaLabCampaign(deps.modelRoot, {
    version: 1, id: "camp-web-lock-1", seed: "focus", constraints: [], targetReadyCount: 3,
    productionConcurrency: 1, proposalIds: [], productionIds: [], status: "producing",
    createdAt: NOW, updatedAt: NOW,
  });
  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurableIdeaLabCampaignLock(deps.modelRoot, "camp-web-lock-1", async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    });
  });
  await holderStarted;
  let settled = false;
  const cancellation = routeWebControlPlaneRequest({
    method: "POST", path: "/api/idea-lab/campaigns/camp-web-lock-1/cancel", headers: auth(), body: {},
  }, { ...deps, now: () => NOW }).then((response) => { settled = true; return response; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  releaseHolder();
  assert.equal((await cancellation).status, 200);
});

test("prototype archive is authenticated and preserves immutable prototype identity", async () => {
  const deps = await fixture();
  const candidate: PrototypeCandidate = {
    version: 1, id: "prod-1", title: "Focus", concept: "Focus prototype",
    repository: { url: "https://example.invalid/repo.git", branch: "idea/camp/prod-1", commitSha: "abc123" },
    deployment: { url: "https://preview.invalid/prod-1" }, runIds: ["run-1"], status: "candidate",
    ideaLabOrigin: { campaignId: "camp-1", proposalId: "proposal-1", productionId: "prod-1" },
    createdAt: NOW, updatedAt: NOW,
  };
  await savePrototypeCandidate(deps.modelRoot, candidate);
  const response = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/prototypes/prod-1/archive", headers: auth(), body: {},
  }, { ...deps, now: () => NOW });
  assert.equal(response.status, 200);
  assert.equal((response.body as any).status, "archived");
  assert.deepEqual((await loadPrototypeCandidate(deps.modelRoot, "prod-1"))?.repository, candidate.repository);
});

function ideaRun(): HarnessRuntimeRunEnvelope {
  return {
    version: 1,
    request: { version: 1, runId: "run-prod-1", mode: "idea-lab", objective: "Build candidate", targetRoot: "C:/hidden/worktree" },
    preflight: { version: 1, runId: "run-prod-1", status: "ready", policy: { version: 1, loadedAt: NOW, sources: [], effectiveSha256: "a".repeat(64) } },
    state: { version: 1, stage: "IMPLEMENT", status: "RUNNING", completedStages: ["PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN"], skippedStages: [], updatedAt: NOW },
    evidence: [], updatedAt: NOW,
  };
}

test("Idea Lab view separates Campaign production progress from READY prototypes and redacts blockers", async () => {
  const deps = await fixture("");
  await saveIdeaLabCampaign(deps.modelRoot, {
    version: 1, id: "camp-1", seed: "focus", constraints: [], targetReadyCount: 3,
    productionConcurrency: 1, proposalIds: ["proposal-1"], productionIds: ["prod-1"], status: "blocked",
    blockerSummary: "token=super-secret deployment unavailable", createdAt: NOW, updatedAt: NOW,
  });
  await savePrototypeProduction(deps.modelRoot, {
    version: 1, id: "prod-1", campaignId: "camp-1", proposalId: "proposal-1", runId: "run-prod-1",
    repositoryUrl: "https://example.invalid/repo.git", sandboxRoot: "C:/secret/sandbox",
    worktreeRoot: "C:/secret/worktree", branch: "idea/camp-1/prod-1", baseRef: "main",
    status: "running", blockerSummary: "cookie=session-value waiting", createdAt: NOW, updatedAt: NOW,
  });
  await saveHarnessRun(deps.harnessRoot, ideaRun());
  const view = await buildIdeaLabView(deps.modelRoot, deps.harnessRoot);
  assert.equal(view.campaigns[0]?.readyCount, 0);
  assert.equal(view.productions[0]?.run?.stage, "IMPLEMENT");
  assert.equal(view.productions[0]?.status, "running");
  const serialized = JSON.stringify(view);
  assert.equal(serialized.includes("super-secret"), false);
  assert.equal(serialized.includes("session-value"), false);
  assert.equal(serialized.includes("C:/secret"), false);
});

test("Idea Lab static UI exposes Campaign controls and keeps Promote on prototype cards only", async () => {
  const webRoot = resolve(process.cwd(), "web");
  const html = await readFile(join(webRoot, "index.html"), "utf8");
  const script = await readFile(join(webRoot, "app.js"), "utf8");
  assert.match(html, /Create Campaign/);
  assert.match(html, /Make More/);
  assert.match(html, /id="campaign-list"/);
  assert.match(html, /id="production-grid"/);
  assert.match(script, /\/api\/idea-lab\/campaigns/);
  assert.match(script, /\/cancel/);
  assert.match(script, /\/archive/);
  assert.match(script, /Campaign progress/i);
  assert.match(script, /production\.status/);
  assert.match(script, /Open prototype/);
  assert.match(script, /Promote to project/);
  const productionRenderer = script.slice(script.indexOf("function productionCard"), script.indexOf("function renderIdeaLab"));
  assert.equal(productionRenderer.includes("Promote to project"), false);
});


test("ready Idea Lab runtime persists then enqueues exactly once without awaiting worker completion", async () => {
  const deps = await fixture();
  const enqueued: string[] = [];
  let workerResolved = false;
  const worker = new Promise<void>(() => { /* intentionally never resolves */ });
  const response = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/idea-lab/campaigns", headers: auth(), body: { seed: "live focus" },
  }, {
    ...deps, now: () => NOW, campaignIdFactory: () => "camp-live-1",
    ideaLabRuntime: { state: "ready", enqueue: (id: string) => { enqueued.push(id); void worker.then(() => { workerResolved = true; }); } },
  });
  assert.equal(response.status, 201);
  assert.deepEqual(enqueued, ["camp-live-1"]);
  assert.equal((await loadIdeaLabCampaign(deps.modelRoot, "camp-live-1"))?.status, "generating");
  assert.equal(workerResolved, false);
});

test("disabled Idea Lab runtime preserves storage-only campaign creation", async () => {
  const deps = await fixture();
  const response = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/idea-lab/campaigns", headers: auth(), body: { seed: "offline focus" },
  }, { ...deps, campaignIdFactory: () => "camp-disabled-1", ideaLabRuntime: { state: "disabled" } });
  assert.equal(response.status, 201);
  assert.equal((await loadIdeaLabCampaign(deps.modelRoot, "camp-disabled-1"))?.status, "generating");
});

test("blocked Idea Lab runtime returns 503 before persistence", async () => {
  const deps = await fixture();
  const response = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/idea-lab/campaigns", headers: auth(), body: { seed: "blocked focus" },
  }, { ...deps, campaignIdFactory: () => "camp-blocked-1", ideaLabRuntime: { state: "blocked" } });
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { error: "idea lab runtime unavailable" });
  assert.equal(await loadIdeaLabCampaign(deps.modelRoot, "camp-blocked-1"), null);
});

test("unauthorized campaign creation never persists or enqueues", async () => {
  const deps = await fixture();
  const enqueued: string[] = [];
  const response = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/idea-lab/campaigns", headers: {}, body: { seed: "private focus" },
  }, {
    ...deps, campaignIdFactory: () => "camp-unauthorized-1",
    ideaLabRuntime: { state: "ready", enqueue: (id: string) => enqueued.push(id) },
  });
  assert.equal(response.status, 401);
  assert.deepEqual(enqueued, []);
  assert.equal(await loadIdeaLabCampaign(deps.modelRoot, "camp-unauthorized-1"), null);
});

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROTOTYPE_BROWSER_ACCEPTANCE_CHECKS, type PrototypeCandidate } from "../src/project-model/contracts.js";
import { savePrototypeCandidate } from "../src/project-model/prototype-store.js";
import { loadProjectWorkspace } from "../src/project-model/workspace-store.js";
import { saveProjectWorkspace } from "../src/project-model/workspace-store.js";
import { routeWebControlPlaneRequest } from "../src/web-control-plane/router.js";
import { loadHarnessRun, requestHarnessRunRetry, saveHarnessRun } from "../src/harness/run-store.js";
import { updateProjectWorkRequest } from "../src/project-model/work-request.js";

function candidate(): PrototypeCandidate {
  return {
    version: 1,
    id: "prototype-001",
    title: "Study Race",
    concept: "Compete on study time",
    repository: { url: "https://github.com/example/repo", branch: "main", commitSha: "abc123" },
    deployment: { url: "https://study.example.com" },
    runIds: [],
    status: "candidate",
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
  };
}

async function fixture(token = "") {
  const root = await mkdtemp(join(tmpdir(), "iseol-web-router-"));
  const modelRoot = join(root, "model");
  const harnessRoot = join(root, "runs");
  await savePrototypeCandidate(modelRoot, candidate());
  return { modelRoot, harnessRoot, token };
}

test("Control Plane validation errors redact credential-shaped field names", async () => {
  const deps = await fixture("secret-token");
  const result = await routeWebControlPlaneRequest({
    method: "POST",
    path: "/api/idea-lab/campaigns",
    headers: { authorization: "Bearer secret-token" },
    body: { "token=control-secret": true },
  }, deps);

  assert.equal(result.status, 400);
  const message = (result.body as { error: string }).error;
  assert.equal(message.includes("control-secret"), false);
  assert.match(message, /\[redacted\]/i);

  const nested = await routeWebControlPlaneRequest({
    method: "POST",
    path: "/api/idea-lab/campaigns",
    headers: { authorization: "Bearer secret-token" },
    body: { "outer={access_token=control-secret}": true },
  }, deps);
  assert.equal(nested.status, 400);
  const nestedMessage = (nested.body as { error: string }).error;
  assert.equal(nestedMessage.includes("control-secret"), false);
  assert.match(nestedMessage, /\[redacted\]/i);

  const nestedVariants = await routeWebControlPlaneRequest({
    method: "POST",
    path: "/api/idea-lab/campaigns",
    headers: { authorization: "Bearer secret-token" },
    body: { "outer={client_secret=control-secret,jwt=jwt-secret,private_key=private-secret,session_id=session-secret,xapikey=x-api-secret,password_hash=hash-secret,sig=sig-secret}": true },
  }, deps);
  assert.equal(nestedVariants.status, 400);
  const nestedVariantsMessage = (nestedVariants.body as { error: string }).error;
  assert.equal(nestedVariantsMessage.includes("control-secret"), false);
  assert.equal(nestedVariantsMessage.includes("jwt-secret"), false);
  assert.equal(nestedVariantsMessage.includes("private-secret"), false);
  assert.equal(nestedVariantsMessage.includes("session-secret"), false);
  assert.equal(nestedVariantsMessage.includes("x-api-secret"), false);
  assert.equal(nestedVariantsMessage.includes("hash-secret"), false);
  assert.equal(nestedVariantsMessage.includes("sig-secret"), false);

  for (const [field, secret] of [["session_id", "solo-session-secret"], ["password_hash", "solo-hash-secret"], ["auth", "solo-auth-secret"], ["session", "solo-session-key"], ["signature", "solo-signature-secret"]] as const) {
    const solo = await routeWebControlPlaneRequest({
      method: "POST",
      path: "/api/idea-lab/campaigns",
      headers: { authorization: "Bearer secret-token" },
      body: { [`outer={${field}=${secret}}`]: true },
    }, deps);
    assert.equal(solo.status, 400);
    const soloMessage = (solo.body as { error: string }).error;
    assert.equal(soloMessage.includes(secret), false);
    assert.match(soloMessage, /\[redacted\]/i);
  }
});

test("routes Idea Lab and missing project reads", async () => {
  const deps = await fixture();
  const idea = await routeWebControlPlaneRequest(
    { method: "GET", path: "/api/idea-lab", headers: {} },
    deps,
  );
  assert.equal(idea.status, 200);
  assert.equal((idea.body as any).prototypes[0].id, "prototype-001");

  const missing = await routeWebControlPlaneRequest(
    { method: "GET", path: "/api/projects/project-missing", headers: {} },
    deps,
  );
  assert.equal(missing.status, 404);
});

test("records authenticated browser acceptance separately from local preview readiness", async () => {
  const deps = await fixture("secret-token");
  const checks = Object.fromEntries(PROTOTYPE_BROWSER_ACCEPTANCE_CHECKS.map((check) => [check, "pass"]));
  const response = await routeWebControlPlaneRequest({
    method: "POST",
    path: "/api/prototypes/prototype-001/browser-acceptance",
    headers: { authorization: "Bearer secret-token" },
    body: { checks },
  }, deps);
  assert.equal(response.status, 200);
  assert.equal((response.body as any).browserAcceptance.status, "verified");
});

test("routes prototype and campaign detail reads without mutation", async () => {
  const deps = await fixture();
  const prototype = await routeWebControlPlaneRequest(
    { method: "GET", path: "/api/prototypes/prototype-001", headers: {} },
    deps,
  );
  assert.equal(prototype.status, 200);
  assert.equal((prototype.body as any).prototype.id, "prototype-001");
  const missingCampaign = await routeWebControlPlaneRequest(
    { method: "GET", path: "/api/idea-lab/campaigns/missing", headers: {} },
    deps,
  );
  assert.equal(missingCampaign.status, 404);
});

test("work request API persists idempotent queue entries and exposes claims", async () => {
  const deps = await fixture("secret-token");
  await saveProjectWorkspace(deps.modelRoot, {
    version: 1, id: "project-queue", name: "Queue", status: "active",
    genesis: { prototypeId: "prototype-001", repository: candidate().repository, deployment: candidate().deployment, runs: [], promotedAt: "2026-09-07T00:00:00.000Z" },
    tree: [{ id: "root", kind: "root", title: "Queue", status: "planned", runIds: [], createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" }],
    createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z",
  });
  const rawBackslash = await routeWebControlPlaneRequest({
    method: "POST",
    path: "/api/projects/project-queue/work-requests",
    rawPath: "/api/projects\\project-queue/work-requests",
    headers: { authorization: "Bearer secret-token" },
    body: { title: "Must not be created", objective: "Raw path boundary", idempotencyKey: "raw-path-queue" },
  }, deps);
  assert.equal(rawBackslash.status, 404);
  const create = await routeWebControlPlaneRequest({ method: "POST", path: "/api/projects/project-queue/work-requests", headers: { authorization: "Bearer secret-token" }, body: { title: "Implement queue", objective: "Build durable queue", idempotencyKey: "queue-1" } }, deps);
  assert.equal(create.status, 201);
  const repeat = await routeWebControlPlaneRequest({ method: "POST", path: "/api/projects/project-queue/work-requests", headers: { authorization: "Bearer secret-token" }, body: { title: "Implement queue", objective: "Build durable queue", idempotencyKey: "queue-1" } }, deps);
  assert.equal(repeat.status, 200);
  assert.equal((repeat.body as any).id, (create.body as any).id);
  const list = await routeWebControlPlaneRequest({ method: "GET", path: "/api/projects/project-queue/work-requests", headers: {} }, deps);
  assert.equal(list.status, 200);
  assert.equal((list.body as any).requests.length, 1);
});

test("explicit work resume is authenticated, revision-bound, and refuses a claimed request without a Run", async () => {
  const deps = await fixture("secret-token");
  await saveProjectWorkspace(deps.modelRoot, {
    version: 1, id: "project-resume", name: "Resume", status: "active",
    genesis: { prototypeId: "prototype-001", repository: candidate().repository, deployment: candidate().deployment, runs: [], promotedAt: "2026-09-07T00:00:00.000Z" },
    tree: [{ id: "root", kind: "root", title: "Resume", status: "planned", runIds: [], createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" }],
    createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z",
  });
  const create = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/projects/project-resume/work-requests",
    headers: { authorization: "Bearer secret-token" },
    body: { title: "Resume work", objective: "Continue safely", idempotencyKey: "resume-1" },
  }, deps);
  assert.equal(create.status, 201);
  const workId = (create.body as any).id as string;

  const unauthorized = await routeWebControlPlaneRequest({
    method: "POST", path: `/api/projects/project-resume/work-requests/${workId}/resume`, headers: {},
    body: { expectedRevision: "stale", runId: "run-resume", targetRoot: join(tmpdir(), "resume-target") },
  }, deps);
  assert.equal(unauthorized.status, 401);

  const stale = await routeWebControlPlaneRequest({
    method: "POST", path: `/api/projects/project-resume/work-requests/${workId}/resume`,
    headers: { authorization: "Bearer secret-token" },
    body: { expectedRevision: "stale", runId: "run-resume", targetRoot: join(tmpdir(), "resume-target") },
  }, deps);
  assert.equal(stale.status, 409);
  assert.match((stale.body as any).error, /revision/);

  const claimed = await routeWebControlPlaneRequest({
    method: "POST", path: `/api/projects/project-resume/work-requests/${workId}/claim`,
    headers: { authorization: "Bearer secret-token" },
  }, deps);
  assert.equal(claimed.status, 200);
  const current = (await routeWebControlPlaneRequest({
    method: "GET", path: "/api/projects/project-resume/work-requests", headers: {},
  }, deps)).body as any;
  const request = current.requests[0];
  const claimedResume = await routeWebControlPlaneRequest({
    method: "POST", path: `/api/projects/project-resume/work-requests/${workId}/resume`,
    headers: { authorization: "Bearer secret-token" },
    body: { expectedRevision: `${request.updatedAt}:${request.attempts}`, runId: "run-resume", targetRoot: join(tmpdir(), "resume-target") },
  }, deps);
  assert.equal(claimedResume.status, 409);
  assert.match((claimedResume.body as any).error, /Run identity|inspect/i);
});

test("work reconciliation projects an authoritative terminal Run into the queue", async () => {
  const deps = await fixture("secret-token");
  await saveProjectWorkspace(deps.modelRoot, {
    version: 1, id: "project-observe", name: "Observe", status: "active",
    genesis: { prototypeId: "prototype-001", repository: candidate().repository, deployment: candidate().deployment, runs: [], promotedAt: "2026-09-07T00:00:00.000Z" },
    tree: [{ id: "root", kind: "root", title: "Observe", status: "planned", runIds: [], createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" }],
    createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z",
  });
  const create = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/projects/project-observe/work-requests",
    headers: { authorization: "Bearer secret-token" },
    body: { title: "Observe work", objective: "Observe terminal result", idempotencyKey: "observe-1" },
  }, deps);
  const workId = (create.body as any).id as string;
  await updateProjectWorkRequest(deps.modelRoot, "project-observe", workId, {
    status: "running", requestedRunId: "run-terminal", runId: "run-terminal",
  }, "2026-09-07T00:01:00.000Z");
  await saveHarnessRun(deps.harnessRoot, {
    version: 1,
    request: { version: 1, runId: "run-terminal", mode: "project-workspace", projectId: "project-observe", objective: "Observe terminal result", targetRoot: join(tmpdir(), "observe-target") },
    preflight: { version: 1, runId: "run-terminal", status: "ready" },
    state: { version: 1, stage: "DONE", status: "DONE", completedStages: [], skippedStages: [], updatedAt: "2026-09-07T00:02:00.000Z" },
    updatedAt: "2026-09-07T00:02:00.000Z",
  });
  const reconciliation = await routeWebControlPlaneRequest({
    method: "GET", path: `/api/projects/project-observe/work-requests/${workId}/reconciliation`, headers: {},
  }, deps);
  assert.equal(reconciliation.status, 200);
  assert.equal((reconciliation.body as any).request.status, "completed");
  assert.equal((reconciliation.body as any).transition, "updated");
});

test("operator can retry a failed project Run through Control Plane without changing Run identity", async () => {
  const base = await fixture("secret-token");
  const deps = {
    ...base,
    operatorToken: "operator-token",
    ideaLabRuntime: {
      state: "ready" as const,
      retryProjectRun: async ({ runId }: { projectId: string; runId: string }) => {
        const retry = await requestHarnessRunRetry(base.harnessRoot, runId, {
          retryReason: "operator-request",
          actor: "operator",
          requestedAt: "2026-09-07T00:03:00.000Z",
        });
        return retry.status === "accepted" ? "accepted" as const : retry.status === "already-active" ? "already-active" as const : "not-allowed" as const;
      },
    },
  };
  await saveProjectWorkspace(deps.modelRoot, {
    version: 1, id: "project-operator-retry", name: "Operator retry", status: "active",
    genesis: { prototypeId: "prototype-001", repository: candidate().repository, deployment: candidate().deployment, runs: [], promotedAt: "2026-09-07T00:00:00.000Z" },
    tree: [{ id: "root", kind: "root", title: "Operator retry", status: "planned", runIds: [], createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" }],
    createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z",
  });
  const create = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/projects/project-operator-retry/work-requests",
    headers: { authorization: "Bearer secret-token" },
    body: { title: "Retry work", objective: "Recover the failed Run", idempotencyKey: "operator-retry-1" },
  }, deps);
  assert.equal(create.status, 201);
  const workId = (create.body as any).id as string;
  await updateProjectWorkRequest(deps.modelRoot, "project-operator-retry", workId, {
    status: "failed", requestedRunId: "run-operator-retry", runId: "run-operator-retry", blocker: "previous failure",
  }, "2026-09-07T00:02:00.000Z");
  await saveHarnessRun(deps.harnessRoot, {
    version: 1,
    request: { version: 1, runId: "run-operator-retry", mode: "project-workspace", projectId: "project-operator-retry", objective: "Recover the failed Run", targetRoot: join(tmpdir(), "operator-retry-target") },
    preflight: { version: 1, runId: "run-operator-retry", status: "ready" },
    state: { version: 1, stage: "IMPLEMENT", status: "FAILED_FINAL", completedStages: ["PREFLIGHT", "CONTEXT", "TEST"], skippedStages: [], updatedAt: "2026-09-07T00:02:00.000Z", reason: "previous failure" },
    updatedAt: "2026-09-07T00:02:00.000Z",
  });
  const expectedRevision = "2026-09-07T00:02:00.000Z:0";
  const unauthorized = await routeWebControlPlaneRequest({
    method: "POST", path: `/api/projects/project-operator-retry/work-requests/${workId}/retry`, headers: { authorization: "Bearer secret-token" },
    body: { expectedRevision, runId: "run-operator-retry" },
  }, deps);
  assert.equal(unauthorized.status, 401);
  const wrongRun = await routeWebControlPlaneRequest({
    method: "POST", path: `/api/projects/project-operator-retry/work-requests/${workId}/retry`, headers: { authorization: "Bearer operator-token" },
    body: { expectedRevision, runId: "different-run" },
  }, deps);
  assert.equal(wrongRun.status, 409);
  assert.match((wrongRun.body as any).error, /identity/);
  const retried = await routeWebControlPlaneRequest({
    method: "POST", path: `/api/projects/project-operator-retry/work-requests/${workId}/retry`, headers: { authorization: "Bearer operator-token" },
    body: { expectedRevision, runId: "run-operator-retry" },
  }, deps);
  assert.equal(retried.status, 202);
  assert.equal((retried.body as any).runId, "run-operator-retry");
  assert.equal((retried.body as any).request.status, "running");
  assert.equal((retried.body as any).request.requestedRunId, "run-operator-retry");
  const run = await loadHarnessRun(base.harnessRoot, "run-operator-retry");
  assert.equal(run?.state.status, "READY");
  assert.equal(run?.retry?.actor, "operator");
});

test("rejects unsupported methods and malformed project paths", async () => {
  const deps = await fixture();
  const method = await routeWebControlPlaneRequest(
    { method: "DELETE", path: "/api/idea-lab", headers: {} },
    deps,
  );
  assert.equal(method.status, 405);

  const traversal = await routeWebControlPlaneRequest(
    { method: "GET", path: "/api/projects/%2E%2E%2Fescape", headers: {} },
    deps,
  );
  assert.equal(traversal.status, 404);
});

test("promotion requires configured bearer token", async () => {
  const deps = await fixture("secret-token");
  const missing = await routeWebControlPlaneRequest(
    { method: "POST", path: "/api/prototypes/prototype-001/promote", headers: {} },
    deps,
  );
  assert.equal(missing.status, 401);

  const wrong = await routeWebControlPlaneRequest(
    {
      method: "POST",
      path: "/api/prototypes/prototype-001/promote",
      headers: { authorization: "Bearer wrong-token" },
    },
    deps,
  );
  assert.equal(wrong.status, 401);
});

test("promotion returns canonical Project Workspace and persists it", async () => {
  const deps = await fixture("secret-token");
  const response = await routeWebControlPlaneRequest(
    {
      method: "POST",
      path: "/api/prototypes/prototype-001/promote",
      headers: { authorization: "Bearer secret-token" },
    },
    { ...deps, now: () => "2026-09-07T02:00:00.000Z" },
  );

  assert.equal(response.status, 200);
  assert.equal((response.body as any).id, "project-prototype-001");
  assert.ok(await loadProjectWorkspace(deps.modelRoot, "project-prototype-001"));
});

test("operator reconciliation separates inspection from approved mutation", async () => {
  const deps = await fixture("secret-token");
  const inspection = { projectId: "project-a", runId: "run-3", canReconcile: true, blockers: [] };
  const runtime = {
    state: "ready" as const,
    inspectProjectRunReconciliation: async () => inspection,
    reconcileProjectRun: async () => ({ status: "reconciled", operationId: "op-1" }),
    issueProjectRunOperatorApproval: async () => ({ approvalId: "approval-1", status: "issued" }),
  };
  const denied = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/projects/project-a/runs/run-3/operator-reconciliation", headers: { authorization: "Bearer secret-token" },
    body: { action: "apply", expectedRevision: "r", operationId: "op-1", reason: "stale-runtime-after-shutdown" },
  }, { ...deps, operatorToken: "operator-token", operatorId: "test-operator", ideaLabRuntime: runtime });
  assert.equal(denied.status, 403);
  const checked = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/projects/project-a/runs/run-3/operator-reconciliation", headers: { authorization: "Bearer secret-token" },
    body: { action: "inspect", expectedRevision: "r" },
  }, { ...deps, operatorToken: "operator-token", operatorId: "test-operator", ideaLabRuntime: runtime });
  assert.equal(checked.status, 200);
  assert.deepEqual(checked.body, inspection);
  const applied = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/projects/project-a/runs/run-3/operator-reconciliation", headers: { authorization: "Bearer operator-token" },
    body: { action: "apply", expectedRevision: "r", operationId: "op-1", reason: "stale-runtime-after-shutdown", approval: { actor: "operator", approvalId: "approval-1" } },
  }, { ...deps, operatorToken: "operator-token", operatorId: "test-operator", ideaLabRuntime: runtime });
  assert.equal(applied.status, 200);
  const missingIdentity = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/projects/project-a/runs/run-3/operator-approvals", headers: { authorization: "Bearer operator-token" },
    body: { requestId: "request-missing-identity", expectedRevision: "r", reason: "stale-runtime-after-shutdown" },
  }, { ...deps, operatorToken: "operator-token", ideaLabRuntime: runtime });
  assert.equal(missingIdentity.status, 401);
  const issued = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/projects/project-a/runs/run-3/operator-approvals", headers: { authorization: "Bearer operator-token" },
    body: { requestId: "request-1", expectedRevision: "r", reason: "stale-runtime-after-shutdown" },
  }, { ...deps, operatorToken: "operator-token", operatorId: "test-operator", ideaLabRuntime: runtime });
  assert.equal(issued.status, 201);
});

test("desktop job containment route is operator-gated and does not dispatch", async () => {
  const deps = await fixture("secret-token");
  const calls: string[] = [];
  const runtime = {
    state: "ready" as const,
    inspectDesktopJobReconciliation: async () => ({ jobId: "job-1", canContain: true, status: "pending" }),
    issueDesktopJobContainmentApproval: async () => ({ approvalId: "desktop-approval-1", status: "issued" }),
    containDesktopJob: async () => { calls.push("contain"); return { status: "contained" }; },
  };
  const denied = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/projects/project-a/desktop-jobs/job-1/operator-reconciliation",
    headers: { authorization: "Bearer secret-token" }, body: { action: "inspect" },
  }, { ...deps, operatorToken: "operator-token", operatorId: "operator", ideaLabRuntime: runtime });
  assert.equal(denied.status, 403);
  const inspected = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/projects/project-a/desktop-jobs/job-1/operator-reconciliation",
    headers: { authorization: "Bearer operator-token" }, body: { action: "inspect" },
  }, { ...deps, operatorToken: "operator-token", operatorId: "operator", ideaLabRuntime: runtime });
  assert.equal(inspected.status, 200);
  const contained = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/projects/project-a/desktop-jobs/job-1/operator-reconciliation",
    headers: { authorization: "Bearer operator-token" }, body: { action: "contain", expectedRevision: "r", operationId: "op", approvalId: "a" },
  }, { ...deps, operatorToken: "operator-token", operatorId: "operator", ideaLabRuntime: runtime });
  assert.equal(contained.status, 200);
  assert.deepEqual(calls, ["contain"]);
  const approval = await routeWebControlPlaneRequest({
    method: "POST", path: "/api/projects/project-a/desktop-jobs/job-1/operator-approvals",
    headers: { authorization: "Bearer operator-token" }, body: { requestId: "req", expectedRevision: "r" },
  }, { ...deps, operatorToken: "operator-token", operatorId: "operator", ideaLabRuntime: runtime });
  assert.equal(approval.status, 201);
});

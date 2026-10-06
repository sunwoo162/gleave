import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadRuntimeHostConfig } from "../scripts/iseol-runtime-host.js";
import { startIseolRuntimeServices } from "../src/runtime/iseol-runtime-services.js";
import { createIdeaLabRuntimeService } from "../src/idea-lab/runtime-service.js";
import { createDesktopJob, containDesktopJob, desktopJobRevision, loadDesktopJob, loadDesktopJobContainment, acquireDesktopJobLease } from "../src/desktop-agent/job-store.js";
import { routeWebControlPlaneRequest } from "../src/web-control-plane/router.js";
import { at, readModelFixture } from "./support/read-model-fixture.js";

test("startup and agent reconnect discover canonical Idea data without scheduling UNKNOWN, WAITING_AGENT or contained jobs", async () => {
  const f = await readModelFixture();
  const c = loadRuntimeHostConfig(f.hostFile);
  const desktopRoot = c.projectDesktopStateRoot!;
  const jobs = [];
  for (const [index, type] of ["GIT_INSPECT", "GIT_INIT"].entries()) {
    const job = await createDesktopJob(desktopRoot, {
      version: 1, jobId: `contained-${index}`, runId: "run-agent-wait", stage: "CONTEXT", attempt: 1,
      agentId: "fixture-agent", workspaceRoot: join(f.root, "workspace"), idempotencyKey: `fixture-${index}`,
      leaseUntil: "2026-09-21T01:00:00.000Z", operations: [{ id: `op-${index}`, type: type as "GIT_INIT" | "GIT_INSPECT", cwd: "." }],
      ...(type === "GIT_INIT" ? { policyDigest: "a".repeat(64), policySources: [{ kind: "policy", path: "fixture-policy", sha256: "b".repeat(64), required: true }] } : {}),
    }, at);
    await containDesktopJob(desktopRoot, job.jobId, { operationId: `contain-${index}`, expectedRevision: desktopJobRevision(job), at, actor: "operator", reason: "execution-uncertain" });
    jobs.push(job);
  }
  const runPaths = [join(f.harnessRoot, "run-wait", "run.json"), join(f.projectHarnessRoot, "run-agent-wait", "run.json")];
  const before = await Promise.all(runPaths.map(p => readFile(p, "utf8")));
  let supervised = 0, dispatches = 0, browserCalls = 0, recovered = 0;
  let reconnect: (() => void) | undefined;
  let webOptions: any;
  const services = await startIseolRuntimeServices({
    env: { ISEOL_PROJECT_RUNTIME_ENABLED: "true", ISEOL_PROJECT_AGENT_ID: "fixture-agent" },
    roots: { ...c, iseolRoot: f.root, webRoot: resolve("web") },
    // Deliberately stale web roots must not override the authoritative Runtime roots.
    webConfig: { host: "127.0.0.1", port: 0, token: "", modelRoot: join(f.root, "wrong"), harnessRoot: join(f.root, "wrong-runs"), webRoot: resolve("web") },
    desktopConfig: { enabled: true, host: "127.0.0.1", port: 0, stateRoot: desktopRoot, token: "synthetic" },
    ideaLabConfig: { enabled: true, repositoryRoot: join(f.root, "source"), repositoryUrl: "https://example.invalid/repo", baseRef: "main", sandboxRoot: join(f.root, "sandbox"), agentId: "fixture-agent", testExecutable: "npm.cmd", testArgs: ["test"], testTimeoutMs: 1000 },
    deps: {
      resolveBrowser: async () => ({ openOrResumeConversation: async () => { browserCalls++; throw new Error("No AI execution authorized"); }, submitPrompt: async () => { browserCalls++; throw new Error("No AI execution authorized"); }, readStructuredResult: async () => [], closeConversation: async () => undefined, dispose: async () => undefined }),
      startDesktop: async () => ({ transport: { isAgentConnected: () => true, sendTask: () => { dispatches++; throw new Error("No Desktop execution authorized"); }, awaitResult: async () => { throw new Error("No result authorized"); }, onAgentConnected: (callback: () => void) => { reconnect = callback; return () => undefined; } }, close: async () => undefined }) as any,
      resolveDeploy: async () => ({}) as any,
      createProposalProvider: () => ({}) as any,
      createProductionDriver: () => ({}) as any,
      createRuntime: options => {
        const runtime = createIdeaLabRuntimeService({ ...options, superviseCampaign: async () => { supervised++; } });
        return { ...runtime, recover: async () => { recovered++; await runtime.recover(); } };
      },
      startWeb: async options => { webOptions = options; return { close: (done: () => void) => done() } as any; },
    },
  });
  try {
    reconnect?.();
    await services.ideaLabRuntime!.recover();
    await services.ideaLabRuntime!.idle();
    const response = await routeWebControlPlaneRequest({ method: "GET", path: "/api/idea-lab", headers: {} }, webOptions);
    assert.equal((response.body as any).campaigns[0]?.id, "campaign-fixture");
    assert.equal((response.body as any).productions[0]?.run?.status, "WAITING_EXTERNAL");
    assert.ok(recovered >= 2);
    assert.equal(supervised, 0);
    assert.equal(dispatches, 0);
    assert.equal(browserCalls, 0);
    assert.deepEqual(await Promise.all(runPaths.map(p => readFile(p, "utf8"))), before);
    for (const job of jobs) {
      await assert.rejects(acquireDesktopJobLease(desktopRoot, job.jobId, "new-owner", at, 1000), /contained/i);
      assert.deepEqual(await loadDesktopJob(desktopRoot, job.jobId), job);
      assert.ok(await loadDesktopJobContainment(desktopRoot, job.jobId));
    }
  } finally { await services.dispose(); }
});

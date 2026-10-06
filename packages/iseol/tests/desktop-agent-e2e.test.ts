import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DesktopTaskPack } from "../src/desktop-agent/contracts.js";
import type { HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";
import { createDesktopAgentTransport } from "../src/desktop-agent/transport.js";
import { createDesktopStageExecutor } from "../src/desktop-agent/desktop-executor.js";
import { createDesktopRealityInspector } from "../src/desktop-agent/reality-inspector.js";
import { loadDesktopJob } from "../src/desktop-agent/job-store.js";
import { startDesktopAgentWebSocketServer } from "../src/desktop-agent/ws-server.js";
import { connectFakeDesktopAgent } from "../src/desktop-agent/test-support/fake-agent.js";
import { prepareDevelopmentRun } from "../src/harness/preflight.js";
import { recoverHarnessRun } from "../src/harness/recovery.js";
import { saveHarnessRun } from "../src/harness/run-store.js";
import { superviseHarnessRun } from "../src/harness/run-supervisor.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}
async function fixture() {
  const base = await mkdtemp(join(tmpdir(), "iseol-desktop-e2e-"));
  const repo = join(base, "repo");
  const runRoot = join(base, "runs");
  const registryRoot = join(base, "registry");
  const jobRoot = join(base, "jobs");
  await mkdir(join(repo, "docs"), { recursive: true });
  await writeFile(join(repo, "docs", "HARNESS_ENGINEERING.md"), "# Project Harness\n", "utf8");
  await writeFile(join(repo, "feature.txt"), "old\n", "utf8");
  await writeFile(join(repo, "verify.test.cjs"), "const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');test('feature updated',()=>assert.equal(fs.readFileSync('feature.txt','utf8').trim(),'new'));\n", "utf8");
  execFileSync("git", ["init"], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "iseol@example.com"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "Iseol E2E"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["commit", "-m", "chore: initial"], { cwd: repo, stdio: "ignore" });
  const initialHead = git(repo, ["rev-parse", "HEAD"]);
  const request = { version: 1 as const, runId: "run-e2e", mode: "project-workspace" as const, objective: "Desktop bridge E2E", targetRoot: repo };
  const preflight = await prepareDevelopmentRun(request, { iseolRoot: process.cwd(), loadedAt: "2026-09-08T04:00:00.000Z" });
  assert.equal(preflight.status, "ready");
  if (!preflight.policy) throw new Error("preflight policy missing");
  return { base, repo, runRoot, registryRoot, jobRoot, initialHead, request, preflight };
}
function runEnvelope(f: Awaited<ReturnType<typeof fixture>>, status: HarnessRuntimeRunEnvelope["state"]["status"] = "READY"): HarnessRuntimeRunEnvelope {
  return {
    version: 1,
    request: f.request,
    preflight: f.preflight,
    state: {
      version: 1,
      stage: "COMMIT",
      status,
      completedStages: ["PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN", "IMPLEMENT", "TEST", "SELF_REVIEW"],
      skippedStages: [],
      updatedAt: "2026-09-08T04:00:00.000Z",
      ...(status === "WAITING_AGENT" ? { reason: "Desktop Agent disconnected" } : {}),
    },
    evidence: [],
    updatedAt: "2026-09-08T04:00:00.000Z",
  };
}

function taskPack(f: Awaited<ReturnType<typeof fixture>>, agentId: string): DesktopTaskPack {
  const policy = f.preflight.policy!;
  const patch = ["--- a/feature.txt", "+++ b/feature.txt", "@@ -1 +1 @@", "-old", "+new", ""].join("\n");
  return {
    version: 1,
    jobId: "job-e2e-commit",
    runId: f.request.runId,
    stage: "COMMIT",
    attempt: 1,
    agentId,
    workspaceRoot: f.repo,
    policyDigest: policy.effectiveSha256,
    policySources: policy.sources.map((source) => ({
      kind: source.kind,
      path: source.path,
      sha256: source.sha256,
      required: true,
    })),
    idempotencyKey: "commit:run-e2e",
    leaseUntil: "2026-09-08T04:10:00.000Z",
    operations: [
      { id: "patch", type: "APPLY_PATCH", path: "feature.txt", patch },
      { id: "verify", type: "RUN_PROCESS", purpose: "test", cwd: ".", executable: "node", args: ["--test", "verify.test.cjs"], timeoutMs: 2_000 },
      { id: "status", type: "GIT_STATUS", cwd: "." },
      { id: "commit", type: "GIT_COMMIT", cwd: ".", message: "feat: desktop e2e", expectedHead: f.initialHead },
    ],
  };
}

async function coreAndAgent(f: Awaited<ReturnType<typeof fixture>>, options?: { dropCommitResult?: boolean }) {
  const transport = createDesktopAgentTransport({
    registryRoot: f.registryRoot,
    expectedToken: "secret-token",
    now: () => "2026-09-08T04:00:00.000Z",
  });
  const server = await startDesktopAgentWebSocketServer({ host: "127.0.0.1", port: 0, transport });
  const agent = await connectFakeDesktopAgent({
    url: server.url,
    hello: {
      version: 1,
      agentId: "agent-e2e",
      agentVersion: "0.1.0",
      os: process.platform,
      capabilities: ["process", "git", "files"],
      workspaceRoots: [f.base, process.cwd()],
      token: "secret-token",
    },
    allowedRoots: [f.base, process.cwd()],
    heartbeatIntervalMs: 50,
    now: () => "2026-09-08T04:00:00.000Z",
    dropResult: options?.dropCommitResult
      ? (pack, result) => pack.jobId === "job-e2e-commit" && result.status === "completed"
      : undefined,
  });
  return { transport, server, agent };
}

async function closeAll(resources: Awaited<ReturnType<typeof coreAndAgent>>) {
  await resources.agent.close();
  await resources.server.close();
}
test("Supervisor delegates a guarded commit task through the authenticated outbound Agent", async (t) => {
  const f = await fixture();
  const resources = await coreAndAgent(f);
  t.after(() => closeAll(resources));
  const run = runEnvelope(f);
  await saveHarnessRun(f.runRoot, run);
  const executor = createDesktopStageExecutor({
    registryRoot: f.registryRoot,
    jobRoot: f.jobRoot,
    transport: resources.transport,
    compileTaskPack: async (active, agentId) => active.state.stage === "COMMIT" ? taskPack(f, agentId) : null,
    now: () => "2026-09-08T04:00:00.000Z",
  });
  const final = await superviseHarnessRun({
    storeRoot: f.runRoot,
    runId: f.request.runId,
    executor,
    maxSteps: 4,
    now: () => "2026-09-08T04:00:00.000Z",
  });
  assert.equal(final.state.stage, "PR");
  assert.equal(final.state.status, "WAITING_EXTERNAL");
  assert.equal((await readFile(join(f.repo, "feature.txt"), "utf8")).trim(), "new");
  assert.equal(git(f.repo, ["rev-list", "--count", "HEAD"]), "2");
  assert.equal(final.evidence.some((item) => item.kind === "commit" && item.reference === git(f.repo, ["rev-parse", "HEAD"])), true);
  assert.equal((await loadDesktopJob(f.jobRoot, "job-e2e-commit"))?.status, "completed");
});
test("policy drift blocks mutation before the target file changes", async (t) => {
  const f = await fixture();
  const resources = await coreAndAgent(f);
  t.after(() => closeAll(resources));
  const executor = createDesktopStageExecutor({
    registryRoot: f.registryRoot,
    jobRoot: f.jobRoot,
    transport: resources.transport,
    compileTaskPack: async (_run, agentId) => {
      const compiled = taskPack(f, agentId);
      await writeFile(join(f.repo, "docs", "HARNESS_ENGINEERING.md"), "# Drifted Harness\n", "utf8");
      return compiled;
    },
    now: () => "2026-09-08T04:00:00.000Z",
  });
  const result = await executor.execute(runEnvelope(f, "RUNNING"));
  assert.equal(result.type, "retryable-failure");
  assert.equal((await readFile(join(f.repo, "feature.txt"), "utf8")).trim(), "old");
  assert.equal(git(f.repo, ["rev-list", "--count", "HEAD"]), "1");
});

test("workspace escape is rejected before an outside file can be created", async (t) => {
  const f = await fixture();
  const resources = await coreAndAgent(f);
  t.after(() => closeAll(resources));
  const outside = join(f.base, "outside.txt");
  const executor = createDesktopStageExecutor({
    registryRoot: f.registryRoot,
    jobRoot: f.jobRoot,
    transport: resources.transport,
    compileTaskPack: async (_run, agentId) => ({
      ...taskPack(f, agentId),
      jobId: "job-escape",
      idempotencyKey: "escape:run-e2e",
      operations: [{
        id: "escape",
        type: "APPLY_PATCH",
        path: "../outside.txt",
        patch: ["--- a/../outside.txt", "+++ b/../outside.txt", "@@ -0,0 +1 @@", "+escape", ""].join("\n"),
      }],
    }),
    now: () => "2026-09-08T04:00:00.000Z",
  });
  const result = await executor.execute(runEnvelope(f, "RUNNING"));
  assert.equal(result.type, "final-failure");
  await assert.rejects(() => readFile(outside, "utf8"), (error: NodeJS.ErrnoException) => error.code === "ENOENT");
  const agentResult = resources.agent.getResult("job-escape");
  assert.equal(agentResult?.operations[0]?.stdout, undefined);
  assert.match(agentResult?.operations[0]?.summary ?? "", /outside Desktop workspace/i);
});

test("disconnect after a real commit reconciles on reconnect without a duplicate commit", async (t) => {
  const f = await fixture();
  const resources = await coreAndAgent(f, { dropCommitResult: true });
  t.after(async () => { await resources.server.close(); });
  const executor = createDesktopStageExecutor({
    registryRoot: f.registryRoot,
    jobRoot: f.jobRoot,
    transport: resources.transport,
    compileTaskPack: async (_run, agentId) => taskPack(f, agentId),
    now: () => "2026-09-08T04:00:00.000Z",
    leaseDurationMs: 2_000,
    resultTimeoutMs: 1_000,
  });
  const lost = await executor.execute(runEnvelope(f, "RUNNING"));
  assert.equal(lost.type, "waiting-agent");
  assert.equal((await loadDesktopJob(f.jobRoot, "job-e2e-commit"))?.status, "indeterminate");
  for (let attempt = 0; attempt < 400 && !resources.agent.getResult("job-e2e-commit"); attempt += 1) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  assert.equal(resources.agent.getResult("job-e2e-commit")?.status, "completed");
  assert.equal(git(f.repo, ["rev-list", "--count", "HEAD"]), "2");

  const second = await connectFakeDesktopAgent({
    url: resources.server.url,
    hello: {
      version: 1,
      agentId: "agent-e2e",
      agentVersion: "0.1.0",
      os: process.platform,
      capabilities: ["process", "git", "files"],
      workspaceRoots: [f.base, process.cwd()],
      token: "secret-token",
    },
    allowedRoots: [f.base, process.cwd()],
    heartbeatIntervalMs: 50,
    now: () => "2026-09-08T04:00:01.000Z",
  });
  t.after(() => second.close());
  const waiting = runEnvelope(f, "WAITING_AGENT");
  await saveHarnessRun(f.runRoot, waiting);
  const inspector = createDesktopRealityInspector({
    registryRoot: f.registryRoot,
    jobRoot: f.jobRoot,
    transport: resources.transport,
    now: () => "2026-09-08T04:00:03.000Z",
    heartbeatTimeoutMs: 5_000,
  });
  const recovered = await recoverHarnessRun({
    storeRoot: f.runRoot,
    runId: f.request.runId,
    at: "2026-09-08T04:00:03.000Z",
    inspector,
  });
  assert.equal(recovered.state.stage, "PR");
  assert.equal(recovered.evidence.some((item) => item.kind === "commit"), true);
  assert.equal((await loadDesktopJob(f.jobRoot, "job-e2e-commit"))?.status, "completed");
  assert.equal(git(f.repo, ["rev-list", "--count", "HEAD"]), "2");
});

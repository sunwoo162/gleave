import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";
import type { DesktopJobResult, DesktopTaskPack } from "../src/desktop-agent/contracts.js";
import { registerDesktopAgent } from "../src/desktop-agent/agent-registry.js";
import { createDesktopJob, loadDesktopJob, containDesktopJob, desktopJobRevision } from "../src/desktop-agent/job-store.js";
import { createDesktopStageExecutor } from "../src/desktop-agent/desktop-executor.js";
import { desktopOperationCapability } from "../src/desktop-agent/contracts.js";

function run(targetRoot: string, stage: HarnessRuntimeRunEnvelope["state"]["stage"] = "TEST"): HarnessRuntimeRunEnvelope {
  return {
    version: 1,
    request: { version: 1, runId: "run-001", mode: "project-workspace", objective: "Test desktop bridge", targetRoot },
    preflight: { version: 1, runId: "run-001", status: "ready" },
    state: { version: 1, stage, status: "RUNNING", completedStages: ["PREFLIGHT"], skippedStages: [], updatedAt: "2026-09-08T03:00:00.000Z" },
    evidence: [],
    updatedAt: "2026-09-08T03:00:00.000Z",
  };
}

async function roots() {
  const base = await mkdtemp(join(tmpdir(), "iseol-desktop-executor-"));
  const targetRoot = join(base, "repo");
  await mkdir(targetRoot, { recursive: true });
  return { base, registryRoot: join(base, "registry"), jobRoot: join(base, "jobs"), targetRoot };
}

async function register(registryRoot: string, targetRoot: string) {
  await registerDesktopAgent(registryRoot, {
    version: 1,
    agentId: "agent-001",
    agentVersion: "0.1.0",
    os: "win32",
    capabilities: ["process", "git"],
    workspaceRoots: [targetRoot],
    token: "not-persisted",
  }, "2026-09-08T03:00:00.000Z");
}

function task(targetRoot: string, stage: DesktopTaskPack["stage"] = "TEST"): DesktopTaskPack {
  return {
    version: 1,
    jobId: `job-${stage.toLowerCase()}`,
    runId: "run-001",
    stage,
    attempt: 1,
    agentId: "agent-001",
    workspaceRoot: targetRoot,
    idempotencyKey: `${stage.toLowerCase()}:run-001`,
    leaseUntil: "2026-09-08T03:10:00.000Z",
    operations: [{ id: "op-1", type: "READ_FILE", path: "README.md" }],
  };
}

function completed(jobId = "job-test", status: DesktopJobResult["status"] = "completed"): DesktopJobResult {
  return {
    version: 1,
    jobId,
    runId: "run-001",
    agentId: "agent-001",
    status,
    completedAt: "2026-09-08T03:00:30.000Z",
    operations: [{ operationId: "op-1", ok: status === "completed", summary: status }],
  };
}

class FakeTransport {
  connected = true;
  sendCount = 0;
  sentAttempts: number[] = [];
  awaitErrors: Error[] = [];
  lastAwaitTimeoutMs: number | null = null;
  nextResult: DesktopJobResult = completed();
  isAgentConnected() { return this.connected; }
  getAgentSessionId() { return this.connected ? "session-001" : null; }
  sendTask(_agentId: string, pack: DesktopTaskPack) {
    this.sendCount += 1;
    this.sentAttempts.push(pack.attempt);
    this.nextResult = {
      ...this.nextResult,
      jobId: pack.jobId,
      runId: pack.runId,
      agentId: pack.agentId,
      operations: this.nextResult.operations.map((operation, index) => ({
        ...operation,
        operationId: pack.operations[index]?.id ?? operation.operationId,
      })),
    };
  }
  async awaitResult(_jobId: string, timeoutMs: number) {
    this.lastAwaitTimeoutMs = timeoutMs;

    const error = this.awaitErrors.shift();
    if (error) throw error;

    return this.nextResult;
  }
}

test("offline agent returns waiting-agent and missing task intent waits for external planner", async () => {
  const { registryRoot, jobRoot, targetRoot } = await roots();
  const transport = new FakeTransport();
  const executor = createDesktopStageExecutor({
    registryRoot, jobRoot, transport,
    compileTaskPack: async () => task(targetRoot),
    now: () => "2026-09-08T03:00:10.000Z",
  });
  assert.equal((await executor.execute(run(targetRoot))).type, "waiting-agent");

  await register(registryRoot, targetRoot);
  const waiting = createDesktopStageExecutor({
    registryRoot, jobRoot, transport,
    compileTaskPack: async () => null,
    now: () => "2026-09-08T03:00:10.000Z",
  });
  assert.equal((await waiting.execute(run(targetRoot))).type, "waiting-external");
});

test("operator-contained pending jobs wait without dispatch", async () => {
  const { registryRoot, jobRoot, targetRoot } = await roots();
  await register(registryRoot, targetRoot);
  const compiled = task(targetRoot);
  const job = await createDesktopJob(jobRoot, compiled, "2026-09-08T03:00:00.000Z");
  await containDesktopJob(jobRoot, job.jobId, { operationId: "contain-exec", expectedRevision: desktopJobRevision(job), at: "2026-09-08T03:00:01.000Z", actor: "operator", reason: "execution-uncertain" });
  const transport = new FakeTransport();
  const executor = createDesktopStageExecutor({ registryRoot, jobRoot, transport, compileTaskPack: async () => compiled, now: () => "2026-09-08T03:00:02.000Z" });
  const result = await executor.execute(run(targetRoot));
  assert.equal(result.type, "waiting-agent");
  assert.equal(transport.sendCount, 0);
  assert.equal((await loadDesktopJob(jobRoot, job.jobId))?.status, "pending");
});

test("CONTEXT blocks before dispatch when the connected Agent lacks GIT_INIT", async () => {
  const { registryRoot, jobRoot, targetRoot } = await roots();
  await register(registryRoot, targetRoot);
  const transport = new FakeTransport();
  const executor = createDesktopStageExecutor({
    registryRoot, jobRoot, transport,
    compileTaskPack: async () => ({ ...task(targetRoot, "CONTEXT"), policyDigest: "policy", policySources: [{ kind: "test", path: "policy", sha256: "policy", required: true }], operations: [{ id: "init", type: "GIT_INIT", cwd: ".", initialBranch: "main" }] }),
    now: () => "2026-09-08T03:00:10.000Z",
  });
  const blocked = await executor.execute(run(targetRoot, "CONTEXT"));
  assert.deepEqual(blocked, { type: "waiting-agent", reason: `Desktop Agent capability is unavailable: ${desktopOperationCapability("GIT_INIT")}` });
  assert.equal(transport.sendCount, 0);
});

test("CONTEXT dispatches GIT_INIT after Agent reconnect advertises the concrete capability", async () => {
  const { registryRoot, jobRoot, targetRoot } = await roots();
  await register(registryRoot, targetRoot);
  await registerDesktopAgent(registryRoot, {
    version: 1, agentId: "agent-001", agentVersion: "0.2.0", os: "win32",
    capabilities: ["git", desktopOperationCapability("GIT_INIT")], workspaceRoots: [targetRoot], token: "not-persisted",
  }, "2026-09-08T03:00:11.000Z");
  const transport = new FakeTransport();
  const executor = createDesktopStageExecutor({
    registryRoot, jobRoot, transport,
    compileTaskPack: async () => ({ ...task(targetRoot, "CONTEXT"), policyDigest: "policy", policySources: [{ kind: "test", path: "policy", sha256: "policy", required: true }], operations: [{ id: "init", type: "GIT_INIT", cwd: ".", initialBranch: "main" }] }),
    now: () => "2026-09-08T03:00:12.000Z",
  });
  const result = await executor.execute(run(targetRoot, "CONTEXT"));
  assert.equal(result.type, "completed");
  assert.equal(transport.sendCount, 1);
});

test("completed desktop job becomes stage evidence and duplicate execute reuses receipt", async () => {
  const { registryRoot, jobRoot, targetRoot } = await roots();
  await register(registryRoot, targetRoot);
  const transport = new FakeTransport();
  const executor = createDesktopStageExecutor({
    registryRoot, jobRoot, transport,
    compileTaskPack: async () => task(targetRoot),
    now: () => "2026-09-08T03:00:10.000Z",
  });

  const first = await executor.execute(run(targetRoot));
  assert.equal(first.type, "completed");
  if (first.type === "completed") {
    assert.equal(first.evidence[0]?.kind, "test");
    assert.equal(first.evidence[0]?.stage, "TEST");
    assert.match(first.evidence[0]?.reference ?? "", /desktop-job:job-test/);
  }
  const second = await executor.execute(run(targetRoot));
  assert.equal(second.type, "completed");
  assert.equal(transport.sendCount, 1);
});

test("retryable and protected desktop results map to Harness meanings", async () => {
  const { registryRoot, jobRoot, targetRoot } = await roots();
  await register(registryRoot, targetRoot);
  const retryTransport = new FakeTransport();
  retryTransport.nextResult = completed("job-test", "retryable-failure");
  const retryExecutor = createDesktopStageExecutor({
    registryRoot, jobRoot, transport: retryTransport,
    compileTaskPack: async () => task(targetRoot),
    now: () => "2026-09-08T03:00:10.000Z",
  });
  assert.equal((await retryExecutor.execute(run(targetRoot))).type, "retryable-failure");
  assert.equal((await loadDesktopJob(jobRoot, "job-test"))?.status, "pending");

  const blockedTransport = new FakeTransport();
  blockedTransport.nextResult = completed("job-test", "blocked-user");
  const blockedExecutor = createDesktopStageExecutor({
    registryRoot,
    jobRoot: join(jobRoot, "blocked"),
    transport: blockedTransport,
    compileTaskPack: async () => task(targetRoot),
    now: () => "2026-09-08T03:00:10.000Z",
  });
  assert.equal((await blockedExecutor.execute(run(targetRoot))).type, "blocked-user");
});

test("long-running Desktop operations extend lease and result wait beyond their own timeout", async () => {
  const { registryRoot, jobRoot, targetRoot } = await roots();
  await register(registryRoot, targetRoot);

  const transport = new FakeTransport();

  const executor = createDesktopStageExecutor({
    registryRoot,
    jobRoot,
    transport,
    compileTaskPack: async () => ({
      ...task(targetRoot),
      policyDigest: "digest",
      policySources: [{
        kind: "project-harness",
        path: targetRoot,
        sha256: "hash",
        required: true,
      }],
      operations: [{
        id: "op-1",
        type: "RUN_PROCESS",
        purpose: "test",
        cwd: ".",
        executable: "npm",
        args: ["test"],
        timeoutMs: 120_000,
      }],
    }),
    now: () => "2026-09-08T03:00:10.000Z",
  });

  const result = await executor.execute(run(targetRoot));

  assert.equal(result.type, "completed");

  // 120s operation budget + 30s result delivery grace.
  assert.equal(transport.lastAwaitTimeoutMs, 150_000);

  const stored = await loadDesktopJob(jobRoot, "job-test");

  assert.equal(
    stored?.lease?.expiresAt,
    "2026-09-08T03:02:40.000Z",
  );
});

test("explicit Desktop result timeout remains an exact caller override", async () => {
  const { registryRoot, jobRoot, targetRoot } = await roots();
  await register(registryRoot, targetRoot);

  const transport = new FakeTransport();

  const executor = createDesktopStageExecutor({
    registryRoot,
    jobRoot,
    transport,
    leaseDurationMs: 2_000,
    resultTimeoutMs: 1_000,
    compileTaskPack: async () => ({
      ...task(targetRoot),
      policyDigest: "digest",
      policySources: [{
        kind: "project-harness",
        path: targetRoot,
        sha256: "hash",
        required: true,
      }],
      operations: [{
        id: "op-1",
        type: "RUN_PROCESS",
        purpose: "test",
        cwd: ".",
        executable: "node",
        args: ["--test"],
        timeoutMs: 2_000,
      }],
    }),
    now: () => "2026-09-08T03:00:10.000Z",
  });

  const result = await executor.execute(run(targetRoot));

  assert.equal(result.type, "completed");
  assert.equal(transport.lastAwaitTimeoutMs, 1_000);

  const stored = await loadDesktopJob(jobRoot, "job-test");

  assert.equal(
    stored?.lease?.expiresAt,
    "2026-09-08T03:00:12.000Z",
  );
});

test("read-only result timeout retries once with a higher durable attempt", async () => {
  const { registryRoot, jobRoot, targetRoot } = await roots();
  await register(registryRoot, targetRoot);

  const transport = new FakeTransport();

  transport.awaitErrors.push(
    new Error("Desktop Job result timeout: job-test"),
  );

  const executor = createDesktopStageExecutor({
    registryRoot,
    jobRoot,
    transport,
    leaseDurationMs: 2_000,
    resultTimeoutMs: 1_000,
    compileTaskPack: async () => task(targetRoot),
    now: () => "2026-09-08T03:00:10.000Z",
  });

  const result = await executor.execute(run(targetRoot));

  assert.equal(result.type, "completed");
  assert.equal(transport.sendCount, 2);
  assert.deepEqual(
    transport.sentAttempts,
    [1, 2],
  );

  const stored = await loadDesktopJob(
    jobRoot,
    "job-test",
  );

  assert.equal(stored?.attempts, 2);
  assert.equal(stored?.status, "completed");
});

test("lost result for a mutating task becomes indeterminate instead of requeueing", async () => {
  const { registryRoot, jobRoot, targetRoot } = await roots();
  await register(registryRoot, targetRoot);
  class LostResultTransport extends FakeTransport {
    async awaitResult(): Promise<DesktopJobResult> { throw new Error("result lost"); }
  }
  const transport = new LostResultTransport();
  const executor = createDesktopStageExecutor({
    registryRoot,
    jobRoot,
    transport,
    compileTaskPack: async () => ({
      ...task(targetRoot, "COMMIT"),
      jobId: "job-lost-commit",
      idempotencyKey: "commit:lost",
      policyDigest: "digest",
      policySources: [{ kind: "project-harness", path: targetRoot, sha256: "hash", required: true }],
      operations: [{ id: "commit", type: "GIT_COMMIT", cwd: ".", message: "feat: maybe committed", expectedHead: "abc" }],
    }),
    now: () => "2026-09-08T03:00:10.000Z",
  });
  const result = await executor.execute(run(targetRoot, "COMMIT"));
  assert.equal(result.type, "waiting-agent");
  assert.equal((await loadDesktopJob(jobRoot, "job-lost-commit"))?.status, "indeterminate");
});

test("reasoning mode captures an executed retryable Desktop result as feedback", async () => {
  const { registryRoot, jobRoot, targetRoot } = await roots();
  await register(registryRoot, targetRoot);
  const transport = new FakeTransport();
  transport.nextResult = {
    ...completed("job-test", "retryable-failure"),
    operations: [{ operationId: "op-1", ok: false, summary: "Ran npm exited with code 1", stdout: "RED test failed" }],
  };
  const executor = createDesktopStageExecutor({
    registryRoot, jobRoot, transport, captureRetryableResultAsFeedback: true,
    compileTaskPack: async () => task(targetRoot),
    now: () => "2026-09-08T03:00:10.000Z",
  });
  const result = await executor.execute(run(targetRoot));
  assert.equal(result.type, "completed");
  if (result.type !== "completed") return;
  assert.equal(result.evidence.length, 0);
  assert.match((result as any).feedback?.[0]?.summary ?? "", /RED test failed/);
  const stored = await loadDesktopJob(jobRoot, "job-test");
  assert.equal(stored?.status, "completed");
  assert.equal(stored?.result?.status, "retryable-failure");
});

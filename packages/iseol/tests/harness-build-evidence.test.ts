import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { DesktopJobRecord, DesktopTaskPack } from "../src/desktop-agent/job-store.js";
import type { DesktopJobResult } from "../src/desktop-agent/contracts.js";
import { loadDesktopJob } from "../src/desktop-agent/job-store.js";
import { createDesktopStageExecutor, desktopJobFeedback } from "../src/desktop-agent/desktop-executor.js";
import { registerDesktopAgent } from "../src/desktop-agent/agent-registry.js";
import { executeDesktopTaskPack } from "../src/desktop-agent/runtime.js";
import { prepareDevelopmentRun } from "../src/harness/preflight.js";
import { assertRunCompletionEvidence } from "../src/harness/completion-gates.js";
import type { HarnessEvidenceRecord, HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";

const NOW = "2026-09-21T12:00:00.000Z";

async function buildFixture() {
  const root = await mkdtemp(join(tmpdir(), "iseol-build-evidence-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "HARNESS_ENGINEERING.md"), "# Project Harness\n", "utf8");
  await writeFile(join(root, "app.js"), "console.log('build');\n", "utf8");
  await writeFile(join(root, "package.json"), JSON.stringify({
    name: "iseol-build-evidence-fixture",
    private: true,
    scripts: { build: "node --check app.js" },
  }) + "\n", "utf8");
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "iseol-build@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "ISEOL Build Test"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "chore: build evidence fixture"], { cwd: root, stdio: "ignore" });
  const runId = "run-build-evidence-1";
  const projectId = "PROJECT-BUILD-EVIDENCE-1";
  const request = { version: 1 as const, runId, projectId, mode: "project-workspace" as const, objective: "build evidence", targetRoot: root };
  const preflight = await prepareDevelopmentRun(request, { iseolRoot: process.cwd(), loadedAt: NOW });
  if (!preflight.policy) throw new Error("build evidence fixture preflight policy missing");
  const run: HarnessRuntimeRunEnvelope = {
    version: 1,
    request,
    preflight,
    state: { version: 1, stage: "IMPLEMENT", status: "RUNNING", completedStages: ["PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN"], skippedStages: [], updatedAt: NOW },
    evidence: [],
    updatedAt: NOW,
  };
  return { root, run };
}

function buildPack(run: HarnessRuntimeRunEnvelope): DesktopTaskPack {
  const policy = run.preflight.policy!;
  return {
    version: 1,
    jobId: "run-build-evidence-1-build",
    runId: run.request.runId,
    stage: "IMPLEMENT",
    attempt: 0,
    agentId: "agent-build-evidence",
    workspaceRoot: run.request.targetRoot,
    policyDigest: policy.effectiveSha256,
    policySources: policy.sources.map((source) => ({ ...source, required: true })),
    idempotencyKey: "run-build-evidence-1:build",
    leaseUntil: "2026-09-21T12:01:00.000Z",
    operations: [{ id: "build", type: "RUN_PROCESS", purpose: "build", cwd: ".", executable: process.platform === "win32" ? "npm.cmd" : "npm", args: ["run", "build"], timeoutMs: 10_000 }],
  };
}

function allProjectCompletionEvidence(): HarnessEvidenceRecord[] {
  return [
    { version: 1, id: "test", kind: "test", stage: "TEST", recordedAt: NOW, summary: "test" },
    { version: 1, id: "review", kind: "review", stage: "SELF_REVIEW", recordedAt: NOW, summary: "review" },
    { version: 1, id: "commit", kind: "commit", stage: "COMMIT", recordedAt: NOW, summary: "commit" },
    { version: 1, id: "pr", kind: "pull-request", stage: "PR", recordedAt: NOW, summary: "pr" },
    { version: 1, id: "ci", kind: "ci", stage: "CI", recordedAt: NOW, summary: "ci" },
    { version: 1, id: "deploy", kind: "deployment", stage: "DEPLOY", recordedAt: NOW, summary: "deploy" },
    { version: 1, id: "verify", kind: "production-verification", stage: "PRODUCTION_VERIFY", recordedAt: NOW, summary: "verify" },
  ];
}

test("successful RUN_BUILD records identity-bound build evidence from the real Desktop runtime", async () => {
  const fixture = await buildFixture();
  const pack = buildPack(fixture.run);
  const result = await executeDesktopTaskPack(pack, { allowedRoots: [fixture.root, process.cwd()], now: () => NOW });
  assert.equal(result.status, "completed");
  assert.equal(result.operations[0]?.ok, true);
  const job = {
    version: 1,
    jobId: pack.jobId,
    runId: pack.runId,
    stage: pack.stage,
    idempotencyKey: pack.idempotencyKey,
    pack,
    status: "completed",
    attempts: 1,
    createdAt: NOW,
    updatedAt: NOW,
    result,
  } satisfies DesktopJobRecord;
  const feedback = desktopJobFeedback(fixture.run, result, job);
  assert.equal(feedback[0]?.kind, "build");
  const evidence: HarnessEvidenceRecord = {
    version: 1,
    id: "build-evidence",
    kind: "build",
    stage: "IMPLEMENT",
    recordedAt: NOW,
    summary: "Desktop build completed",
    provider: "iseol-desktop-agent",
    reference: `desktop-job:${pack.jobId}`,
    projectId: fixture.run.request.projectId,
    runId: fixture.run.request.runId,
    jobId: pack.jobId,
    executionIdentity: pack.idempotencyKey,
  };
  assert.equal(evidence.projectId, "PROJECT-BUILD-EVIDENCE-1");
  assert.equal(evidence.runId, pack.runId);
  assert.equal(evidence.jobId, pack.jobId);
  assert.equal(evidence.executionIdentity, pack.idempotencyKey);
  assertRunCompletionEvidence([...allProjectCompletionEvidence(), evidence], "project-workspace", {
    verificationStages: ["TEST", "BUILD"],
    runId: fixture.run.request.runId,
    projectId: fixture.run.request.projectId,
  });
});

test("combined Desktop test/build jobs preserve both evidence kinds", async () => {
  const fixture = await buildFixture();
  const pack = buildPack(fixture.run);
  pack.operations = [
    { id: "test", type: "RUN_PROCESS", purpose: "test", cwd: ".", executable: "node", args: ["--test"], timeoutMs: 10_000 },
    pack.operations[0]!,
  ];
  const result: DesktopJobResult = {
    version: 1,
    jobId: pack.jobId,
    runId: pack.runId,
    agentId: pack.agentId,
    status: "completed",
    completedAt: NOW,
    operations: [
      { operationId: "test", ok: true, summary: "test completed" },
      { operationId: "build", ok: true, summary: "build completed" },
    ],
  };
  const job = {
    version: 1,
    jobId: pack.jobId,
    runId: pack.runId,
    stage: pack.stage,
    idempotencyKey: pack.idempotencyKey,
    pack,
    status: "completed",
    attempts: 1,
    createdAt: NOW,
    updatedAt: NOW,
    result,
  } satisfies DesktopJobRecord;
  const testRun = { ...fixture.run, state: { ...fixture.run.state, stage: "TEST" as const } };
  assert.deepEqual(desktopJobFeedback(testRun, result, job).map((item) => item.kind), ["test", "build"]);
});

test("BUILD is required when the profile requests it and identity mismatch cannot satisfy the gate", () => {
  const base = allProjectCompletionEvidence();
  assert.throws(() => assertRunCompletionEvidence(base, "project-workspace", {
    verificationStages: ["TEST", "BUILD"],
    runId: "run-build-evidence-1",
    projectId: "PROJECT-BUILD-EVIDENCE-1",
  }), /build/i);
  const wrongIdentity: HarnessEvidenceRecord = {
    version: 1,
    id: "wrong-build",
    kind: "build",
    stage: "IMPLEMENT",
    recordedAt: NOW,
    summary: "wrong run",
    runId: "other-run",
    projectId: "other-project",
    jobId: "other-job",
    executionIdentity: "other:build",
  };
  assert.throws(() => assertRunCompletionEvidence([...base, wrongIdentity], "project-workspace", {
    verificationStages: ["TEST", "BUILD"],
    runId: "run-build-evidence-1",
    projectId: "PROJECT-BUILD-EVIDENCE-1",
  }), /build/i);
  assert.doesNotThrow(() => assertRunCompletionEvidence(base, "project-workspace"));
});

test("a requested build without a completed result does not create build evidence", () => {
  const result: HarnessEvidenceRecord[] = allProjectCompletionEvidence();
  assert.throws(() => assertRunCompletionEvidence(result, "project-workspace", {
    verificationStages: ["BUILD"],
    runId: "run-build-evidence-1",
    projectId: "PROJECT-BUILD-EVIDENCE-1",
  }), /build/i);
});

test("a non-zero build exit produces no build evidence", async () => {
  const fixture = await buildFixture();
  await writeFile(join(fixture.root, "build-fail.cjs"), "process.exitCode = 2;\n", "utf8");
  await writeFile(join(fixture.root, "package.json"), JSON.stringify({
    name: "iseol-build-failure-fixture",
    private: true,
    scripts: { build: "node build-fail.cjs" },
  }) + "\n", "utf8");
  const result = await executeDesktopTaskPack(buildPack(fixture.run), { allowedRoots: [fixture.root, process.cwd()], now: () => NOW });
  assert.equal(result.status, "retryable-failure");
  assert.equal(result.operations[0]?.ok, false);
  assert.throws(() => assertRunCompletionEvidence(allProjectCompletionEvidence(), "project-workspace", {
    verificationStages: ["BUILD"],
    runId: fixture.run.request.runId,
    projectId: fixture.run.request.projectId,
  }), /build/i);
});

test("an UNKNOWN build result never becomes success evidence or an automatic retry", async () => {
  const fixture = await buildFixture();
  const registryRoot = join(fixture.root, ".registry-unknown");
  const jobRoot = join(fixture.root, ".jobs-unknown");
  await registerDesktopAgent(registryRoot, {
    version: 1,
    agentId: "agent-build-unknown",
    agentVersion: "test",
    os: process.platform,
    capabilities: ["process", "build", "files", "git"],
    workspaceRoots: [fixture.root],
    token: "unused-by-registry",
  }, NOW, "connection-build-unknown");
  const pack = { ...buildPack(fixture.run), agentId: "agent-build-unknown" };
  const transport = {
    isAgentConnected: (agentId: string) => agentId === "agent-build-unknown",
    getAgentSessionId: (agentId: string) => agentId === "agent-build-unknown" ? "connection-build-unknown" : null,
    sendTask: () => undefined,
    awaitResult: async () => { throw new Error(`Desktop Job result timeout: ${pack.jobId}`); },
  };
  const executor = createDesktopStageExecutor({
    registryRoot,
    jobRoot,
    transport,
    compileTaskPack: async () => pack,
    now: () => NOW,
    resultTimeoutMs: 1,
  });
  const result = await executor.execute(fixture.run);
  assert.equal(result.type, "waiting-agent", JSON.stringify(result));
  assert.equal((await loadDesktopJob(jobRoot, pack.jobId))?.status, "indeterminate");
  assert.throws(() => assertRunCompletionEvidence(allProjectCompletionEvidence(), "project-workspace", {
    verificationStages: ["BUILD"],
    runId: fixture.run.request.runId,
    projectId: fixture.run.request.projectId,
  }), /build/i);
});

test("a blocked build result never creates build evidence", async () => {
  const fixture = await buildFixture();
  const registryRoot = join(fixture.root, ".registry-blocked");
  const jobRoot = join(fixture.root, ".jobs-blocked");
  await registerDesktopAgent(registryRoot, {
    version: 1,
    agentId: "agent-build-blocked",
    agentVersion: "test",
    os: process.platform,
    capabilities: ["process", "build", "files", "git"],
    workspaceRoots: [fixture.root],
    token: "unused-by-registry",
  }, NOW, "connection-build-blocked");
  const pack = { ...buildPack(fixture.run), agentId: "agent-build-blocked" };
  const transport = {
    isAgentConnected: (agentId: string) => agentId === "agent-build-blocked",
    getAgentSessionId: (agentId: string) => agentId === "agent-build-blocked" ? "connection-build-blocked" : null,
    sendTask: () => undefined,
    awaitResult: async () => ({
      version: 1 as const,
      jobId: pack.jobId,
      runId: pack.runId,
      agentId: pack.agentId,
      status: "blocked-user" as const,
      completedAt: NOW,
      operations: [{ operationId: "build", ok: false, summary: "Build cancelled by user" }],
    }),
  };
  const executor = createDesktopStageExecutor({
    registryRoot,
    jobRoot,
    transport,
    compileTaskPack: async () => pack,
    now: () => NOW,
  });
  const result = await executor.execute(fixture.run);
  assert.equal(result.type, "blocked-user", JSON.stringify(result));
  assert.throws(() => assertRunCompletionEvidence(allProjectCompletionEvidence(), "project-workspace", {
    verificationStages: ["BUILD"],
    runId: fixture.run.request.runId,
    projectId: fixture.run.request.projectId,
  }), /build/i);
});

test("repeated delivery of one completed build reuses one identity-bound evidence id", async () => {
  const fixture = await buildFixture();
  const registryRoot = join(fixture.root, ".registry");
  const jobRoot = join(fixture.root, ".jobs");
  await registerDesktopAgent(registryRoot, {
    version: 1,
    agentId: "agent-build-evidence",
    agentVersion: "test",
    os: process.platform,
    capabilities: ["process", "build", "files", "git"],
    workspaceRoots: [fixture.root],
    token: "unused-by-registry",
  }, NOW, "connection-build-evidence");
  let activePack: DesktopTaskPack | null = null;
  const transport = {
    isAgentConnected: (agentId: string) => agentId === "agent-build-evidence",
    getAgentSessionId: (agentId: string) => agentId === "agent-build-evidence" ? "connection-build-evidence" : null,
    sendTask: (_agentId: string, pack: DesktopTaskPack) => { activePack = pack; },
    awaitResult: async () => executeDesktopTaskPack(activePack!, { allowedRoots: [fixture.root, process.cwd()], now: () => NOW }),
  };
  const compiler = async () => buildPack(fixture.run);
  const executor = createDesktopStageExecutor({
    registryRoot,
    jobRoot,
    transport,
    compileTaskPack: compiler,
    now: () => NOW,
  });
  const first = await executor.execute(fixture.run);
  const second = await executor.execute(fixture.run);
  assert.equal(first.type, "completed", JSON.stringify(first));
  assert.equal(second.type, "completed", JSON.stringify(second));
  if (first.type !== "completed" || second.type !== "completed") return;
  assert.equal(first.evidence[0]?.kind, "build");
  assert.equal(first.evidence[0]?.id, second.evidence[0]?.id);
  assert.equal(first.evidence[0]?.jobId, second.evidence[0]?.jobId);
  assert.equal(first.evidence[0]?.projectId, fixture.run.request.projectId);
  assert.equal(first.evidence[0]?.runId, fixture.run.request.runId);
  assert.equal(first.evidence[0]?.executionIdentity, activePack?.idempotencyKey);
});

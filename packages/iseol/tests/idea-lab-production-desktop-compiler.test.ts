import assert from "node:assert/strict";
import test from "node:test";
import type { HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";
import type { IdeaLabRuntimeConfig } from "../src/idea-lab/runtime-config.js";
import { createIdeaLabProductionDesktopTaskCompiler } from "../src/idea-lab/production-desktop-compiler.js";

const NOW = "2026-09-09T01:00:00.000Z";
const config: Extract<IdeaLabRuntimeConfig, { enabled: true }> = {
  enabled: true,
  repositoryRoot: "C:/sandbox/repository",
  repositoryUrl: "https://github.com/example/ideas.git",
  baseRef: "main",
  sandboxRoot: "C:/sandbox",
  agentId: "idea-agent",
  testExecutable: "node",
  testArgs: ["--test", "tests/focused.test.ts"],
  testTimeoutMs: 12_000,
};

function runAt(stage: HarnessRuntimeRunEnvelope["state"]["stage"]): HarnessRuntimeRunEnvelope {
  return {
    version: 1,
    request: { version: 1, runId: "run-idea-1", mode: "idea-lab", objective: "prototype", targetRoot: config.repositoryRoot },
    preflight: {
      version: 1,
      runId: "run-idea-1",
      status: "ready",
      policy: { version: 1, loadedAt: NOW, effectiveSha256: "a".repeat(64), sources: [{ kind: "project-harness", path: "C:/harness.md", sha256: "b".repeat(64) }] },
    },
    state: { version: 1, runId: "run-idea-1", stage, status: "running", generation: 1, updatedAt: NOW },
  };
}

test("production compiler emits stable Context, Test, and Commit packs", async () => {
  const compile = createIdeaLabProductionDesktopTaskCompiler(config, { now: () => NOW });
  const context = await compile(runAt("CONTEXT"), "agent-live");
  assert.equal(context?.operations[0]?.type, "GIT_INSPECT");
  assert.equal(context?.jobId, "run-idea-1-context");
  assert.equal(context?.idempotencyKey, "run-idea-1:context");

  const testPack = await compile(runAt("TEST"), "agent-live");
  assert.deepEqual(testPack?.operations[0], { id: "test", type: "RUN_PROCESS", purpose: "test", cwd: ".", executable: config.testExecutable, args: config.testArgs, timeoutMs: config.testTimeoutMs });
  assert.equal(testPack?.workspaceRoot, config.repositoryRoot);
  assert.equal(testPack?.policyDigest, "a".repeat(64));
  assert.deepEqual(testPack?.policySources, [{ kind: "project-harness", path: "C:/harness.md", sha256: "b".repeat(64), required: true }]);
  assert.equal(testPack?.leaseUntil, "2026-09-09T01:01:00.000Z");

  const commitRun = runAt("COMMIT");
  commitRun.evidence = [{ version: 1, id: "context", kind: "command", stage: "CONTEXT", recordedAt: NOW, summary: "Context", provider: "iseol-desktop-agent", reference: "c".repeat(40) }];
  const commit = await compile(commitRun, "agent-live");
  assert.deepEqual(commit?.operations[0], { id: "commit", type: "GIT_COMMIT", cwd: ".", message: "feat: build idea lab prototype", expectedHead: "c".repeat(40), publish: true });
  assert.equal(commit?.jobId, "run-idea-1-commit");
  assert.equal(commit?.idempotencyKey, "run-idea-1:commit");
});

test("production compiler returns null for non-production stages", async () => {
  const compile = createIdeaLabProductionDesktopTaskCompiler(config, { now: () => NOW });
  for (const stage of ["ANALYZE", "PLAN", "IMPLEMENT", "SELF_REVIEW", "PR", "DEPLOY"] as const) {
    assert.equal(await compile(runAt(stage), "agent-live"), null);
  }
});

test("production Commit publishes the exact system branch from the Context head", async () => {
  const compile = createIdeaLabProductionDesktopTaskCompiler(config, { now: () => NOW });
  const contextHead = "c".repeat(40);
  const run = runAt("COMMIT");
  run.evidence = [{
    version: 1,
    id: "context-head",
    kind: "command",
    stage: "CONTEXT",
    recordedAt: NOW,
    summary: "Desktop context inspected",
    provider: "iseol-desktop-agent",
    reference: contextHead,
  }];

  const commit = await compile(run, "agent-live");
  assert.deepEqual(commit?.operations[0], {
    id: "commit",
    type: "GIT_COMMIT",
    cwd: ".",
    message: "feat: build idea lab prototype",
    expectedHead: contextHead,
    publish: true,
  });
});
test("production TEST operation is explicitly purpose-bound", async () => {
  const compile = createIdeaLabProductionDesktopTaskCompiler(config, { now: () => NOW });
  const testPack = await compile(runAt("TEST"), "agent-live");
  assert.equal((testPack?.operations[0] as any)?.purpose, "test");
});

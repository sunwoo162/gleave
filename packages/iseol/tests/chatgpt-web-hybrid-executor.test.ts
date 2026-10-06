import assert from "node:assert/strict";
import test from "node:test";
import type { HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";
import { createHybridStageExecutor } from "../src/chatgpt-web/hybrid-executor.js";

function runAt(stage: HarnessRuntimeRunEnvelope["state"]["stage"]): HarnessRuntimeRunEnvelope {
  return {
    version: 1,
    request: { version: 1, runId: "run-hybrid", mode: "project-workspace", objective: "route", targetRoot: "C:/repo" },
    preflight: { version: 1, runId: "run-hybrid", status: "ready", policy: { version: 1, loadedAt: "2026-09-08T01:00:00.000Z", sources: [], effectiveSha256: "a" } },
    state: { version: 1, stage, status: "RUNNING", completedStages: [], skippedStages: [], updatedAt: "2026-09-08T01:00:00.000Z" },
    evidence: [], updatedAt: "2026-09-08T01:00:00.000Z",
  };
}

test("hybrid executor routes each stage to exactly one owner", async () => {
  const calls: string[] = [];
  const owner = (name: string) => ({ execute: async () => { calls.push(name); return { type: "waiting-external" as const, reason: name }; } });
  const hybrid = createHybridStageExecutor({ webExecutor: owner("web"), desktopExecutor: owner("desktop"), providerExecutor: owner("provider") });
  for (const stage of ["ANALYZE", "PLAN", "IMPLEMENT", "SELF_REVIEW"] as const) {
    calls.length = 0; await hybrid.execute(runAt(stage)); assert.deepEqual(calls, ["web"]);
  }
  for (const stage of ["CONTEXT", "TEST", "COMMIT"] as const) {
    calls.length = 0; await hybrid.execute(runAt(stage)); assert.deepEqual(calls, ["desktop"]);
  }
  for (const stage of ["PR", "CI", "MERGE", "DEPLOY", "PRODUCTION_VERIFY"] as const) {
    calls.length = 0; await hybrid.execute(runAt(stage)); assert.deepEqual(calls, ["provider"]);
  }
});

test("unconfigured provider and unsupported stages wait without side effects", async () => {
  let calls = 0;
  const owner = { execute: async () => { calls += 1; return { type: "completed" as const, evidence: [] }; } };
  const hybrid = createHybridStageExecutor({ webExecutor: owner, desktopExecutor: owner });
  const provider = await hybrid.execute(runAt("PR"));
  assert.equal(provider.type, "waiting-external");
  const done = await hybrid.execute(runAt("DONE"));
  assert.equal(done.type, "waiting-external");
  assert.equal(calls, 0);
});
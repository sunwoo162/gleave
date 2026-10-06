import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessEvidenceRecord, HarnessRuntimeRunEnvelope, HarnessRunStage } from "../src/harness/contracts.js";
import { loadLatestHarnessCheckpoint } from "../src/harness/event-store.js";
import { recoverHarnessRun, type HarnessRealitySnapshot } from "../src/harness/recovery.js";
import { loadHarnessRun, saveHarnessRun } from "../src/harness/run-store.js";
import { superviseHarnessRun, type HarnessStageExecutor } from "../src/harness/run-supervisor.js";
import { loadHarnessSideEffect } from "../src/harness/side-effect-ledger.js";
import { runEvaluationScenario } from "../src/evaluation/scenario-runner.js";
import { CONCURRENT_RECOVERY_SCENARIOS } from "../src/evaluation/scenarios/concurrent-recovery.js";

const T1 = "2026-09-08T07:00:01.000Z";
const T2 = "2026-09-08T07:00:02.000Z";

function runtimeRun(stage: HarnessRunStage): HarnessRuntimeRunEnvelope {
  return {
    version: 1,
    request: { version: 1, runId: "run-race", mode: "project-workspace", objective: "race evaluation", targetRoot: "C:/repo" },
    preflight: { version: 1, runId: "run-race", status: "ready", policy: { version: 1, loadedAt: T1, sources: [], effectiveSha256: "a".repeat(64) } },
    state: { version: 1, stage, status: "RUNNING", completedStages: ["PREFLIGHT"], skippedStages: [], updatedAt: T1 },
    evidence: [],
    updatedAt: T1,
  };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function commitReality(): HarnessRealitySnapshot {
  return {
    agentAvailable: true,
    currentCommit: "abc123",
    desktopCommit: { key: "commit:run-race", reference: "abc123", jobId: "job-commit" },
  };
}

function prReality(): HarnessRealitySnapshot {
  return {
    agentAvailable: true,
    currentCommit: "abc123",
    pullRequest: { key: "pull-request:owner/repo:feat/race", reference: "https://github.com/owner/repo/pull/42" },
  };
}

function evidence(kind: HarnessEvidenceRecord["kind"], stage: HarnessRunStage): HarnessEvidenceRecord {
  return { version: 1, id: `${stage}-${kind}`, kind, stage, recordedAt: T2, summary: `${stage} ${kind}` };
}
test("concurrent COMMIT recovery keeps one canonical side effect and progression", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-race-commit-"));
  await saveHarnessRun(root, runtimeRun("COMMIT"));
  const entered = deferred();
  const release = deferred();
  const slow = recoverHarnessRun({
    storeRoot: root, runId: "run-race", at: "2026-09-08T07:00:02.000Z",
    inspector: { inspect: async () => { entered.resolve(); await release.promise; return commitReality(); } },
  });
  await entered.promise;
  const fast = await recoverHarnessRun({
    storeRoot: root, runId: "run-race", at: "2026-09-08T07:00:03.000Z",
    inspector: { inspect: async () => commitReality() },
  });
  release.resolve();
  await slow;
  const final = await loadHarnessRun(root, "run-race");
  assert.equal(fast.state.stage, "PR");
  assert.equal(final?.state.stage, "PR");
  assert.equal(final?.evidence.filter((item) => item.kind === "commit").length, 1);
  assert.equal((await loadHarnessSideEffect(root, "run-race", "commit:run-race"))?.status, "completed");
});
test("concurrent PR recovery reuses one provider receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-race-pr-"));
  await saveHarnessRun(root, runtimeRun("PR"));
  const entered = deferred();
  const release = deferred();
  const slow = recoverHarnessRun({
    storeRoot: root, runId: "run-race", at: "2026-09-08T07:00:02.000Z",
    inspector: { inspect: async () => { entered.resolve(); await release.promise; return prReality(); } },
  });
  await entered.promise;
  await recoverHarnessRun({
    storeRoot: root, runId: "run-race", at: "2026-09-08T07:00:03.000Z",
    inspector: { inspect: async () => prReality() },
  });
  release.resolve();
  await slow;
  const final = await loadHarnessRun(root, "run-race");
  const key = prReality().pullRequest!.key;
  assert.equal(final?.state.stage, "CI");
  assert.equal(final?.evidence.filter((item) => item.kind === "pull-request").length, 1);
  assert.equal((await loadHarnessSideEffect(root, "run-race", key))?.status, "completed");
});
test("late older recovery cannot overwrite a newer supervisor checkpoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-race-stale-"));
  await saveHarnessRun(root, runtimeRun("COMMIT"));
  const entered = deferred();
  const release = deferred();
  const slow = recoverHarnessRun({
    storeRoot: root, runId: "run-race", at: "2026-09-08T07:00:02.000Z",
    inspector: { inspect: async () => { entered.resolve(); await release.promise; return commitReality(); } },
  });
  await entered.promise;
  await recoverHarnessRun({
    storeRoot: root, runId: "run-race", at: "2026-09-08T07:00:03.000Z",
    inspector: { inspect: async () => commitReality() },
  });
  const executor: HarnessStageExecutor = {
    execute: async (run) => run.state.stage === "PR"
      ? { type: "completed", evidence: [evidence("pull-request", "PR")] }
      : { type: "waiting-external", reason: "CI pending" },
  };
  const times = [
    "2026-09-08T07:00:04.000Z",
    "2026-09-08T07:00:05.000Z",
    "2026-09-08T07:00:06.000Z",
  ];
  const supervised = await superviseHarnessRun({
    storeRoot: root,
    runId: "run-race",
    executor,
    maxSteps: 2,
    now: () => times.shift() ?? "2026-09-08T07:00:06.000Z",
  });
  assert.equal(supervised.state.stage, "CI");
  assert.equal(supervised.state.status, "WAITING_EXTERNAL");
  release.resolve();
  await slow;

  const final = await loadHarnessRun(root, "run-race");
  const checkpoint = await loadLatestHarnessCheckpoint(root, "run-race");
  assert.equal(checkpoint?.state.stage, "CI");
  assert.equal(checkpoint?.state.status, "WAITING_EXTERNAL");
  assert.equal(final?.state.stage, "CI");
  assert.equal(final?.state.status, "WAITING_EXTERNAL");
});
test("concurrent recovery evaluation scenario records the canonical race invariant", async () => {
  assert.equal(CONCURRENT_RECOVERY_SCENARIOS.length, 1);
  const root = await mkdtemp(join(tmpdir(), "iseol-race-evaluation-"));
  const result = await runEvaluationScenario({
    root,
    suiteId: "concurrent-recovery",
    evaluationId: "eval-concurrent-recovery",
    definition: CONCURRENT_RECOVERY_SCENARIOS[0]!,
    seed: "seed-concurrent-recovery",
    now: () => "2026-09-08T07:01:00.000Z",
  });
  assert.equal(result.report.status, "passed", result.report.summary);
  assert.equal(result.run.metrics.duplicateSideEffectCount, 0);
  assert.equal(result.run.invariants.every((item) => item.status === "passed"), true);
});

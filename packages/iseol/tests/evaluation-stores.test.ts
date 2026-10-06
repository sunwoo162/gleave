import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  EvaluationObservation,
  EvaluationReport,
  EvaluationRun,
  EvaluationSuite,
} from "../src/evaluation/contracts.js";
import { loadEvaluationSuite, listEvaluationSuites, saveEvaluationSuite } from "../src/evaluation/suite-store.js";
import { loadEvaluationRun, listEvaluationRuns, saveEvaluationRun } from "../src/evaluation/evaluation-store.js";
import { appendEvaluationObservationOnce, listEvaluationObservations } from "../src/evaluation/observation-store.js";
import { loadEvaluationReport, saveEvaluationReport } from "../src/evaluation/report-store.js";

const NOW = "2026-09-08T05:00:00.000Z";
const metrics = {
  completionRate: 1, recoverySuccessRate: 1, humanInterventionCount: 0,
  duplicateSideEffectCount: 0, unexpectedMutationCount: 0, verificationPassRate: 1,
  recoveryLatencyMs: 20, runDurationMs: 100, stageRetryCount: 0,
  staleSessionResultCount: 0, providerCallCount: 1, toolInvocationCount: 1,
};

async function withRoot(fn: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "iseol-eval-"));
  try { await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}
function suite(id: string, createdAt = NOW): EvaluationSuite {
  return { version: 1, suiteId: id, name: id, mode: "quick", scenarioIds: ["scenario-1"], defaultSeed: "seed", createdAt };
}
function run(id: string, startedAt = NOW): EvaluationRun {
  return {
    version: 1, evaluationId: id, suiteId: "suite-1", scenarioId: "scenario-1", seed: "seed",
    status: "running", startedAt, injectedFaults: [], metrics: { ...metrics }, invariants: [], summary: "running",
  };
}
function observation(id: string, summary = "observed"): EvaluationObservation {
  return {
    version: 1, id, evaluationId: "eval-1", scenarioId: "scenario-1",
    type: "recovery-observed", at: NOW, summary,
  };
}
function report(summary = "passed"): EvaluationReport {
  return {
    version: 1, evaluationId: "eval-1", suiteId: "suite-1", status: "passed",
    startedAt: NOW, completedAt: "2026-09-08T05:01:00.000Z", metrics: { ...metrics },
    invariants: [], scenarios: [{ scenarioId: "scenario-1", evaluationId: "eval-1", seed: "seed", status: "passed" }],
    liveBlockers: [], summary,
  };
}
test("suite and run stores round trip and list deterministically", async () => {
  await withRoot(async (root) => {
    await saveEvaluationSuite(root, suite("suite-b"));
    await saveEvaluationSuite(root, suite("suite-a", "2026-09-08T04:00:00.000Z"));
    assert.equal((await loadEvaluationSuite(root, "suite-b"))?.suiteId, "suite-b");
    assert.equal(await loadEvaluationSuite(root, "missing"), null);
    assert.deepEqual((await listEvaluationSuites(root)).map((item) => item.suiteId), ["suite-a", "suite-b"]);

    await saveEvaluationRun(root, run("eval-b"));
    await saveEvaluationRun(root, run("eval-a", "2026-09-08T04:30:00.000Z"));
    assert.equal((await loadEvaluationRun(root, "eval-b"))?.status, "running");
    assert.equal(await loadEvaluationRun(root, "missing"), null);
    assert.deepEqual((await listEvaluationRuns(root)).map((item) => item.evaluationId), ["eval-a", "eval-b"]);
  });
});

test("observations append once by semantic identity", async () => {
  await withRoot(async (root) => {
    assert.equal(await appendEvaluationObservationOnce(root, observation("obs-1")), true);
    assert.equal(await appendEvaluationObservationOnce(root, { ...observation("obs-1"), at: "2026-09-08T05:00:01.000Z" }), false);
    assert.deepEqual((await listEvaluationObservations(root, "eval-1")).map((item) => item.id), ["obs-1"]);
    await assert.rejects(() => appendEvaluationObservationOnce(root, observation("obs-1", "different")), /identity mismatch/i);
  });
});
test("concurrent observation append-once calls preserve one identity", async () => {
  await withRoot(async (root) => {
    const results = await Promise.all([
      appendEvaluationObservationOnce(root, observation("obs-concurrent")),
      appendEvaluationObservationOnce(root, observation("obs-concurrent")),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal((await listEvaluationObservations(root, "eval-1")).length, 1);
  });
});
test("completed reports are immutable and idempotent", async () => {
  await withRoot(async (root) => {
    assert.equal(await saveEvaluationReport(root, report()), true);
    assert.equal(await saveEvaluationReport(root, report()), false);
    assert.equal((await loadEvaluationReport(root, "eval-1"))?.summary, "passed");
    await assert.rejects(() => saveEvaluationReport(root, report("changed")), /immutable|identity mismatch/i);
  });
});

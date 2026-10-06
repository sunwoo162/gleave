import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { EvaluationRun } from "../src/evaluation/contracts.js";
import { withDurableEvaluationRunLock } from "../src/evaluation/run-lock.js";
import { listEvaluationRuns, loadEvaluationRun, saveEvaluationRun } from "../src/evaluation/evaluation-store.js";

const run: EvaluationRun = {
  version: 1,
  evaluationId: "evaluation-run-store-lock-test",
  suiteId: "suite-1",
  scenarioId: "scenario-1",
  seed: "seed",
  status: "running",
  startedAt: "2026-09-30T00:00:00.000Z",
  injectedFaults: [],
  metrics: {
    completionRate: 0,
    recoverySuccessRate: 0,
    humanInterventionCount: 0,
    duplicateSideEffectCount: 0,
    unexpectedMutationCount: 0,
    verificationPassRate: 0,
    recoveryLatencyMs: 0,
    runDurationMs: 0,
    stageRetryCount: 0,
    staleSessionResultCount: 0,
    providerCallCount: 0,
    toolInvocationCount: 0,
  },
  invariants: [],
  summary: "실행 중",
};

test("evaluation run public reads and writes wait for the durable run lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-evaluation-run-store-lock-"));
  try {
    await saveEvaluationRun(root, run);

    let releaseHolder!: () => void;
    const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
    const lockHeld = withDurableEvaluationRunLock(root, run.evaluationId, async () => holderReleased, { waitForMs: 0 });
    await new Promise((resolve) => setTimeout(resolve, 25));

    let saveSettled = false;
    let loadSettled = false;
    let listSettled = false;
    const updated = { ...run, summary: "잠금 해제 후 실행" };
    const save = saveEvaluationRun(root, updated).then(() => { saveSettled = true; });
    const load = loadEvaluationRun(root, run.evaluationId).then(() => { loadSettled = true; });
    const list = listEvaluationRuns(root).then(() => { listSettled = true; });

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(saveSettled, false);
    assert.equal(loadSettled, false);
    assert.equal(listSettled, false);

    releaseHolder();
    await lockHeld;
    await Promise.all([save, load, list]);
    assert.equal((await loadEvaluationRun(root, run.evaluationId))?.summary, updated.summary);
    assert.equal((await listEvaluationRuns(root))[0]?.summary, updated.summary);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { EvaluationReport } from "../src/evaluation/contracts.js";
import { withDurableEvaluationReportLock } from "../src/evaluation/report-lock.js";
import { loadEvaluationReport, saveEvaluationReport } from "../src/evaluation/report-store.js";

const report: EvaluationReport = {
  version: 1,
  evaluationId: "evaluation-report-store-lock-test",
  suiteId: "suite-1",
  status: "passed",
  startedAt: "2026-09-30T00:00:00.000Z",
  completedAt: "2026-09-30T00:01:00.000Z",
  metrics: {
    completionRate: 1,
    recoverySuccessRate: 1,
    humanInterventionCount: 0,
    duplicateSideEffectCount: 0,
    unexpectedMutationCount: 0,
    verificationPassRate: 1,
    recoveryLatencyMs: 20,
    runDurationMs: 100,
    stageRetryCount: 0,
    staleSessionResultCount: 0,
    providerCallCount: 1,
    toolInvocationCount: 1,
  },
  invariants: [],
  scenarios: [{ scenarioId: "scenario-1", evaluationId: "evaluation-report-store-lock-test", seed: "seed", status: "passed" }],
  liveBlockers: [],
  summary: "통과",
};

test("evaluation report public reads and writes wait for the durable report lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-evaluation-report-store-lock-"));
  try {
    assert.equal(await saveEvaluationReport(root, report), true);

    let releaseHolder!: () => void;
    const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
    const lockHeld = withDurableEvaluationReportLock(root, report.evaluationId, async () => holderReleased, { waitForMs: 0 });
    await new Promise((resolve) => setTimeout(resolve, 25));

    let loadSettled = false;
    let saveSettled = false;
    let saveResult: boolean | undefined;
    const load = loadEvaluationReport(root, report.evaluationId).then(() => { loadSettled = true; });
    const save = saveEvaluationReport(root, report).then((result) => { saveResult = result; saveSettled = true; });

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(loadSettled, false);
    assert.equal(saveSettled, false);

    releaseHolder();
    await lockHeld;
    await Promise.all([load, save]);
    assert.equal(saveResult, false);
    assert.equal((await loadEvaluationReport(root, report.evaluationId))?.summary, report.summary);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("concurrent identical evaluation report saves have one writer", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-evaluation-report-store-race-"));
  try {
    const results = await Promise.all([saveEvaluationReport(root, report), saveEvaluationReport(root, report)]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.deepEqual(await loadEvaluationReport(root, report.evaluationId), report);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

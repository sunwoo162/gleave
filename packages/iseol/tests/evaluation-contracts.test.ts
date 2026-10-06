import assert from "node:assert/strict";
import test from "node:test";
import {
  ISEOL_EVALUATION_VERSION,
  assertEvaluationId,
  assertEvaluationRun,
  assertEvaluationScenario,
  assertEvaluationSuite,
  assertEvaluationVersion,
  type EvaluationMetrics,
  type EvaluationRun,
  type EvaluationScenario,
  type EvaluationSuite,
} from "../src/evaluation/contracts.js";

const NOW = "2026-09-08T05:00:00.000Z";
const ZERO_METRICS: EvaluationMetrics = {
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
};
function suite(): EvaluationSuite {
  return {
    version: 1,
    suiteId: "quick-core",
    name: "Quick Core",
    mode: "quick",
    scenarioIds: ["desktop-commit-loss"],
    defaultSeed: "seed-001",
    createdAt: NOW,
  };
}

function scenario(): EvaluationScenario {
  return {
    version: 1,
    scenarioId: "desktop-commit-loss",
    category: "desktop",
    name: "Commit receipt loss",
    targetMode: "project-workspace",
    maxDurationMs: 30_000,
    faultPlan: [{ boundary: "desktop", point: "after-side-effect-before-receipt", occurrence: 1, action: "disconnect" }],
    expectedInvariants: ["duplicate-commit-zero"],
    requiredCapabilities: ["desktop-agent"],
  };
}
function run(): EvaluationRun {
  return {
    version: 1,
    evaluationId: "eval-1",
    suiteId: "quick-core",
    scenarioId: "desktop-commit-loss",
    seed: "seed-001",
    targetRunId: "run-1",
    status: "running",
    startedAt: NOW,
    injectedFaults: [],
    metrics: { ...ZERO_METRICS },
    invariants: [],
    summary: "Running evaluation",
  };
}

test("evaluation version and ids fail closed", () => {
  assert.equal(ISEOL_EVALUATION_VERSION, 1);
  assert.doesNotThrow(() => assertEvaluationVersion(1));
  assert.throws(() => assertEvaluationVersion(2));
  for (const bad of ["", "../escape", "a/b", "a\\b", ".hidden"]) {
    assert.throws(() => assertEvaluationId(bad));
  }
  assert.doesNotThrow(() => assertEvaluationId("eval-abc_123"));
});
test("suite scenario and run contracts are strict", () => {
  assert.doesNotThrow(() => assertEvaluationSuite(suite()));
  assert.doesNotThrow(() => assertEvaluationScenario(scenario()));
  assert.doesNotThrow(() => assertEvaluationRun(run()));

  assert.throws(() => assertEvaluationSuite({ ...suite(), token: "secret" }));
  assert.throws(() => assertEvaluationScenario({ ...scenario(), randomCode: "() => true" }));
  assert.throws(() => assertEvaluationRun({ ...run(), status: "done" }));
  assert.throws(() => assertEvaluationRun({ ...run(), metrics: { ...ZERO_METRICS, providerCallCount: -1 } }));
});

test("scenario requires deterministic bounded fault identity", () => {
  assert.throws(() => assertEvaluationScenario({ ...scenario(), maxDurationMs: 0 }));
  assert.throws(() => assertEvaluationScenario({ ...scenario(), faultPlan: [
    { boundary: "desktop", point: "after-side-effect-before-receipt", occurrence: 0, action: "disconnect" },
  ] }));
  assert.throws(() => assertEvaluationScenario({ ...scenario(), faultPlan: [
    { boundary: "unknown", point: "x", occurrence: 1, action: "disconnect" },
  ] }));
});

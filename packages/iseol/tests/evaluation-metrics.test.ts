import assert from "node:assert/strict";
import test from "node:test";
import { reduceEvaluationMetrics } from "../src/evaluation/metrics-reducer.js";
import { evaluateEvaluationInvariants } from "../src/evaluation/invariant-evaluator.js";
import { buildEvaluationReport } from "../src/evaluation/report.js";
import type { EvaluationMetrics } from "../src/evaluation/contracts.js";

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

const RUNS = [
  {
    runId: "run-1", startedAt: "2026-09-08T06:00:00.000Z", completedAt: "2026-09-08T06:00:10.000Z",
    completed: true, verificationPassed: true, stageRetryCount: 2, staleSessionResultCount: 1,
    toolInvocationCount: 4, humanInterventionCount: 0,
  },
  {
    runId: "run-2", startedAt: "2026-09-08T06:01:00.000Z", completedAt: "2026-09-08T06:01:20.000Z",
    completed: false, verificationPassed: false, stageRetryCount: 1, staleSessionResultCount: 0,
    toolInvocationCount: 3, humanInterventionCount: 1,
  },
];

const INVARIANT_EVIDENCE = {
  canonicalRunIdStable: true,
  canonicalDesktopJobIdStable: true,
  canonicalProductionIdStable: true,
  duplicateCommitCount: 0,
  duplicatePullRequestCount: 0,
  duplicateMergeCount: 0,
  duplicateDeploymentCount: 0,
  workspaceEscapeCount: 0,
  secretLeakageCount: 0,
  policyBypassMutationCount: 0,
  unverifiedCompletionCount: 0,
};

test("metrics reducer derives rates counts retries tools and durations from explicit evidence", () => {
  const metrics = reduceEvaluationMetrics({
    runs: RUNS,
    recoveries: [
      { runId: "run-1", startedAt: "2026-09-08T06:00:01.000Z", recoveredAt: "2026-09-08T06:00:03.000Z", succeeded: true },
      { runId: "run-2", startedAt: "2026-09-08T06:01:01.000Z", recoveredAt: "2026-09-08T06:01:05.000Z", succeeded: false },
    ],
    sideEffects: [
      { kind: "commit", semanticKey: "commit:run-1" },
      { kind: "commit", semanticKey: "commit:run-1" },
      { kind: "deployment", semanticKey: "deploy:run-1" },
    ],
    providerCallCount: 5,
    unexpectedMutationCount: 0,
  });
  assert.equal(metrics.completionRate, 0.5);
  assert.equal(metrics.recoverySuccessRate, 0.5);
  assert.equal(metrics.humanInterventionCount, 1);
  assert.equal(metrics.duplicateSideEffectCount, 1);
  assert.equal(metrics.verificationPassRate, 0.5);
  assert.equal(metrics.recoveryLatencyMs, 2_000);
  assert.equal(metrics.runDurationMs, 15_000);
  assert.equal(metrics.stageRetryCount, 3);
  assert.equal(metrics.staleSessionResultCount, 1);
  assert.equal(metrics.providerCallCount, 5);
  assert.equal(metrics.toolInvocationCount, 7);
});

test("recovery latency is deterministic p95 over successful explicit timestamps", () => {
  const latencies = [100, 200, 300, 400, 5_000].map((ms, index) => ({
    runId: `run-${index + 1}`,
    startedAt: "2026-09-08T06:00:00.000Z",
    recoveredAt: new Date(Date.parse("2026-09-08T06:00:00.000Z") + ms).toISOString(),
    succeeded: true,
  }));
  const metrics = reduceEvaluationMetrics({
    runs: [], recoveries: latencies, sideEffects: [], providerCallCount: 0, unexpectedMutationCount: 0,
  });
  assert.equal(metrics.recoveryLatencyMs, 5_000);
});

test("metrics reducer rejects impossible negative counts and backwards timestamps", () => {
  assert.throws(() => reduceEvaluationMetrics({
    runs: RUNS, recoveries: [], sideEffects: [], providerCallCount: -1, unexpectedMutationCount: 0,
  }));
  assert.throws(() => reduceEvaluationMetrics({
    runs: [{
      ...RUNS[0]!,
      startedAt: "2026-09-08T06:00:10.000Z",
      completedAt: "2026-09-08T06:00:00.000Z",
    }],
    recoveries: [], sideEffects: [], providerCallCount: 0, unexpectedMutationCount: 0,
  }));
});

test("hard invariants fail security and duplicate side effects even after completion", () => {
  const metrics = { ...ZERO_METRICS, completionRate: 1, duplicateSideEffectCount: 1 };
  const invariants = evaluateEvaluationInvariants({
    metrics,
    ...INVARIANT_EVIDENCE,
    duplicateDeploymentCount: 1,
    workspaceEscapeCount: 1,
  });
  assert.equal(invariants.find((item) => item.id === "duplicate-side-effect-zero")?.status, "failed");
  assert.equal(invariants.find((item) => item.id === "duplicate-deployment-zero")?.status, "failed");
  assert.equal(invariants.find((item) => item.id === "workspace-escape-zero")?.status, "failed");
  assert.equal(invariants.find((item) => item.id === "secret-leakage-zero")?.status, "passed");
});

test("report remains failed when hard metrics or invariants fail", () => {
  const metrics = { ...ZERO_METRICS, completionRate: 1, duplicateSideEffectCount: 1 };
  const report = buildEvaluationReport({
    evaluationId: "eval-1",
    suiteId: "quick-core",
    startedAt: "2026-09-08T06:00:00.000Z",
    completedAt: "2026-09-08T06:00:30.000Z",
    metrics,
    invariants: evaluateEvaluationInvariants({ metrics, ...INVARIANT_EVIDENCE }),
    scenarios: [{ scenarioId: "desktop-1", evaluationId: "eval-1", seed: "seed-1", status: "passed" }],
    liveBlockers: [],
    summary: "target Run reached DONE",
  });
  assert.equal(report.status, "failed");
});

test("report sanitizes credential-shaped text and caps per-scenario diagnostics", () => {
  const report = buildEvaluationReport({
    evaluationId: "eval-2",
    suiteId: "quick-core",
    startedAt: "2026-09-08T06:00:00.000Z",
    completedAt: "2026-09-08T06:00:30.000Z",
    metrics: { ...ZERO_METRICS },
    invariants: [],
    scenarios: [{
      scenarioId: "security-1", evaluationId: "eval-2", seed: "seed-2", status: "passed",
      diagnostic: `token=super-secret password=hunter2 https://preview.example/?access_token=diagnostic-secret ${"x".repeat(600)}`,
    }],
    liveBlockers: ["cookie=session-cookie", "preview https://preview.example/#oauth_token=blocker-secret"],
    summary: "Bearer abcdef secret=my-secret-value https://preview.example/?access_token=summary-secret",
  });
  assert.doesNotMatch(JSON.stringify(report), /super-secret|hunter2|diagnostic-secret|session-cookie|blocker-secret|abcdef|my-secret-value|summary-secret/);
  assert.match(report.summary, /REDACTED/);
  assert.match(report.liveBlockers[0] ?? "", /REDACTED/);
  assert.ok((report.scenarios[0]?.diagnostic?.length ?? 0) <= 256);
});

test("live blockers remain blocked-external when no deterministic failure exists", () => {
  const report = buildEvaluationReport({
    evaluationId: "eval-3",
    suiteId: "quick-core",
    startedAt: "2026-09-08T06:00:00.000Z",
    completedAt: "2026-09-08T06:00:30.000Z",
    metrics: { ...ZERO_METRICS },
    invariants: [],
    scenarios: [{ scenarioId: "live-chatgpt", evaluationId: "eval-3", seed: "seed-3", status: "blocked-external" }],
    liveBlockers: ["ChatGPT browser authorization unavailable"],
    summary: "live smoke unavailable",
  });
  assert.equal(report.status, "blocked-external");
});

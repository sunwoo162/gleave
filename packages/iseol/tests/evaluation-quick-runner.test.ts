import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EvaluationReport } from "../src/evaluation/contracts.js";
import { loadEvaluationReport } from "../src/evaluation/report-store.js";
import {
  QUICK_EVALUATION_SEEDS,
  QUICK_EVALUATION_SUITE,
  buildQuickLiveSmokeBlockers,
} from "../src/evaluation/scenario-catalog.js";
import {
  formatQuickEvaluationOutput,
  quickEvaluationExitCode,
  runQuickEvaluation,
} from "../src/evaluation/quick-runner.js";

const EXPECTED_IDS = [
  "desktop-offline-before-dispatch",
  "desktop-disconnect-after-lease",
  "desktop-harmless-result-loss",
  "desktop-commit-receipt-loss",
  "desktop-stale-late-result",
  "desktop-process-timeout",
  "desktop-heartbeat-transient",
  "chatgpt-session-loss",
  "chatgpt-old-generation-late-result",
  "chatgpt-malformed-output-budget",
  "chatgpt-invalid-intent-budget",
  "chatgpt-policy-drift-before-mutation",
  "security-parent-traversal",
  "security-symlink-escape",
  "security-raw-shell-field",
  "security-destructive-git-operation",
  "security-stale-harness-source",
  "security-missing-harness-source",
  "security-secret-shaped-evidence",
  "security-malformed-contract-version",
  "security-task-result-identity-mismatch",
  "provider-pr-response-loss",
  "provider-pr-repeat-dedupe",
  "provider-ci-failure",
  "provider-ci-pending",
  "provider-permission-denied",
  "provider-rate-limit",
  "provider-deploy-response-loss",
  "provider-deploy-wrong-commit",
  "provider-production-verify-timeout",
  "provider-duplicate-callback",
];

const EXPECTED_SEEDS = EXPECTED_IDS.map((_, index) => `quick-v1-${String(index + 1).padStart(2, "0")}`);

test("quick catalog order and seeds are committed", () => {
  assert.deepEqual(QUICK_EVALUATION_SUITE.scenarioIds, EXPECTED_IDS);
  assert.deepEqual(EXPECTED_IDS.map((id) => QUICK_EVALUATION_SEEDS[id]), EXPECTED_SEEDS);
  assert.equal(QUICK_EVALUATION_SUITE.defaultSeed, "quick-v1");
});

test("quick runner writes one durable aggregate report with committed replay seeds", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-eval-quick-"));
  const report = await runQuickEvaluation({
    root,
    now: () => "2026-09-08T12:00:00.000Z",
  });

  assert.equal(report.status, "passed", report.summary);
  assert.deepEqual(report.scenarios.map((item) => item.scenarioId), EXPECTED_IDS);
  assert.deepEqual(report.scenarios.map((item) => item.seed), EXPECTED_SEEDS);
  assert.equal(report.metrics.duplicateSideEffectCount, 0);
  assert.equal(report.metrics.unexpectedMutationCount, 0);
  assert.deepEqual(report.liveBlockers, []);
  assert.deepEqual(await loadEvaluationReport(root, report.evaluationId), report);
});

function failingReport(): EvaluationReport {
  return {
    version: 1,
    evaluationId: "eval-quick-failure",
    suiteId: "quick-evaluation",
    status: "failed",
    startedAt: "2026-09-08T12:00:00.000Z",
    completedAt: "2026-09-08T12:00:01.000Z",
    metrics: {
      completionRate: 0, recoverySuccessRate: 0, humanInterventionCount: 0,
      duplicateSideEffectCount: 0, unexpectedMutationCount: 0, verificationPassRate: 0,
      recoveryLatencyMs: 0, runDurationMs: 0, stageRetryCount: 0,
      staleSessionResultCount: 0, providerCallCount: 0, toolInvocationCount: 0,
    },
    invariants: [{
      id: "duplicate-side-effect-zero", name: "Duplicate side effects", status: "failed",
      expected: "0", actual: "1", summary: "duplicate side effect observed",
    }],
    scenarios: [{
      scenarioId: "provider-pr-repeat-dedupe",
      evaluationId: "eval-quick-failure-s24",
      seed: "quick-v1-24",
      status: "failed",
    }],
    liveBlockers: [],
    summary: "Quick evaluation failed",
  };
}

test("quick CLI semantics return nonzero and print a replay tuple for failures", () => {
  const report = failingReport();
  assert.equal(quickEvaluationExitCode(report), 1);
  const output = formatQuickEvaluationOutput(report);
  assert.match(output, /suiteId=quick-evaluation/);
  assert.match(output, /scenarioId=provider-pr-repeat-dedupe/);
  assert.match(output, /evaluationId=eval-quick-failure-s24/);
  assert.match(output, /seed=quick-v1-24/);
});

test("live smoke blockers stay separate from deterministic quick scenarios", () => {
  const blockers = buildQuickLiveSmokeBlockers({
    chatGptBrowserDriverAvailable: false,
    realPreviewProviderAvailable: false,
  });
  assert.equal(blockers.length, 2);
  assert.match(blockers[0] ?? "", /ChatGptBrowserDriver/);
  assert.match(blockers[1] ?? "", /preview provider/i);
  assert.equal(QUICK_EVALUATION_SUITE.scenarioIds.some((id) => /live|browser-driver|preview-provider/i.test(id)), false);

  const blocked = { ...failingReport(), status: "blocked-external" as const, invariants: [], scenarios: [], liveBlockers: blockers };
  assert.equal(quickEvaluationExitCode(blocked), 1);
  assert.match(formatQuickEvaluationOutput(blocked), /live-smoke blocker/i);
});

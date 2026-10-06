import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runEvaluationScenario } from "../src/evaluation/scenario-runner.js";
import { PROVIDER_RECOVERY_SCENARIOS } from "../src/evaluation/scenarios/provider.js";

const EXPECTED_PROVIDER = [
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

function ids(items: { scenario: { scenarioId: string } }[]) {
  return items.map((item) => item.scenario.scenarioId);
}

test("provider catalog contains deterministic PR CI deploy and verification scenarios", () => {
  assert.deepEqual(ids(PROVIDER_RECOVERY_SCENARIOS), EXPECTED_PROVIDER);
});

test("every provider scenario passes through durable Iseol evaluation boundaries", async () => {
  for (const [index, definition] of PROVIDER_RECOVERY_SCENARIOS.entries()) {
    const root = await mkdtemp(join(tmpdir(), `iseol-eval-provider-${index}-`));
    const result = await runEvaluationScenario({
      root,
      suiteId: "quick-provider",
      evaluationId: `eval-provider-${index + 1}`,
      definition,
      seed: `seed-provider-${index + 1}`,
      now: () => "2026-09-08T11:00:00.000Z",
    });
    assert.equal(result.report.status, "passed", `${definition.scenario.scenarioId}: ${result.report.summary}`);
    assert.equal(result.run.status, "passed");
    assert.equal(result.run.metrics.duplicateSideEffectCount, 0);
    assert.equal(result.run.metrics.unexpectedMutationCount, 0);
    assert.equal(result.run.invariants.every((item) => item.status === "passed"), true);
    assert.equal(result.run.injectedFaults.length, definition.scenario.faultPlan.length);
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runEvaluationScenario } from "../src/evaluation/scenario-runner.js";
import { SECURITY_SCENARIOS } from "../src/evaluation/scenarios/security.js";

const EXPECTED_SECURITY = [
  "security-parent-traversal",
  "security-symlink-escape",
  "security-raw-shell-field",
  "security-destructive-git-operation",
  "security-stale-harness-source",
  "security-missing-harness-source",
  "security-secret-shaped-evidence",
  "security-malformed-contract-version",
  "security-task-result-identity-mismatch",
];

test("security catalog contains the committed deterministic negative scenarios", () => {
  assert.deepEqual(SECURITY_SCENARIOS.map((item) => item.scenario.scenarioId), EXPECTED_SECURITY);
});

test("every security scenario fails closed without unexpected mutation or leakage", async () => {
  for (const [index, definition] of SECURITY_SCENARIOS.entries()) {
    const root = await mkdtemp(join(tmpdir(), `iseol-eval-security-${index}-`));
    const result = await runEvaluationScenario({
      root,
      suiteId: "quick-security",
      evaluationId: `eval-security-${index + 1}`,
      definition,
      seed: `seed-security-${index + 1}`,
      now: () => "2026-09-08T07:10:00.000Z",
    });
    assert.equal(result.report.status, "passed", `${definition.scenario.scenarioId}: ${result.report.summary}`);
    assert.equal(result.run.metrics.unexpectedMutationCount, 0);
    assert.equal(result.run.invariants.every((item) => item.status === "passed"), true);
    assert.doesNotMatch(JSON.stringify(result.report), /hunter2|super-secret-token|raw-cookie/);
  }
});

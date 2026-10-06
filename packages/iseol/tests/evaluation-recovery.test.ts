import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEvaluationReport } from "../src/evaluation/report-store.js";
import { listEvaluationObservations } from "../src/evaluation/observation-store.js";
import { runEvaluationScenario } from "../src/evaluation/scenario-runner.js";
import { DESKTOP_RECOVERY_SCENARIOS } from "../src/evaluation/scenarios/desktop.js";
import { CHATGPT_WEB_RECOVERY_SCENARIOS } from "../src/evaluation/scenarios/chatgpt-web.js";

const EXPECTED_DESKTOP = [
  "desktop-offline-before-dispatch",
  "desktop-disconnect-after-lease",
  "desktop-harmless-result-loss",
  "desktop-commit-receipt-loss",
  "desktop-stale-late-result",
  "desktop-process-timeout",
  "desktop-heartbeat-transient",
];
const EXPECTED_WEB = [
  "chatgpt-session-loss",
  "chatgpt-old-generation-late-result",
  "chatgpt-malformed-output-budget",
  "chatgpt-invalid-intent-budget",
  "chatgpt-policy-drift-before-mutation",
];

function ids(items: { scenario: { scenarioId: string } }[]) {
  return items.map((item) => item.scenario.scenarioId);
}
test("recovery catalog contains the committed deterministic Desktop and ChatGPT Web scenarios", () => {
  assert.deepEqual(ids(DESKTOP_RECOVERY_SCENARIOS), EXPECTED_DESKTOP);
  assert.deepEqual(ids(CHATGPT_WEB_RECOVERY_SCENARIOS), EXPECTED_WEB);
});

test("every recovery scenario passes through normal Iseol boundaries with durable evaluation evidence", async () => {
  const scenarios = [...DESKTOP_RECOVERY_SCENARIOS, ...CHATGPT_WEB_RECOVERY_SCENARIOS];
  for (const [index, definition] of scenarios.entries()) {
    const root = await mkdtemp(join(tmpdir(), `iseol-eval-recovery-${index}-`));
    const evaluationId = `eval-recovery-${index + 1}`;
    const result = await runEvaluationScenario({
      root,
      suiteId: "quick-recovery",
      evaluationId,
      definition,
      seed: `seed-recovery-${index + 1}`,
      now: () => "2026-09-08T07:00:00.000Z",
    });
    assert.equal(result.report.status, "passed", `${definition.scenario.scenarioId}: ${result.report.summary}`);
    assert.equal(result.run.status, "passed");
    assert.equal(result.run.metrics.duplicateSideEffectCount, 0);
    assert.equal(result.run.metrics.unexpectedMutationCount, 0);
    assert.equal(result.run.invariants.every((item) => item.status === "passed"), true);
    assert.deepEqual(await loadEvaluationReport(root, evaluationId), result.report);
    const observations = await listEvaluationObservations(root, evaluationId);
    assert.equal(observations[0]?.type, "evaluation-started");
    assert.equal(observations.at(-1)?.type, "evaluation-completed");
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { EvaluationReport } from "../src/evaluation/contracts.js";
import { saveEvaluationReport } from "../src/evaluation/report-store.js";
import { buildEvaluationView } from "../src/web-control-plane/view-model.js";
import { routeWebControlPlaneRequest } from "../src/web-control-plane/router.js";

const METRICS = {
  completionRate: 1, recoverySuccessRate: 1, humanInterventionCount: 0,
  duplicateSideEffectCount: 0, unexpectedMutationCount: 0, verificationPassRate: 1,
  recoveryLatencyMs: 125, runDurationMs: 500, stageRetryCount: 0,
  staleSessionResultCount: 0, providerCallCount: 2, toolInvocationCount: 3,
};

function report(input: {
  evaluationId: string;
  suiteId: "quick-evaluation" | "soak-evaluation";
  completedAt: string;
  status?: EvaluationReport["status"];
  secret?: boolean;
}): EvaluationReport {
  const secret = input.secret ? " token=super-secret-token api_key=evaluation-api-secret https://preview.example/?access_token=evaluation-url-secret https%3A%2F%2Fpreview.example%2F%3Faccess_token%3Devaluation-encoded-secret" : "";
  return {
    version: 1, evaluationId: input.evaluationId, suiteId: input.suiteId,
    status: input.status ?? "failed",
    startedAt: "2026-09-08T07:00:00.000Z", completedAt: input.completedAt,
    metrics: { ...METRICS },
    invariants: [{
      id: "secret-leakage-zero", name: "Secret leakage", status: "failed",
      expected: "0", actual: "1", summary: `Secret leakage detected${secret}`,
    }],
    scenarios: [
      { scenarioId: "scenario-pass", evaluationId: `${input.evaluationId}-pass`, seed: "seed-pass", status: "passed" },
      { scenarioId: "scenario-fail", evaluationId: `${input.evaluationId}-fail`, seed: "seed-fail", status: "failed", diagnostic: `failed${secret}` },
      { scenarioId: "scenario-blocked", evaluationId: `${input.evaluationId}-blocked`, seed: "seed-blocked", status: "blocked-external" },
    ],
    liveBlockers: [`ChatGPT browser unavailable${secret}`],
    summary: `evaluation summary${secret}`,
  };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "iseol-evaluation-web-"));
  await saveEvaluationReport(root, report({ evaluationId: "quick-old", suiteId: "quick-evaluation", completedAt: "2026-09-08T07:00:01.000Z" }));
  await saveEvaluationReport(root, report({ evaluationId: "quick-new", suiteId: "quick-evaluation", completedAt: "2026-09-08T07:00:03.000Z", secret: true }));
  await saveEvaluationReport(root, report({ evaluationId: "soak-new", suiteId: "soak-evaluation", completedAt: "2026-09-08T07:00:02.000Z" }));
  return root;
}
test("Evaluation view selects latest quick and soak reports with bounded replay identity", async () => {
  const root = await fixture();
  const view = await buildEvaluationView(root);
  assert.equal(view.quick?.evaluationId, "quick-new");
  assert.equal(view.soak?.evaluationId, "soak-new");
  assert.deepEqual(view.quick?.counts, { passed: 1, failed: 1, blocked: 1 });
  assert.equal(view.quick?.recoveryLatencyMs, 125);
  assert.equal(view.quick?.duplicateSideEffectCount, 0);
  assert.deepEqual(view.quick?.failedScenarios[0], {
    scenarioId: "scenario-fail", evaluationId: "quick-new-fail", seed: "seed-fail", status: "failed",
  });
  assert.deepEqual(view.quick?.failedInvariantIds, ["secret-leakage-zero"]);
  assert.equal(view.quick?.liveBlockers.length, 1);
});

test("Evaluation view redacts durable diagnostics and missing roots render empty", async () => {
  const root = await fixture();
  const view = await buildEvaluationView(root);
  const serialized = JSON.stringify(view);
  for (const secret of ["super-secret-token", "evaluation-api-secret", "evaluation-url-secret", "evaluation-encoded-secret"]) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.match(serialized, /\[REDACTED\]/);
  const missing = await buildEvaluationView(join(root, "missing"));
  assert.deepEqual(missing, { quick: null, soak: null });
  assert.equal(JSON.stringify(missing).includes(root), false);
});
test("Evaluation endpoint is GET-only and exposes no mutation control", async () => {
  const evaluationRoot = await fixture();
  const deps = { modelRoot: join(evaluationRoot, "model"), harnessRoot: join(evaluationRoot, "runs"), evaluationRoot };
  const get = await routeWebControlPlaneRequest({ method: "GET", path: "/api/evaluation", headers: {} }, deps);
  assert.equal(get.status, 200);
  assert.equal((get.body as any).quick.evaluationId, "quick-new");

  const post = await routeWebControlPlaneRequest({ method: "POST", path: "/api/evaluation", headers: {}, body: {} }, deps);
  assert.equal(post.status, 405);
});

test("Evaluation UI shows replay identity and separates deterministic failures from live blockers", async () => {
  const webRoot = resolve(process.cwd(), "web");
  const html = await readFile(join(webRoot, "index.html"), "utf8");
  const script = await readFile(join(webRoot, "app.js"), "utf8");
  const styles = await readFile(join(webRoot, "styles.css"), "utf8");
  assert.match(html, /data-mode="evaluation"/);
  assert.match(html, /id="evaluation-view"/);
  assert.match(script, /\/api\/evaluation/);
  assert.match(script, /scenarioId/);
  assert.match(script, /seed/);
  assert.match(script, /liveBlockers/);
  assert.match(styles, /evaluation-failure/);
  assert.match(styles, /evaluation-live-blocker/);
});

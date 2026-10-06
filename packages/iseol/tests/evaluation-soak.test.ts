import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acquireDesktopJobLease,
  createDesktopJob,
  markDesktopJobIndeterminate,
} from "../src/desktop-agent/job-store.js";
import { createWebWorkerSession } from "../src/chatgpt-web/session-store.js";
import { loadEvaluationReport } from "../src/evaluation/report-store.js";
import { observeEvaluationResources } from "../src/evaluation/resource-observer.js";
import { runSoakEvaluation } from "../src/evaluation/soak-runner.js";
import {
  createEvaluationFixture,
  desktopPack,
} from "../src/evaluation/test-support/evaluation-fixtures.js";

const AT = "2026-09-08T13:00:00.000Z";
const LATER = "2026-09-08T13:02:00.000Z";

test("resource observer detects only explicitly owned leaked jobs sessions processes and temp files", async () => {
  const f = await createEvaluationFixture("iseol-eval-resource");
  const readPack = desktopPack({ targetRoot: f.targetRoot, jobId: "job-expired" });
  await createDesktopJob(f.jobRoot, readPack, AT);
  await acquireDesktopJobLease(f.jobRoot, readPack.jobId, "session-expired", AT, 1_000);
  const mutatingPack = desktopPack({
    targetRoot: f.targetRoot,
    jobId: "job-indeterminate",
    policyDigest: f.policyDigest,
    policySources: f.policySources,
    operations: [{
      id: "build",
      type: "RUN_PROCESS",
      purpose: "build",
      cwd: ".",
      executable: "npm",
      args: ["run", "build"],
      timeoutMs: 1_000,
    }],
  });
  await createDesktopJob(f.jobRoot, mutatingPack, AT);
  await acquireDesktopJobLease(f.jobRoot, mutatingPack.jobId, "session-mutating", AT, 1_000);
  await markDesktopJobIndeterminate(f.jobRoot, mutatingPack.jobId, "session-mutating", AT);

  await createWebWorkerSession(f.workerRoot, {
    version: 1,
    sessionId: "session-stale",
    runId: "run-stale",
    stage: "ANALYZE",
    generation: 1,
    policySha256: "a".repeat(64),
    status: "ready",
    resultContract: "structured-json",
    createdAt: AT,
  });
  await writeFile(join(f.jobRoot, "leaked.tmp"), "temporary", "utf8");
  const snapshot = await observeEvaluationResources({
    evaluationRoot: f.runRoot,
    desktopJobRoots: [f.jobRoot],
    webSessionRoots: [f.workerRoot],
    ownedChildProcessPids: [process.pid],
    now: LATER,
    webSessionStaleAfterMs: 30_000,
  });

  assert.equal(snapshot.desktopJobCount, 2);
  assert.equal(snapshot.expiredLiveLeaseCount, 2);
  assert.equal(snapshot.unreconciledMutatingIndeterminateCount, 1);
  assert.equal(snapshot.webSessionCount, 1);
  assert.equal(snapshot.staleHealthySessionCount, 1);
  assert.equal(snapshot.orphanProcessCount, 1);
  assert.equal(snapshot.temporaryFileCount, 1);
  assert.ok(snapshot.rssBytes > 0);
});

test("bounded soak repeats the committed catalog with deterministic seed expansion and durable report", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-eval-soak-"));
  const report = await runSoakEvaluation({
    root,
    iterations: 2,
    seeds: ["seed-a", "seed-b"],
    maxDurationMs: 30_000,
    now: () => "2026-09-08T13:10:00.000Z",
  });

  assert.equal(report.status, "passed", report.summary);
  assert.equal(report.scenarios.length, 62);
  assert.equal(report.scenarios[0]?.seed, "seed-a-i01-desktop-offline-before-dispatch");
  assert.equal(report.scenarios.at(-1)?.seed, "seed-b-i02-provider-duplicate-callback");
  assert.equal(report.metrics.duplicateSideEffectCount, 0);
  assert.equal(report.metrics.unexpectedMutationCount, 0);
  assert.equal(report.invariants.find((item) => item.id === "soak-resource-end-state")?.status, "passed");
  assert.deepEqual(await loadEvaluationReport(root, report.evaluationId), report);

  const end = await observeEvaluationResources({ evaluationRoot: root, now: LATER });
  assert.equal(end.orphanProcessCount, 0);
  assert.equal(end.expiredLiveLeaseCount, 0);
  assert.equal(end.unreconciledMutatingIndeterminateCount, 0);
  assert.equal(end.staleHealthySessionCount, 0);
  assert.equal(end.temporaryFileCount, 0);
});

test("soak time budget fails deterministically before starting work beyond the budget", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-eval-soak-budget-"));
  let calls = 0;
  const clockMs = () => (calls++ === 0 ? 0 : 11);
  const report = await runSoakEvaluation({
    root,
    iterations: 2,
    seeds: ["budget-seed"],
    maxDurationMs: 10,
    now: () => "2026-09-08T13:20:00.000Z",
    clockMs,
  });

  assert.equal(report.status, "failed");
  assert.equal(report.scenarios.length, 0);
  assert.equal(report.invariants.find((item) => item.id === "soak-time-budget")?.status, "failed");
  assert.match(report.summary, /time budget/i);
  assert.deepEqual(await loadEvaluationReport(root, report.evaluationId), report);
});
test("soak time budget failure still reports evaluation-owned resource leaks", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-eval-soak-budget-resource-"));
  await writeFile(join(root, "leaked.tmp"), "temporary", "utf8");
  let calls = 0;
  const clockMs = () => (calls++ === 0 ? 0 : 11);
  const report = await runSoakEvaluation({
    root,
    iterations: 2,
    seeds: ["budget-resource-seed"],
    maxDurationMs: 10,
    now: () => "2026-09-08T13:20:00.000Z",
    clockMs,
  });

  const resource = report.invariants.find((item) => item.id === "soak-resource-end-state");
  assert.equal(resource?.status, "failed");
  assert.match(resource?.actual ?? "", /temp=1/);
});

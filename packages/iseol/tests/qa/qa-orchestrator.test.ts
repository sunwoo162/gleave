import assert from "node:assert/strict";
import test from "node:test";
import { EvidenceLedger } from "../../src/qa/evidence-ledger.js";
import { QaOrchestrator } from "../../src/qa/qa-orchestrator.js";
import { QaPlan } from "../../src/qa/qa-plan.js";

function plan(revision = "rev-1") {
  return QaPlan.build({
    schemaVersion: 1,
    projectId: "project-1",
    requestId: "request-1",
    userGoal: "Ship a verified change",
    scope: ["responsive UI"],
    constraints: [],
    preferences: { projectRevision: revision },
    schedule: {},
    retrievedMemoryIds: [],
    qaBaselineIds: [],
    createdAt: "2026-10-06T00:00:00.000Z",
    projectRevision: revision,
  }, []);
}

test("QA orchestrator requires executable evidence and records hashes", async () => {
  const ledger = new EvidenceLedger(() => "2026-10-06T00:00:00.000Z");
  const report = await new QaOrchestrator({
    evidenceLedger: ledger,
    execute: (check) => ({
      status: "PASS",
      summary: `${check.id} passed`,
      command: `run-${check.id}`,
      exitStatus: 0,
      stdout: "ok",
    }),
  }).run(plan(), "C:\\workspace\\project", "rev-1");

  assert.equal(report.status, "PASS");
  assert.equal(report.checks.length, 7);
  assert.equal(ledger.list().length, 7);
  assert.match(ledger.list()[0]!.stdoutHash, /^[a-f0-9]{64}$/);
});

test("Agent completion text without command evidence cannot pass QA", async () => {
  const report = await new QaOrchestrator({
    execute: () => ({ status: "PASS", summary: "Agent says it is done" }),
  }).run(plan(), "C:\\workspace\\project", "rev-1");

  assert.equal(report.status, "FAIL");
  assert.ok(report.findings.some((finding) => finding.summary.includes("evidence")));
});

test("QA orchestrator blocks a stale plan revision", async () => {
  const report = await new QaOrchestrator({
    execute: () => ({ status: "PASS", summary: "should not release", command: "test", exitStatus: 0 }),
  }).run(plan("rev-1"), "C:\\workspace\\project", "rev-2");

  assert.equal(report.status, "FAIL");
  assert.ok(report.evidenceIds.includes("evidence-" + report.evidenceIds[0]!.slice("evidence-".length)));
  assert.equal(report.checks[0]?.id, "qa-latest-revision");
});

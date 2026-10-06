import test from "node:test";
import assert from "node:assert/strict";
import { runIndependentQa } from "../../src/qa/independent-runner.js";
import { buildProjectOutcomeReport } from "../../src/qa/outcome-report.js";
import { parseQaReportV1 } from "../../src/integrations/eeee-contracts.js";

test("ISEOL independent QA aggregates deterministic checks into a PASS report", async () => {
  const report = await runIndependentQa({
    projectId: "project-1",
    projectRevision: "rev-1",
    checks: [
      {
        id: "tests",
        label: "unit tests",
        run: async () => ({ status: "PASS", summary: "All unit tests passed", evidenceIds: ["evidence-tests"] }),
      },
      {
        id: "security",
        label: "security scan",
        run: async () => ({ status: "PASS", summary: "No release blockers", evidenceIds: ["evidence-security"] }),
      },
    ],
    now: () => "2026-10-06T00:00:00.000Z",
  });

  assert.equal(report.status, "PASS");
  assert.equal(report.independent, true);
  assert.deepEqual(report.evidenceIds, ["evidence-tests", "evidence-security"]);
  assert.deepEqual(report.findings, []);
});

test("a failed or errored check prevents QA PASS and records a finding", async () => {
  const report = await runIndependentQa({
    projectId: "project-1",
    projectRevision: "rev-1",
    checks: [
      {
        id: "build",
        label: "production build",
        run: async () => ({ status: "FAIL", summary: "Build failed", evidenceIds: ["evidence-build"] }),
      },
      {
        id: "runtime",
        label: "runtime smoke",
        run: async () => {
          throw new Error("runner unavailable");
        },
      },
    ],
    now: () => "2026-10-06T00:00:00.000Z",
  });

  assert.equal(report.status, "FAIL");
  assert.equal(report.findings.length, 2);
  assert.equal(report.findings[1]?.severity, "FAIL");
  assert.ok(report.evidenceIds.includes("qa-error-runtime"));
});

test("a warning remains visible and prevents memory promotion to an all-clear report", async () => {
  const report = await runIndependentQa({
    projectId: "project-1",
    projectRevision: "rev-1",
    checks: [
      {
        id: "visual",
        label: "visual regression",
        run: async () => ({ status: "WARN", summary: "Baseline drift needs review", evidenceIds: ["evidence-visual"] }),
      },
    ],
    now: () => "2026-10-06T00:00:00.000Z",
  });

  assert.equal(report.status, "WARN");
  assert.equal(report.findings[0]?.severity, "WARN");
});

test("ISEOL carries its independent QA result into the versioned EEEE outcome contract", async () => {
  const qa = await runIndependentQa({
    projectId: "project-1",
    projectRevision: "rev-1",
    checks: [{
      id: "tests",
      label: "unit tests",
      run: () => ({ status: "PASS", summary: "All tests passed", evidenceIds: ["evidence-tests"] }),
    }],
    now: () => "2026-10-06T00:00:00.000Z",
  });

  const outcome = buildProjectOutcomeReport({
    requestId: "request-1",
    qaReport: qa,
    deterministicVerification: { status: "PASS", evidenceIds: ["evidence-build"] },
    claimLatchReports: [{ id: "claimlatch-report-1", decision: "PASS" }],
    receipts: [{ id: "receipt-1" }],
    memoryCandidates: [{
      candidateId: "memory-1",
      kind: "qa_rule",
      content: "Run independent tests before release.",
      scope: { workstream: "release" },
      sourceProjectId: "project-1",
      sourceArtifactIds: ["artifact-qa-1"],
      evidenceIds: ["evidence-tests"],
      verificationIds: ["claimlatch-report-1"],
      confidence: 0.9,
      promotionState: "candidate",
      createdAt: "2026-10-06T00:00:00.000Z",
    }],
    createdAt: "2026-10-06T00:00:00.000Z",
  });

  assert.equal(outcome.qaReport.independent, true);
  assert.equal(outcome.qaReport.executor, "iseol-independent-qa");
  assert.equal(outcome.projectRevision, "rev-1");
  assert.equal(parseQaReportV1(outcome.qaReport).status, "PASS");
});

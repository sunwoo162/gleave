import assert from "node:assert/strict";
import test from "node:test";
import { ReleaseGate } from "../../src/qa/release-gate.js";
import type { IndependentQaReportV1 } from "../../src/qa/independent-runner.js";

const qaReport: IndependentQaReportV1 = {
  schemaVersion: 1,
  projectId: "project-1",
  projectRevision: "rev-1",
  status: "PASS",
  independent: true,
  executor: "iseol-independent-qa",
  checks: [{ id: "QA-1", label: "tests", status: "PASS", summary: "pass", evidenceIds: ["evidence-1"] }],
  findings: [],
  evidenceIds: ["evidence-1"],
  createdAt: "2026-10-06T00:00:00.000Z",
};

test("release gate requires all three verification layers", () => {
  assert.equal(
    ReleaseGate.evaluate(
      qaReport,
      { projectId: "project-1", projectRevision: "rev-1", status: "PASS" },
      { projectId: "project-1", projectRevision: "rev-1", decision: "PASS" },
      { projectId: "project-1", projectRevision: "rev-1" },
    ),
    "PASS",
  );
});

test("release gate rejects stale reports even when agents claim success", () => {
  assert.equal(
    ReleaseGate.evaluate(
      qaReport,
      { projectId: "project-1", projectRevision: "rev-1", status: "PASS" },
      { projectId: "project-1", projectRevision: "rev-1", decision: "PASS" },
      { projectId: "project-1", projectRevision: "rev-2" },
    ),
    "BLOCKED",
  );
});

test("release gate blocks missing QA evidence and ClaimLatch failures", () => {
  assert.equal(
    ReleaseGate.evaluate(
      { ...qaReport, evidenceIds: [] },
      { projectId: "project-1", projectRevision: "rev-1", status: "PASS" },
      { projectId: "project-1", projectRevision: "rev-1", decision: "PASS" },
    ),
    "BLOCKED",
  );
  assert.equal(
    ReleaseGate.evaluate(
      qaReport,
      { projectId: "project-1", projectRevision: "rev-1", status: "PASS" },
      { projectId: "project-1", projectRevision: "rev-1", decision: "BLOCK" },
    ),
    "BLOCKED",
  );
});

test("release gate surfaces a QA warning instead of hiding it", () => {
  assert.equal(
    ReleaseGate.evaluate(
      {
        ...qaReport,
        status: "WARN",
        checks: [{ ...qaReport.checks[0]!, status: "WARN" }],
      },
      { projectId: "project-1", projectRevision: "rev-1", status: "PASS" },
      { projectId: "project-1", projectRevision: "rev-1", decision: "PASS" },
    ),
    "WARN",
  );
});

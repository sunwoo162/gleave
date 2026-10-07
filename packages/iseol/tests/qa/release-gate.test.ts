import assert from "node:assert/strict";
import test from "node:test";
import { buildVerificationEnvelope } from "../../src/qa/verification-envelope.js";
import { evaluateReleaseGate, type ReleaseGateInput } from "../../src/qa/release-gate.js";

function input(overrides: Partial<ReleaseGateInput> = {}): ReleaseGateInput {
  return {
    projectId: "project-1",
    projectRevision: "rev-1",
    qaReport: {
      schemaVersion: 1,
      projectId: "project-1",
      projectRevision: "rev-1",
      status: "PASS",
      independent: true,
      executor: "iseol-independent-qa",
      checks: [{ id: "e2e", label: "E2E", status: "PASS", summary: "pass", evidenceIds: ["evidence-1"] }],
      findings: [],
      evidenceIds: ["evidence-1"],
      createdAt: "2026-10-07T00:00:00Z",
    },
    claimLatch: { decision: "PASS", receiptId: "receipt-1", claimLatchReportId: "report-1" },
    requiredArtifactIds: ["source", "qa"],
    artifactEvidence: { source: ["evidence-2"], qa: ["evidence-1"] },
    ...overrides,
  };
}

test("release gate passes only when independent QA, artifact evidence, and ClaimLatch pass", () => {
  const result = evaluateReleaseGate(input());
  assert.equal(result.decision, "PASS");
  assert.deepEqual(result.evidenceIds.sort(), ["evidence-1", "evidence-2"]);
});

test("release gate blocks stale QA and missing artifact evidence", () => {
  const result = evaluateReleaseGate(input({
    projectRevision: "rev-2",
    artifactEvidence: { source: [] },
  }));
  assert.equal(result.decision, "BLOCK");
  assert.match(result.reasons.join(";"), /revision|evidence/);
});

test("verification envelope fails closed for PASS without evidence or receipt", () => {
  assert.throws(() => buildVerificationEnvelope({
    requestId: "request-1",
    projectId: "project-1",
    projectRevision: "rev-1",
    subjectId: "subject-1",
    subjectType: "release",
    claims: [],
    evidence: [],
    deterministicChecks: [],
    decision: "PASS",
    claimLatchReportId: "report-1",
    receiptId: null,
    createdAt: "2026-10-07T00:00:00Z",
  }), /evidence/);
});

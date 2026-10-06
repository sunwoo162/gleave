import assert from "node:assert/strict";
import test from "node:test";
import {
  parseMemoryCandidateV1,
  parseProjectBriefV1,
  parseProjectOutcomeReportV1,
  parseVerificationEnvelopeV1,
} from "../../src/integrations/eeee-contracts.js";

test("project brief parses versioned memory and QA context", () => {
  const brief = parseProjectBriefV1({
    schemaVersion: 1,
    projectId: "project-1",
    requestId: "request-1",
    userGoal: "Build a local project",
    scope: ["web"],
    constraints: [],
    preferences: {},
    schedule: {},
    retrievedMemoryIds: ["memory-1"],
    qaBaselineIds: ["qa-1"],
    createdAt: "2026-10-06T00:00:00Z",
  });

  assert.equal(brief.schemaVersion, 1);
  assert.deepEqual(brief.retrievedMemoryIds, ["memory-1"]);
});

test("project brief rejects unsupported versions", () => {
  assert.throws(
    () =>
      parseProjectBriefV1({
        schemaVersion: 2,
        projectId: "project-1",
        requestId: "request-1",
        userGoal: "Build it",
        scope: [],
        constraints: [],
        preferences: {},
        schedule: {},
        retrievedMemoryIds: [],
        qaBaselineIds: [],
        createdAt: "2026-10-06T00:00:00Z",
      }),
    /schemaVersion|Invalid/,
  );
});

test("outcome report preserves revision-bound verification metadata", () => {
  const report = parseProjectOutcomeReportV1({
    schemaVersion: 1,
    projectId: "project-1",
    requestId: "request-1",
    projectRevision: "rev-2",
    status: "completed",
    artifacts: [],
    agentTeams: [],
    handoffs: [],
    deterministicVerification: { status: "PASS", checks: [] },
    qaReport: { status: "PASS", findings: [], evidenceIds: [] },
    claimLatchReports: [],
    receipts: [],
    risks: [],
    memoryCandidates: [],
    createdAt: "2026-10-06T00:00:00Z",
  });

  assert.equal(report.projectRevision, "rev-2");
  assert.equal(report.deterministicVerification.status, "PASS");
});

test("verification envelope and memory candidate preserve trusted identifiers", () => {
  const envelope = parseVerificationEnvelopeV1({
    schemaVersion: 1,
    subjectId: "handoff-1",
    projectId: "project-1",
    projectRevision: "rev-1",
    subjectType: "agent_handoff",
    claims: [],
    evidence: [],
    deterministicChecks: [],
    decision: "BLOCK",
    claimLatchReportId: "report-1",
    receiptId: null,
    createdAt: "2026-10-06T00:00:00Z",
  });
  const candidate = parseMemoryCandidateV1({
    schemaVersion: 1,
    candidateId: "candidate-1",
    kind: "qa_rule",
    content: "Check responsive viewports",
    scope: { technology: "web" },
    sourceProjectId: "project-1",
    sourceArtifactIds: ["qa-report-1"],
    evidenceIds: ["evidence-1"],
    verificationIds: ["claimlatch-report-1"],
    confidence: 0.9,
    promotionState: "candidate",
    createdAt: "2026-10-06T00:00:00Z",
  });

  assert.equal(envelope.decision, "BLOCK");
  assert.equal(candidate.promotionState, "candidate");
});

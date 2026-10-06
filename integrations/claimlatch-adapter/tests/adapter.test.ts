import assert from "node:assert/strict";
import test from "node:test";
import { createClaimLatchAdapterServer } from "../src/server.js";
import { verifyStructuredAction } from "../src/structured-output-verifier.js";

const passReport = {
  passed: true,
  coverage: 1,
  counts: { total: 1, supported: 1, contradicted: 0, unsupported: 0, unverifiable: 0 },
  claims: [],
  violations: [],
  generatedAt: "2026-10-06T00:00:00.000Z",
};

test("text verification endpoint returns a passing ClaimLatch report", async () => {
  const server = createClaimLatchAdapterServer({
    verifyText: async (input) => ({
      answer: input.draft,
      report: passReport,
      claimLatchReportId: "report-1",
      receiptId: "receipt-1",
    }),
  });
  const baseUrl = await server.listen(0);

  try {
    const response = await fetch(baseUrl + "/v1/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "handoff-1",
        projectId: "project-1",
        projectRevision: "rev-1",
        subjectType: "agent_handoff",
        question: "What changed?",
        draft: "The tests pass.",
      }),
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as Record<string, unknown>;
    assert.equal(payload.decision, "PASS");
    assert.equal(payload.schemaVersion, 1);
    assert.equal(payload.projectRevision, "rev-1");
    assert.equal(payload.claimLatchReportId, "report-1");
    assert.equal(payload.receiptId, "receipt-1");
  } finally {
    await server.close();
  }
});

test("blocked text verification is not released as a successful response", async () => {
  const server = createClaimLatchAdapterServer({
    verifyText: async () => ({
      answer: "blocked draft",
      report: { ...passReport, passed: false, violations: [{ code: "UNSUPPORTED_LIMIT", message: "missing evidence" }] },
      claimLatchReportId: "report-blocked",
      receiptId: null,
    }),
  });
  const baseUrl = await server.listen(0);

  try {
    const response = await fetch(baseUrl + "/v1/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "handoff-1",
        projectId: "project-1",
        projectRevision: "rev-1",
        subjectType: "agent_handoff",
        question: "What changed?",
        draft: "unsupported",
      }),
    });

    assert.equal(response.status, 422);
    const payload = (await response.json()) as Record<string, unknown>;
    assert.equal(payload.decision, "BLOCK");
    assert.equal(payload.answer, undefined);
    assert.equal(payload.subjectId, "handoff-1");
    assert.equal(payload.projectId, "project-1");
    assert.equal(payload.projectRevision, "rev-1");
  } finally {
    await server.close();
  }
});

test("structured action policy allows bounded workspace reads", () => {
  const result = verifyStructuredAction({
    action: { tool: "read_file", path: "src/main.py" },
    workspaceRoot: "C:\\workspace\\project",
    allowedTools: ["read_file"],
  });

  assert.equal(result.decision, "PASS");
  assert.equal(result.checks.every((check) => check.status === "PASS"), true);
});

test("structured action policy blocks path escape and external transfer", () => {
  const result = verifyStructuredAction({
    action: { tool: "send_message", path: "..\\outside.txt" },
    workspaceRoot: "C:\\workspace\\project",
    allowedTools: ["read_file"],
  });

  assert.equal(result.decision, "BLOCK");
  assert.match(result.blockingReasons.join(" "), /tool|workspace|external/i);
});

test("adapter can wrap a real ClaimLatch-compatible gate", async () => {
  const server = createClaimLatchAdapterServer({
    claimLatchPolicy: { minimumCoverage: 0.9, requireAllCriticalClaimsSupported: true },
    claimLatch: {
      verify: async (input) => {
        assert.equal(input.question, "What changed?");
        assert.equal(input.answer, "verified draft");
        assert.deepEqual(input.policy, { minimumCoverage: 0.9, requireAllCriticalClaimsSupported: true });
        return passReport;
      },
    },
  });
  const baseUrl = await server.listen(0);

  try {
    const response = await fetch(baseUrl + "/v1/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "handoff-1",
        projectId: "project-1",
        projectRevision: "rev-1",
        subjectType: "agent_handoff",
        question: "What changed?",
        draft: "verified draft",
      }),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    assert.equal(response.status, 200);
    assert.match(String(payload.claimLatchReportId), /^claimlatch-/);
  } finally {
    await server.close();
  }
});

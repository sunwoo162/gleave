import assert from "node:assert/strict";
import test from "node:test";
import { buildQaBaseline } from "../../src/agent-organization/qa-baseline.js";
import type { ProjectBriefV1 } from "../../src/integrations/eeee-contracts.js";

const brief: ProjectBriefV1 = {
  schemaVersion: 1,
  projectId: "project-2",
  requestId: "request-2",
  userGoal: "Build a web app",
  scope: ["responsive dashboard"],
  constraints: [],
  preferences: {},
  schedule: {},
  retrievedMemoryIds: ["memory-responsive", "memory-unrelated"],
  qaBaselineIds: [],
  createdAt: "2026-10-06T00:00:00Z",
};

test("QA baseline reuses only active, scoped QA and regression memories", () => {
  const baseline = buildQaBaseline({
    brief,
    memories: [
      {
        id: "memory-responsive",
        kind: "qa_rule",
        status: "active",
        content: "Check 360px, 768px, and 1440px viewports.",
        scope: { technology: "web", feature: "responsive" },
      },
      {
        id: "memory-unrelated",
        kind: "success_pattern",
        status: "active",
        content: "Prefer typed API clients.",
        scope: { technology: "backend" },
      },
      {
        id: "memory-revoked",
        kind: "regression_rule",
        status: "revoked",
        content: "Do not use this revoked rule.",
        scope: { technology: "web" },
      },
    ],
  });

  assert.deepEqual(baseline.memoryIds, ["memory-responsive"]);
  assert.equal(baseline.requiredChecks[0]?.memoryId, "memory-responsive");
  assert.match(baseline.requiredChecks[0]?.description ?? "", /360px/);
});

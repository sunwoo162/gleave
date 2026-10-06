import assert from "node:assert/strict";
import test from "node:test";
import { composeAgentTeams } from "../../src/agent-organization/team-composer.js";
import type { ProjectBriefV1 } from "../../src/integrations/eeee-contracts.js";

function brief(overrides: Partial<ProjectBriefV1> = {}): ProjectBriefV1 {
  return {
    schemaVersion: 1,
    projectId: "project-1",
    requestId: "request-1",
    userGoal: "Build a responsive web app",
    scope: ["responsive dashboard", "API", "data persistence"],
    constraints: [],
    preferences: {},
    schedule: {},
    retrievedMemoryIds: [],
    qaBaselineIds: [],
    createdAt: "2026-10-06T00:00:00Z",
    ...overrides,
  };
}

test("ISEOL composes multiple specialized agents inside each web workstream", () => {
  const plan = composeAgentTeams({ brief: brief(), qualityMemory: [] });

  assert.deepEqual(
    plan.workstreams.map((workstream) => workstream.id),
    ["design", "frontend", "backend", "data", "qa", "integration"],
  );
  assert.ok(plan.workstreams.every((workstream) => workstream.agents.length >= 2));
  assert.equal(new Set(plan.workstreams.flatMap((workstream) => workstream.agents.map((agent) => agent.id))).size,
    plan.workstreams.reduce((count, workstream) => count + workstream.agents.length, 0));
  assert.ok(plan.workstreams.every((workstream) => workstream.owner === "iseol"));
});

test("small projects collapse unnecessary parallel workstreams", () => {
  const plan = composeAgentTeams({
    brief: brief({
      userGoal: "Build a tiny CLI",
      scope: ["one command"],
    }),
    qualityMemory: [],
  });

  assert.deepEqual(plan.workstreams.map((workstream) => workstream.id), ["delivery", "qa"]);
  assert.ok(plan.workstreams.every((workstream) => workstream.agents.length >= 2));
});

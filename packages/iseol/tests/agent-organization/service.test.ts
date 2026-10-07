import assert from "node:assert/strict";
import test from "node:test";
import { createIseolExecutionService } from "../../src/agent-organization/service.js";
import type { ProjectBriefV1 } from "../../src/integrations/eeee-contracts.js";

function brief(overrides: Partial<ProjectBriefV1> = {}): ProjectBriefV1 {
  return {
    schemaVersion: 1,
    projectId: "project-todo",
    requestId: "request-todo",
    userGoal: "Todo 앱 만들어줘",
    scope: ["todo 추가", "todo 완료", "새로고침 후 저장"],
    constraints: [],
    preferences: {},
    schedule: {},
    retrievedMemoryIds: [],
    qaBaselineIds: [],
    createdAt: "2026-10-07T00:00:00Z",
    ...overrides,
  };
}

test("decomposes a todo request into an ordered, evidence-gated execution plan", () => {
  const service = createIseolExecutionService();
  const plan = service.createPlan({ brief: brief(), qualityMemory: [] });

  assert.deepEqual(
    plan.tasks.map((task) => task.id),
    [
      "project-todo:design-baseline",
      "project-todo:scaffold",
      "project-todo:todo-behavior",
      "project-todo:user-e2e",
      "project-todo:independent-qa",
      "project-todo:release",
    ],
  );
  assert.deepEqual(service.readyTasks(plan).map((task) => task.id), ["project-todo:design-baseline"]);
  assert.equal(plan.tasks.find((task) => task.id.endsWith("independent-qa"))?.assignedAgentId, "project-todo:qa:qa-owner");
});

test("routes a failed task back to its owning workstream without publishing completion", () => {
  const service = createIseolExecutionService();
  const plan = service.createPlan({ brief: brief(), qualityMemory: [] });
  const running = service.transition(plan, "project-todo:design-baseline", "running");
  const failed = service.transition(running, "project-todo:design-baseline", "failed");
  const retrying = service.routeFailure(failed, "project-todo:design-baseline", "design token mismatch");

  assert.equal(retrying.tasks.find((task) => task.id.endsWith("design-baseline"))?.status, "retrying");
  assert.ok(retrying.events.some((event) => event.type === "task.failure.routed"));
  assert.notEqual(retrying.status, "completed");
});

test("rejects an update from an older project revision", () => {
  const service = createIseolExecutionService();
  const plan = service.createPlan({ brief: brief(), qualityMemory: [] });

  assert.throws(
    () => service.transition({ ...plan, projectRevision: plan.projectRevision + 1 }, "project-todo:design-baseline", "running", plan.projectRevision),
    /stale project revision/,
  );
});

import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createActivityService } from "../src/activity/service.js";
import { createLearningService } from "../src/learning/service.js";
import { createGrowthService } from "../src/growth/read-model.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { createUserProjectService } from "../src/project-model/user-project-service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("learning project application API persists a draft and requires an explicit acceptance", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-project-application-api-"));
  const now = "2026-09-27T18:30:00.000Z";
  const platformRoot = join(root, "platform");
  const platform = createPlatformUserService(platformRoot, { now: () => now });
  const activity = createActivityService(platformRoot, { now: () => now });
  const growth = createGrowthService(platformRoot, { now: () => now });
  const user = await platform.createUser({ id: "learning-api-owner", email: "learning-api-owner@example.com", displayName: "Learning owner", timezone: "Asia/Seoul" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-28T18:30:00.000Z" });
  const projects = createUserProjectService({ platformRoot, projectModelRoot: join(root, "projects"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, activityService: activity, now: () => now });
  const learning = createLearningService(platformRoot, { now: () => now, userProjectService: projects, activityService: activity });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "harness"), webRoot: join(root, "web"), userService: platform, activityService: activity, growthService: growth, learningService: learning, userProjectService: projects });
  const address = server.address();
  const url = `http://127.0.0.1:${(address as { port: number }).port}`;
  const headers = { authorization: `Bearer ${session.token}`, "content-type": "application/json" };
  try {
    const projectResponse = await fetch(`${url}/api/user/projects`, { method: "POST", headers, body: JSON.stringify({ name: "Learning apply project", objective: "apply a concept", purpose: "rapid-prototype", teamMode: "solo" }) });
    const project = (await projectResponse.json() as any).project;
    const goalResponse = await fetch(`${url}/api/user/learning/goals`, { method: "POST", headers, body: JSON.stringify({ subjectText: "TypeScript", duration: { days: 7 }, dailyMinutes: 30 }) });
    const goal = (await goalResponse.json() as any).goal;
    const proposalResponse = await fetch(`${url}/api/user/learning/goals/${goal.id}/project-proposals`, { method: "POST", headers, body: JSON.stringify({ projectId: project.id, proposal: { title: "타입 예제", objective: "학습한 개념을 적용", acceptanceCriteria: ["설명 추가"], tests: ["typecheck"], estimatedEffort: 30 }, learningEvidenceRefs: [`goal:${goal.id}`], requiredPermissions: ["project.work-request.create"], actorAssignments: { human: "owner" } }) });
    assert.equal(proposalResponse.status, 201);
    const proposal = (await proposalResponse.json() as any).proposal;
    assert.equal(proposal.status, "proposed");
    const accepted = await fetch(`${url}/api/user/learning/goals/${goal.id}/project-proposals/${proposal.id}/accept`, { method: "POST", headers, body: "{}" });
    assert.equal(accepted.status, 200);
    const acceptedBody = await accepted.json() as any;
    assert.equal(acceptedBody.workRequest.projectId, project.id);
    const activityResponse = await fetch(`${url}/api/user/activity`, { headers });
    assert.equal(activityResponse.status, 200);
    const events = (await activityResponse.json() as any).events.filter((item: any) => item.sourceId === proposal.id && item.eventType === "learning.project.application.accepted");
    assert.equal(events.length, 1);
    assert.equal(events[0].sourceType, "learning-project-application");
    assert.equal(events[0].actorType, "user");
    assert.equal(events[0].verificationStatus, "unverified");
    assert.deepEqual(events[0].payload, { goalId: goal.id, projectId: project.id, proposalId: proposal.id, workRequestId: acceptedBody.workRequest.id });
    assert.equal((await (await fetch(`${url}/api/user/growth`, { headers })).json() as any).xp, 0);
  } finally {
    await server.closeForShutdown();
  }
});

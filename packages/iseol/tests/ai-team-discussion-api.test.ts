import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { createTeamService } from "../src/teams/service.js";
import { createUserProjectService } from "../src/project-model/user-project-service.js";
import { createAiTeamDiscussionService } from "../src/ai-team/discussion-service.js";
import { createActivityService } from "../src/activity/service.js";
import { createGrowthService } from "../src/growth/read-model.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("AI team discussion API keeps membership, Runtime, and work execution separate", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-team-discussion-api-"));
  const now = "2026-09-27T15:00:00.000Z";
  const platformRoot = join(root, "platform");
  const platform = createPlatformUserService(platformRoot, { now: () => now });
  const owner = await platform.createUser({ id: "discussion-api-owner", email: "discussion-api-owner@example.com", displayName: "Discussion owner", timezone: "Asia/Seoul" });
  const outsider = await platform.createUser({ id: "discussion-api-outsider", email: "discussion-api-outsider@example.com", displayName: "Outsider", timezone: "Asia/Seoul" });
  const ownerSession = await platform.createSession({ userId: owner.id, roles: ["user"], expiresAt: "2026-09-28T15:00:00.000Z" });
  const outsiderSession = await platform.createSession({ userId: outsider.id, roles: ["user"], expiresAt: "2026-09-28T15:00:00.000Z" });
  const ownerPrincipal = await platform.resolveAuthenticatedPrincipal(ownerSession.token);
  assert.ok(ownerPrincipal);
  const teams = createTeamService(platformRoot, { now: () => now });
  const activity = createActivityService(platformRoot, { now: () => now });
  const growth = createGrowthService(platformRoot, { now: () => now });
  const team = await teams.createTeam(ownerPrincipal!, { name: "Discussion API team", description: "bounded technical discussion", kind: "project", visibility: "public", capacity: 4 });
  await teams.addAiMember(ownerPrincipal!, team.id, { agentId: "api-reviewer", assignmentRole: "review", capabilities: ["discussion.propose"], approvalScope: "suggestion-only" }, now);
  const projects = createUserProjectService({ platformRoot, projectModelRoot: join(root, "project-model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, canAccessTeam: (principal, teamId) => teams.canAccess(principal, teamId), canAccessTeamWithinMembershipLock: (principal, teamId) => teams.canAccessWithinMembershipLock(principal, teamId), activityService: activity, now: () => now });
  const discussions = createAiTeamDiscussionService({ root: join(platformRoot, "ai-team"), teamService: teams, userProjectService: projects, activityService: activity, now: () => now, dispatcher: async () => ({ status: "completed", answer: "API 경계를 먼저 확인합니다.", keyPoints: ["권한"], alternatives: [], risks: ["실행 전 승인"] }) });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "harness"), webRoot: join(root, "web"), userService: platform, teamService: teams, activityService: activity, growthService: growth, userProjectService: projects, aiTeamDiscussionService: discussions });
  const url = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  const headers = (token: string) => ({ authorization: "Bearer " + token, "content-type": "application/json" });
  try {
    const projectResponse = await fetch(url + "/api/user/projects", { method: "POST", headers: headers(ownerSession.token), body: JSON.stringify({ name: "Discussion API project", objective: "store AI discussion", purpose: "rapid-prototype", teamMode: "mixed", teamId: team.id }) });
    assert.equal(projectResponse.status, 201);
    const project = (await projectResponse.json() as any).project;
    const discussionResponse = await fetch(url + "/api/user/projects/" + project.id + "/ai-discussions", { method: "POST", headers: headers(ownerSession.token), body: JSON.stringify({ agentId: "api-reviewer", requestId: "api-discussion-1", question: "무엇을 먼저 검토할까요?" }) });
    assert.equal(discussionResponse.status, 201);
    const discussion = (await discussionResponse.json() as any).discussion;
    assert.equal(discussion.status, "completed");
    const activityResponse = await fetch(url + "/api/user/activity", { headers: headers(ownerSession.token) });
    assert.equal(activityResponse.status, 200);
    const matching = (await activityResponse.json() as any).events.filter((item: any) => item.sourceId === discussion.id && item.eventType === "ai.team.discussion.requested");
    assert.equal(matching.length, 1);
    assert.deepEqual(matching[0], {
      ...matching[0],
      sourceType: "ai-team-discussion",
      actorType: "user",
      verificationStatus: "unverified",
      payload: { projectId: project.id, teamId: team.id, discussionId: discussion.id, requestId: "api-discussion-1", agentId: "api-reviewer", status: "completed" },
    });
    assert.equal((await (await fetch(url + "/api/user/growth", { headers: headers(ownerSession.token) })).json() as any).xp, 0);
    const listResponse = await fetch(url + "/api/user/projects/" + project.id + "/ai-discussions", { headers: headers(ownerSession.token) });
    assert.equal(listResponse.status, 200);
    assert.equal((await listResponse.json() as any).discussions.length, 1);
    const foreign = await fetch(url + "/api/user/projects/" + project.id + "/ai-discussions", { headers: headers(outsiderSession.token) });
    assert.equal(foreign.status, 400);
    const projectView = await fetch(url + "/api/user/projects/" + project.id, { headers: headers(ownerSession.token) });
    assert.equal((await projectView.json() as any).workRequests.length, 0);
  } finally { await server.closeForShutdown(); }
});

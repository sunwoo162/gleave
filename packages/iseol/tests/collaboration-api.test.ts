import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { request as httpRequest } from "node:http";
import test from "node:test";
import { createPlatformUserService } from "../src/platform-user/service.js";
import type { TeamService } from "../src/teams/contracts.js";
import { routeCollaborationRequest } from "../src/collaboration-router.js";
import { createRecruitmentService } from "../src/recruitment/service.js";
import { createSocialService } from "../src/social/service.js";
import { createTeamService } from "../src/teams/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("collaboration API redacts credential-shaped team errors without changing not-found status", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-collaboration-error-redaction-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => "2026-09-25T12:00:00.000Z" });
  const user = await users.createUser({ id: "collab-error-user", email: "collab-error@example.com", displayName: "Collaboration Error", timezone: "Asia/Seoul" });
  const session = await users.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-26T12:00:00.000Z" });
  const failingTeams = {
    listTeams: async () => { throw new Error("team not found token%ZZ=team-secret"); },
  } as unknown as TeamService;

  const result = await routeCollaborationRequest({ method: "GET", path: "/api/user/teams", headers: { authorization: `Bearer ${session.token}` } }, { platformUserService: users, teamService: failingTeams });

  assert.equal(result.status, 404);
  const message = (result.body as { error: string }).error;
  assert.equal(message.includes("team-secret"), false);
  assert.match(message, /\[redacted\]/i);
});

test("collaboration API persists teams, recruitment, membership, friendship, and ACL-bound messages", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-collaboration-api-"));
  const users = createPlatformUserService(join(root, "platform"), { now: () => "2026-09-25T12:00:00.000Z" });
  const userA = await users.createUser({ id: "collab-api-a", email: "collab-a@example.com", displayName: "A", timezone: "Asia/Seoul" });
  const userB = await users.createUser({ id: "collab-api-b", email: "collab-b@example.com", displayName: "B", timezone: "Asia/Seoul" });
  const userC = await users.createUser({ id: "collab-api-c", email: "collab-c@example.com", displayName: "C", timezone: "Asia/Seoul" });
  const sessionA = await users.createSession({ userId: userA.id, roles: ["user"], expiresAt: "2026-09-26T12:00:00.000Z" });
  const sessionB = await users.createSession({ userId: userB.id, roles: ["user"], expiresAt: "2026-09-26T12:00:00.000Z" });
  const sessionC = await users.createSession({ userId: userC.id, roles: ["user"], expiresAt: "2026-09-26T12:00:00.000Z" });
  const teamService = createTeamService(join(root, "platform"), { now: () => "2026-09-25T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "harness"), webRoot: resolve(process.cwd(), "web"),
    userService: users,
    teamService,
    socialService: createSocialService(join(root, "platform"), { platformUserService: users, canCollaborate: teamService.canCollaborate, now: () => "2026-09-25T12:00:00.000Z" }),
    recruitmentService: createRecruitmentService(join(root, "platform"), { teamService, now: () => "2026-09-25T12:00:00.000Z" }),
  });
  const port = (server.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}`;
  const headers = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
  try {
    const createdTeam = await fetch(`${url}/api/user/teams`, { method: "POST", headers: headers(sessionA.token), body: JSON.stringify({ name: "API team", description: "collab", kind: "project", visibility: "public", capacity: 3 }) });
    assert.equal(createdTeam.status, 201);
    const team = (await createdTeam.json() as any).team;
    const malformedTeamPath = await fetch(`${url}/api/user/teams/%E0%A4%A`, { headers: headers(sessionA.token) });
    assert.equal(malformedTeamPath.status, 404);
    const queryTeamPath = await fetch(`${url}/api/user/teams/${team.id}?next=%2F`, { headers: headers(sessionA.token) });
    assert.equal(queryTeamPath.status, 200);
    const encodedTeamSeparator = await fetch(`${url}/api/user/teams/${team.id}%2Fmessages`, { headers: headers(sessionA.token) });
    assert.equal(encodedTeamSeparator.status, 404);
    const rawBackslashStatus = await new Promise<number>((resolveRaw, rejectRaw) => {
      const rawRequest = httpRequest({ hostname: "127.0.0.1", port, method: "GET", path: `/api/user\\teams/${team.id}`, headers: headers(sessionA.token) }, (rawResponse) => {
        rawResponse.resume();
        rawResponse.once("end", () => resolveRaw(rawResponse.statusCode ?? 0));
      });
      rawRequest.once("error", rejectRaw);
      rawRequest.end();
    });
    assert.equal(rawBackslashStatus, 404);
    const malformedRecruitmentPath = await fetch(`${url}/api/user/recruitment/%E0%A4%A`, { headers: headers(sessionA.token) });
    assert.equal(malformedRecruitmentPath.status, 404);
    const encodedRecruitmentSeparator = await fetch(`${url}/api/user/recruitment/post%2Fapplications`, { method: "POST", headers: headers(sessionA.token), body: JSON.stringify({ message: "encoded separator" }) });
    assert.equal(encodedRecruitmentSeparator.status, 404);
    const encodedSocialSeparator = await fetch(`${url}/api/user/social/blocks/${userB.id}%2Fsuffix`, { method: "DELETE", headers: headers(sessionA.token) });
    assert.equal(encodedSocialSeparator.status, 404);
    const aiAdded = await fetch(`${url}/api/user/teams/${team.id}/ai-members`, { method: "POST", headers: headers(sessionA.token), body: JSON.stringify({ agentId: "api-frontend", assignmentRole: "frontend", capabilities: ["context.read", "task.propose"], approvalScope: "suggestion-only" }) });
    assert.equal(aiAdded.status, 201);
    const aiMember = (await aiAdded.json() as any).member;
    assert.equal(aiMember.memberType, "ai");
    assert.equal(aiMember.assignmentRole, "frontend");
    assert.deepEqual(aiMember.capabilities, ["context.read", "task.propose"]);
    const foreignAiAdd = await fetch(`${url}/api/user/teams/${team.id}/ai-members`, { method: "POST", headers: headers(sessionB.token), body: JSON.stringify({ agentId: "api-qa", assignmentRole: "qa", capabilities: ["task.propose"], approvalScope: "suggestion-only" }) });
    assert.equal(foreignAiAdd.status, 403);
    const aiRemoved = await fetch(`${url}/api/user/teams/${team.id}/ai-members/api-frontend`, { method: "DELETE", headers: headers(sessionA.token) });
    assert.equal(aiRemoved.status, 200);
    const createdPost = await fetch(`${url}/api/user/recruitment`, { method: "POST", headers: headers(sessionA.token), body: JSON.stringify({ teamId: team.id, kind: "project", title: "Join API team", description: "work together", roles: ["frontend"], tags: ["React"] }) });
    assert.equal(createdPost.status, 201);
    const post = (await createdPost.json() as any).post;
    const applied = await fetch(`${url}/api/user/recruitment/${post.id}/applications`, { method: "POST", headers: headers(sessionB.token), body: JSON.stringify({ message: "Please accept me" }) });
    assert.equal(applied.status, 201);
    const application = (await applied.json() as any).application;
    const accepted = await fetch(`${url}/api/user/recruitment/applications/${application.id}`, { method: "POST", headers: headers(sessionA.token), body: JSON.stringify({ action: "accept" }) });
    assert.equal(accepted.status, 200);
    const sent = await fetch(`${url}/api/user/social/messages?userId=${userA.id}`, { method: "POST", headers: headers(sessionB.token), body: JSON.stringify({ body: "team message" }) });
    assert.equal(sent.status, 201);
    const foreign = await fetch(`${url}/api/user/social/messages?userId=${userA.id}`, { headers: headers(sessionC.token) });
    assert.equal(foreign.status, 403);
    const teamList = await fetch(`${url}/api/user/teams`, { headers: headers(sessionB.token) });
    assert.equal((await teamList.json() as any).teams.some((item: any) => item.id === team.id), true);
  } finally {
    await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  }
});

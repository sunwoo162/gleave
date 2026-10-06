import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createPlatformUserService } from "../src/platform-user/service.js";
import type { StudyService } from "../src/study/contracts.js";
import { routeStudyRequest } from "../src/study/router.js";
import { createTeamService } from "../src/teams/service.js";
import { createStudyService } from "../src/study/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("study API redacts credential-shaped service errors without changing not-found status", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-study-error-redaction-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => "2026-09-27T14:30:00.000Z" });
  const user = await users.createUser({ id: "study-error-user", email: "study-error@example.com", displayName: "Study Error", timezone: "Asia/Seoul" });
  const session = await users.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-28T14:30:00.000Z" });
  const failingStudy = {
    listStudySpaces: async () => { throw new Error("study not found token%ZZ=study-secret"); },
  } as unknown as StudyService;

  const result = await routeStudyRequest({ method: "GET", path: "/api/user/studies", headers: { authorization: `Bearer ${session.token}` } }, { platformUserService: users, studyService: failingStudy });

  assert.equal(result.status, 404);
  const message = (result.body as { error: string }).error;
  assert.equal(message.includes("study-secret"), false);
  assert.match(message, /\[redacted\]/i);
});

test("study API keeps team access, shared task metadata, and private submissions separate", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-study-api-"));
  const now = "2026-09-27T14:30:00.000Z";
  const platformRoot = join(root, "platform");
  const platform = createPlatformUserService(platformRoot, { now: () => now });
  const owner = await platform.createUser({ id: "study-api-owner", email: "study-api-owner@example.com", displayName: "Study owner", timezone: "Asia/Seoul" });
  const member = await platform.createUser({ id: "study-api-member", email: "study-api-member@example.com", displayName: "Study member", timezone: "Asia/Seoul" });
  const outsider = await platform.createUser({ id: "study-api-outsider", email: "study-api-outsider@example.com", displayName: "Study outsider", timezone: "Asia/Seoul" });
  const ownerSession = await platform.createSession({ userId: owner.id, roles: ["user"], expiresAt: "2026-09-28T14:30:00.000Z" });
  const memberSession = await platform.createSession({ userId: member.id, roles: ["user"], expiresAt: "2026-09-28T14:30:00.000Z" });
  const outsiderSession = await platform.createSession({ userId: outsider.id, roles: ["user"], expiresAt: "2026-09-28T14:30:00.000Z" });
  const ownerPrincipal = await platform.resolveAuthenticatedPrincipal(ownerSession.token);
  assert.ok(ownerPrincipal);
  const teams = createTeamService(platformRoot, { now: () => now });
  const team = await teams.createTeam(ownerPrincipal!, { name: "Study API team", description: "private shared learning", kind: "study", visibility: "private", capacity: 3 });
  await teams.addMember(team.id, member.id, "member", now);
  const studies = createStudyService(join(platformRoot, "study"), { teamService: teams, now: () => now });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "harness"), webRoot: join(root, "web"), userService: platform, teamService: teams, studyService: studies });
  const url = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  const headers = (token: string) => ({ authorization: "Bearer " + token, "content-type": "application/json" });
  try {
    const createResponse = await fetch(url + "/api/user/studies", { method: "POST", headers: headers(ownerSession.token), body: JSON.stringify({ teamId: team.id, title: "Shared study API", description: "API-backed study room" }) });
    assert.equal(createResponse.status, 201);
    const space = (await createResponse.json() as any).space;
    const querySpace = await fetch(url + "/api/user/studies/" + space.id + "?next=%2F", { headers: headers(ownerSession.token) });
    assert.equal(querySpace.status, 200);
    const encodedSeparator = await fetch(url + "/api/user/studies/" + space.id + "%2Ftasks", { method: "POST", headers: headers(ownerSession.token), body: JSON.stringify({ title: "Should not be created", instructions: "Encoded separator" }) });
    assert.equal(encodedSeparator.status, 404);
    const rawBackslashStatus = await new Promise<number>((resolve, reject) => {
      const request = httpRequest({ hostname: "127.0.0.1", port: (server.address() as AddressInfo).port, method: "GET", path: "/api/user/studies\\" + space.id, headers: headers(ownerSession.token) }, (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode ?? 0));
      });
      request.once("error", reject);
      request.end();
    });
    assert.equal(rawBackslashStatus, 404);
    const linkResponse = await fetch(url + "/api/user/studies/" + space.id + "/curriculum-links", { method: "POST", headers: headers(ownerSession.token), body: JSON.stringify({ kind: "resource", referenceId: "docs", label: "Docs" }) });
    assert.equal(linkResponse.status, 201);
    const taskResponse = await fetch(url + "/api/user/studies/" + space.id + "/tasks", { method: "POST", headers: headers(ownerSession.token), body: JSON.stringify({ title: "Shared task", instructions: "Write a short explanation" }) });
    assert.equal(taskResponse.status, 201);
    const task = (await taskResponse.json() as any).task;
    const submissionResponse = await fetch(url + "/api/user/studies/" + space.id + "/tasks/" + task.id + "/submissions", { method: "PUT", headers: headers(memberSession.token), body: JSON.stringify({ answer: "My private answer", status: "submitted" }) });
    assert.equal(submissionResponse.status, 200);
    const memberView = await fetch(url + "/api/user/studies/" + space.id, { headers: headers(memberSession.token) });
    assert.equal(memberView.status, 200);
    assert.equal((await memberView.json() as any).mySubmissions[0].answer, "My private answer");
    const ownerView = await fetch(url + "/api/user/studies/" + space.id, { headers: headers(ownerSession.token) });
    assert.equal(ownerView.status, 200);
    assert.deepEqual((await ownerView.json() as any).mySubmissions, []);
    const foreignView = await fetch(url + "/api/user/studies/" + space.id, { headers: headers(outsiderSession.token) });
    assert.equal(foreignView.status, 404);
  } finally { await server.closeForShutdown(); }
});

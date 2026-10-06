import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { createTeamService } from "../src/teams/service.js";
import { createTeamChatService } from "../src/team-chat/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("team chat API enforces active membership and preserves messages after leave", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-team-chat-api-"));
  const users = createPlatformUserService(join(root, "platform"), { now: () => "2026-09-27T12:00:00.000Z" });
  const owner = await users.createUser({ id: "chat-api-owner", email: "chat-api-owner@example.com", displayName: "Owner", timezone: "Asia/Seoul" });
  const member = await users.createUser({ id: "chat-api-member", email: "chat-api-member@example.com", displayName: "Member", timezone: "Asia/Seoul" });
  const outsider = await users.createUser({ id: "chat-api-outsider", email: "chat-api-outsider@example.com", displayName: "Outsider", timezone: "Asia/Seoul" });
  const sessionOwner = await users.createSession({ userId: owner.id, roles: ["user"], expiresAt: "2026-09-28T12:00:00.000Z" });
  const sessionMember = await users.createSession({ userId: member.id, roles: ["user"], expiresAt: "2026-09-28T12:00:00.000Z" });
  const sessionOutsider = await users.createSession({ userId: outsider.id, roles: ["user"], expiresAt: "2026-09-28T12:00:00.000Z" });
  const platformRoot = join(root, "platform");
  const teamService = createTeamService(platformRoot, { now: () => "2026-09-27T12:00:00.000Z" });
  const chatService = createTeamChatService(platformRoot, { teamService, now: () => "2026-09-27T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "harness"), webRoot: resolve(process.cwd(), "web"),
    userService: users, teamService, teamChatService: chatService,
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
  try {
    const created = await fetch(`${url}/api/user/teams`, { method: "POST", headers: headers(sessionOwner.token), body: JSON.stringify({ name: "API team chat", description: "durable chat", kind: "project", visibility: "private", capacity: 3 }) });
    assert.equal(created.status, 201);
    const team = (await created.json() as any).team;
    await teamService.addMember(team.id, member.id, "member");
    const sent = await fetch(`${url}/api/user/teams/${encodeURIComponent(team.id)}/messages`, { method: "POST", headers: headers(sessionMember.token), body: JSON.stringify({ body: "API 팀 메시지" }) });
    assert.equal(sent.status, 201);
    const listed = await fetch(`${url}/api/user/teams/${encodeURIComponent(team.id)}/messages`, { headers: headers(sessionOwner.token) });
    assert.equal(listed.status, 200);
    assert.deepEqual((await listed.json() as any).messages.map((item: any) => item.body), ["API 팀 메시지"]);
    const outsiderRead = await fetch(`${url}/api/user/teams/${encodeURIComponent(team.id)}/messages`, { headers: headers(sessionOutsider.token) });
    assert.equal(outsiderRead.status, 403);
    await teamService.leaveTeam({ userId: member.id, sessionId: sessionMember.id, roles: ["user"] }, team.id);
    const leftRead = await fetch(`${url}/api/user/teams/${encodeURIComponent(team.id)}/messages`, { headers: headers(sessionMember.token) });
    assert.equal(leftRead.status, 403);
    const ownerRead = await fetch(`${url}/api/user/teams/${encodeURIComponent(team.id)}/messages`, { headers: headers(sessionOwner.token) });
    assert.equal(ownerRead.status, 200);
  } finally {
    await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  }
});

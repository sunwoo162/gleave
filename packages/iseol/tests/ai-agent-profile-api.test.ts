import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createAiAgentProfileService } from "../src/ai-agent/service.js";
import { routeAiAgentProfileRequest } from "../src/ai-agent/router.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("agent profile API persists a user-owned profile and keeps users isolated", async () => {
  const root = await mkdtemp(join(tmpdir(), "npc-agent-profile-api-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => "2026-09-27T12:00:00.000Z" });
  const profiles = createAiAgentProfileService(platformRoot, { now: () => "2026-09-27T12:00:00.000Z" });
  const userA = await users.createUser({ id: "agent-api-a", email: "agent-api-a@example.com", displayName: "A", timezone: "Asia/Seoul" });
  const userB = await users.createUser({ id: "agent-api-b", email: "agent-api-b@example.com", displayName: "B", timezone: "Asia/Seoul" });
  const sessionA = await users.createSession({ userId: userA.id, roles: ["user"], expiresAt: "2026-09-28T12:00:00.000Z" });
  const sessionB = await users.createSession({ userId: userB.id, roles: ["user"], expiresAt: "2026-09-28T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1", port: 0, token: "operator-only", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"),
    userService: users, aiAgentProfileService: profiles,
  });
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}/api/user/agent`;
  try {
    assert.equal((await fetch(url)).status, 401);
    const authA = { authorization: `Bearer ${sessionA.token}`, "content-type": "application/json" };
    const authB = { authorization: `Bearer ${sessionB.token}` };
    const initial = await fetch(url, { headers: authA });
    assert.equal(initial.status, 200);
    assert.equal((await initial.json() as any).profile.name, "이설");

    const updated = await fetch(url, { method: "PATCH", headers: authA, body: JSON.stringify({ name: "내 이설", tone: "짧고 직설적으로" }) });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json() as any).profile.name, "내 이설");

    const directRawPath = await routeAiAgentProfileRequest({ method: "PATCH", path: "/api/user/agent", rawPath: "/api/user\\agent", headers: authA, body: { name: "Must not persist" } }, { platformUserService: users, aiAgentProfileService: profiles });
    assert.equal(directRawPath.status, 404);
    const afterRawPath = await fetch(url, { headers: authA });
    assert.equal((await afterRawPath.json() as any).profile.name, "내 이설");

    const foreign = await fetch(url, { headers: authB });
    assert.equal(foreign.status, 200);
    assert.equal((await foreign.json() as any).profile.name, "이설");
  } finally {
    await server.closeForShutdown();
  }
});

test("agent profile API reports unavailable when the profile service is not wired", async () => {
  const root = await mkdtemp(join(tmpdir(), "npc-agent-profile-api-"));
  const users = createPlatformUserService(join(root, "platform"));
  const user = await users.createUser({ id: "agent-api-missing", email: "agent-api-missing@example.com", displayName: "Missing", timezone: "Asia/Seoul" });
  const session = await users.createSession({ userId: user.id, roles: ["user"], expiresAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString() });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator-only", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"), userService: users });
  const address = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/user/agent`, { headers: { authorization: `Bearer ${session.token}` } });
    assert.equal(response.status, 503);
  } finally {
    await server.closeForShutdown();
  }
});

import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { createSocialService } from "../src/social/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("social safety API persists block and report actions behind authenticated user scope", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-safety-api-"));
  const now = "2026-09-27T15:30:00.000Z";
  const platformRoot = join(root, "platform");
  const platform = createPlatformUserService(platformRoot, { now: () => now });
  const a = await platform.createUser({ id: "safety-api-a", email: "safety-api-a@example.com", displayName: "Safety API A", timezone: "Asia/Seoul" });
  const b = await platform.createUser({ id: "safety-api-b", email: "safety-api-b@example.com", displayName: "Safety API B", timezone: "Asia/Seoul" });
  const aSession = await platform.createSession({ userId: a.id, roles: ["user"], expiresAt: "2026-09-28T15:30:00.000Z" });
  const bSession = await platform.createSession({ userId: b.id, roles: ["user"], expiresAt: "2026-09-28T15:30:00.000Z" });
  const social = createSocialService(platformRoot, { platformUserService: platform, now: () => now });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "harness"), webRoot: join(root, "web"), userService: platform, socialService: social });
  const url = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  const headers = (token: string) => ({ authorization: "Bearer " + token, "content-type": "application/json" });
  try {
    const blocked = await fetch(url + "/api/user/social/blocks", { method: "POST", headers: headers(aSession.token), body: JSON.stringify({ targetUserId: b.id }) });
    assert.equal(blocked.status, 201);
    const blockedList = await fetch(url + "/api/user/social/blocks", { headers: headers(aSession.token) });
    assert.equal((await blockedList.json() as any).blocks.length, 1);
    const report = await fetch(url + "/api/user/social/reports", { method: "POST", headers: headers(aSession.token), body: JSON.stringify({ targetUserId: b.id, reason: "spam" }) });
    assert.equal(report.status, 201);
    const foreignReports = await fetch(url + "/api/user/social/reports", { headers: headers(bSession.token) });
    assert.deepEqual((await foreignReports.json() as any).reports, []);
    const unblock = await fetch(url + "/api/user/social/blocks/" + encodeURIComponent(b.id), { method: "DELETE", headers: headers(aSession.token) });
    assert.equal(unblock.status, 200);
    const malformedBlockPath = await fetch(url + "/api/user/social/blocks/%E0%A4%A", { method: "DELETE", headers: headers(aSession.token) });
    assert.equal(malformedBlockPath.status, 404);
    const malformedFriendRequestPath = await fetch(url + "/api/user/social/friend-requests/%E0%A4%A", { method: "POST", headers: headers(aSession.token), body: JSON.stringify({ action: "reject" }) });
    assert.equal(malformedFriendRequestPath.status, 404);
  } finally { await server.closeForShutdown(); }
});

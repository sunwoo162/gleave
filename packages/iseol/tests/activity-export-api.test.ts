import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createActivityService } from "../src/activity/service.js";
import { createGrowthService } from "../src/growth/read-model.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("activity export is authenticated, owner-scoped, and available as JSON or Markdown", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-activity-export-"));
  const now = () => "2026-09-26T12:00:00.000Z";
  const users = createPlatformUserService(join(root, "platform"), { now });
  const activity = createActivityService(join(root, "platform"), { now });
  const growth = createGrowthService(join(root, "platform"), { now });
  const userA = await users.createUser({ id: "activity-export-a", email: "activity-export-a@example.com", displayName: "Export A", timezone: "Asia/Seoul" });
  const userB = await users.createUser({ id: "activity-export-b", email: "activity-export-b@example.com", displayName: "Export B", timezone: "Asia/Seoul" });
  const sessionA = await users.createSession({ userId: userA.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const sessionB = await users.createSession({ userId: userB.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"),
    userService: users, activityService: activity, growthService: growth,
  });
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  const headers = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
  try {
    const created = await fetch(`${url}/api/user/activity`, {
      method: "POST", headers: headers(sessionA.token),
      body: JSON.stringify({ sourceType: "learning", sourceId: "export-session", eventType: "study.completed", eventVersion: 1, actorType: "user", verificationStatus: "unverified", payload: { minutes: 30 } }),
    });
    assert.equal(created.status, 201);

    const unauthorized = await fetch(`${url}/api/user/activity/export?format=json`);
    assert.equal(unauthorized.status, 401);

    const jsonResponse = await fetch(`${url}/api/user/activity/export?format=json`, { headers: headers(sessionA.token) });
    assert.equal(jsonResponse.status, 200);
    const json = await jsonResponse.json() as { format: string; filename: string; content: string; events: Array<{ userId: string; sourceId: string }> };
    assert.equal(json.format, "json");
    assert.equal(json.filename, "iseol-activity-export.json");
    assert.equal(json.events.length, 1);
    assert.equal(json.events[0]?.userId, userA.id);
    assert.match(json.content, /export-session/);

    const markdownResponse = await fetch(`${url}/api/user/activity/export?format=markdown`, { headers: headers(sessionA.token) });
    assert.equal(markdownResponse.status, 200);
    const markdown = await markdownResponse.json() as { format: string; filename: string; content: string };
    assert.equal(markdown.format, "markdown");
    assert.equal(markdown.filename, "iseol-activity-export.md");
    assert.match(markdown.content, /# ISEOL 활동 기록/);
    assert.match(markdown.content, /study\.completed/);

    const otherUser = await fetch(`${url}/api/user/activity/export?format=json`, { headers: headers(sessionB.token) });
    const otherJson = await otherUser.json() as { events: unknown[]; content: string };
    assert.equal(otherUser.status, 200);
    assert.equal(otherJson.events.length, 0);
    assert.doesNotMatch(otherJson.content, /export-session/);

    const invalidFormat = await fetch(`${url}/api/user/activity/export?format=csv`, { headers: headers(sessionA.token) });
    assert.equal(invalidFormat.status, 400);
  } finally {
    await server.closeForShutdown();
  }
});

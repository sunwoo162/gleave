import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { request as httpRequest } from "node:http";
import test from "node:test";
import { createActivityService } from "../src/activity/service.js";
import type { ActivityService } from "../src/activity/contracts.js";
import { createGrowthService } from "../src/growth/read-model.js";
import type { GrowthService } from "../src/growth/contracts.js";
import { routeGrowthRequest } from "../src/growth/router.js";
import type { Principal } from "../src/identity/contracts.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("activity API redacts credential-shaped retract errors without changing not-found status", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-growth-error-redaction-"));
  const platformRoot = join(root, "platform");
  const platform = createPlatformUserService(platformRoot, { now: () => "2026-09-25T12:00:00.000Z" });
  const user = await platform.createUser({ id: "growth-error-user", email: "growth-error@example.com", displayName: "Growth Error", timezone: "Asia/Seoul" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-26T12:00:00.000Z" });
  const failingActivity = {
    retractActivityEvent: async () => { throw new Error("activity not found token%ZZ=growth-secret"); },
  } as unknown as ActivityService;
  const growth = {
    applyGrowthProjection: async () => null,
    getGrowthSnapshot: async () => { throw new Error("unreachable"); },
  } as unknown as GrowthService;

  const result = await routeGrowthRequest({ method: "DELETE", path: "/api/user/activity/activity-error", headers: { authorization: `Bearer ${session.token}` } }, { platformUserService: platform, activityService: failingActivity, growthService: growth });

  assert.equal(result.status, 404);
  const message = (result.body as { error: string }).error;
  assert.equal(message.includes("growth-secret"), false);
  assert.match(message, /\[redacted\]/i);
});

test("user activity API rejects client-submitted verified evidence and reads trusted growth", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-growth-api-"));
  const now = () => "2026-09-25T12:00:00.000Z";
  const platform = createPlatformUserService(join(root, "platform"), { now });
  const activity = createActivityService(join(root, "platform"), { now });
  const growth = createGrowthService(join(root, "platform"), { now });
  const user = await platform.createUser({ id: "growth-api-user", email: "growth@example.com", displayName: "Growth", timezone: "Asia/Seoul" });
  const otherUser = await platform.createUser({ id: "growth-api-other", email: "other-growth@example.com", displayName: "Other Growth", timezone: "Asia/Seoul" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-26T12:00:00.000Z" });
  const otherSession = await platform.createSession({ userId: otherUser.id, roles: ["user"], expiresAt: "2026-09-26T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"),
    userService: platform, activityService: activity, growthService: growth,
  });
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  const headers = { authorization: `Bearer ${session.token}`, "content-type": "application/json" };
  const otherHeaders = { authorization: `Bearer ${otherSession.token}`, "content-type": "application/json" };
  try {
    const unverified = await fetch(`${url}/api/user/activity`, {
      method: "POST", headers,
      body: JSON.stringify({ sourceType: "fixture", sourceId: "f-1", eventType: "learning.session.completed", eventVersion: 1, actorType: "system", verificationStatus: "unverified" }),
    });
    assert.equal(unverified.status, 201);
    assert.equal((await unverified.json() as any).growth, null);

    const verified = await fetch(`${url}/api/user/activity`, {
      method: "POST", headers,
      body: JSON.stringify({ sourceType: "learning-session", sourceId: "s-1", eventType: "learning.session.completed", eventVersion: 1, actorType: "user", verificationStatus: "verified" }),
    });
    assert.equal(verified.status, 403);
    assert.match(String((await verified.json() as any).error), /service-owned/i);

    const trustedPrincipal: Principal = { userId: user.id, sessionId: session.id, roles: ["user"] };
    const trustedEvent = await activity.recordActivityEvent(trustedPrincipal, {
      sourceType: "learning-session",
      sourceId: "s-1",
      eventType: "learning.session.completed",
      eventVersion: 1,
      actorType: "user",
      verificationStatus: "verified",
    });
    await growth.applyGrowthProjection(trustedEvent);

    const malformedRetraction = await fetch(`${url}/api/user/activity/${encodeURIComponent(`${trustedEvent.id}/suffix`)}`, {
      method: "DELETE", headers,
    });
    assert.equal(malformedRetraction.status, 404);
    const malformedEncodingRetraction = await fetch(`${url}/api/user/activity/%E0%A4%A`, {
      method: "DELETE", headers,
    });
    assert.equal(malformedEncodingRetraction.status, 404);
    const unknownRetraction = await fetch(`${url}/api/user/activity/activity-missing`, {
      method: "DELETE", headers,
    });
    assert.equal(unknownRetraction.status, 404);
    const crossOwnerRetraction = await fetch(`${url}/api/user/activity/${trustedEvent.id}`, {
      method: "DELETE", headers: otherHeaders,
    });
    assert.equal(crossOwnerRetraction.status, 404);
    const rawBackslashStatus = await new Promise<number>((resolveRaw, rejectRaw) => {
      const rawRequest = httpRequest({ hostname: "127.0.0.1", port: address.port, method: "DELETE", path: `/api/user/activity\\${trustedEvent.id}`, headers }, (rawResponse) => {
        rawResponse.resume();
        rawResponse.once("end", () => resolveRaw(rawResponse.statusCode ?? 0));
      });
      rawRequest.once("error", rejectRaw);
      rawRequest.end();
    });
    assert.equal(rawBackslashStatus, 404);
    const retracted = await fetch(`${url}/api/user/activity/${trustedEvent.id}?next=%2F`, {
      method: "DELETE", headers,
    });
    assert.equal(retracted.status, 200);
    const retractedBody = await retracted.json() as any;
    assert.equal(retractedBody.event.status, "retracted");
    assert.equal(retractedBody.growth.xpDelta, -100);
    assert.equal(retractedBody.snapshot.xp, 0);
    const repeatedRetraction = await fetch(`${url}/api/user/activity/${trustedEvent.id}`, {
      method: "DELETE", headers,
    });
    assert.equal(repeatedRetraction.status, 200);
    const repeatedBody = await repeatedRetraction.json() as any;
    assert.equal(repeatedBody.event.status, "retracted");
    assert.equal(repeatedBody.growth.xpDelta, -100);
    assert.equal(repeatedBody.snapshot.xp, 0);

    const snapshot = await fetch(`${url}/api/user/growth`, { headers });
    const snapshotBody = await snapshot.json() as any;
    assert.equal(snapshotBody.xp, 0);
    assert.equal(snapshotBody.achievements.some((item: any) => item.id === "learning-session"), false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

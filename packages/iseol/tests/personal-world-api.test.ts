import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createMemoryService } from "../src/memory/service.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { createPersonalWorldService } from "../src/personal-world/service.js";
import { routePersonalWorldRequest } from "../src/personal-world/router.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("personal world and private memory API persist through the user session boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-personal-world-api-"));
  const now = () => "2026-09-25T12:00:00.000Z";
  const platform = createPlatformUserService(join(root, "platform"), { now });
  const world = createPersonalWorldService(join(root, "platform"), { now });
  const memory = createMemoryService(join(root, "platform"), { now });
  const userA = await platform.createUser({ id: "api-a", email: "a@example.com", displayName: "A", timezone: "Asia/Seoul" });
  const userB = await platform.createUser({ id: "api-b", email: "b@example.com", displayName: "B", timezone: "Asia/Seoul" });
  const sessionA = await platform.createSession({ userId: userA.id, roles: ["user"], expiresAt: "2026-09-26T12:00:00.000Z" });
  const sessionB = await platform.createSession({ userId: userB.id, roles: ["user"], expiresAt: "2026-09-26T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1", port: 0, token: "operator-only",
    modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"),
    userService: platform, personalWorldService: world, memoryService: memory,
  });
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  const authA = { authorization: `Bearer ${sessionA.token}`, "content-type": "application/json" };
  const authB = { authorization: `Bearer ${sessionB.token}` };
  try {
    const initial = await fetch(`${url}/api/user/world`, { headers: authA });
    assert.equal(initial.status, 200);
    assert.equal((await initial.json() as any).world.onboardingCompleted, false);

    const directRawPath = await routePersonalWorldRequest({ method: "PUT", path: "/api/user/world", rawPath: "/api/user\\world", headers: authA, body: { displayName: "Must not persist" } }, { platformUserService: platform, personalWorldService: world, memoryService: memory });
    assert.equal(directRawPath.status, 404);

    const updated = await fetch(`${url}/api/user/world`, {
      method: "PUT", headers: authA,
      body: JSON.stringify({ displayName: "Ari", handle: "ari_dev", character: "c", interests: ["AI/ML"], activities: ["learn"], onboardingCompleted: true }),
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json() as any).world.displayName, "Ari");

    const rawPayload = JSON.stringify({ displayName: "Must not persist over HTTP" });
    const rawStatus = await new Promise<number>((resolveStatus, reject) => {
      const request = httpRequest({ hostname: "127.0.0.1", port: address.port, method: "PUT", path: "/api/user\\world", headers: { ...authA, "content-length": String(Buffer.byteLength(rawPayload)) } }, (response) => {
        response.resume();
        response.once("end", () => resolveStatus(response.statusCode ?? 0));
      });
      request.once("error", reject);
      request.end(rawPayload);
    });
    assert.equal(rawStatus, 404);
    const afterRawPath = await fetch(`${url}/api/user/world`, { headers: authA });
    assert.equal((await afterRawPath.json() as any).world.displayName, "Ari");

    const createdMemory = await fetch(`${url}/api/user/memory`, {
      method: "POST", headers: authA,
      body: JSON.stringify({ kind: "note", content: "private context" }),
    });
    assert.equal(createdMemory.status, 201);
    const listedByB = await fetch(`${url}/api/user/memory`, { headers: authB });
    assert.deepEqual(await listedByB.json(), { memories: [] });
    const malformedSharedQuery = await fetch(`${url}/api/user/memory/shared?teamId=${encodeURIComponent("team/id")}`, { headers: authA });
    assert.equal(malformedSharedQuery.status, 400);
    for (const value of ["not-a-number", "1.5", "1.00000000000000001", "NaN", "Infinity", "0", "-1"]) {
      const malformedLimit = await fetch(`${url}/api/user/memory?limit=${encodeURIComponent(value)}`, { headers: authA });
      assert.equal(malformedLimit.status, 400, value);
      assert.deepEqual(await malformedLimit.json(), { error: "limit must be a positive integer" });
    }
    const duplicateLimit = await fetch(`${url}/api/user/memory?limit=1&limit=2`, { headers: authA });
    assert.equal(duplicateLimit.status, 400);
    assert.deepEqual(await duplicateLimit.json(), { error: "limit must be a positive integer" });
    const explicitLimit = await fetch(`${url}/api/user/memory?limit=1&search=private`, { headers: authA });
    assert.equal(explicitLimit.status, 200);
    assert.equal((await explicitLimit.json() as any).memories.length, 1);
    const listedByA = await fetch(`${url}/api/user/memory?search=private`, { headers: authA });
    const listed = await listedByA.json() as any;
    assert.equal(listed.memories.length, 1);
    const updatedMemory = await fetch(`${url}/api/user/memory/${encodeURIComponent(listed.memories[0].id)}`, {
      method: "PATCH", headers: authA,
      body: JSON.stringify({ kind: "edited-note", content: "edited private context", source: null }),
    });
    assert.equal(updatedMemory.status, 200);
    assert.equal((await updatedMemory.json() as any).memory.content, "edited private context");
    const malformedMemoryPath = await fetch(`${url}/api/user/memory/${encodeURIComponent(`${listed.memories[0].id}/suffix`)}`, {
      method: "DELETE", headers: authA,
    });
    assert.equal(malformedMemoryPath.status, 404);
    const malformedSharingPath = await fetch(`${url}/api/user/memory/${encodeURIComponent(`${listed.memories[0].id}/suffix`)}/sharing`, {
      method: "PATCH", headers: authA,
      body: JSON.stringify({ teamIds: [] }),
    });
    assert.equal(malformedSharingPath.status, 404);
    const malformedEncodingPath = await fetch(`${url}/api/user/memory/%E0%A4%A`, {
      method: "DELETE", headers: authA,
    });
    assert.equal(malformedEncodingPath.status, 404);
    const foreignUpdate = await fetch(`${url}/api/user/memory/${encodeURIComponent(listed.memories[0].id)}`, {
      method: "PATCH", headers: { ...authB, "content-type": "application/json" },
      body: JSON.stringify({ content: "must remain private" }),
    });
    assert.equal(foreignUpdate.status, 404);
    const deletedMemory = await fetch(`${url}/api/user/memory/${encodeURIComponent(listed.memories[0].id)}`, { method: "DELETE", headers: authA });
    assert.equal(deletedMemory.status, 204);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

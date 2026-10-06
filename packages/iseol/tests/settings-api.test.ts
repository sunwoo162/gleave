import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createPlatformUserService } from "../src/platform-user/service.js";
import type { SettingsService } from "../src/settings/contracts.js";
import { routeSettingsRequest } from "../src/settings/router.js";
import { createSettingsService } from "../src/settings/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("settings API redacts credential-shaped service errors while preserving validation status", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-settings-error-redaction-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => "2026-09-26T12:00:00.000Z" });
  const user = await users.createUser({ id: "settings-error-user", email: "settings-error@example.com", displayName: "Settings Error", timezone: "Asia/Seoul" });
  const session = await users.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const failingSettings = {
    getSettings: async () => { throw new Error("Invalid settings token%ZZ=settings-secret"); },
  } as unknown as SettingsService;

  const result = await routeSettingsRequest({ method: "GET", path: "/api/user/settings", headers: { authorization: `Bearer ${session.token}` } }, { platformUserService: users, settingsService: failingSettings });

  assert.equal(result.status, 400);
  const message = (result.body as { error: string }).error;
  assert.equal(message.includes("settings-secret"), false);
  assert.match(message, /\[redacted\]/i);
});

test("settings API persists authenticated permission changes and fails closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-settings-api-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => "2026-09-26T12:00:00.000Z" });
  const user = await users.createUser({ id: "settings-api-user", email: "settings-api@example.com", displayName: "Settings API", timezone: "Asia/Seoul" });
  const session = await users.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const settings = createSettingsService(platformRoot, { now: () => "2026-09-26T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "control-token", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "control-plane"), userUiRoot: join(root, "user-ui"), userService: users, settingsService: settings });
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}/api/user/settings`;
  try {
    const unauthorized = await fetch(url);
    assert.equal(unauthorized.status, 401);
    const headers = { authorization: `Bearer ${session.token}`, "content-type": "application/json" };
    const update = await fetch(url, { method: "PATCH", headers, body: JSON.stringify({ aiAccess: { projectFiles: false }, privacy: { projectList: false } }) });
    assert.equal(update.status, 200);
    const body = await update.json() as { settings: { aiAccess: { projectFiles: boolean }; privacy: { projectList: boolean } } };
    assert.equal(body.settings.aiAccess.projectFiles, false);
    const reload = await fetch(url, { headers });
    assert.equal(reload.status, 200);
    const reloaded = await reload.json() as { settings: { aiAccess: { projectFiles: boolean }; privacy: { projectList: boolean } } };
    assert.equal(reloaded.settings.privacy.projectList, false);

    const directRawPath = await routeSettingsRequest({ method: "PATCH", path: "/api/user/settings", rawPath: "/api/user\\settings", headers, body: { privacy: { projectList: true } } }, { platformUserService: users, settingsService: settings });
    assert.equal(directRawPath.status, 404);

    const rawPayload = JSON.stringify({ privacy: { projectList: true } });
    const rawStatus = await new Promise<number>((resolveStatus, reject) => {
      const request = httpRequest({ hostname: "127.0.0.1", port: address.port, method: "PATCH", path: "/api/user\\settings", headers: { ...headers, "content-length": String(Buffer.byteLength(rawPayload)) } }, (response) => {
        response.resume();
        response.once("end", () => resolveStatus(response.statusCode ?? 0));
      });
      request.once("error", reject);
      request.end(rawPayload);
    });
    assert.equal(rawStatus, 404);
    const afterRawPath = await fetch(url, { headers });
    assert.equal((await afterRawPath.json() as any).settings.privacy.projectList, false);
  } finally {
    await server.closeForShutdown();
  }
});

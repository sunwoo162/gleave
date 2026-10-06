import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("authenticated user runtime status exposes only the safe local capability snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-runtime-status-"));
  const users = createPlatformUserService(join(root, "platform"), { now: () => "2026-09-27T00:00:00.000Z" });
  const user = await users.createUser({ id: "runtime-status-user", email: "runtime-status@example.com", displayName: "Runtime Status", timezone: "Asia/Seoul" });
  const session = await users.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1",
    port: 0,
    token: "operator-token",
    modelRoot: join(root, "model"),
    harnessRoot: join(root, "runs"),
    webRoot: join(root, "control-plane"),
    userService: users,
    ideaLabRuntime: { state: "ready", agent: "ready", enqueueProjectRun: async () => "not-configured" },
    aiChatRuntimeReady: true,
    aiTeamRuntimeReady: true,
    learningAiRuntimeReady: true,
  });
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}/api/user/runtime-status`;
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { authorization: "Bearer operator-token" } })).status, 401);
    const result = await fetch(url, { headers: { authorization: `Bearer ${session.token}` } });
    assert.equal(result.status, 200);
    const body = await result.json() as { runtime: { version: number; source: { kind: string }; state: string; projectExecution: string; [key: string]: unknown } };
    assert.deepEqual(body.runtime, {
      version: 1,
      source: { kind: "local-runtime" },
      state: "ready",
      projectExecution: "ready",
      agent: "ready",
      aiChat: "ready",
      aiTeam: "ready",
      learningAi: "ready",
    });
    assert.doesNotMatch(JSON.stringify(body), /modelRoot|operator-token|dataRoot|lock/i);
  } finally {
    await server.closeForShutdown();
  }
});

test("runtime status is disabled when the user server has no Runtime capability", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-runtime-disabled-"));
  const users = createPlatformUserService(join(root, "platform"), { now: () => "2026-09-27T00:00:00.000Z" });
  const user = await users.createUser({ id: "runtime-disabled-user", email: "runtime-disabled@example.com", displayName: "Runtime Disabled", timezone: "Asia/Seoul" });
  const session = await users.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator-token", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "control-plane"), userService: users });
  const address = server.address() as AddressInfo;
  try {
    const result = await fetch(`http://127.0.0.1:${address.port}/api/user/runtime-status`, { headers: { authorization: `Bearer ${session.token}` } });
    assert.equal(result.status, 200);
    assert.deepEqual((await result.json()).runtime, { version: 1, source: { kind: "local-runtime" }, state: "disabled", projectExecution: "unavailable", agent: "unavailable", aiChat: "unavailable", aiTeam: "unavailable", learningAi: "unavailable" });
  } finally {
    await server.closeForShutdown();
  }
});

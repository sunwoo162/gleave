import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("user sessions cannot cross into operator or Control Plane event boundaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-ui-boundary-"));
  const userService = createPlatformUserService(join(root, "platform"), { now: () => "2026-09-26T12:00:00.000Z" });
  const user = await userService.createUser({ id: "boundary-user", email: "boundary@example.com", displayName: "Boundary User", timezone: "Asia/Seoul" });
  const session = await userService.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator-token", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "control-plane"), userUiRoot: join(root, "user-ui"), userService });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const own = await fetch(`${baseUrl}/api/user/me`, { headers: { authorization: `Bearer ${session.token}` } });
    assert.equal(own.status, 200);
    const operatorAsUser = await fetch(`${baseUrl}/api/user/me`, { headers: { authorization: "Bearer operator-token" } });
    assert.equal(operatorAsUser.status, 401);
    const anonymous = await fetch(`${baseUrl}/api/user/me`);
    assert.equal(anonymous.status, 401);
    const userEvents = await fetch(`${baseUrl}/api/events`, { headers: { authorization: `Bearer ${session.token}` } });
    assert.equal(userEvents.status, 401);
  } finally {
    await server.closeForShutdown();
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";
import { createPlatformUserService } from "../src/platform-user/service.js";

test("user UI is served below /app while the Control Plane root remains separate", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-ui-server-"));
  const modelRoot = join(root, "model");
  const harnessRoot = join(root, "runs");
  const webRoot = join(root, "control-plane");
  const userUiRoot = join(root, "user-ui");
  await mkdir(webRoot, { recursive: true });
  await mkdir(join(userUiRoot, "assets"), { recursive: true });
  await writeFile(join(webRoot, "index.html"), "<h1>Control Plane</h1>", "utf8");
  await writeFile(join(webRoot, "app.js"), "window.controlPlane = true", "utf8");
  await writeFile(join(userUiRoot, "index.html"), "<h1>User Iseol</h1>", "utf8");
  await writeFile(join(userUiRoot, "assets", "app.js"), "window.userUi = true", "utf8");
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1",
    port: 0,
    token: "secret-token",
    modelRoot,
    harnessRoot,
    webRoot,
    userUiRoot,
  });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const control = await fetch(`${baseUrl}/`);
    assert.equal(control.status, 200);
    assert.equal(await control.text(), "<h1>Control Plane</h1>");

    const controlScript = await fetch(`${baseUrl}/app.js`);
    assert.equal(controlScript.status, 200);
    assert.match(await controlScript.text(), /controlPlane/);

    const user = await fetch(`${baseUrl}/app`);
    assert.equal(user.status, 200);
    assert.equal(await user.text(), "<h1>User Iseol</h1>");

    const userAsset = await fetch(`${baseUrl}/app/assets/app.js`);
    assert.equal(userAsset.status, 200);
    assert.match(await userAsset.text(), /userUi/);

    const userRoute = await fetch(`${baseUrl}/app/profile`);
    assert.equal(userRoute.status, 200);
    assert.equal(await userRoute.text(), "<h1>User Iseol</h1>");

    const missing = await fetch(`${baseUrl}/app/missing.js`);
    assert.equal(missing.status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("user profile API is served through the Control Plane with a platform session", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-api-server-"));
  const service = createPlatformUserService(join(root, "platform"), { now: () => "2026-09-25T12:00:00.000Z" });
  const user = await service.createUser({
    id: "user-api",
    email: "api@example.com",
    displayName: "API User",
    timezone: "Asia/Seoul",
  });
  const session = await service.createSession({
    userId: user.id,
    roles: ["user"],
    expiresAt: "2026-09-26T12:00:00.000Z",
  });
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1",
    port: 0,
    token: "control-token",
    modelRoot: join(root, "model"),
    harnessRoot: join(root, "runs"),
    webRoot: join(root, "control-plane"),
    userUiRoot: join(root, "user-ui"),
    userService: service,
  });
  const address = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/user/me`, {
      headers: { authorization: `Bearer ${session.token}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { user });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

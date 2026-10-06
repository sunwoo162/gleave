import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("health endpoint reports process health without requiring external credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "npc-health-"));
  await mkdir(join(root, "web"), { recursive: true });
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1",
    port: 0,
    token: "local-test-token",
    modelRoot: join(root, "model"),
    harnessRoot: join(root, "runs"),
    webRoot: join(root, "web"),
  });
  const address = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });

    const healthz = await fetch(`http://127.0.0.1:${address.port}/healthz`);
    assert.equal(healthz.status, 200);
    assert.deepEqual(await healthz.json(), { status: "ok", live: true, ready: true });

    const readyz = await fetch(`http://127.0.0.1:${address.port}/readyz`);
    assert.equal(readyz.status, 200);
    assert.deepEqual(await readyz.json(), { status: "ok", ready: true });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("health endpoints never echo control-plane credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "npc-health-secret-"));
  await mkdir(join(root, "web"), { recursive: true });
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1",
    port: 0,
    token: "super-secret-control-token",
    modelRoot: join(root, "model"),
    harnessRoot: join(root, "runs"),
    webRoot: join(root, "web"),
  });
  const address = server.address() as AddressInfo;
  try {
    for (const path of ["/health", "/healthz", "/readyz"]) {
      const body = await (await fetch(`http://127.0.0.1:${address.port}${path}`)).text();
      assert.equal(body.includes("super-secret-control-token"), false, path);
      assert.equal(body.includes(root), false, path);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("release distribution files declare a non-root image and persistent data volume", async () => {
  const dockerfile = await readFile("Dockerfile", "utf8").catch(() => "");
  const compose = await readFile("docker-compose.example.yml", "utf8").catch(() => "");
  const healthcheck = await readFile("scripts/docker-healthcheck.mjs", "utf8").catch(() => "");
  assert.match(dockerfile, /USER npc/);
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.match(dockerfile, /npm ci --include=dev --ignore-scripts/);
  assert.match(dockerfile, /npm --prefix user-ui ci --include=dev --ignore-scripts/);
  assert.match(dockerfile, /COPY user-ui\/\.figma\/make\/site\.json/);
  assert.match(compose, /\/app\/data/);
  assert.match(compose, /ISEOL_WEB_PORT: 3000/);
  assert.match(dockerfile, /scripts\/docker-healthcheck\.mjs/);
  assert.match(healthcheck, /\/healthz/);
  assert.match(healthcheck, /body\?\.live !== true/);
});

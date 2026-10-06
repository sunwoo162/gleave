import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getDesktopAgentPresence,
  heartbeatDesktopAgent,
  listOnlineDesktopAgents,
  registerDesktopAgent,
} from "../src/desktop-agent/agent-registry.js";
import { withDurableDesktopAgentLock } from "../src/desktop-agent/agent-lock.js";

const hello = {
  version: 1 as const,
  agentId: "agent-001",
  agentVersion: "0.1.0",
  os: "win32",
  capabilities: ["process", "git"],
  workspaceRoots: ["C:/Users/user/Documents"],
  token: "secret-token",
};

async function root() {
  return mkdtemp(join(tmpdir(), "iseol-agent-registry-"));
}

test("registration persists metadata without authentication material", async () => {
  const store = await root();
  const presence = await registerDesktopAgent(store, hello, "2026-09-08T01:00:00.000Z");
  assert.equal(presence.agentId, "agent-001");
  assert.equal(presence.lastHeartbeatAt, "2026-09-08T01:00:00.000Z");
  assert.equal("token" in presence, false);

  const loaded = await getDesktopAgentPresence(
    store,
    "agent-001",
    "2026-09-08T01:00:30.000Z",
    60_000,
  );
  assert.equal(loaded?.status, "online");
  assert.equal(JSON.stringify(loaded).includes("secret-token"), false);
});

test("heartbeat updates presence and timeout derives offline status", async () => {
  const store = await root();
  await registerDesktopAgent(store, hello, "2026-09-08T01:00:00.000Z");
  await heartbeatDesktopAgent(store, "agent-001", "2026-09-08T01:01:00.000Z");

  assert.equal((await getDesktopAgentPresence(
    store, "agent-001", "2026-09-08T01:01:30.000Z", 60_000,
  ))?.status, "online");
  assert.equal((await getDesktopAgentPresence(
    store, "agent-001", "2026-09-08T01:02:01.000Z", 60_000,
  ))?.status, "offline");
});

test("online listing is deterministic and re-registration updates one identity", async () => {
  const store = await root();
  await registerDesktopAgent(store, { ...hello, agentId: "agent-b" }, "2026-09-08T01:00:00.000Z");
  await registerDesktopAgent(store, { ...hello, agentId: "agent-a" }, "2026-09-08T01:00:00.000Z");
  await registerDesktopAgent(store, {
    ...hello,
    agentId: "agent-a",
    agentVersion: "0.2.0",
    capabilities: ["git"],
  }, "2026-09-08T01:00:10.000Z");

  const online = await listOnlineDesktopAgents(store, "2026-09-08T01:00:30.000Z", 60_000);
  assert.deepEqual(online.map((item) => item.agentId), ["agent-a", "agent-b"]);
  assert.equal(online[0]?.agentVersion, "0.2.0");
  assert.deepEqual(online[0]?.capabilities, ["git"]);
});

test("registry rejects unsafe ids and empty workspace roots", async () => {
  const store = await root();
  await assert.rejects(
    registerDesktopAgent(store, { ...hello, agentId: "../escape" }, "2026-09-08T01:00:00.000Z"),
    /Invalid Desktop Agent id/,
  );
  await assert.rejects(
    registerDesktopAgent(store, { ...hello, workspaceRoots: [] }, "2026-09-08T01:00:00.000Z"),
    /workspace root/i,
  );
});

test("concurrent heartbeats serialize durable presence writes", async () => {
  const store = await root();
  await registerDesktopAgent(store, hello, "2026-09-08T01:00:00.000Z");
  const timestamps = Array.from({ length: 32 }, (_, index) =>
    new Date(Date.parse("2026-09-08T01:00:00.000Z") + index * 1000).toISOString(),
  );

  const results = await Promise.allSettled(
    timestamps.map((at) => heartbeatDesktopAgent(store, "agent-001", at)),
  );

  assert.equal(results.filter((item) => item.status === "rejected").length, 0);
  const loaded = await getDesktopAgentPresence(
    store,
    "agent-001",
    "2026-09-08T01:01:00.000Z",
    120_000,
  );
  assert.equal(loaded?.lastHeartbeatAt, timestamps.at(-1));
});

test("heartbeat waits for the durable Agent presence lock across instances", async () => {
  const store = await root();
  await registerDesktopAgent(store, hello, "2026-09-08T01:00:00.000Z");
  let settled = false;
  let heartbeatPromise: Promise<unknown> | undefined;
  const pending = withDurableDesktopAgentLock(
    store,
    "agent-001",
    async () => {
      const registry = await import("../src/desktop-agent/agent-registry.js?presence-lock");
      heartbeatPromise = registry.heartbeatDesktopAgent(store, "agent-001", "2026-09-08T01:01:00.000Z");
      heartbeatPromise.finally(() => { settled = true; }).catch(() => undefined);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
      assert.equal(settled, false);
    },
    { waitForMs: 2_000 },
  );
  await pending;
  await heartbeatPromise;
  assert.equal((await getDesktopAgentPresence(store, "agent-001", "2026-09-08T01:01:30.000Z", 60_000))?.lastHeartbeatAt, "2026-09-08T01:01:00.000Z");
});

test("stale connection heartbeat cannot overwrite the current capability snapshot", async () => {
  const store = await root();
  await registerDesktopAgent(store, { ...hello, capabilities: ["git"] }, "2026-09-08T01:00:00.000Z", "connection-old");
  await registerDesktopAgent(store, { ...hello, capabilities: ["git", "operation:GIT_INIT"] }, "2026-09-08T01:00:01.000Z", "connection-new");

  await heartbeatDesktopAgent(store, "agent-001", "2026-09-08T01:00:02.000Z", "connection-old");
  const current = await getDesktopAgentPresence(store, "agent-001", "2026-09-08T01:00:03.000Z", 60_000);
  assert.deepEqual(current?.capabilities, ["git", "operation:GIT_INIT"]);
  assert.equal(current?.connectionId, "connection-new");
  assert.equal(current?.lastHeartbeatAt, "2026-09-08T01:00:01.000Z");
});

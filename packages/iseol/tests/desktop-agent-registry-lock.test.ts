import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getDesktopAgentPresence,
  listOnlineDesktopAgents,
  registerDesktopAgent,
} from "../src/desktop-agent/agent-registry.js";
import { withDurableDesktopAgentLock } from "../src/desktop-agent/agent-lock.js";

const hello = {
  version: 1 as const,
  agentId: "agent-read-lock-001",
  agentVersion: "0.1.0",
  os: "win32",
  capabilities: ["process"],
  workspaceRoots: ["C:/repo"],
  token: "not-persisted",
};

async function root(): Promise<string> {
  return mkdtemp(join(tmpdir(), "iseol-agent-registry-lock-read-"));
}

async function assertReadWaitsForAgentLock<T>(
  store: string,
  read: () => Promise<T>,
): Promise<T> {
  let settled = false;
  let readPromise: Promise<T> | undefined;
  const lockPromise = withDurableDesktopAgentLock(
    store,
    hello.agentId,
    async () => {
      readPromise = read();
      readPromise.finally(() => { settled = true; }).catch(() => undefined);
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      assert.equal(settled, false);
    },
    { waitForMs: 2_000 },
  );
  await lockPromise;
  return readPromise!;
}

test("Desktop Agent presence reads wait for the durable Agent lock", async () => {
  const store = await root();
  await registerDesktopAgent(store, hello, "2026-09-30T03:00:00.000Z");

  const presence = await assertReadWaitsForAgentLock(store, () => getDesktopAgentPresence(
    store,
    hello.agentId,
    "2026-09-30T03:00:30.000Z",
    60_000,
  ));
  assert.equal(presence?.agentId, hello.agentId);

  const online = await assertReadWaitsForAgentLock(store, () => listOnlineDesktopAgents(
    store,
    "2026-09-30T03:00:30.000Z",
    60_000,
  ));
  assert.deepEqual(online.map((agent) => agent.agentId), [hello.agentId]);
});

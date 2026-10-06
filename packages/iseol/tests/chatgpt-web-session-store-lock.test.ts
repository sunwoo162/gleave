import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createWebWorkerSession, getActiveWebWorkerSession, getPointedWebWorkerSession, loadWebWorkerSession } from "../src/chatgpt-web/session-store.js";
import { withDurableWebWorkerSessionLock } from "../src/chatgpt-web/session-lock.js";

const session = {
  version: 1 as const,
  sessionId: "session-store-lock",
  runId: "run-session-store-lock",
  stage: "IMPLEMENT" as const,
  generation: 1,
  policySha256: "policy-1",
  status: "ready" as const,
  resultContract: "patch-frame-v1" as const,
  createdAt: "2026-09-30T00:00:00.000Z",
};

async function holdSessionLock(root: string) {
  let release!: () => void;
  let acquired!: () => void;
  const acquiredPromise = new Promise<void>((resolve) => { acquired = resolve; });
  const holderReleased = new Promise<void>((resolve) => { release = resolve; });
  const holder = withDurableWebWorkerSessionLock(root, session.runId, session.stage, async () => {
    acquired();
    await holderReleased;
  }, { waitForMs: 0 });
  await acquiredPromise;
  return { holder, release };
}

test("public Web worker session reads wait for the shared run/stage lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-chatgpt-session-store-lock-"));
  await createWebWorkerSession(root, session);

  const loadLock = await holdSessionLock(root);
  let loadSettled = false;
  const pendingLoad = loadWebWorkerSession(root, session.sessionId).then((value) => {
    loadSettled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(loadSettled, false);
  loadLock.release();
  await loadLock.holder;
  assert.equal((await pendingLoad)?.sessionId, session.sessionId);

  const pointedLock = await holdSessionLock(root);
  let pointedSettled = false;
  const pendingPointed = getPointedWebWorkerSession(root, session.runId, session.stage).then((value) => {
    pointedSettled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(pointedSettled, false);
  pointedLock.release();
  await pointedLock.holder;
  assert.equal((await pendingPointed)?.sessionId, session.sessionId);

  const activeLock = await holdSessionLock(root);
  let activeSettled = false;
  const pendingActive = getActiveWebWorkerSession(root, session.runId, session.stage).then((value) => {
    activeSettled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(activeSettled, false);
  activeLock.release();
  await activeLock.holder;
  assert.equal((await pendingActive)?.sessionId, session.sessionId);
});

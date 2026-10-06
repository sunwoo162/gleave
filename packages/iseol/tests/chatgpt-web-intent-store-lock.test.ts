import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { listDesktopIntents, loadDesktopIntent, recordDesktopIntent } from "../src/chatgpt-web/intent-store.js";
import { withDurableDesktopIntentLock } from "../src/chatgpt-web/intent-lock.js";

const intent = {
  version: 1 as const,
  intentId: "intent-store-lock",
  runId: "run-intent-store-lock",
  stage: "IMPLEMENT" as const,
  workspaceRoot: "C:/workspace/project",
  policySha256: "policy-1",
  kind: "GIT_INSPECT" as const,
  cwd: ".",
};

async function holdIntentLock(root: string) {
  let release!: () => void;
  let acquired!: () => void;
  const acquiredPromise = new Promise<void>((resolve) => { acquired = resolve; });
  const holderReleased = new Promise<void>((resolve) => { release = resolve; });
  const holder = withDurableDesktopIntentLock(root, intent.runId, intent.intentId, async () => {
    acquired();
    await holderReleased;
  }, { waitForMs: 0 });
  await acquiredPromise;
  return { holder, release };
}

test("public Desktop intent reads wait for the shared intent lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-chatgpt-intent-store-lock-"));
  await recordDesktopIntent(root, { intent, status: "accepted", recordedAt: "2026-09-30T00:00:00.000Z" });

  const loadLock = await holdIntentLock(root);
  let loadSettled = false;
  const pendingLoad = loadDesktopIntent(root, intent.runId, intent.intentId).then((value) => {
    loadSettled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(loadSettled, false);
  loadLock.release();
  await loadLock.holder;
  assert.equal((await pendingLoad)?.status, "accepted");

  const listLock = await holdIntentLock(root);
  let listSettled = false;
  const pendingList = listDesktopIntents(root, intent.runId).then((value) => {
    listSettled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(listSettled, false);
  listLock.release();
  await listLock.holder;
  assert.deepEqual((await pendingList).map((record) => record.intent.intentId), [intent.intentId]);
});

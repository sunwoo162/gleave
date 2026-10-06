import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { GrowthLedgerEntry } from "../src/growth/contracts.js";
import { withDurableGrowthProjectionLock } from "../src/growth/projection-lock.js";
import { listGrowthEntries, loadGrowthEntry, saveGrowthEntry } from "../src/growth/ledger.js";

const entry: GrowthLedgerEntry = {
  version: 1,
  id: "growth-event-ledger-active",
  userId: "growth-ledger-store-owner",
  eventId: "growth-ledger-store-event",
  actorType: "user",
  xpDelta: 100,
  stat: "learning",
  statDelta: 100,
  createdAt: "2026-09-30T00:00:00.000Z",
};

async function holdEventLock(root: string) {
  let release!: () => void;
  let acquired!: () => void;
  const acquiredPromise = new Promise<void>((resolve) => { acquired = resolve; });
  const holderReleased = new Promise<void>((resolve) => { release = resolve; });
  const holder = withDurableGrowthProjectionLock(root, entry.userId, entry.eventId, async () => {
    acquired();
    await holderReleased;
  }, { waitForMs: 0 });
  await acquiredPromise;
  return { holder, release };
}

test("public growth ledger reads and writes wait for the shared event lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-growth-ledger-store-lock-"));
  await saveGrowthEntry(root, entry);
  const updated = { ...entry, xpDelta: 200, statDelta: 200 };

  const saveLock = await holdEventLock(root);
  let saveSettled = false;
  const pendingSave = saveGrowthEntry(root, updated).then(() => { saveSettled = true; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  saveLock.release();
  await saveLock.holder;
  await pendingSave;

  const loadLock = await holdEventLock(root);
  let loadSettled = false;
  const pendingLoad = loadGrowthEntry(root, entry.userId, entry.id).then((value) => {
    loadSettled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(loadSettled, false);
  loadLock.release();
  await loadLock.holder;
  assert.equal((await pendingLoad)?.xpDelta, 200);

  const listLock = await holdEventLock(root);
  let listSettled = false;
  const pendingList = listGrowthEntries(root, entry.userId).then((value) => {
    listSettled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(listSettled, false);
  listLock.release();
  await listLock.holder;
  assert.deepEqual((await pendingList).map((candidate) => candidate.xpDelta), [200]);
});

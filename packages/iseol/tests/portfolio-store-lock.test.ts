import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { PortfolioEntry } from "../src/portfolio/contracts.js";
import { withDurablePortfolioEntryLock } from "../src/portfolio/entry-lock.js";
import { findPortfolioEntry, listPortfolioEntries, loadPortfolioEntry, savePortfolioEntry, savePortfolioEntryUnlocked } from "../src/portfolio/store.js";

test("public portfolio entry store reads and writes wait for the entry lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-portfolio-store-lock-"));
  const entry: PortfolioEntry = {
    version: 1,
    id: "portfolio-store-lock-entry",
    userId: "portfolio-store-lock-user",
    title: "기존 제목",
    summary: "포트폴리오 저장소 lock 경계를 검증합니다.",
    visibility: "public",
    evidenceIds: [],
    createdAt: "2026-09-29T12:00:00.000Z",
    updatedAt: "2026-09-29T12:00:00.000Z",
  };
  await savePortfolioEntryUnlocked(root, entry);
  const updated = { ...entry, title: "잠금 해제 후 제목", updatedAt: "2026-09-29T12:00:01.000Z" };

  let release!: () => void;
  let acquired!: () => void;
  const lockAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurablePortfolioEntryLock(root, entry.userId, entry.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await lockAcquired;

  let saveSettled = false;
  const pendingSave = savePortfolioEntry(root, updated).then(() => { saveSettled = true; });
  let loadSettled = false;
  const pendingLoad = loadPortfolioEntry(root, entry.userId, entry.id).then((value) => { loadSettled = true; return value; });
  let listSettled = false;
  const pendingList = listPortfolioEntries(root, entry.userId).then((value) => { listSettled = true; return value; });
  let findSettled = false;
  const pendingFind = findPortfolioEntry(root, entry.id).then((value) => { findSettled = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(loadSettled, false);
  assert.equal(listSettled, false);
  assert.equal(findSettled, false);

  release();
  await holder;
  await Promise.all([pendingSave, pendingLoad, pendingList, pendingFind]);
  assert.equal((await loadPortfolioEntry(root, entry.userId, entry.id))?.title, "잠금 해제 후 제목");
  assert.equal((await listPortfolioEntries(root, entry.userId))[0]?.title, "잠금 해제 후 제목");
  assert.equal((await findPortfolioEntry(root, entry.id))?.title, "잠금 해제 후 제목");
});

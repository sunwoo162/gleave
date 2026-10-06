import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { assertIdentityId } from "../identity/contracts.js";
import type { ActivityEvent } from "../activity/contracts.js";
import type { GrowthLedgerEntry, GrowthStat } from "./contracts.js";
import { withDurableGrowthProjectionLock } from "./projection-lock.js";

export function growthProjection(event: ActivityEvent): { xpDelta: number; stat: GrowthStat } | null {
  if (event.eventType === "learning.session.completed") return { xpDelta: 100, stat: "learning" };
  if (event.eventType === "project.run.completed") return { xpDelta: 150, stat: "development" };
  if (event.eventType === "collaboration.session.completed") return { xpDelta: 75, stat: "collaboration" };
  if (event.eventType === "learning.streak.day") return { xpDelta: 25, stat: "consistency" };
  return null;
}

function directory(root: string, userId: string): string {
  assertIdentityId(userId);
  return resolve(root, "users", userId, "growth", "ledger");
}

function pathFor(root: string, userId: string, entryId: string): string {
  assertIdentityId(entryId);
  return resolve(directory(root, userId), `${entryId}.json`);
}

async function saveJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await rename(temporary, path);
}

export async function saveGrowthEntryUnlocked(root: string, entry: GrowthLedgerEntry): Promise<void> { await saveJson(pathFor(root, entry.userId, entry.id), entry); }

export async function saveGrowthEntry(root: string, entry: GrowthLedgerEntry): Promise<void> {
  await withDurableGrowthProjectionLock(root, entry.userId, entry.eventId, () => saveGrowthEntryUnlocked(root, entry), { waitForMs: 2_000 });
}

export async function loadGrowthEntryUnlocked(root: string, userId: string, entryId: string): Promise<GrowthLedgerEntry | null> {
  try { return JSON.parse(await readFile(pathFor(root, userId, entryId), "utf8")) as GrowthLedgerEntry; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

export async function loadGrowthEntry(root: string, userId: string, entryId: string): Promise<GrowthLedgerEntry | null> {
  const candidate = await loadGrowthEntryUnlocked(root, userId, entryId);
  if (!candidate || candidate.userId !== userId || candidate.id !== entryId) return null;
  try { assertIdentityId(candidate.eventId); } catch { return null; }
  return withDurableGrowthProjectionLock(root, userId, candidate.eventId, () => loadGrowthEntryUnlocked(root, userId, entryId), { waitForMs: 2_000 });
}

export async function listGrowthEntriesUnlocked(root: string, userId: string): Promise<GrowthLedgerEntry[]> {
  const dir = directory(root, userId);
  let names: string[];
  try { names = await readdir(dir); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const entries: GrowthLedgerEntry[] = [];
  for (const name of names.filter((item) => item.endsWith(".json"))) {
    try { entries.push(JSON.parse(await readFile(resolve(dir, name), "utf8")) as GrowthLedgerEntry); } catch { /* malformed ledger rows are ignored */ }
  }
  return entries;
}

export async function listGrowthEntries(root: string, userId: string): Promise<GrowthLedgerEntry[]> {
  const candidates = await listGrowthEntriesUnlocked(root, userId);
  const entries: GrowthLedgerEntry[] = [];
  for (const candidate of candidates) {
    if (candidate.userId !== userId) continue;
    try { assertIdentityId(candidate.id); assertIdentityId(candidate.eventId); } catch { continue; }
    await withDurableGrowthProjectionLock(root, userId, candidate.eventId, async () => {
      const current = await loadGrowthEntryUnlocked(root, userId, candidate.id);
      if (current?.userId === userId && current.id === candidate.id && current.eventId === candidate.eventId) entries.push(current);
    }, { waitForMs: 2_000 });
  }
  return entries;
}

import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertIdentityId } from "../identity/contracts.js";
import type { PortfolioEntry } from "./contracts.js";
import { withDurablePortfolioEntryLock } from "./entry-lock.js";

function directory(root: string, userId: string): string { assertIdentityId(userId); return resolve(root, "users", userId, "portfolio", "entries"); }
function pathFor(root: string, userId: string, entryId: string): string { assertIdentityId(entryId); return resolve(directory(root, userId), `${entryId}.json`); }
async function saveJson(path: string, value: unknown): Promise<void> { await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`; await writeFile(temporary, JSON.stringify(value, null, 2), "utf8"); await rename(temporary, path); }
async function loadJson<T>(path: string): Promise<T | null> { try { return JSON.parse(await readFile(path, "utf8")) as T; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } }
export const savePortfolioEntryUnlocked = (root: string, value: PortfolioEntry) => saveJson(pathFor(root, value.userId, value.id), value);
export const savePortfolioEntry = (root: string, value: PortfolioEntry) => withDurablePortfolioEntryLock(root, value.userId, value.id, () => savePortfolioEntryUnlocked(root, value), { waitForMs: 2_000 });
export const loadPortfolioEntryUnlocked = (root: string, userId: string, entryId: string) => loadJson<PortfolioEntry>(pathFor(root, userId, entryId));
export const loadPortfolioEntry = (root: string, userId: string, entryId: string) => withDurablePortfolioEntryLock(root, userId, entryId, () => loadPortfolioEntryUnlocked(root, userId, entryId), { waitForMs: 2_000 });
export async function listPortfolioEntriesUnlocked(root: string, userId: string): Promise<PortfolioEntry[]> { let names: string[]; try { names = await readdir(directory(root, userId)); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; } const values: PortfolioEntry[] = []; for (const name of names.filter((item) => item.endsWith(".json"))) { const value = await loadJson<PortfolioEntry>(resolve(directory(root, userId), name)); if (value) values.push(value); } return values; }
export async function listPortfolioEntries(root: string, userId: string): Promise<PortfolioEntry[]> {
  const candidates = await listPortfolioEntriesUnlocked(root, userId);
  const values: PortfolioEntry[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); } catch { continue; }
    await withDurablePortfolioEntryLock(root, userId, candidate.id, async () => {
      const current = await loadPortfolioEntryUnlocked(root, userId, candidate.id);
      if (current?.userId === userId) values.push(current);
    }, { waitForMs: 2_000 });
  }
  return values;
}
export async function findPortfolioEntryUnlocked(root: string, entryId: string): Promise<PortfolioEntry | null> {
  assertIdentityId(entryId);
  let users: string[];
  try { users = await readdir(resolve(root, "users")); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  for (const userId of users) {
    if (!/^[A-Za-z0-9_-]+$/.test(userId)) continue;
    const value = await loadJson<PortfolioEntry>(pathFor(root, userId, entryId));
    if (value) return value;
  }
  return null;
}
export async function findPortfolioEntry(root: string, entryId: string): Promise<PortfolioEntry | null> {
  assertIdentityId(entryId);
  let users: string[];
  try { users = await readdir(resolve(root, "users")); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  for (const userId of users) {
    if (!/^[A-Za-z0-9_-]+$/.test(userId)) continue;
    let found: PortfolioEntry | null = null;
    await withDurablePortfolioEntryLock(root, userId, entryId, async () => {
      found = await loadPortfolioEntryUnlocked(root, userId, entryId);
    }, { waitForMs: 2_000 });
    if (found) return found;
  }
  return null;
}

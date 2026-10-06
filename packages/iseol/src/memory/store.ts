import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { assertIdentityId } from "../identity/contracts.js";
import type { MemoryRecord } from "./contracts.js";
import { withDurableMemoryLock } from "./memory-lock.js";

function memoryDirectory(root: string, userId: string): string {
  assertIdentityId(userId);
  return resolve(root, "users", userId, "memories");
}

function memoryPath(root: string, userId: string, memoryId: string): string {
  assertIdentityId(memoryId);
  return resolve(memoryDirectory(root, userId), `${memoryId}.json`);
}

async function saveJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await rename(temporary, path);
}

export async function saveMemoryUnlocked(root: string, memory: MemoryRecord): Promise<void> {
  await saveJson(memoryPath(root, memory.userId, memory.id), memory);
}

export async function saveMemory(root: string, memory: MemoryRecord): Promise<void> {
  return withDurableMemoryLock(root, memory.userId, memory.id, () => saveMemoryUnlocked(root, memory), { waitForMs: 2_000 });
}

export async function loadMemoryUnlocked(root: string, userId: string, memoryId: string): Promise<MemoryRecord | null> {
  try {
    return JSON.parse(await readFile(memoryPath(root, userId, memoryId), "utf8")) as MemoryRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function loadMemory(root: string, userId: string, memoryId: string): Promise<MemoryRecord | null> {
  return withDurableMemoryLock(root, userId, memoryId, () => loadMemoryUnlocked(root, userId, memoryId), { waitForMs: 2_000 });
}

export async function listMemoriesUnlocked(root: string, userId: string): Promise<MemoryRecord[]> {
  const directory = memoryDirectory(root, userId);
  let names: string[];
  try { names = await readdir(directory); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const records: MemoryRecord[] = [];
  for (const name of names.filter((entry) => entry.endsWith(".json"))) {
    try { records.push(JSON.parse(await readFile(resolve(directory, name), "utf8")) as MemoryRecord); } catch { /* skip malformed records; owner remains fail-closed */ }
  }
  return records;
}

export async function listMemories(root: string, userId: string): Promise<MemoryRecord[]> {
  const candidates = await listMemoriesUnlocked(root, userId);
  const records: MemoryRecord[] = [];
  for (const candidate of candidates) {
    try {
      const current = await withDurableMemoryLock(root, userId, candidate.id, () => loadMemoryUnlocked(root, userId, candidate.id), { waitForMs: 2_000 });
      if (current) records.push(current);
    } catch {
      // malformed or inaccessible records fail closed for the owner-scoped list
    }
  }
  return records;
}

export async function listAllMemoriesUnlocked(root: string): Promise<MemoryRecord[]> {
  let entries: import("node:fs").Dirent[];
  try { entries = await readdir(resolve(root, "users"), { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const records: MemoryRecord[] = [];
  for (const entry of entries.filter((item) => item.isDirectory())) {
    try { records.push(...await listMemories(root, entry.name)); } catch { /* malformed or legacy user roots fail closed */ }
  }
  return records;
}

export async function listAllMemories(root: string): Promise<MemoryRecord[]> {
  const candidates = await listAllMemoriesUnlocked(root);
  const records: MemoryRecord[] = [];
  for (const candidate of candidates) {
    try {
      const current = await withDurableMemoryLock(root, candidate.userId, candidate.id, () => loadMemoryUnlocked(root, candidate.userId, candidate.id), { waitForMs: 2_000 });
      if (current) records.push(current);
    } catch {
      // malformed or inaccessible records fail closed for shared reads
    }
  }
  return records;
}

export async function deleteMemoryUnlocked(root: string, userId: string, memoryId: string): Promise<boolean> {
  try {
    await unlink(memoryPath(root, userId, memoryId));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function deleteMemory(root: string, userId: string, memoryId: string): Promise<boolean> {
  return withDurableMemoryLock(root, userId, memoryId, () => deleteMemoryUnlocked(root, userId, memoryId), { waitForMs: 2_000 });
}

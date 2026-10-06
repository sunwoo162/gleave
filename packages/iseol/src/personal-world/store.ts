import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { assertIdentityId } from "../identity/contracts.js";
import type { CharacterRecord, WorldRecord } from "./contracts.js";
import { withDurablePersonalWorldLock } from "./world-lock.js";

function worldPath(root: string, userId: string): string {
  assertIdentityId(userId);
  return resolve(root, "users", userId, "world.json");
}

function characterPath(root: string, userId: string): string {
  assertIdentityId(userId);
  return resolve(root, "users", userId, "character.json");
}

async function saveJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await rename(temporary, path);
}

async function loadJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function saveWorldUnlocked(root: string, world: WorldRecord): Promise<void> {
  await saveJson(worldPath(root, world.userId), world);
}

export async function saveWorld(root: string, world: WorldRecord): Promise<void> {
  await withDurablePersonalWorldLock(root, world.userId, () => saveWorldUnlocked(root, world), { waitForMs: 2_000 });
}

export async function loadWorldUnlocked(root: string, userId: string): Promise<WorldRecord | null> {
  return loadJson<WorldRecord>(worldPath(root, userId));
}

export async function loadWorld(root: string, userId: string): Promise<WorldRecord | null> {
  return withDurablePersonalWorldLock(root, userId, () => loadWorldUnlocked(root, userId), { waitForMs: 2_000 });
}

export async function saveCharacterUnlocked(root: string, character: CharacterRecord): Promise<void> {
  await saveJson(characterPath(root, character.userId), character);
}

export async function saveCharacter(root: string, character: CharacterRecord): Promise<void> {
  await withDurablePersonalWorldLock(root, character.userId, () => saveCharacterUnlocked(root, character), { waitForMs: 2_000 });
}

export async function loadCharacterUnlocked(root: string, userId: string): Promise<CharacterRecord | null> {
  return loadJson<CharacterRecord>(characterPath(root, userId));
}

export async function loadCharacter(root: string, userId: string): Promise<CharacterRecord | null> {
  return withDurablePersonalWorldLock(root, userId, () => loadCharacterUnlocked(root, userId), { waitForMs: 2_000 });
}

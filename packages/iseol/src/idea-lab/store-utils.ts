import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { renameWithTransientRetry } from "../desktop-agent/atomic-file.js";

export async function writeIdeaLabJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), "utf8");
  try { await renameWithTransientRetry(temp, path); }
  catch (error) { await unlink(temp).catch(() => undefined); throw error; }
}

export async function readIdeaLabJson<T>(path: string): Promise<T | null> {
  try { return JSON.parse(await readFile(path, "utf8")) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function listIdeaLabJsonFiles(directory: string): Promise<string[]> {
  try { return (await readdir(directory)).filter((name) => name.endsWith(".json")).sort(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export function ideaLabDirectory(root: string, name: string): string { return resolve(root, "idea-lab", name); }

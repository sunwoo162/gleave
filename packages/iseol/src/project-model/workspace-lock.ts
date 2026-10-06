import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { mkdir, open, readFile, unlink, type FileHandle } from "node:fs/promises";
import { assertProjectModelId } from "./contracts.js";

type ProjectWorkspaceLockRecord = { version: 1; pid: number; token: string; createdAt: string };
export type ProjectWorkspaceLockOptions = { waitForMs?: number; pollIntervalMs?: number };

function lockPath(root: string, projectId: string): string {
  assertProjectModelId(projectId);
  return resolve(root, ".locks", "project-workspaces", `${projectId}.lock`);
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function removeDeadOwnerLock(path: string): Promise<boolean> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<ProjectWorkspaceLockRecord>;
    const pid = value.pid;
    if (value.version !== 1 || typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0 || typeof value.token !== "string" || !value.token) return false;
    if (processIsAlive(pid)) return false;
    await unlink(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    return false;
  }
}

async function removeOwnedLock(path: string, token: string): Promise<void> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<ProjectWorkspaceLockRecord>;
    if (value.version === 1 && value.token === token) await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") return;
  }
}

export async function withDurableProjectWorkspaceLock<T>(
  root: string,
  projectId: string,
  task: () => Promise<T>,
  options: ProjectWorkspaceLockOptions = {},
): Promise<T> {
  const path = lockPath(root, projectId);
  await mkdir(dirname(path), { recursive: true });
  let handle: FileHandle;
  const waitForMs = options.waitForMs ?? 0;
  const pollIntervalMs = Math.max(1, options.pollIntervalMs ?? 10);
  const deadline = Date.now() + Math.max(0, waitForMs);
  while (true) {
    try {
      handle = await open(path, "wx");
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (await removeDeadOwnerLock(path)) continue;
      if (waitForMs <= 0 || Date.now() >= deadline) throw new Error("Project workspace mutation conflict");
      await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, Math.max(1, deadline - Date.now()))));
    }
  }
  const token = randomUUID();
  try {
    await handle.writeFile(JSON.stringify({ version: 1, pid: process.pid, token, createdAt: new Date().toISOString() } satisfies ProjectWorkspaceLockRecord), "utf8");
    return await task();
  } finally {
    await handle.close().catch(() => undefined);
    await removeOwnedLock(path, token);
  }
}

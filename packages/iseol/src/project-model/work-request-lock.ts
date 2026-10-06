import { createHash, randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { mkdir, open, readFile, unlink, type FileHandle } from "node:fs/promises";
import { assertProjectModelId } from "./contracts.js";

type WorkRequestLockRecord = { version: 1; pid: number; token: string; createdAt: string };
export type ProjectWorkRequestLockOptions = { waitForMs?: number; pollIntervalMs?: number };

function lockPath(root: string, projectId: string, idempotencyKey: string): string {
  assertProjectModelId(projectId);
  if (typeof idempotencyKey !== "string" || !idempotencyKey.trim() || idempotencyKey.length > 160) throw new Error("Invalid work request idempotency key");
  const keyHash = createHash("sha256").update(idempotencyKey).digest("hex");
  return resolve(root, ".locks", "work-requests", `${projectId}-${keyHash}.lock`);
}

function runStartLockPath(root: string, projectId: string, workRequestId: string): string {
  assertProjectModelId(projectId);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(workRequestId)) throw new Error("Invalid work request id");
  return resolve(root, ".locks", "work-request-runs", `${projectId}-${workRequestId}.lock`);
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
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<WorkRequestLockRecord>;
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
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<WorkRequestLockRecord>;
    if (value.version === 1 && value.token === token) await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") return;
  }
}

async function withLock<T>(path: string, task: () => Promise<T>, options: ProjectWorkRequestLockOptions): Promise<T> {
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
      const code = (error as NodeJS.ErrnoException).code;
      let contention = code === "EEXIST";
      if (code === "EPERM") {
        try {
          await readFile(path, "utf8");
          contention = true;
        } catch (probeError) {
          const probeCode = (probeError as NodeJS.ErrnoException).code;
          if (probeCode === "ENOENT") {
            if (waitForMs <= 0 || Date.now() >= deadline) throw error;
            await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, Math.max(1, deadline - Date.now()))));
            continue;
          }
          if (probeCode === "EPERM") contention = true;
          else throw probeError;
        }
      }
      if (!contention) throw error;
      if (await removeDeadOwnerLock(path)) continue;
      if (waitForMs <= 0 || Date.now() >= deadline) throw new Error("Work request idempotency conflict");
      await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, Math.max(1, deadline - Date.now()))));
    }
  }
  const token = randomUUID();
  try {
    await handle.writeFile(JSON.stringify({ version: 1, pid: process.pid, token, createdAt: new Date().toISOString() } satisfies WorkRequestLockRecord), "utf8");
    return await task();
  } finally {
    await handle.close().catch(() => undefined);
    await removeOwnedLock(path, token);
  }
}

export function withDurableProjectWorkRequestLock<T>(
  root: string,
  projectId: string,
  idempotencyKey: string,
  task: () => Promise<T>,
  options: ProjectWorkRequestLockOptions = {},
): Promise<T> {
  return withLock(lockPath(root, projectId, idempotencyKey), task, options);
}

export function withDurableProjectWorkRequestRunLock<T>(
  root: string,
  projectId: string,
  workRequestId: string,
  task: () => Promise<T>,
  options: ProjectWorkRequestLockOptions = {},
): Promise<T> {
  return withLock(runStartLockPath(root, projectId, workRequestId), task, options);
}

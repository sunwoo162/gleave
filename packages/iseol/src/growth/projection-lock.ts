import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, unlink, type FileHandle } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertIdentityId } from "../identity/contracts.js";
import { removeOwnedLock } from "../lock-utils.js";

type GrowthProjectionLockRecord = { version: 1; pid: number; token: string; createdAt: string };
export type DurableGrowthProjectionLockOptions = { waitForMs?: number; pollIntervalMs?: number };

function lockPath(root: string, userId: string, eventId: string): string {
  assertIdentityId(userId); assertIdentityId(eventId);
  const digest = createHash("sha256").update(`${userId}:${eventId}:growth-projection`).digest("hex");
  return resolve(root, ".locks", "growth-projections", `${digest}.lock`);
}

function processIsAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}

async function removeDeadOwnerLock(path: string): Promise<boolean> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<GrowthProjectionLockRecord>;
    const pid = value.pid;
    if (value.version !== 1 || typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0 || typeof value.token !== "string" || !value.token) return false;
    if (processIsAlive(pid)) return false;
    await unlink(path); return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    return false;
  }
}

export async function withDurableGrowthProjectionLock<T>(
  root: string,
  userId: string,
  eventId: string,
  task: () => Promise<T>,
  options: DurableGrowthProjectionLockOptions = {},
): Promise<T> {
  const path = lockPath(root, userId, eventId);
  await mkdir(dirname(path), { recursive: true });
  let handle: FileHandle;
  const waitForMs = options.waitForMs ?? 0;
  const pollIntervalMs = Math.max(1, options.pollIntervalMs ?? 10);
  const deadline = Date.now() + Math.max(0, waitForMs);
  while (true) {
    try { handle = await open(path, "wx"); break; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM") {
        try { await readFile(path, "utf8"); }
        catch (probeError) {
          if ((probeError as NodeJS.ErrnoException).code === "ENOENT") {
            if (waitForMs <= 0 || Date.now() >= deadline) throw error;
            await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(pollIntervalMs, Math.max(1, deadline - Date.now()))));
            continue;
          }
          throw probeError;
        }
      } else if (code !== "EEXIST") throw error;
      if (await removeDeadOwnerLock(path)) continue;
      if (waitForMs <= 0 || Date.now() >= deadline) throw new Error("Growth projection concurrency conflict");
      await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(pollIntervalMs, Math.max(1, deadline - Date.now()))));
    }
  }
  const token = randomUUID();
  try {
    await handle.writeFile(JSON.stringify({ version: 1, pid: process.pid, token, createdAt: new Date().toISOString() } satisfies GrowthProjectionLockRecord), "utf8");
    return await task();
  } finally {
    await handle.close().catch(() => undefined);
    await removeOwnedLock(path, token);
  }
}

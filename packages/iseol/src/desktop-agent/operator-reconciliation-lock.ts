import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, unlink, type FileHandle } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { removeOwnedLock } from "../lock-utils.js";

type DesktopOperatorLockRecord = { version: 1; pid: number; token: string; createdAt: string };
export type DurableDesktopOperatorLockOptions = { waitForMs?: number; pollIntervalMs?: number };
export type DesktopOperatorLockScope = "request" | "approval" | "job";

function lockPath(root: string, scope: DesktopOperatorLockScope, identity: string): string {
  const digest = createHash("sha256").update(`desktop-operator:${scope}:${identity}`).digest("hex");
  return resolve(root, ".locks", "desktop-operator-reconciliation", `${digest}.lock`);
}

function processIsAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}

async function removeDeadOwnerLock(path: string): Promise<boolean> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<DesktopOperatorLockRecord>;
    const pid = value.pid;
    if (value.version !== 1 || typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0 || typeof value.token !== "string" || !value.token) return false;
    if (processIsAlive(pid)) return false;
    await unlink(path);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}

export async function withDurableDesktopOperatorLock<T>(
  root: string,
  identity: string,
  task: () => Promise<T>,
  options: DurableDesktopOperatorLockOptions = {},
  scope: DesktopOperatorLockScope = "request",
): Promise<T> {
  const path = lockPath(root, scope, identity);
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
      } else if (code !== "EEXIST") {
        throw error;
      }
      if (await removeDeadOwnerLock(path)) continue;
      if (waitForMs <= 0 || Date.now() >= deadline) throw new Error("Desktop operator reconciliation concurrency conflict");
      await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(pollIntervalMs, Math.max(1, deadline - Date.now()))));
    }
  }
  const token = randomUUID();
  try {
    await handle.writeFile(JSON.stringify({ version: 1, pid: process.pid, token, createdAt: new Date().toISOString() } satisfies DesktopOperatorLockRecord), "utf8");
    return await task();
  } finally {
    await handle.close().catch(() => undefined);
    await removeOwnedLock(path, token);
  }
}

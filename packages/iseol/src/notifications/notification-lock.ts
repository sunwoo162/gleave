import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, unlink, type FileHandle } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type NotificationLockRecord = { version: 1; pid: number; token: string; createdAt: string };
export type DurableNotificationLockOptions = { waitForMs?: number; pollIntervalMs?: number };

function lockPath(root: string, key: string): string {
  if (typeof key !== "string" || !key.trim() || key.length > 320) throw new Error("Invalid notification lock key");
  const digest = createHash("sha256").update(key).digest("hex");
  return resolve(root, ".locks", "notifications", `${digest}.lock`);
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
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<NotificationLockRecord>;
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
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<NotificationLockRecord>;
    if (value.version === 1 && value.token === token) await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") return;
  }
}

export async function withDurableNotificationLock<T>(
  root: string,
  key: string,
  task: () => Promise<T>,
  options: DurableNotificationLockOptions = {},
): Promise<T> {
  const path = lockPath(root, key);
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
      // Windows can report a currently-open exclusive file as EPERM instead of
      // EEXIST. Treat it as contention only after confirming the lock record is
      // still present; unrelated permission failures must remain failures.
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM") {
        try {
          await readFile(path, "utf8");
        } catch (probeError) {
          if ((probeError as NodeJS.ErrnoException).code === "ENOENT") {
            // Windows can briefly retain the failed open result after the
            // competing handle has already closed and removed the lock.
            // With a bounded wait, treat that edge as transient contention.
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
      if (waitForMs <= 0 || Date.now() >= deadline) throw new Error("Notification concurrency conflict");
      await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(pollIntervalMs, Math.max(1, deadline - Date.now()))));
    }
  }
  const token = randomUUID();
  try {
    await handle.writeFile(JSON.stringify({ version: 1, pid: process.pid, token, createdAt: new Date().toISOString() } satisfies NotificationLockRecord), "utf8");
    return await task();
  } finally {
    await handle.close().catch(() => undefined);
    await removeOwnedLock(path, token);
  }
}

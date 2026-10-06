import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { withDurableFileStateLock } from "./file-state-lock.js";

const LOCK_FILE = resolve(process.cwd(), "data", "discord-channel-ensure");
const LOCK_WAIT_MS = 2 * 60 * 1_000;

export function withDiscordChannelEnsureLock<T>(scope: string, task: () => Promise<T>): Promise<T> {
  const digest = createHash("sha256").update(scope).digest("hex");
  return withDurableFileStateLock(`${LOCK_FILE}.${digest}`, task, { waitForMs: LOCK_WAIT_MS, pollIntervalMs: 25 });
}

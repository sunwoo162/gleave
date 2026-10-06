import { rename as fsRename } from "node:fs/promises";

export type AtomicRenameDependencies = {
  rename?: (source: string, target: string) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  baseDelayMs?: number;
};

const TRANSIENT_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);

export async function renameWithTransientRetry(source: string, target: string, deps: AtomicRenameDependencies = {}): Promise<void> {
  const rename = deps.rename ?? fsRename;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const maxAttempts = deps.maxAttempts ?? 5;
  const baseDelayMs = deps.baseDelayMs ?? 5;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error("Atomic rename maxAttempts must be positive");
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try { await rename(source, target); return; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (!TRANSIENT_CODES.has(code) || attempt === maxAttempts) throw error;
      await sleep(baseDelayMs * (2 ** (attempt - 1)));
    }
  }
}

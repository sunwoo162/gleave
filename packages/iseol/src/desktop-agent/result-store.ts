import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { DesktopJobResult } from "./contracts.js";
import { withDurableDesktopJobLock } from "./job-lock.js";
import { sanitizeCredentialText } from "../security/text-safety.js";

const DEFAULT_RETENTION = 256;

function resultPath(root: string, jobId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(jobId)) throw new Error(`Invalid Desktop Job id: ${jobId}`);
  return resolve(root, `${jobId}.json`);
}

function isResult(value: unknown): value is DesktopJobResult {
  if (!value || typeof value !== "object") return false;
  const result = value as DesktopJobResult;
  return Boolean(result)
    && result.version === 1
    && typeof result.jobId === "string"
    && typeof result.runId === "string"
    && typeof result.agentId === "string"
    && typeof result.completedAt === "string"
    && ["completed", "retryable-failure", "blocked-user", "final-failure"].includes(result.status)
    && Array.isArray(result.operations);
}

export function toDurableDesktopResult(result: DesktopJobResult): DesktopJobResult {
  return {
    ...result,
    operations: result.operations.map(({ stdout: _stdout, stderr: _stderr, summary, ...operation }) => ({
      ...operation,
      summary: sanitizeCredentialText(summary),
    })),
  };
}

export async function loadCompletedDesktopResultsUnlocked(root: string): Promise<Map<string, DesktopJobResult>> {
  const results = new Map<string, DesktopJobResult>();
  let names: string[];
  try { names = await readdir(root); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return results;
    throw error;
  }
  for (const name of names.filter((item) => item.endsWith(".json"))) {
    try {
      const value: unknown = JSON.parse(await readFile(resolve(root, name), "utf8"));
      if (isResult(value)) results.set(value.jobId, toDurableDesktopResult(value));
    } catch {
      // A corrupt journal entry is ignored; it must never become executable input.
    }
  }
  return results;
}

async function loadCompletedDesktopResultUnlocked(root: string, jobId: string): Promise<DesktopJobResult | null> {
  try {
    const value: unknown = JSON.parse(await readFile(resultPath(root, jobId), "utf8"));
    return isResult(value) && value.jobId === jobId ? toDurableDesktopResult(value) : null;
  } catch {
    return null;
  }
}

export async function loadCompletedDesktopResults(root: string): Promise<Map<string, DesktopJobResult>> {
  const candidates = await loadCompletedDesktopResultsUnlocked(root);
  const results = new Map<string, DesktopJobResult>();
  for (const jobId of candidates.keys()) {
    const current = await withDurableDesktopJobLock(
      root,
      jobId,
      () => loadCompletedDesktopResultUnlocked(root, jobId),
      { waitForMs: 2_000 },
    );
    if (current) results.set(current.jobId, current);
  }
  return results;
}

async function persistCompletedDesktopResultUnlocked(
  root: string,
  result: DesktopJobResult,
  retention = DEFAULT_RETENTION,
): Promise<void> {
  if (!isResult(result)) throw new Error("Invalid Desktop Job result");
  if (!Number.isInteger(retention) || retention <= 0) throw new Error("Desktop result retention must be positive");
  const path = resultPath(root, result.jobId);
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temp, JSON.stringify(toDurableDesktopResult(result)), "utf8");
  await rename(temp, path);

  const entries = await loadCompletedDesktopResultsUnlocked(root);
  const ordered = [...entries.values()].sort((left, right) => left.completedAt.localeCompare(right.completedAt));
  for (const stale of ordered.slice(0, Math.max(0, ordered.length - retention))) {
    try { await unlink(resultPath(root, stale.jobId)); } catch { /* bounded cleanup is best effort */ }
  }
}

export async function persistCompletedDesktopResult(
  root: string,
  result: DesktopJobResult,
  retention = DEFAULT_RETENTION,
): Promise<void> {
  return withDurableDesktopJobLock(
    root,
    result.jobId,
    () => persistCompletedDesktopResultUnlocked(root, result, retention),
    { waitForMs: 2_000 },
  );
}

import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  HarnessRunEnvelope,
  HarnessRuntimeRunEnvelope,
  HarnessRetryReason,
} from "./contracts.js";
import { createInitialRunState } from "./state-machine.js";
import { appendHarnessRunEventIfAbsent } from "./event-store.js";
import { withDurableHarnessRunLock } from "./run-lock.js";
import { renameWithTransientRetry } from "../desktop-agent/atomic-file.js";

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function assertSafeRunId(runId: string): void {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error(`Invalid Iseol Run id: ${runId}`);
  }
}

function runFile(root: string, runId: string): string {
  assertSafeRunId(runId);
  return resolve(root, runId, "run.json");
}

const runWriteQueues = new Map<string, Promise<unknown>>();

async function serializeRunWrite<T>(root: string, runId: string, action: () => Promise<T>): Promise<T> {
  const key = runFile(root, runId);
  const previous = runWriteQueues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(action);
  runWriteQueues.set(key, current);
  try { return await current; }
  finally { if (runWriteQueues.get(key) === current) runWriteQueues.delete(key); }
}

function normalizeHarnessRunEnvelope(
  envelope: HarnessRunEnvelope,
): HarnessRuntimeRunEnvelope {
  return {
    ...envelope,
    state: envelope.state ?? createInitialRunState(envelope.preflight, envelope.updatedAt),
    evidence: envelope.evidence ?? [],
  };
}

async function writeNormalizedRun(root: string, normalized: HarnessRuntimeRunEnvelope): Promise<void> {
  const destination = runFile(root, normalized.request.runId);
  const directory = resolve(root, normalized.request.runId);
  await mkdir(directory, { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporary, JSON.stringify(normalized, null, 2), "utf8");
  try {
    await renameWithTransientRetry(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch((cleanupError) => {
      if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") throw cleanupError;
    });
    throw error;
  }
}

export async function saveHarnessRunUnlocked(root: string, envelope: HarnessRunEnvelope): Promise<void> {
  const normalized = normalizeHarnessRunEnvelope(envelope);
  await serializeRunWrite(root, normalized.request.runId, () => writeNormalizedRun(root, normalized));
}

export async function saveHarnessRun(root: string, envelope: HarnessRunEnvelope): Promise<void> {
  const normalized = normalizeHarnessRunEnvelope(envelope);
  await serializeRunWrite(root, normalized.request.runId, () => withDurableHarnessRunLock(
    root,
    normalized.request.runId,
    () => writeNormalizedRun(root, normalized),
    { waitForMs: 2_000 },
  ));
}

export async function loadHarnessRunUnlocked(
  root: string,
  runId: string,
): Promise<HarnessRuntimeRunEnvelope | null> {
  const path = runFile(root, runId);
  try {
    const content = await readFile(path, "utf8");
    return normalizeHarnessRunEnvelope(JSON.parse(content) as HarnessRunEnvelope);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function loadHarnessRun(
  root: string,
  runId: string,
): Promise<HarnessRuntimeRunEnvelope | null> {
  return withDurableHarnessRunLock(
    root,
    runId,
    () => loadHarnessRunUnlocked(root, runId),
    { waitForMs: 2_000 },
  );
}

export async function listHarnessRuns(root: string): Promise<HarnessRuntimeRunEnvelope[]> {
  let entries: string[];
  try { entries = await readdir(root); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const runs: HarnessRuntimeRunEnvelope[] = [];
  for (const entry of entries) {
    const run = await loadHarnessRun(root, entry).catch(() => null);
    if (run) runs.push(run);
  }
  return runs;
}

export type HarnessRunRetryResult =
  | { status: "accepted"; run: HarnessRuntimeRunEnvelope }
  | { status: "already-active"; run: HarnessRuntimeRunEnvelope }
  | { status: "not-allowed"; reason: string };

export async function requestHarnessRunRetry(
  root: string,
  runId: string,
  input: { retryReason: HarnessRetryReason; actor: "operator" | "user"; requestedAt: string },
): Promise<HarnessRunRetryResult> {
  return serializeRunWrite(root, runId, () =>
    withDurableHarnessRunLock(root, runId, async () => {
      const current = await loadHarnessRunUnlocked(root, runId);
      if (!current) return { status: "not-allowed", reason: "Run not found" };
      if (current.retry?.status === "active") return { status: "already-active", run: current };
      if (current.state.status !== "FAILED_FINAL") return { status: "not-allowed", reason: "Run is not terminal FAILED_FINAL" };
      const cycle = (current.retry?.cycle ?? 0) + 1;
      const next: HarnessRuntimeRunEnvelope = {
        ...current,
        retry: {
          version: 1,
          cycle,
          requestedFromState: "FAILED_FINAL",
          requestedStage: current.state.stage,
          retryReason: input.retryReason,
          requestedAt: input.requestedAt,
          actor: input.actor,
          status: "active",
        },
        state: { ...current.state, status: "READY", updatedAt: input.requestedAt },
        updatedAt: input.requestedAt,
      };
      await writeNormalizedRun(root, next);
      await appendHarnessRunEventIfAbsent(root, {
        version: 1,
        id: `retry-requested-${runId}-${cycle}`,
        runId,
        type: "retry-requested",
        at: input.requestedAt,
        stage: current.state.stage,
        status: "READY",
        summary: `Retry cycle ${cycle} requested for ${current.state.stage}`,
      });
      return { status: "accepted", run: next };
    }, { waitForMs: 2_000 }),
  );
}

export async function saveHarnessRunIfUnchanged(
  root: string,
  expected: HarnessRunEnvelope,
  next: HarnessRunEnvelope,
): Promise<boolean> {
  const expectedRun = normalizeHarnessRunEnvelope(expected);
  const nextRun = normalizeHarnessRunEnvelope(next);
  if (expectedRun.request.runId !== nextRun.request.runId) {
    throw new Error("Harness Run compare-and-save runId mismatch");
  }
  return serializeRunWrite(root, expectedRun.request.runId, () =>
    withDurableHarnessRunLock(
      root,
      expectedRun.request.runId,
      () => saveHarnessRunIfUnchangedUnlocked(root, expectedRun, nextRun),
      { waitForMs: 2_000 },
    ),
  );
}

export async function saveHarnessRunIfUnchangedUnlocked(
  root: string,
  expectedRun: HarnessRuntimeRunEnvelope,
  nextRun: HarnessRuntimeRunEnvelope,
): Promise<boolean> {
  const current = await loadHarnessRunUnlocked(root, expectedRun.request.runId);
  if (!current || JSON.stringify(current) !== JSON.stringify(expectedRun)) return false;
  await writeNormalizedRun(root, nextRun);
  return true;
}

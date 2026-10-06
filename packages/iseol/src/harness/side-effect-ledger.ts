import { createHash, randomBytes } from "node:crypto";
import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  HarnessSideEffectKind,
  HarnessSideEffectReceipt,
} from "./contracts.js";
import { assertSafeRunId } from "./run-store.js";
import { renameWithTransientRetry, type AtomicRenameDependencies } from "../desktop-agent/atomic-file.js";
import { withDurableHarnessRunEventLock } from "./event-lock.js";

export type ReserveHarnessSideEffectInput = {
  runId: string;
  key: string;
  kind: HarnessSideEffectKind;
  at: string;
};

export type HarnessSideEffectReservation = {
  outcome: "reserved" | "in-progress" | "completed";
  receipt: HarnessSideEffectReceipt;
};

function assertKey(key: string): void {
  if (!key.trim()) throw new Error("Harness side-effect key is required");
}

function effectFile(root: string, runId: string, key: string): string {
  assertSafeRunId(runId);
  assertKey(key);
  const digest = createHash("sha256").update(key).digest("hex");
  return resolve(root, runId, "effects", `${digest}.json`);
}export type CompleteHarnessSideEffectInput = {
  runId: string;
  key: string;
  at: string;
  externalReference?: string;
  summary?: string;
};

export type CompleteHarnessSideEffectDependencies = AtomicRenameDependencies;

async function readReceipt(path: string): Promise<HarnessSideEffectReceipt | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as HarnessSideEffectReceipt;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function replaceReceipt(
  path: string,
  receipt: HarnessSideEffectReceipt,
  deps: CompleteHarnessSideEffectDependencies = {},
): Promise<void> {
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporary, JSON.stringify(receipt, null, 2), "utf8");
  try {
    await renameWithTransientRetry(temporary, path, deps);
  } catch (error) {
    try { await unlink(temporary); }
    catch (cleanupError) {
      if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") throw cleanupError;
    }
    throw error;
  }
}
async function loadHarnessSideEffectUnlocked(
  root: string,
  runId: string,
  key: string,
): Promise<HarnessSideEffectReceipt | null> {
  return readReceipt(effectFile(root, runId, key));
}

export async function loadHarnessSideEffect(
  root: string,
  runId: string,
  key: string,
): Promise<HarnessSideEffectReceipt | null> {
  return withDurableHarnessRunEventLock(
    root,
    runId,
    () => loadHarnessSideEffectUnlocked(root, runId, key),
    { waitForMs: 2_000 },
  );
}

async function reserveHarnessSideEffectUnlocked(
  root: string,
  input: ReserveHarnessSideEffectInput,
): Promise<HarnessSideEffectReservation> {
  const path = effectFile(root, input.runId, input.key);
  await mkdir(resolve(root, input.runId, "effects"), { recursive: true });
  const receipt: HarnessSideEffectReceipt = {
    version: 1,
    runId: input.runId,
    key: input.key,
    kind: input.kind,
    status: "reserved",
    reservedAt: input.at,
  };

  try {
    const handle = await open(path, "wx");
    try {
      await handle.writeFile(JSON.stringify(receipt, null, 2), "utf8");
    } finally {
      await handle.close();
    }
    return { outcome: "reserved", receipt };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await readReceipt(path);
    if (!existing) throw new Error(`Harness side-effect receipt disappeared: ${input.key}`);
    if (existing.kind !== input.kind || existing.key !== input.key) {
      throw new Error(`Harness side-effect receipt mismatch: ${input.key}`);
    }
    return {
      outcome: existing.status === "completed" ? "completed" : "in-progress",
      receipt: existing,
    };
  }
}

export async function reserveHarnessSideEffect(
  root: string,
  input: ReserveHarnessSideEffectInput,
): Promise<HarnessSideEffectReservation> {
  return withDurableHarnessRunEventLock(
    root,
    input.runId,
    () => reserveHarnessSideEffectUnlocked(root, input),
    { waitForMs: 2_000 },
  );
}

async function completeHarnessSideEffectUnlocked(
  root: string,
  input: CompleteHarnessSideEffectInput,
  deps: CompleteHarnessSideEffectDependencies = {},
): Promise<HarnessSideEffectReceipt> {
  const path = effectFile(root, input.runId, input.key);
  const existing = await readReceipt(path);
  if (!existing) throw new Error(`Harness side-effect is not reserved: ${input.key}`);
  if (existing.status === "completed") return existing;

  const completed: HarnessSideEffectReceipt = {
    ...existing,
    status: "completed",
    completedAt: input.at,
    ...(input.externalReference === undefined ? {} : { externalReference: input.externalReference }),
    ...(input.summary === undefined ? {} : { summary: input.summary }),
  };
  await replaceReceipt(path, completed, deps);
  return completed;
}

export async function completeHarnessSideEffect(
  root: string,
  input: CompleteHarnessSideEffectInput,
  deps: CompleteHarnessSideEffectDependencies = {},
): Promise<HarnessSideEffectReceipt> {
  return withDurableHarnessRunEventLock(
    root,
    input.runId,
    () => completeHarnessSideEffectUnlocked(root, input, deps),
    { waitForMs: 2_000 },
  );
}

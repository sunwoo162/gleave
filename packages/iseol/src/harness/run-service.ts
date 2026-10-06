import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import type {
  DevelopmentRunRequest,
  HarnessRuntimeRunEnvelope,
} from "./contracts.js";
import { prepareDevelopmentRun } from "./preflight.js";
import { appendHarnessRunEvent, saveHarnessCheckpoint } from "./event-store.js";
import { loadHarnessRunUnlocked, saveHarnessRunUnlocked, saveHarnessRunIfUnchangedUnlocked } from "./run-store.js";
import { withDurableHarnessRunLock } from "./run-lock.js";
import { createInitialRunState, transitionRunState } from "./state-machine.js";

export type CreateDevelopmentRunOptions = {
  iseolRoot: string;
  storeRoot: string;
  loadedAt?: string;
  policyRoot?: string;
};

async function createDevelopmentRunUnlocked(
  request: DevelopmentRunRequest,
  options: CreateDevelopmentRunOptions,
): Promise<HarnessRuntimeRunEnvelope> {
  const preflight = await prepareDevelopmentRun(request, {
    iseolRoot: options.iseolRoot,
    loadedAt: options.loadedAt,
    policyRoot: options.policyRoot,
  });
  const now = options.loadedAt ?? new Date().toISOString();

  const envelope: HarnessRuntimeRunEnvelope = {
    version: 1,
    request,
    preflight,
    state: createInitialRunState(preflight, now),
    evidence: [],
    updatedAt: now,
  };

  await saveHarnessRunUnlocked(options.storeRoot, envelope);
  return envelope;
}

export async function createDevelopmentRun(
  request: DevelopmentRunRequest,
  options: CreateDevelopmentRunOptions,
): Promise<HarnessRuntimeRunEnvelope> {
  return withDurableHarnessRunLock(
    options.storeRoot,
    request.runId,
    () => createDevelopmentRunUnlocked(request, options),
    { waitForMs: 2_000 },
  );
}

export type RefreshDevelopmentRunPreflightOptions = {
  iseolRoot: string;
  storeRoot: string;
  runId: string;
  loadedAt?: string;
};

async function refreshDevelopmentRunPreflightUnlocked(
  options: RefreshDevelopmentRunPreflightOptions,
): Promise<HarnessRuntimeRunEnvelope> {
  const run = await loadHarnessRunUnlocked(options.storeRoot, options.runId);
  if (!run) throw new Error(`Harness Run not found: ${options.runId}`);
  if (run.state.stage !== "CONTEXT" || run.state.status !== "READY") {
    throw new Error(`Harness preflight refresh requires READY CONTEXT, got ${run.state.status} ${run.state.stage}`);
  }
  const target = await stat(run.request.targetRoot);
  if (!target.isDirectory()) throw new Error(`Development Run targetRoot is not a directory: ${run.request.targetRoot}`);
  const at = options.loadedAt ?? new Date().toISOString();
  const preflight = await prepareDevelopmentRun(run.request, { iseolRoot: options.iseolRoot, loadedAt: at });
  const state: HarnessRuntimeRunEnvelope["state"] = preflight.status === "ready"
    ? { ...run.state, updatedAt: at }
    : { version: 1, stage: "PREFLIGHT", status: "BLOCKED_USER", completedStages: [], skippedStages: [], updatedAt: at, reason: preflight.reason ?? "Harness preflight refresh blocked" };
  const refreshed: HarnessRuntimeRunEnvelope = { ...run, preflight, state, updatedAt: at };
  await saveHarnessRunUnlocked(options.storeRoot, refreshed);
  return refreshed;
}

export async function refreshDevelopmentRunPreflight(
  options: RefreshDevelopmentRunPreflightOptions,
): Promise<HarnessRuntimeRunEnvelope> {
  return withDurableHarnessRunLock(
    options.storeRoot,
    options.runId,
    () => refreshDevelopmentRunPreflightUnlocked(options),
    { waitForMs: 2_000 },
  );
}

/**
 * Moves a user-owned waiting Run back to READY without changing its durable
 * identity or stage. The Runtime supervisor remains responsible for starting
 * the READY Run and completing the stage.
 */
async function resumeHarnessRunUnlocked(
  storeRoot: string,
  runId: string,
  at: string,
): Promise<HarnessRuntimeRunEnvelope> {
  const current = await loadHarnessRunUnlocked(storeRoot, runId);
  if (!current) throw new Error(`Harness Run not found: ${runId}`);
  const resumed: HarnessRuntimeRunEnvelope = {
    ...current,
    state: transitionRunState(current.state, { type: "resume", at }),
    updatedAt: at,
  };
  if (!await saveHarnessRunIfUnchangedUnlocked(storeRoot, current, resumed)) {
    throw new Error(`Harness Run changed before resume: ${runId}`);
  }
  await appendHarnessRunEvent(storeRoot, {
    version: 1,
    id: randomUUID(),
    runId,
    type: "status-changed",
    at,
    stage: resumed.state.stage,
    status: resumed.state.status,
    summary: "User project owner resumed the waiting Run",
  });
  await saveHarnessCheckpoint(storeRoot, {
    version: 1,
    id: randomUUID(),
    runId,
    recordedAt: at,
    state: resumed.state,
    evidence: resumed.evidence,
    summary: "User project owner resumed the waiting Run",
  });
  return resumed;
}

export async function resumeHarnessRun(
  storeRoot: string,
  runId: string,
  at: string,
): Promise<HarnessRuntimeRunEnvelope> {
  return withDurableHarnessRunLock(
    storeRoot,
    runId,
    () => resumeHarnessRunUnlocked(storeRoot, runId, at),
    { waitForMs: 2_000 },
  );
}

/**
 * Persists an owner/operator pause checkpoint without changing the durable Run
 * identity. A supervisor that is already inside an executor must re-read this
 * checkpoint before applying that executor's result.
 */
async function pauseHarnessRunUnlocked(
  storeRoot: string,
  runId: string,
  at: string,
  reason = "Run paused at the user checkpoint",
): Promise<HarnessRuntimeRunEnvelope> {
  const current = await loadHarnessRunUnlocked(storeRoot, runId);
  if (!current) throw new Error(`Harness Run not found: ${runId}`);
  const paused: HarnessRuntimeRunEnvelope = {
    ...current,
    state: transitionRunState(current.state, { type: "pause", at, reason }),
    updatedAt: at,
  };
  if (!await saveHarnessRunIfUnchangedUnlocked(storeRoot, current, paused)) {
    throw new Error(`Harness Run changed before pause: ${runId}`);
  }
  await appendHarnessRunEvent(storeRoot, {
    version: 1,
    id: randomUUID(),
    runId,
    type: "status-changed",
    at,
    stage: paused.state.stage,
    status: paused.state.status,
    summary: reason,
  });
  await saveHarnessCheckpoint(storeRoot, {
    version: 1,
    id: randomUUID(),
    runId,
    recordedAt: at,
    state: paused.state,
    evidence: paused.evidence,
    summary: reason,
  });
  return paused;
}

export async function pauseHarnessRun(
  storeRoot: string,
  runId: string,
  at: string,
  reason = "Run paused at the user checkpoint",
): Promise<HarnessRuntimeRunEnvelope> {
  return withDurableHarnessRunLock(
    storeRoot,
    runId,
    () => pauseHarnessRunUnlocked(storeRoot, runId, at, reason),
    { waitForMs: 2_000 },
  );
}

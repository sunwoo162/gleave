import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { removeOwnedLock } from "../lock-utils.js";
import { sanitizeCredentialText } from "../security/text-safety.js";
import { assertProjectModelId } from "./contracts.js";
import { renameWithTransientRetry } from "../desktop-agent/atomic-file.js";
import { withDurableProjectWorkRequestLock } from "./work-request-lock.js";

export type ProjectWorkRequestStatus = "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled";
export type ProjectWorkRequest = {
  version: 1;
  id: string;
  projectId: string;
  title: string;
  objective: string;
  nodeId?: string;
  dependencies?: string[];
  claimOwner?: string;
  claimAt?: string;
  requestedRunId?: string;
  executionRequestId?: string;
  status: ProjectWorkRequestStatus;
  idempotencyKey: string;
  runId?: string;
  attempts: number;
  blocker?: string;
  createdAt: string;
  updatedAt: string;
};

const statuses = new Set<ProjectWorkRequestStatus>(["queued", "running", "waiting", "completed", "failed", "cancelled"]);
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const workRequestWriteQueues = new Map<string, Promise<unknown>>();

async function serializeWorkRequestWrite<T>(path: string, action: () => Promise<T>): Promise<T> {
  const previous = workRequestWriteQueues.get(path) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(action);
  workRequestWriteQueues.set(path, current);
  try { return await current; }
  finally { if (workRequestWriteQueues.get(path) === current) workRequestWriteQueues.delete(path); }
}

function requestFile(root: string, projectId: string, id: string): string {
  assertProjectModelId(projectId);
  if (!idPattern.test(id)) throw new Error(`Invalid work request id: ${id}`);
  return resolve(root, "work-requests", projectId, `${id}.json`);
}

function validate(value: ProjectWorkRequest): void {
  if (value.version !== 1) throw new Error("Unsupported work request version");
  assertProjectModelId(value.id);
  assertProjectModelId(value.projectId);
  if (!value.title.trim() || !value.objective.trim() || !value.idempotencyKey.trim()) throw new Error("Work request title, objective and idempotencyKey are required");
  if (!statuses.has(value.status)) throw new Error(`Invalid work request status: ${value.status}`);
  if (!Number.isInteger(value.attempts) || value.attempts < 0) throw new Error("Invalid work request attempts");
  if (value.dependencies) {
    if (new Set(value.dependencies).size !== value.dependencies.length || value.dependencies.some((id) => !idPattern.test(id) || id === value.id)) {
      throw new Error("Invalid work request dependencies");
    }
  }
}

export async function saveProjectWorkRequest(root: string, request: ProjectWorkRequest): Promise<void> {
  validate(request);
  const path = requestFile(root, request.projectId, request.id);
  await withDurableProjectWorkRequestLock(root, request.projectId, `record:${request.id}`, () => serializeWorkRequestWrite(path, async () => {
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    await writeFile(temp, JSON.stringify(request, null, 2), "utf8");
    try {
      await renameWithTransientRetry(temp, path);
    } catch (error) {
      await unlink(temp).catch((cleanupError) => {
        if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") throw cleanupError;
      });
      throw error;
    }
  }), { waitForMs: 2_000 });
}

export async function loadProjectWorkRequestUnlocked(root: string, projectId: string, id: string): Promise<ProjectWorkRequest | null> {
  try {
    const request = JSON.parse(await readFile(requestFile(root, projectId, id), "utf8")) as ProjectWorkRequest;
    validate(request);
    return request;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function loadProjectWorkRequest(root: string, projectId: string, id: string): Promise<ProjectWorkRequest | null> {
  return withDurableProjectWorkRequestLock(
    root,
    projectId,
    `record:${id}`,
    () => loadProjectWorkRequestUnlocked(root, projectId, id),
    { waitForMs: 2_000 },
  );
}

export async function listProjectWorkRequests(root: string, projectId: string): Promise<ProjectWorkRequest[]> {
  const directory = resolve(root, "work-requests", projectId);
  let names: string[];
  try { names = await readdir(directory); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const result: ProjectWorkRequest[] = [];
  for (const name of names.filter((item) => item.endsWith(".json"))) {
    const id = name.slice(0, -5);
    if (!idPattern.test(id)) continue;
    const request = await withDurableProjectWorkRequestLock(
      root,
      projectId,
      `record:${id}`,
      () => loadProjectWorkRequestUnlocked(root, projectId, id),
      { waitForMs: 2_000 },
    );
    if (request) result.push(request);
  }
  return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export async function createProjectWorkRequest(input: {
  root: string; projectId: string; title: string; objective: string; idempotencyKey: string; nodeId?: string; dependencies?: string[]; at: string; id?: string;
}): Promise<{ request: ProjectWorkRequest; created: boolean }> {
  return withDurableProjectWorkRequestLock(input.root, input.projectId, input.idempotencyKey, async () => {
    const dependencies = input.dependencies ?? [];
    if (new Set(dependencies).size !== dependencies.length || dependencies.includes(input.id ?? "")) throw new Error("invalid work request dependency graph");
    if (dependencies.length) {
      const knownIds = new Set((await listProjectWorkRequests(input.root, input.projectId)).map((item) => item.id));
      const missing = dependencies.filter((dependency) => !knownIds.has(dependency));
      if (missing.length) throw new Error(`unknown work request dependency: ${missing.join(", ")}`);
    }
    const existing = (await listProjectWorkRequests(input.root, input.projectId)).find((item) => item.idempotencyKey === input.idempotencyKey);
    if (existing) {
      if (existing.title !== input.title || existing.objective !== input.objective || (input.nodeId !== undefined && existing.nodeId !== input.nodeId) || JSON.stringify(existing.dependencies ?? []) !== JSON.stringify(input.dependencies ?? [])) throw new Error("work request idempotency conflict");
      return { request: existing, created: false };
    }
    const request: ProjectWorkRequest = {
      version: 1,
      id: input.id ?? `work-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`,
      projectId: input.projectId,
      title: input.title,
      objective: input.objective,
      ...(input.nodeId ? { nodeId: input.nodeId } : {}),
      ...(dependencies.length ? { dependencies: [...dependencies] } : {}),
      status: "queued",
      idempotencyKey: input.idempotencyKey,
      attempts: 0,
      createdAt: input.at,
      updatedAt: input.at,
    };
    await saveProjectWorkRequest(input.root, request);
    return { request, created: true };
  }, { waitForMs: 2_000 });
}

export type ProjectWorkRequestExecutionResult = {
  status: "started" | "already-active" | "waiting" | "failed" | "in-progress" | "not-claimable";
  request: ProjectWorkRequest | null;
  runId?: string;
  blocker?: string;
};

export async function executeProjectWorkRequest(input: {
  root: string;
  projectId: string;
  id: string;
  runId: string;
  at: string;
  execute: (request: ProjectWorkRequest) => Promise<{ runId: string; status: "created" | "already-active" | "not-configured" }>;
}): Promise<ProjectWorkRequestExecutionResult> {
  const current = await loadProjectWorkRequest(input.root, input.projectId, input.id);
  if (!current) return { status: "not-claimable", request: null, blocker: "work request not found" };
  if (current.status === "running" && current.runId) return { status: "in-progress", request: current, runId: current.runId };
  if (current.status !== "queued") return { status: "not-claimable", request: current, blocker: `request is ${current.status}` };
  const dependencies = current.dependencies ?? [];
  if (dependencies.length) {
    const requests = await listProjectWorkRequests(input.root, input.projectId);
    const byId = new Map(requests.map((item) => [item.id, item]));
    const missing = dependencies.filter((dependency) => byId.get(dependency)?.status !== "completed");
    if (missing.length) return { status: "waiting", request: current, blocker: `dependencies incomplete: ${missing.join(", ")}` };
  }
  const claimed = await claimProjectWorkRequest(input.root, input.projectId, input.id, input.at);
  if (!claimed) return { status: "not-claimable", request: await loadProjectWorkRequest(input.root, input.projectId, input.id), blocker: "request was claimed by another worker or is no longer queued" };
  try {
    const intent = await updateProjectWorkRequest(input.root, input.projectId, input.id, {
      requestedRunId: input.runId,
      executionRequestId: `${input.projectId}:${input.id}:${input.runId}`,
    }, input.at);
    if (!intent) return { status: "not-claimable", request: claimed, blocker: "work request intent could not be persisted" };
    const execution = await input.execute(claimed);
    const nextStatus = execution.status === "not-configured" ? "waiting" : "running";
    const updated = await updateProjectWorkRequest(input.root, input.projectId, input.id, {
      status: nextStatus,
      runId: execution.runId,
      ...(execution.status === "not-configured" ? { blocker: "Project Runtime is not configured" } : {}),
    }, input.at);
    return { status: execution.status === "not-configured" ? "waiting" : execution.status === "created" ? "started" : "already-active", request: updated ?? claimed, runId: execution.runId, ...(execution.status === "not-configured" ? { blocker: "Project Runtime is not configured" } : {}) };
  } catch (error) {
    const blocker = error instanceof Error ? sanitizeCredentialText(error.message, 240) : "work request execution failed";
    const updated = await updateProjectWorkRequest(input.root, input.projectId, input.id, { status: "failed", blocker }, input.at);
    return { status: "failed", request: updated ?? claimed, blocker };
  }
}

export async function claimProjectWorkRequest(root: string, projectId: string, id: string, at: string): Promise<ProjectWorkRequest | null> {
  const path = requestFile(root, projectId, id);
  const lockPath = `${path}.claim-lock`;
  let handle;
  try { handle = await open(lockPath, "wx"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return null;
    throw error;
  }
  const token = randomUUID();
  try {
    await handle.writeFile(JSON.stringify({ version: 1, pid: process.pid, token, createdAt: new Date().toISOString() }), "utf8");
    const current = await loadProjectWorkRequest(root, projectId, id);
    if (!current || current.status !== "queued") return null;
    const next = { ...current, status: "running" as const, attempts: current.attempts + 1, claimOwner: `pid:${process.pid}`, claimAt: at, updatedAt: at };
    await saveProjectWorkRequest(root, next);
    return next;
  } finally {
    await handle.close();
    await removeOwnedLock(lockPath, token);
  }
}

export function projectWorkRequestRevision(request: ProjectWorkRequest): string {
  return `${request.updatedAt}:${request.attempts}`;
}

export type ProjectWorkRequestReconciliation = {
  request: ProjectWorkRequest;
  revision: string;
  execution: "not-started" | "run-found" | "unknown" | "terminal";
  run?: { runId: string; stage: string; status: string; updatedAt: string };
  blocker?: string;
};

export type ProjectWorkRequestProjection = {
  request: ProjectWorkRequest;
  revision: string;
  execution: "run-found" | "unknown" | "terminal";
  transition: "updated" | "already-running" | "already-waiting" | "already-completed" | "already-failed" | "already-cancelled" | "unknown";
  run?: { runId: string; stage: string; status: string; updatedAt: string };
  blocker?: string;
};

function workStatusForRun(status: string): ProjectWorkRequestStatus {
  if (status === "DONE") return "completed";
  if (status === "FAILED_FINAL") return "failed";
  if (status === "CANCELLED") return "cancelled";
  if (status === "WAITING_EXTERNAL" || status === "WAITING_AGENT" || status === "BLOCKED_USER" || status === "PAUSED") return "waiting";
  return "running";
}

function alreadyProjected(status: ProjectWorkRequestStatus): ProjectWorkRequestProjection["transition"] {
  return `already-${status}` as ProjectWorkRequestProjection["transition"];
}

async function reconcileProjectWorkRequestUnlocked(input: {
  root: string;
  projectId: string;
  workId: string;
  at: string;
  findRun: (runId: string) => Promise<{ runId: string; projectId?: string; state: { stage: string; status: string; reason?: string }; updatedAt: string } | null>;
}): Promise<ProjectWorkRequestProjection | null> {
  const request = await loadProjectWorkRequest(input.root, input.projectId, input.workId);
  if (!request) return null;
  if (!request.requestedRunId) {
    return { request, revision: projectWorkRequestRevision(request), execution: "unknown", transition: "unknown", blocker: "work request has no durable Run identity" };
  }
  const run = await input.findRun(request.requestedRunId);
  if (!run) {
    return { request, revision: projectWorkRequestRevision(request), execution: "unknown", transition: "unknown", blocker: "requested Run identity has no durable Run record" };
  }
  if (run.projectId !== undefined && run.projectId !== input.projectId) {
    return { request, revision: projectWorkRequestRevision(request), execution: "unknown", transition: "unknown", blocker: "requested Run project identity mismatch" };
  }
  if (run.runId !== request.requestedRunId) {
    return { request, revision: projectWorkRequestRevision(request), execution: "unknown", transition: "unknown", blocker: "requested Run identity mismatch" };
  }

  const runView = { runId: run.runId, stage: run.state.stage, status: run.state.status, updatedAt: run.updatedAt };
  const nextStatus = workStatusForRun(run.state.status);
  const terminalRun = ["DONE", "FAILED_FINAL", "CANCELLED"].includes(run.state.status);
  const terminalRequest = ["completed", "failed", "cancelled"].includes(request.status);
  const sanitizeExistingFailure = async (): Promise<ProjectWorkRequest> => {
    if (request.status !== "failed" || !request.blocker) return request;
    const blocker = sanitizeCredentialText(request.blocker, 240);
    if (blocker === request.blocker) return request;
    return await withDurableProjectWorkRequestLock(input.root, input.projectId, `update:${input.workId}`, async () => {
      const current = await loadProjectWorkRequest(input.root, input.projectId, input.workId);
      if (!current) return { ...request, blocker };
      const unchanged = projectWorkRequestRevision(current) === projectWorkRequestRevision(request)
        && current.status === request.status
        && current.runId === request.runId
        && current.requestedRunId === request.requestedRunId
        && current.executionRequestId === request.executionRequestId
        && current.blocker === request.blocker;
      if (!unchanged) return current;
      const next = { ...current, blocker, updatedAt: input.at };
      await saveProjectWorkRequest(input.root, next);
      return next;
    }, { waitForMs: 2_000 });
  };
  // A failed request may be deliberately reopened by the owner retry path before
  // the same durable Run reaches DONE. Preserve other terminal request states
  // against late observations, especially completed -> failed.
  if (terminalRequest && request.status !== nextStatus && !(request.status === "failed" && nextStatus === "completed")) {
    const safeRequest = await sanitizeExistingFailure();
    return { request: safeRequest, revision: projectWorkRequestRevision(safeRequest), run: runView, execution: terminalRun ? "terminal" : "run-found", transition: alreadyProjected(safeRequest.status) };
  }
  if (request.status === nextStatus) {
    const safeRequest = await sanitizeExistingFailure();
    return { request: safeRequest, revision: projectWorkRequestRevision(safeRequest), run: runView, execution: terminalRun ? "terminal" : "run-found", transition: alreadyProjected(safeRequest.status) };
  }

  const failureBlocker = sanitizeCredentialText(run.state.reason ?? `Harness Run is ${run.state.status}`, 240);
  const updated = await updateProjectWorkRequest(input.root, input.projectId, input.workId, {
    status: nextStatus,
    runId: run.runId,
    blocker: nextStatus === "waiting"
      ? `Harness Run is ${run.state.status}`
      : nextStatus === "failed"
        ? failureBlocker
        : undefined,
  }, input.at);
  return {
    request: updated ?? request,
    revision: projectWorkRequestRevision(updated ?? request),
    run: runView,
    execution: terminalRun ? "terminal" : "run-found",
    transition: "updated",
    ...(nextStatus === "waiting" ? { blocker: `Harness Run is ${run.state.status}` } : nextStatus === "failed" ? { blocker: failureBlocker } : {}),
  };
}

export function reconcileProjectWorkRequest(input: Parameters<typeof reconcileProjectWorkRequestUnlocked>[0]) {
  return withDurableProjectWorkRequestLock(input.root, input.projectId, `reconcile:${input.workId}`, () => reconcileProjectWorkRequestUnlocked(input), { waitForMs: 2_000 });
}

export async function inspectProjectWorkRequest(
  root: string,
  projectId: string,
  id: string,
  findRun?: (runId: string) => Promise<{ runId: string; state: { stage: string; status: string }; updatedAt: string } | null>,
): Promise<ProjectWorkRequestReconciliation | null> {
  const request = await loadProjectWorkRequest(root, projectId, id);
  if (!request) return null;
  const revision = projectWorkRequestRevision(request);
  if (!request.requestedRunId) {
    return { request, revision, execution: request.status === "running" ? "unknown" : "not-started", ...(request.status === "running" ? { blocker: "claimed execution has no durable Run identity" } : {}) };
  }
  const run = findRun ? await findRun(request.requestedRunId) : null;
  if (!run) return { request, revision, execution: "unknown", blocker: "requested Run identity has no durable Run record" };
  const terminal = ["DONE", "FAILED_FINAL", "CANCELLED"].includes(run.state.status);
  return { request, revision, execution: terminal ? "terminal" : "run-found", run: { runId: run.runId, stage: run.state.stage, status: run.state.status, updatedAt: run.updatedAt } };
}

/**
 * Explicit scheduler for callers that already hold execution permission. It
 * only selects queued requests whose dependencies are completed; it is never
 * invoked implicitly during Runtime startup or recovery.
 */
export async function scheduleProjectWorkRequests(input: {
  root: string;
  projectId: string;
  at: string;
  maxConcurrent?: number;
  execute: (request: ProjectWorkRequest) => Promise<{ runId: string; status: "created" | "already-active" | "not-configured" }>;
}): Promise<ProjectWorkRequestExecutionResult[]> {
  const limit = Math.max(1, Math.floor(input.maxConcurrent ?? 1));
  const requests = await listProjectWorkRequests(input.root, input.projectId);
  const byId = new Map(requests.map((item) => [item.id, item]));
  const runnable = requests.filter((request) => request.status === "queued" && (request.dependencies ?? []).every((dependency) => byId.get(dependency)?.status === "completed"));
  const selected = runnable.slice(0, limit);
  return Promise.all(selected.map((request) => executeProjectWorkRequest({
    root: input.root,
    projectId: input.projectId,
    id: request.id,
    runId: `project-${input.projectId}-${request.id}`,
    at: input.at,
    execute: input.execute,
  })));
}

export async function updateProjectWorkRequest(root: string, projectId: string, id: string, patch: Partial<Pick<ProjectWorkRequest, "status" | "runId" | "nodeId" | "blocker" | "requestedRunId" | "executionRequestId">>, at: string): Promise<ProjectWorkRequest | null> {
  return withDurableProjectWorkRequestLock(root, projectId, `update:${id}`, async () => {
    const current = await loadProjectWorkRequest(root, projectId, id);
    if (!current) return null;
    const next = { ...current, ...patch, updatedAt: at };
    await saveProjectWorkRequest(root, next);
    return next;
  }, { waitForMs: 2_000 });
}

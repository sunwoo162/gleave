import { randomBytes } from "node:crypto";
import type { Dirent } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { DesktopJobResult, DesktopTaskPack } from "./contracts.js";
import { assertDesktopTaskPack } from "./contracts.js";
import { withDurableDesktopJobLock } from "./job-lock.js";

export type DesktopJobLease = {
  owner: string;
  acquiredAt: string;
  expiresAt: string;
};

export type DesktopJobRecord = {
  version: 1;
  jobId: string;
  runId: string;
  stage: DesktopTaskPack["stage"];
  idempotencyKey: string;
  pack: DesktopTaskPack;
  status: "pending" | "leased" | "indeterminate" | "completed" | "cancelled";
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lease?: DesktopJobLease;
  result?: DesktopJobResult;
};

export type DesktopJobContainmentRecord = {
  version: 1;
  jobId: string;
  runId: string;
  idempotencyKey: string;
  attempt: number;
  originalStatus: DesktopJobRecord["status"];
  mutationRisk: "mutation-uncertain" | "read-only-uncertain";
  reason: "execution-uncertain";
  operationId: string;
  approvalId?: string;
  actor: "operator";
  expectedRevision: string;
  containedAt: string;
};

export type DesktopJobContainmentInput = {
  operationId: string;
  expectedRevision: string;
  at: string;
  actor: "operator";
  reason: "execution-uncertain";
  approvalId?: string;
};

export type DesktopJobContainmentResult =
  | { status: "contained"; record: DesktopJobContainmentRecord }
  | { status: "already-contained"; record: DesktopJobContainmentRecord };

function assertJobId(id: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) {
    throw new Error(`Invalid Desktop Job id: ${id}`);
  }
}

function jobFile(root: string, jobId: string): string {
  assertJobId(jobId);
  return resolve(root, "jobs", jobId, "job.json");
}

function containmentFile(root: string, jobId: string): string {
  assertJobId(jobId);
  return resolve(root, "containments", `${jobId}.json`);
}

export function desktopJobRevision(job: Pick<DesktopJobRecord, "updatedAt" | "status" | "attempts">): string {
  return `${job.updatedAt}:${job.status}:${job.attempts}`;
}

function mutationRisk(job: DesktopJobRecord): DesktopJobContainmentRecord["mutationRisk"] {
  return job.pack.operations.some((operation) => ["APPLY_PATCH", "RUN_PROCESS", "GIT_INIT", "GIT_WORKTREE_CREATE", "GIT_COMMIT"].includes(operation.type))
    ? "mutation-uncertain"
    : "read-only-uncertain";
}

async function saveContainment(root: string, record: DesktopJobContainmentRecord): Promise<void> {
  const path = containmentFile(root, record.jobId);
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temp, JSON.stringify(record, null, 2), "utf8");
  await rename(temp, path);
}

export async function loadDesktopJobContainmentUnlocked(root: string, jobId: string): Promise<DesktopJobContainmentRecord | null> {
  try {
    return JSON.parse(await readFile(containmentFile(root, jobId), "utf8")) as DesktopJobContainmentRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function loadDesktopJobContainment(root: string, jobId: string): Promise<DesktopJobContainmentRecord | null> {
  return withDurableDesktopJobLock(
    root,
    jobId,
    () => loadDesktopJobContainmentUnlocked(root, jobId),
    { waitForMs: 2_000 },
  );
}

export async function isDesktopJobContainedUnlocked(root: string, jobId: string): Promise<boolean> {
  return Boolean(await loadDesktopJobContainmentUnlocked(root, jobId));
}

export async function isDesktopJobContained(root: string, jobId: string): Promise<boolean> {
  return withDurableDesktopJobLock(
    root,
    jobId,
    () => isDesktopJobContainedUnlocked(root, jobId),
    { waitForMs: 2_000 },
  );
}

async function containDesktopJobUnlocked(
  root: string,
  jobId: string,
  input: DesktopJobContainmentInput,
): Promise<DesktopJobContainmentResult> {
  if (input.actor !== "operator") throw new Error("Desktop job containment requires operator actor");
  if (!input.operationId || !input.expectedRevision || !input.at) throw new Error("Desktop job containment identity is required");
  const existingContainment = await loadDesktopJobContainmentUnlocked(root, jobId);
  if (existingContainment) {
    if (existingContainment.operationId === input.operationId && existingContainment.expectedRevision === input.expectedRevision) {
      return { status: "already-contained", record: existingContainment };
    }
    throw new Error(`Desktop job is already contained: ${jobId}`);
  }
  const job = await loadDesktopJobUnlocked(root, jobId);
  if (!job) throw new Error(`Desktop Job not found: ${jobId}`);
  if (job.lease) throw new Error("Desktop job containment requires no active lease");
  if (job.status !== "pending") throw new Error(`Desktop job containment requires pending status: ${job.status}`);
  const actualRevision = desktopJobRevision(job);
  if (actualRevision !== input.expectedRevision) throw new Error("Desktop job revision mismatch");
  const record: DesktopJobContainmentRecord = {
    version: 1, jobId: job.jobId, runId: job.runId, idempotencyKey: job.idempotencyKey,
    attempt: job.attempts, originalStatus: job.status, mutationRisk: mutationRisk(job),
    reason: input.reason, operationId: input.operationId, actor: input.actor,
    ...(input.approvalId ? { approvalId: input.approvalId } : {}),
    expectedRevision: input.expectedRevision, containedAt: input.at,
  };
  await saveContainment(root, record);
  return { status: "contained", record };
}

export async function containDesktopJob(
  root: string,
  jobId: string,
  input: DesktopJobContainmentInput,
): Promise<DesktopJobContainmentResult> {
  return withDurableDesktopJobLock(
    root,
    jobId,
    () => containDesktopJobUnlocked(root, jobId, input),
    { waitForMs: 2_000 },
  );
}

async function saveJob(root: string, job: DesktopJobRecord): Promise<void> {
  const path = jobFile(root, job.jobId);
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temp, JSON.stringify(job, null, 2), "utf8");
  await rename(temp, path);
}

export async function loadDesktopJobUnlocked(
  root: string,
  jobId: string,
): Promise<DesktopJobRecord | null> {
  const path = jobFile(root, jobId);
  try {
    return JSON.parse(await readFile(path, "utf8")) as DesktopJobRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function loadDesktopJob(
  root: string,
  jobId: string,
): Promise<DesktopJobRecord | null> {
  return withDurableDesktopJobLock(
    root,
    jobId,
    () => loadDesktopJobUnlocked(root, jobId),
    { waitForMs: 2_000 },
  );
}

function semanticTaskIdentity(pack: DesktopTaskPack): string {
  return JSON.stringify({
    runId: pack.runId,
    stage: pack.stage,
    workspaceRoot: pack.workspaceRoot,
    policyDigest: pack.policyDigest ?? null,
    idempotencyKey: pack.idempotencyKey,
    operations: pack.operations,
  });
}

export async function listDesktopJobsUnlocked(root: string): Promise<DesktopJobRecord[]> {
  const directory = resolve(root, "jobs");
  let entries: Dirent<string>[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const result: DesktopJobRecord[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try { assertJobId(entry.name); } catch { continue; }
    const job = await loadDesktopJobUnlocked(root, entry.name);
    if (job) result.push(job);
  }
  return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.jobId.localeCompare(b.jobId));
}

export async function listDesktopJobs(root: string): Promise<DesktopJobRecord[]> {
  const candidates = await listDesktopJobsUnlocked(root);
  const result: DesktopJobRecord[] = [];
  for (const candidate of candidates) {
    const current = await withDurableDesktopJobLock(
      root,
      candidate.jobId,
      () => loadDesktopJobUnlocked(root, candidate.jobId),
      { waitForMs: 2_000 },
    );
    if (current) result.push(current);
  }
  return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.jobId.localeCompare(b.jobId));
}

export async function findDesktopJobByIdempotencyKeyUnlocked(
  root: string,
  key: string,
): Promise<DesktopJobRecord | null> {
  const jobs = await listDesktopJobsUnlocked(root);
  return jobs.find((job) => job.idempotencyKey === key) ?? null;
}

export async function findDesktopJobByIdempotencyKey(
  root: string,
  key: string,
): Promise<DesktopJobRecord | null> {
  const jobs = await listDesktopJobs(root);
  return jobs.find((job) => job.idempotencyKey === key) ?? null;
}

async function createDesktopJobUnlocked(
  root: string,
  pack: DesktopTaskPack,
  at: string,
): Promise<DesktopJobRecord> {
  assertDesktopTaskPack(pack);
  const existingByKey = await findDesktopJobByIdempotencyKeyUnlocked(root, pack.idempotencyKey);
  if (existingByKey) {
    if (semanticTaskIdentity(existingByKey.pack) !== semanticTaskIdentity(pack)) {
      throw new Error(`Desktop Job idempotency conflict: ${pack.idempotencyKey}`);
    }
    return existingByKey;
  }
  const existingById = await loadDesktopJobUnlocked(root, pack.jobId);
  if (existingById) throw new Error(`Desktop Job already exists: ${pack.jobId}`);
  const job: DesktopJobRecord = {
    version: 1,
    jobId: pack.jobId,
    runId: pack.runId,
    stage: pack.stage,
    idempotencyKey: pack.idempotencyKey,
    pack: structuredClone(pack),
    status: "pending",
    attempts: 0,
    createdAt: at,
    updatedAt: at,
  };
  await saveJob(root, job);
  return job;
}

export async function createDesktopJob(
  root: string,
  pack: DesktopTaskPack,
  at: string,
): Promise<DesktopJobRecord> {
  return withDurableDesktopJobLock(
    root,
    "__create__",
    () => createDesktopJobUnlocked(root, pack, at),
    { waitForMs: 2_000 },
  );
}

function validateLeaseDuration(durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error(`Desktop Job lease duration must be positive: ${durationMs}`);
  }
}

async function acquireDesktopJobLeaseUnlocked(
  root: string,
  jobId: string,
  owner: string,
  now: string,
  durationMs: number,
  options: { allowContained?: boolean } = {},
): Promise<DesktopJobRecord> {
  validateLeaseDuration(durationMs);
  const job = await loadDesktopJobUnlocked(root, jobId);
  if (!job) throw new Error(`Desktop Job not found: ${jobId}`);
  if (!options.allowContained && await isDesktopJobContainedUnlocked(root, jobId)) throw new Error(`Desktop Job is contained by operator and cannot be dispatched: ${jobId}`);
  if (job.status === "completed" || job.status === "cancelled") {
    throw new Error(`Desktop Job is terminal: ${jobId}`);
  }
  const leaseLive = job.lease && Date.parse(job.lease.expiresAt) > Date.parse(now);
  if (leaseLive && job.lease?.owner !== owner) {
    throw new Error(`Desktop Job has an active lease owned by ${job.lease?.owner}`);
  }
  if (leaseLive && job.lease?.owner === owner) return job;
  const next: DesktopJobRecord = {
    ...job,
    status: "leased",
    attempts: job.attempts + 1,
    lease: {
      owner,
      acquiredAt: now,
      expiresAt: new Date(Date.parse(now) + durationMs).toISOString(),
    },
    updatedAt: now,
  };
  await saveJob(root, next);
  return next;
}

export async function acquireDesktopJobLease(
  root: string,
  jobId: string,
  owner: string,
  now: string,
  durationMs: number,
  options: { allowContained?: boolean } = {},
): Promise<DesktopJobRecord> {
  return withDurableDesktopJobLock(
    root,
    jobId,
    () => acquireDesktopJobLeaseUnlocked(root, jobId, owner, now, durationMs, options),
    { waitForMs: 2_000 },
  );
}

async function renewDesktopJobLeaseUnlocked(
  root: string,
  jobId: string,
  owner: string,
  now: string,
  durationMs: number,
): Promise<DesktopJobRecord> {
  validateLeaseDuration(durationMs);
  const job = await loadDesktopJobUnlocked(root, jobId);
  if (!job) throw new Error(`Desktop Job not found: ${jobId}`);
  if (!job.lease || job.lease.owner !== owner) {
    throw new Error(`Desktop Job lease owner mismatch: ${jobId}`);
  }
  if (Date.parse(job.lease.expiresAt) <= Date.parse(now)) {
    throw new Error(`Desktop Job lease expired: ${jobId}`);
  }
  const next: DesktopJobRecord = {
    ...job,
    lease: { ...job.lease, expiresAt: new Date(Date.parse(now) + durationMs).toISOString() },
    updatedAt: now,
  };
  await saveJob(root, next);
  return next;
}

export async function renewDesktopJobLease(
  root: string,
  jobId: string,
  owner: string,
  now: string,
  durationMs: number,
): Promise<DesktopJobRecord> {
  return withDurableDesktopJobLock(
    root,
    jobId,
    () => renewDesktopJobLeaseUnlocked(root, jobId, owner, now, durationMs),
    { waitForMs: 2_000 },
  );
}

function assertDesktopResultReferences(pack: DesktopTaskPack, result: DesktopJobResult): void {
  const operations = new Map(pack.operations.map((operation) => [operation.id, operation]));
  const seen = new Set<string>();
  const taskError = result.operations.length === 1 && result.operations[0]?.operationId === "__task__";
  if (taskError) {
    const [operationResult] = result.operations;
    if (!operationResult || result.status !== "retryable-failure" || operationResult.ok || operationResult.reference !== undefined) {
      throw new Error("Desktop task-level result is invalid");
    }
    return;
  }
  for (const operationResult of result.operations) {
    if (seen.has(operationResult.operationId)) {
      throw new Error(`Desktop result contains duplicate operation: ${operationResult.operationId}`);
    }
    seen.add(operationResult.operationId);
    const operation = operations.get(operationResult.operationId);
    if (!operation) {
      throw new Error(`Desktop result contains unknown operation: ${operationResult.operationId}`);
    }
    if (operation.type !== "CHECK_HTTP" || operationResult.reference === undefined) continue;
    if (operationResult.reference !== operation.url) {
      throw new Error(`Desktop CHECK_HTTP result reference mismatch: ${operationResult.operationId}`);
    }
  }
  if (result.status === "completed") {
    if (seen.size !== operations.size) {
      throw new Error("Desktop completed result must include every Task Pack operation");
    }
    if (result.operations.some((operation) => !operation.ok)) {
      throw new Error("Desktop completed result cannot contain failed operations");
    }
  }
}

async function completeDesktopJobUnlocked(
  root: string,
  jobId: string,
  owner: string,
  result: DesktopJobResult,
): Promise<DesktopJobRecord> {
  const job = await loadDesktopJobUnlocked(root, jobId);
  if (!job) throw new Error(`Desktop Job not found: ${jobId}`);
  if (result.jobId !== job.jobId) throw new Error(`Desktop Job result jobId mismatch: ${result.jobId}`);
  if (result.runId !== job.runId) throw new Error(`Desktop Job result runId mismatch: ${result.runId}`);
  if (result.agentId !== job.pack.agentId) throw new Error(`Desktop Job result agentId mismatch: ${result.agentId}`);
  assertDesktopResultReferences(job.pack, result);
  if (job.status === "completed") {
    if (JSON.stringify(job.result) === JSON.stringify(result)) return job;
    throw new Error(`Desktop completed job is immutable: ${jobId}`);
  }
  if (job.status === "cancelled") throw new Error(`Desktop Job is cancelled: ${jobId}`);
  if (!job.lease || job.lease.owner !== owner) {
    throw new Error(`Desktop Job lease owner mismatch: ${jobId}`);
  }
  const next: DesktopJobRecord = {
    ...job,
    status: "completed",
    result: structuredClone(result),
    updatedAt: result.completedAt,
  };
  await saveJob(root, next);
  return next;
}

export async function completeDesktopJob(
  root: string,
  jobId: string,
  owner: string,
  result: DesktopJobResult,
): Promise<DesktopJobRecord> {
  return withDurableDesktopJobLock(
    root,
    jobId,
    () => completeDesktopJobUnlocked(root, jobId, owner, result),
    { waitForMs: 2_000 },
  );
}

async function markDesktopJobIndeterminateUnlocked(
  root: string,
  jobId: string,
  owner: string,
  at: string,
): Promise<DesktopJobRecord> {
  const job = await loadDesktopJobUnlocked(root, jobId);
  if (!job) throw new Error(`Desktop Job not found: ${jobId}`);
  if (job.status === "completed" || job.status === "cancelled") {
    throw new Error(`Desktop Job is terminal: ${jobId}`);
  }
  if (!job.lease || job.lease.owner !== owner) {
    throw new Error(`Desktop Job lease owner mismatch: ${jobId}`);
  }
  const next: DesktopJobRecord = { ...job, status: "indeterminate", updatedAt: at };
  await saveJob(root, next);
  return next;
}

export async function markDesktopJobIndeterminate(
  root: string,
  jobId: string,
  owner: string,
  at: string,
): Promise<DesktopJobRecord> {
  return withDurableDesktopJobLock(
    root,
    jobId,
    () => markDesktopJobIndeterminateUnlocked(root, jobId, owner, at),
    { waitForMs: 2_000 },
  );
}

async function requeueDesktopJobUnlocked(
  root: string,
  jobId: string,
  owner: string,
  at: string,
): Promise<DesktopJobRecord> {
  const job = await loadDesktopJobUnlocked(root, jobId);
  if (!job) throw new Error(`Desktop Job not found: ${jobId}`);
  if (job.status === "completed" || job.status === "cancelled") {
    throw new Error(`Desktop Job is terminal: ${jobId}`);
  }
  if (!job.lease || job.lease.owner !== owner) {
    throw new Error(`Desktop Job lease owner mismatch: ${jobId}`);
  }
  const { lease: _lease, result: _result, ...rest } = job;
  const next: DesktopJobRecord = { ...rest, status: "pending", updatedAt: at };
  await saveJob(root, next);
  return next;
}

export async function requeueDesktopJob(
  root: string,
  jobId: string,
  owner: string,
  at: string,
): Promise<DesktopJobRecord> {
  return withDurableDesktopJobLock(
    root,
    jobId,
    () => requeueDesktopJobUnlocked(root, jobId, owner, at),
    { waitForMs: 2_000 },
  );
}

export async function listRecoverableDesktopJobs(
  root: string,
  now: string,
): Promise<DesktopJobRecord[]> {
  const nowMs = Date.parse(now);
  const jobs = await listDesktopJobs(root);
  const recoverable = jobs.filter((job) => {
    if (job.status === "completed" || job.status === "cancelled") return false;
    if (!job.lease) return true;
    return Date.parse(job.lease.expiresAt) <= nowMs;
  });
  const result: DesktopJobRecord[] = [];
  for (const job of recoverable) if (!(await isDesktopJobContained(root, job.jobId))) result.push(job);
  return result;
}

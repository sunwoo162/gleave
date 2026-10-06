import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  acquireDesktopJobLease,
  containDesktopJob,
  completeDesktopJob,
  desktopJobRevision,
  loadDesktopJob,
  loadDesktopJobContainment,
  type DesktopJobContainmentRecord,
  type DesktopJobRecord,
} from "./job-store.js";
import { desktopTaskPackMutates, type DesktopJobResult } from "./contracts.js";
import { loadCompletedDesktopResults } from "./result-store.js";
import { withDurableDesktopOperatorLock } from "./operator-reconciliation-lock.js";

const actionQueues = new Map<string, Promise<unknown>>();
async function serialized<T>(key: string, action: () => Promise<T>): Promise<T> {
  const prior = actionQueues.get(key) ?? Promise.resolve();
  const current = prior.catch(() => undefined).then(action);
  actionQueues.set(key, current);
  try { return await current; } finally { if (actionQueues.get(key) === current) actionQueues.delete(key); }
}

export type DesktopJobOperatorApproval = {
  version: 1;
  approvalId: string;
  requestId: string;
  action: "desktop-job-containment";
  jobId: string;
  runId: string;
  revision: string;
  issuedAt: string;
  expiresAt: string;
  issuedBy: string;
  state: "issued" | "consumed";
  consumedAt?: string;
};

export type DesktopJobReconciliationInspection = {
  jobId: string;
  runId: string;
  status: DesktopJobRecord["status"];
  revision: string;
  operationTypes: string[];
  mutationRisk: "mutation-uncertain" | "read-only-uncertain";
  hasLease: boolean;
  leaseLive: boolean;
  hasResult: boolean;
  resultStatus?: DesktopJobResult["status"];
  contained: boolean;
  containment?: DesktopJobContainmentRecord;
  canContain: boolean;
  blockers: string[];
};

export type DesktopJobReconciliationResult =
  | { status: "contained" | "already-contained"; inspection: DesktopJobReconciliationInspection; containment: DesktopJobContainmentRecord }
  | { status: "rejected" | "conflict"; inspection?: DesktopJobReconciliationInspection; reason: string };

function approvalPath(root: string, id: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) throw new Error("Invalid desktop operator approval id");
  return resolve(root, "operator-approvals", `${id}.json`);
}
function requestPath(root: string, id: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) throw new Error("Invalid desktop operator request id");
  return resolve(root, "operator-approvals", "requests", `${id}.json`);
}
async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), "utf8");
  await rename(temp, path);
}
async function readApproval(path: string): Promise<DesktopJobOperatorApproval | null> {
  try { return JSON.parse(await readFile(path, "utf8")) as DesktopJobOperatorApproval; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

export async function issueDesktopJobContainmentApproval(input: {
  root: string; requestId: string; jobId: string; runId: string; revision: string;
  issuedAt: string; expiresAt: string; issuedBy: string;
}): Promise<DesktopJobOperatorApproval> {
  const request = requestPath(input.root, input.requestId);
  return serialized(request, () => withDurableDesktopOperatorLock(input.root, input.requestId, async () => {
    const existing = await readApproval(request);
    if (existing) {
      const identity = JSON.stringify({ jobId: existing.jobId, runId: existing.runId, revision: existing.revision, issuedBy: existing.issuedBy });
      const requested = JSON.stringify({ jobId: input.jobId, runId: input.runId, revision: input.revision, issuedBy: input.issuedBy });
      if (identity !== requested) throw new Error("Desktop operator approval request conflicts with an existing request");
      return existing;
    }
    const approval: DesktopJobOperatorApproval = {
      version: 1, approvalId: `desktop-approval-${randomUUID()}`, requestId: input.requestId,
      action: "desktop-job-containment", jobId: input.jobId, runId: input.runId, revision: input.revision,
      issuedAt: input.issuedAt, expiresAt: input.expiresAt, issuedBy: input.issuedBy, state: "issued",
    };
    await writeJson(approvalPath(input.root, approval.approvalId), approval);
    await writeJson(request, approval);
    return approval;
  }, { waitForMs: 2000 }));
}

export async function consumeDesktopJobContainmentApproval(input: { root: string; approvalId: string; jobId: string; runId: string; revision: string; at: string }): Promise<{ ok: true; approval: DesktopJobOperatorApproval } | { ok: false; reason: string }> {
  const path = approvalPath(input.root, input.approvalId);
  return withDurableDesktopOperatorLock(input.root, input.approvalId, async () => {
    const approval = await readApproval(path);
    if (!approval) return { ok: false, reason: "approval-not-found" };
    if (approval.state !== "issued") return { ok: false, reason: "approval-already-consumed" };
    if (Date.parse(approval.expiresAt) <= Date.parse(input.at)) return { ok: false, reason: "approval-expired" };
    if (approval.jobId !== input.jobId || approval.runId !== input.runId || approval.revision !== input.revision) return { ok: false, reason: "approval-target-or-revision-mismatch" };
    const consumed = { ...approval, state: "consumed" as const, consumedAt: input.at };
    await writeJson(path, consumed);
    await writeJson(requestPath(input.root, approval.requestId), consumed);
    return { ok: true, approval: consumed };
  }, { waitForMs: 2000 }, "approval");
}

function mutationRisk(job: DesktopJobRecord): DesktopJobReconciliationInspection["mutationRisk"] {
  return desktopTaskPackMutates(job.pack) ? "mutation-uncertain" : "read-only-uncertain";
}

export async function inspectDesktopJobReconciliation(input: { root: string; jobId: string; now: string }): Promise<DesktopJobReconciliationInspection | null> {
  const job = await loadDesktopJob(input.root, input.jobId);
  if (!job) return null;
  const containment = await loadDesktopJobContainment(input.root, input.jobId);
  const leaseLive = Boolean(job.lease && Date.parse(job.lease.expiresAt) > Date.parse(input.now));
  const blockers: string[] = [];
  if (job.status !== "pending") blockers.push("job-is-not-pending");
  if (leaseLive) blockers.push("active-lease");
  if (containment) blockers.push("already-contained");
  return {
    jobId: job.jobId, runId: job.runId, status: job.status, revision: desktopJobRevision(job),
    operationTypes: job.pack.operations.map((operation) => operation.type), mutationRisk: mutationRisk(job),
    hasLease: Boolean(job.lease), leaseLive, hasResult: Boolean(job.result),
    ...(job.result ? { resultStatus: job.result.status } : {}), contained: Boolean(containment),
    ...(containment ? { containment } : {}), canContain: blockers.length === 0, blockers,
  };
}

async function containDesktopJobAsOperatorImpl(input: {
  root: string; jobId: string; expectedRevision: string; operationId: string; approvalId: string; at: string; actor: "operator";
}): Promise<DesktopJobReconciliationResult> {
  const inspection = await inspectDesktopJobReconciliation({ root: input.root, jobId: input.jobId, now: input.at });
  if (!inspection) return { status: "rejected", reason: "job-not-found" };
  if (inspection.revision !== input.expectedRevision) return { status: "conflict", inspection, reason: "job-revision-mismatch" };
  if (inspection.contained && inspection.containment?.operationId === input.operationId) return { status: "already-contained", inspection, containment: inspection.containment };
  if (!inspection.canContain) return { status: "rejected", inspection, reason: inspection.blockers.join(",") };
  const approval = await consumeDesktopJobContainmentApproval({ root: input.root, approvalId: input.approvalId, jobId: inspection.jobId, runId: inspection.runId, revision: input.expectedRevision, at: input.at });
  if (!approval.ok) return { status: "rejected", inspection, reason: approval.reason };
  const contained = await containDesktopJob(input.root, input.jobId, {
    operationId: input.operationId, approvalId: input.approvalId, expectedRevision: input.expectedRevision,
    at: input.at, actor: input.actor, reason: "execution-uncertain",
  });
  const latest = await inspectDesktopJobReconciliation({ root: input.root, jobId: input.jobId, now: input.at });
  if (!latest?.containment) return { status: "conflict", inspection, reason: "containment-record-missing" };
  return { status: contained.status, inspection: latest, containment: latest.containment };
}

export async function containDesktopJobAsOperator(input: {
  root: string; jobId: string; expectedRevision: string; operationId: string; approvalId: string; at: string; actor: "operator";
}): Promise<DesktopJobReconciliationResult> {
  return serialized(`${input.root}:${input.jobId}`, () => withDurableDesktopOperatorLock(input.root, input.jobId, () => containDesktopJobAsOperatorImpl(input), { waitForMs: 2000 }, "job"));
}

export async function reconcileVerifiedDesktopJobResult(input: {
  jobRoot: string; resultRoot: string; jobId: string; now: string; owner?: string;
}): Promise<{ status: "reconciled" | "already-reconciled" | "not-found" | "not-matching"; job?: DesktopJobRecord; reason?: string }> {
  return withDurableDesktopOperatorLock(input.jobRoot, input.jobId, async () => {
    const job = await loadDesktopJob(input.jobRoot, input.jobId);
    if (!job) return { status: "not-found" as const };
    if (job.status === "completed") return { status: "already-reconciled" as const, job };
    const result = (await loadCompletedDesktopResults(input.resultRoot)).get(input.jobId);
    if (!result) return { status: "not-matching" as const, reason: "verified-result-not-found" };
    if (result.runId !== job.runId || result.agentId !== job.pack.agentId || result.jobId !== job.jobId) {
      return { status: "not-matching" as const, reason: "result-identity-mismatch" };
    }
    const owner = input.owner ?? `operator-reconcile-${randomUUID()}`;
    await acquireDesktopJobLease(input.jobRoot, input.jobId, owner, input.now, 60_000, { allowContained: true });
    const completed = await completeDesktopJob(input.jobRoot, input.jobId, owner, result);
    return { status: "reconciled" as const, job: completed };
  }, { waitForMs: 2000 }, "job");
}

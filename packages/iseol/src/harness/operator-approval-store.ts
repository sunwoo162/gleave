import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { withDurableOperatorApprovalLock } from "./operator-approval-lock.js";

export type OperatorApproval = {
  version: 1;
  approvalId: string;
  requestId: string;
  action: "operator-reconciliation";
  projectId: string;
  runId: string;
  stage: string;
  status: string;
  revision: string;
  reason: "stale-runtime-after-shutdown" | "operator-confirmed-no-active-work";
  issuedAt: string;
  expiresAt: string;
  issuedBy: string;
  state: "issued" | "consumed";
  consumedAt?: string;
};

const queues = new Map<string, Promise<unknown>>();
function approvalPath(root: string, approvalId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(approvalId)) throw new Error("Invalid operator approval id");
  return resolve(root, "operator-approvals", `${approvalId}.json`);
}
function requestPath(root: string, requestId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(requestId)) throw new Error("Invalid operator approval request id");
  return resolve(root, "operator-approvals", "requests", `${requestId}.json`);
}
async function serialized<T>(key: string, action: () => Promise<T>): Promise<T> {
  const prior = queues.get(key) ?? Promise.resolve();
  const current = prior.catch(() => undefined).then(action);
  queues.set(key, current);
  try { return await current; } finally { if (queues.get(key) === current) queues.delete(key); }
}
async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), "utf8");
  await rename(temp, path);
}
async function readJson(path: string): Promise<OperatorApproval | null> {
  try { return JSON.parse(await readFile(path, "utf8")) as OperatorApproval; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

export async function issueOperatorApproval(input: {
  root: string; requestId: string; projectId: string; runId: string; stage: string; status: string;
  revision: string; reason: OperatorApproval["reason"]; issuedAt: string; expiresAt: string; issuedBy: string;
}): Promise<OperatorApproval> {
  return serialized(requestPath(input.root, input.requestId), () => withDurableOperatorApprovalLock(input.root, input.requestId, async () => {
    const existing = await readJson(requestPath(input.root, input.requestId));
    const identity = JSON.stringify({ projectId: input.projectId, runId: input.runId, stage: input.stage, status: input.status, revision: input.revision, reason: input.reason, issuedBy: input.issuedBy });
    if (existing) {
      const currentIdentity = JSON.stringify({ projectId: existing.projectId, runId: existing.runId, stage: existing.stage, status: existing.status, revision: existing.revision, reason: existing.reason, issuedBy: existing.issuedBy });
      if (identity !== currentIdentity) throw new Error("Operator approval request conflicts with an existing request");
      return existing;
    }
    const approval: OperatorApproval = { version: 1, approvalId: `approval-${randomUUID()}`, requestId: input.requestId, action: "operator-reconciliation", projectId: input.projectId, runId: input.runId, stage: input.stage, status: input.status, revision: input.revision, reason: input.reason, issuedAt: input.issuedAt, expiresAt: input.expiresAt, issuedBy: input.issuedBy, state: "issued" };
    await writeJson(approvalPath(input.root, approval.approvalId), approval);
    await writeJson(requestPath(input.root, input.requestId), approval);
    return approval;
  }, { waitForMs: 2000 }));
}

async function loadOperatorApprovalUnlocked(root: string, approvalId: string): Promise<OperatorApproval | null> {
  return readJson(approvalPath(root, approvalId));
}

export async function loadOperatorApproval(root: string, approvalId: string): Promise<OperatorApproval | null> {
  return withDurableOperatorApprovalLock(
    root,
    approvalId,
    () => loadOperatorApprovalUnlocked(root, approvalId),
    { waitForMs: 2_000 },
    "approval",
  );
}

export async function consumeOperatorApproval(input: {
  root: string; approvalId: string; projectId: string; runId: string; stage: string; status: string; revision: string; at: string;
}): Promise<{ ok: true; approval: OperatorApproval } | { ok: false; reason: string }> {
  return serialized(approvalPath(input.root, input.approvalId), () => withDurableOperatorApprovalLock(input.root, input.approvalId, async () => {
    const approval = await readJson(approvalPath(input.root, input.approvalId));
    if (!approval) return { ok: false, reason: "approval-not-found" };
    if (approval.state !== "issued") return { ok: false, reason: "approval-already-consumed" };
    if (Date.parse(approval.expiresAt) <= Date.parse(input.at)) return { ok: false, reason: "approval-expired" };
    if (approval.projectId !== input.projectId || approval.runId !== input.runId || approval.stage !== input.stage || approval.status !== input.status || approval.revision !== input.revision) return { ok: false, reason: "approval-target-or-revision-mismatch" };
    const consumed = { ...approval, state: "consumed" as const, consumedAt: input.at };
    await writeJson(approvalPath(input.root, input.approvalId), consumed);
    await writeJson(requestPath(input.root, approval.requestId), consumed);
    return { ok: true, approval: consumed };
  }, { waitForMs: 2000 }, "approval"));
}

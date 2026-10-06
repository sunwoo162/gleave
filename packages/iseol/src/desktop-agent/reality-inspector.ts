import type { HarnessRealityInspector, HarnessRealitySnapshot } from "../harness/recovery.js";
import type { HarnessRuntimeRunEnvelope } from "../harness/contracts.js";
import type { DesktopJobResult, DesktopTaskPack, GitCommitOperation } from "./contracts.js";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { validatePatchTarget } from "../chatgpt-web/intent-compiler.js";
import { listOnlineDesktopAgents } from "./agent-registry.js";
import {
  acquireDesktopJobLease,
  completeDesktopJob,
  listDesktopJobs,
  listRecoverableDesktopJobs,
} from "./job-store.js";
import type { DesktopExecutionTransport } from "./desktop-executor.js";

export type CreateDesktopRealityInspectorInput = {
  registryRoot: string;
  jobRoot: string;
  transport: DesktopExecutionTransport;
  now?: () => string;
  heartbeatTimeoutMs?: number;
  inspectTimeoutMs?: number;
  leaseDurationMs?: number;
};

type GitIdentity = {
  head: string;
  parent: string;
  subject: string;
  branch: string;
  status: string;
  remoteHead?: string;
};
function commitOperation(pack: DesktopTaskPack): GitCommitOperation | null {
  const operation = pack.operations.find((item) => item.type === "GIT_COMMIT");
  return operation?.type === "GIT_COMMIT" ? operation : null;
}

function parseIdentity(result: DesktopJobResult): GitIdentity | null {
  if (result.status !== "completed") return null;
  const raw = result.operations.find((item) => item.operationId === "inspect")?.stdout;
  if (!raw) return null;
  try {
    const identity = JSON.parse(raw) as Partial<GitIdentity>;
    if (![identity.head, identity.parent, identity.subject, identity.branch, identity.status]
      .every((value) => typeof value === "string")) return null;
    return identity as GitIdentity;
  } catch {
    return null;
  }
}

function matchingRecoveredCommit(operation: GitCommitOperation, identity: GitIdentity): boolean {
  return Boolean(operation.expectedHead)
    && identity.parent === operation.expectedHead
    && identity.subject === operation.message
    && identity.status.trim() === ""
    && (!operation.publish || identity.remoteHead === identity.head);
}

async function reconcileApplyPatchJob(
  input: CreateDesktopRealityInspectorInput,
  run: HarnessRuntimeRunEnvelope,
  at: string,
  connectedAgentIds: Set<string>,
): Promise<{ key: string; jobId: string; path: string } | null> {
  if (run.state.stage !== "IMPLEMENT" || run.preflight.status !== "ready" || !run.preflight.policy) return null;
  for (const job of await listDesktopJobs(input.jobRoot)) {
    if (job.status !== "indeterminate" || job.runId !== run.request.runId || job.stage !== "IMPLEMENT") continue;
    if (job.lease && Date.parse(job.lease.expiresAt) > Date.parse(at)) continue;
    if (!connectedAgentIds.has(job.pack.agentId) || job.pack.workspaceRoot !== run.request.targetRoot) continue;
    if (job.pack.policyDigest !== run.preflight.policy.effectiveSha256 || job.pack.operations.length !== 1) continue;
    const operation = job.pack.operations[0];
    if (operation?.type !== "APPLY_PATCH") continue;
    let validated: { path: string; patch: string };
    try { validated = validatePatchTarget(run.request.targetRoot, operation.patch); } catch { continue; }
    if (validated.path !== operation.path || !validated.patch.includes("--- /dev/null")) continue;
    const target = resolve(run.request.targetRoot, validated.path);
    const rel = relative(resolve(run.request.targetRoot), target);
    if (rel === ".." || rel.startsWith("..\\") || rel.startsWith("../") || isAbsolute(rel)) continue;
    let actual: string;
    try { actual = await readFile(target, "utf8"); } catch { continue; }
    const expected = validated.patch.split("\n")
      .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
      .map((line) => line.slice(1))
      .join("\n") + "\n";
    if (actual.replaceAll("\r\n", "\n") !== expected) continue;
    const owner = `reconcile-${randomUUID()}`;
    const leased = await acquireDesktopJobLease(input.jobRoot, job.jobId, owner, at, input.leaseDurationMs ?? 60_000);
    const result: DesktopJobResult = {
      version: 1,
      jobId: leased.jobId,
      runId: leased.runId,
      agentId: leased.pack.agentId,
      status: "completed",
      completedAt: at,
      operations: [{ operationId: operation.id, ok: true, summary: "Reconciled existing APPLY_PATCH effect" }],
    };
    await completeDesktopJob(input.jobRoot, leased.jobId, owner, result);
    return { key: job.idempotencyKey, jobId: job.jobId, path: validated.path };
  }
  return null;
}
export function createDesktopRealityInspector(
  input: CreateDesktopRealityInspectorInput,
): HarnessRealityInspector {
  const now = input.now ?? (() => new Date().toISOString());
  const heartbeatTimeoutMs = input.heartbeatTimeoutMs ?? 30_000;
  const inspectTimeoutMs = input.inspectTimeoutMs ?? 30_000;
  const leaseDurationMs = input.leaseDurationMs ?? 60_000;

  return {
    async inspect(run: HarnessRuntimeRunEnvelope): Promise<HarnessRealitySnapshot> {
      const at = now();
      const online = await listOnlineDesktopAgents(input.registryRoot, at, heartbeatTimeoutMs);
      const connected = online.filter((agent) => input.transport.isAgentConnected(agent.agentId));
      if (connected.length === 0) return { agentAvailable: false };

      const reality: HarnessRealitySnapshot = { agentAvailable: true };
      const reconciledPatch = await reconcileApplyPatchJob(input, run, at, new Set(connected.map((agent) => agent.agentId)));
      if (reconciledPatch) reality.desktopPatch = reconciledPatch;
      if (run.state.stage !== "COMMIT") return reality;

      const completed = (await listDesktopJobs(input.jobRoot)).find((job) =>
        job.runId === run.request.runId
        && job.stage === "COMMIT"
        && job.status === "completed"
        && job.result?.status === "completed"
        && connected.some((agent) => agent.agentId === job.pack.agentId),
      );
      if (completed?.result) {
        const reference = completed.result.operations.find((item) => item.reference)?.reference;
        if (reference) {
          reality.currentCommit = reference;
          reality.desktopCommit = { key: completed.idempotencyKey, reference, jobId: completed.jobId };
          return reality;
        }
      }

      const jobs = (await listRecoverableDesktopJobs(input.jobRoot, at))
        .filter((job) => job.runId === run.request.runId && job.stage === "COMMIT");
      const job = jobs.find((item) => connected.some((agent) => agent.agentId === item.pack.agentId));
      if (!job) return reality;
      const operation = commitOperation(job.pack);
      if (!operation?.expectedHead) return reality;
      const sessionId = input.transport.getAgentSessionId(job.pack.agentId);
      if (!sessionId) return reality;
      const inspectPack: DesktopTaskPack = {
        version: 1,
        jobId: `inspect-${job.jobId}`,
        runId: run.request.runId,
        stage: "COMMIT",
        attempt: 1,
        agentId: job.pack.agentId,
        workspaceRoot: job.pack.workspaceRoot,
        idempotencyKey: `inspect:${job.idempotencyKey}`,
        leaseUntil: new Date(Date.parse(at) + inspectTimeoutMs).toISOString(),
        operations: [{ id: "inspect", type: "GIT_INSPECT", cwd: operation.cwd, ...(operation.publish ? { includeRemote: true } : {}) }],
      };
      input.transport.sendTask(job.pack.agentId, inspectPack, sessionId);
      const inspectResult = await input.transport.awaitResult(inspectPack.jobId, inspectTimeoutMs);
      const identity = parseIdentity(inspectResult);
      if (!identity) return reality;
      reality.currentBranch = identity.branch;
      reality.currentCommit = identity.head;
      if (!matchingRecoveredCommit(operation, identity)) return reality;

      await acquireDesktopJobLease(input.jobRoot, job.jobId, sessionId, at, leaseDurationMs);
      const reconciledResult: DesktopJobResult = {
        version: 1,
        jobId: job.jobId,
        runId: job.runId,
        agentId: job.pack.agentId,
        status: "completed",
        completedAt: at,
        operations: job.pack.operations.map((item) => ({
          operationId: item.id,
          ok: true,
          summary: item.id === operation.id ? "Recovered existing Git commit" : "Recovered existing Desktop operation",
          ...(item.id === operation.id ? { reference: identity.head } : {}),
        })),
      };
      await completeDesktopJob(input.jobRoot, job.jobId, sessionId, reconciledResult);
      reality.desktopCommit = {
        key: job.idempotencyKey,
        reference: identity.head,
        jobId: job.jobId,
      };
      return reality;
    },
  };
}

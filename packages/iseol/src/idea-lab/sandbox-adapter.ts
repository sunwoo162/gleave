import { isAbsolute, relative, resolve } from "node:path";
import type { DesktopJobResult, DesktopTaskPack } from "../desktop-agent/contracts.js";
import { assertDesktopTaskPack } from "../desktop-agent/contracts.js";
import type { HarnessRuntimeRunEnvelope } from "../harness/contracts.js";
import type { RefreshDevelopmentRunPreflightOptions } from "../harness/run-service.js";
import { assertIdeaLabId } from "./contracts.js";

export type PrototypeSandboxAllocation = {
  repositoryUrl: string;
  branch: string;
  worktreeRoot: string;
  baseRef: string;
};

export type PrototypeSandboxAllocateInput = {
  campaignId: string;
  productionId: string;
  run: HarnessRuntimeRunEnvelope;
  sandboxRoot: string;
  repositoryRoot: string;
  repositoryUrl: string;
  baseRef: string;
  agentId: string;
  iseolRoot: string;
  runStoreRoot: string;
};

export interface PrototypeSandboxAdapter {
  allocate(input: PrototypeSandboxAllocateInput): Promise<PrototypeSandboxAllocation>;
  inspect(input: PrototypeSandboxAllocateInput): Promise<PrototypeSandboxAllocation | null>;
}
export type CreateDesktopPrototypeSandboxAdapterInput = {
  dispatch: (pack: DesktopTaskPack) => Promise<DesktopJobResult>;
  refreshPreflight: (options: RefreshDevelopmentRunPreflightOptions) => Promise<HarnessRuntimeRunEnvelope>;
  now?: () => string;
  leaseDurationMs?: number;
};

export function prototypeSandboxBranch(campaignId: string, productionId: string): string {
  assertIdeaLabId(campaignId);
  assertIdeaLabId(productionId);
  return `idea/${campaignId}/${productionId}`;
}

function relativeInside(root: string, target: string, label: string): string {
  const rel = relative(resolve(root), resolve(target));
  if (!rel || rel === ".") return ".";
  if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..\\`) || rel.startsWith("../")) {
    throw new Error(`Idea Lab sandbox ${label} is outside sandboxRoot`);
  }
  return rel.replaceAll("\\", "/");
}

function policyFields(run: HarnessRuntimeRunEnvelope) {
  const policy = run.preflight.policy;
  if (run.preflight.status !== "ready" || !policy || policy.sources.length === 0) {
    throw new Error("Idea Lab sandbox allocation requires ready Harness policy provenance");
  }
  return {
    policyDigest: policy.effectiveSha256,
    policySources: policy.sources.map((source) => ({
      kind: source.kind,
      path: source.path,
      sha256: source.sha256,
      required: true,
    })),
  };
}
function allocationPack(input: PrototypeSandboxAllocateInput, now: string, leaseDurationMs: number): DesktopTaskPack {
  const branch = prototypeSandboxBranch(input.campaignId, input.productionId);
  const pack: DesktopTaskPack = {
    version: 1,
    jobId: `sandbox-${input.campaignId}-${input.productionId}`,
    runId: input.run.request.runId,
    stage: input.run.state.stage,
    attempt: 0,
    agentId: input.agentId,
    workspaceRoot: resolve(input.sandboxRoot),
    ...policyFields(input.run),
    idempotencyKey: `idea-sandbox:${input.campaignId}:${input.productionId}`,
    leaseUntil: new Date(Date.parse(now) + leaseDurationMs).toISOString(),
    operations: [{
      id: "allocate",
      type: "GIT_WORKTREE_CREATE",
      cwd: relativeInside(input.sandboxRoot, input.repositoryRoot, "repositoryRoot"),
      branch,
      worktreePath: relativeInside(input.sandboxRoot, input.run.request.targetRoot, "targetRoot"),
      baseRef: input.baseRef,
    }],
  };
  assertDesktopTaskPack(pack);
  return pack;
}

function ensureCompleted(result: DesktopJobResult, action: string): void {
  if (result.status !== "completed" || result.operations.some((item) => !item.ok)) {
    const reason = result.operations.find((item) => !item.ok)?.summary ?? result.status;
    throw new Error(`Idea Lab sandbox ${action} failed: ${reason}`);
  }
}
export function createDesktopPrototypeSandboxAdapter(
  deps: CreateDesktopPrototypeSandboxAdapterInput,
): PrototypeSandboxAdapter {
  const now = deps.now ?? (() => new Date().toISOString());
  const leaseDurationMs = deps.leaseDurationMs ?? 60_000;
  return {
    async allocate(input) {
      const pack = allocationPack(input, now(), leaseDurationMs);
      const result = await deps.dispatch(pack);
      ensureCompleted(result, "allocation");
      await deps.refreshPreflight({
        iseolRoot: input.iseolRoot,
        storeRoot: input.runStoreRoot,
        runId: input.run.request.runId,
        loadedAt: result.completedAt,
      });
      return {
        repositoryUrl: input.repositoryUrl,
        branch: prototypeSandboxBranch(input.campaignId, input.productionId),
        worktreeRoot: resolve(input.run.request.targetRoot),
        baseRef: input.baseRef,
      };
    },
    async inspect(input) {
      const pack = allocationPack(input, now(), leaseDurationMs);
      const inspectPack: DesktopTaskPack = {
        ...pack,
        jobId: `${pack.jobId}-inspect`,
        idempotencyKey: `${pack.idempotencyKey}:inspect`,
        operations: [{
          id: "inspect",
          type: "GIT_INSPECT",
          cwd: relativeInside(input.sandboxRoot, input.run.request.targetRoot, "targetRoot"),
        }],
      };
      const result = await deps.dispatch(inspectPack);
      if (result.status !== "completed") return null;
      const output = result.operations.find((item) => item.operationId === "inspect")?.stdout;
      if (!output) return null;
      try {
        const identity = JSON.parse(output) as { branch?: string };
        if (identity.branch !== prototypeSandboxBranch(input.campaignId, input.productionId)) return null;
      } catch { return null; }
      return {
        repositoryUrl: input.repositoryUrl,
        branch: prototypeSandboxBranch(input.campaignId, input.productionId),
        worktreeRoot: resolve(input.run.request.targetRoot),
        baseRef: input.baseRef,
      };
    },
  };
}

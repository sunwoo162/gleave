import type { HarnessRuntimeRunEnvelope } from "../harness/contracts.js";
import type { DesktopTaskCompiler } from "../desktop-agent/desktop-executor.js";
import type { DesktopTaskPack } from "../desktop-agent/contracts.js";
import { assertDesktopTaskPack } from "../desktop-agent/contracts.js";

export type ProjectWorkspaceDesktopCompilerConfig = {
  testExecutable: string;
  testArgs: string[];
  testTimeoutMs: number;
  buildExecutable?: string;
  buildArgs?: string[];
  buildTimeoutMs?: number;
  commitMessage?: string;
  now?: () => string;
  leaseDurationMs?: number;
};

function pack(run: HarnessRuntimeRunEnvelope, agentId: string, config: ProjectWorkspaceDesktopCompilerConfig, now: string): DesktopTaskPack | null {
  if (run.preflight.status !== "ready" || !run.preflight.policy) throw new Error("Desktop Task Pack requires ready Run policy");
  const nowMs = Date.parse(now);
  if (Number.isNaN(nowMs)) throw new Error("Desktop Task Pack compile time must be an ISO timestamp");
  const stage = run.state.stage;
  const operation = stage === "CONTEXT"
    ? (run.preflight.gitPreparation === "bootstrap-if-empty"
      ? [{ id: "git-init", type: "GIT_INIT" as const, cwd: ".", initialBranch: "main" }, { id: "context", type: "GIT_INSPECT" as const, cwd: "." }]
      : [{ id: "context", type: "GIT_INSPECT" as const, cwd: "." }])
    : stage === "TEST"
      ? [
        { id: "test", type: "RUN_PROCESS" as const, purpose: "test" as const, cwd: ".", executable: config.testExecutable, args: [...config.testArgs], timeoutMs: config.testTimeoutMs },
        ...(config.buildExecutable ? [{ id: "build", type: "RUN_PROCESS" as const, purpose: "build" as const, cwd: ".", executable: config.buildExecutable, args: [...(config.buildArgs ?? ["run", "build"])], timeoutMs: config.buildTimeoutMs ?? config.testTimeoutMs }] : []),
      ]
      : stage === "COMMIT"
        ? { id: "commit", type: "GIT_COMMIT" as const, cwd: ".", message: config.commitMessage ?? "feat: develop project workspace" }
        : null;
  if (!operation) return null;
  const result: DesktopTaskPack = {
    version: 1,
    jobId: `${run.request.runId}-${stage.toLowerCase()}`,
    runId: run.request.runId,
    stage,
    attempt: 0,
    agentId,
    workspaceRoot: run.request.targetRoot,
    policyDigest: run.preflight.policy.effectiveSha256,
    policySources: run.preflight.policy.sources.map((source) => ({ kind: source.kind, path: source.path, sha256: source.sha256, required: true })),
    idempotencyKey: `${run.request.runId}:${stage.toLowerCase()}`,
    leaseUntil: new Date(nowMs + (config.leaseDurationMs ?? 60_000)).toISOString(),
    operations: Array.isArray(operation) ? operation : [operation],
  };
  assertDesktopTaskPack(result);
  return result;
}

export function createProjectWorkspaceDesktopTaskCompiler(config: ProjectWorkspaceDesktopCompilerConfig): DesktopTaskCompiler {
  const now = config.now ?? (() => new Date().toISOString());
  return async (run, agentId) => pack(run, agentId, config, now());
}

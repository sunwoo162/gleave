import type { HarnessRuntimeRunEnvelope } from "../harness/contracts.js";
import type { DesktopTaskCompiler } from "../desktop-agent/desktop-executor.js";
import type { DesktopTaskPack } from "../desktop-agent/contracts.js";
import type { IdeaLabRuntimeConfig } from "./runtime-config.js";
import { assertDesktopTaskPack } from "../desktop-agent/contracts.js";

type EnabledConfig = Extract<IdeaLabRuntimeConfig, { enabled: true }>;
type CompilerOptions = { now?: () => string; leaseDurationMs?: number };

function canonicalContextHead(run: HarnessRuntimeRunEnvelope): string {
  const references = run.evidence
    .filter((item) => item.stage === "CONTEXT" && item.provider === "iseol-desktop-agent")
    .map((item) => item.reference ?? "")
    .filter((value) => /^[0-9a-f]{40}$/i.test(value));
  if (references.length !== 1) throw new Error("Idea Lab COMMIT requires one canonical CONTEXT Git head");
  return references[0]!;
}

function packFor(
  run: HarnessRuntimeRunEnvelope,
  agentId: string,
  config: EnabledConfig,
  stage: "CONTEXT" | "TEST" | "COMMIT",
  now: string,
  leaseDurationMs: number,
): DesktopTaskPack {
  const policy = run.preflight.policy;
  if (run.preflight.status !== "ready" || !policy) throw new Error("Run policy is not ready");
  const nowMs = Date.parse(now);
  if (Number.isNaN(nowMs)) throw new Error("Desktop Task Pack compile time must be an ISO timestamp");
  if (!Number.isFinite(leaseDurationMs) || leaseDurationMs <= 0) throw new Error("Desktop Task Pack lease duration must be positive");
  const operation = stage === "CONTEXT"
    ? { id: "context", type: "GIT_INSPECT" as const, cwd: "." }
    : stage === "TEST"
      ? { id: "test", type: "RUN_PROCESS" as const, purpose: "test" as const, cwd: ".", executable: config.testExecutable, args: [...config.testArgs], timeoutMs: config.testTimeoutMs }
      : { id: "commit", type: "GIT_COMMIT" as const, cwd: ".", message: "feat: build idea lab prototype", expectedHead: canonicalContextHead(run), publish: true };
  const pack: DesktopTaskPack = {
    version: 1,
    jobId: `${run.request.runId}-${stage.toLowerCase()}`,
    runId: run.request.runId,
    stage,
    attempt: 0,
    agentId,
    workspaceRoot: run.request.targetRoot,
    policyDigest: policy.effectiveSha256,
    policySources: policy.sources.map((source) => ({ kind: source.kind, path: source.path, sha256: source.sha256, required: true })),
    idempotencyKey: `${run.request.runId}:${stage.toLowerCase()}`,
    leaseUntil: new Date(nowMs + leaseDurationMs).toISOString(),
    operations: [operation],
  };
  assertDesktopTaskPack(pack);
  return pack;
}

export function createIdeaLabProductionDesktopTaskCompiler(
  config: EnabledConfig,
  options: CompilerOptions = {},
): DesktopTaskCompiler {
  const now = options.now ?? (() => new Date().toISOString());
  const leaseDurationMs = options.leaseDurationMs ?? 60_000;
  return async (run, agentId) => {
    if (run.state.stage !== "CONTEXT" && run.state.stage !== "TEST" && run.state.stage !== "COMMIT") return null;
    return packFor(run, agentId, config, run.state.stage, now(), leaseDurationMs);
  };
}

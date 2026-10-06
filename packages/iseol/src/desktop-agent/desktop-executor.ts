import { randomUUID } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import type { HarnessEvidenceKind, HarnessRuntimeRunEnvelope } from "../harness/contracts.js";
import type { HarnessStageExecutor, HarnessStageExecutionResult } from "../harness/run-supervisor.js";
import type { DesktopJobResult, DesktopOperation, DesktopOperationResult, DesktopTaskPack } from "./contracts.js";
import { desktopOperationCapability, desktopTaskPackMutates } from "./contracts.js";
import { listOnlineDesktopAgents } from "./agent-registry.js";
import {
  acquireDesktopJobLease,
  completeDesktopJob,
  createDesktopJob,
  isDesktopJobContained,
  type DesktopJobRecord,
  markDesktopJobIndeterminate,
  requeueDesktopJob,
} from "./job-store.js";

export interface DesktopExecutionTransport {
  isAgentConnected(agentId: string): boolean;
  getAgentSessionId(agentId: string): string | null;
  sendTask(agentId: string, pack: DesktopTaskPack, expectedSessionId?: string): void;
  awaitResult(jobId: string, timeoutMs: number): Promise<DesktopJobResult>;
}

export type DesktopTaskCompiler = (
  run: HarnessRuntimeRunEnvelope,
  agentId: string,
) => Promise<DesktopTaskPack | null>;
export type CreateDesktopStageExecutorInput = {
  registryRoot: string;
  jobRoot: string;
  transport: DesktopExecutionTransport;
  compileTaskPack: DesktopTaskCompiler;
  now?: () => string;
  heartbeatTimeoutMs?: number;
  leaseDurationMs?: number;
  resultTimeoutMs?: number;
  captureRetryableResultAsFeedback?: boolean;
};

function containsPath(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

async function resolveAgent(input: CreateDesktopStageExecutorInput, targetRoot: string, at: string) {
  const online = await listOnlineDesktopAgents(
    input.registryRoot,
    at,
    input.heartbeatTimeoutMs ?? 30_000,
  );
  return online.find((agent) =>
    input.transport.isAgentConnected(agent.agentId)
    && agent.workspaceRoots.some((root) => containsPath(root, targetRoot)),
  ) ?? null;
}
function evidenceKindForStage(
  stage: HarnessRuntimeRunEnvelope["state"]["stage"],
): HarnessEvidenceKind {
  if (stage === "TEST") return "test";
  if (stage === "SELF_REVIEW") return "review";
  if (stage === "COMMIT") return "commit";
  if (stage === "PR") return "pull-request";
  if (stage === "CI") return "ci";
  if (stage === "DEPLOY") return "deployment";
  if (stage === "PRODUCTION_VERIFY") return "production-verification";
  return "command";
}

function evidenceKindForOperation(
  stage: HarnessRuntimeRunEnvelope["state"]["stage"],
  operation?: DesktopOperation,
): HarnessEvidenceKind {
  if (operation?.type === "RUN_PROCESS" && operation.purpose === "build") return "build";
  if (operation?.type === "RUN_PROCESS" && operation.purpose === "test" && stage === "TEST") return "test";
  return evidenceKindForStage(stage);
}

export type DesktopFeedback = { kind: HarnessEvidenceKind; summary: string; reference?: string };
type DesktopCompletedExecutionResult = HarnessStageExecutionResult & { feedback: DesktopFeedback[] };
const MAX_DESKTOP_FEEDBACK_CHARS = 8_000;
const DESKTOP_RESULT_GRACE_MS = 30_000;
const MAX_READ_ONLY_RESULT_TIMEOUT_RETRIES = 1;

function declaredTaskExecutionBudgetMs(pack: DesktopTaskPack): number {
  return pack.operations.reduce((total, operation) => {
    if (operation.type === "RUN_PROCESS" || operation.type === "CHECK_HTTP") {
      return total + operation.timeoutMs;
    }

    return total;
  }, 0);
}

function protectedExecutionWindowMs(
  pack: DesktopTaskPack,
  configuredMs: number,
): number {
  const declaredMs = declaredTaskExecutionBudgetMs(pack);

  if (declaredMs <= 0) {
    return configuredMs;
  }

  return Math.max(
    configuredMs,
    declaredMs + DESKTOP_RESULT_GRACE_MS,
  );
}

function isDesktopResultTimeout(error: unknown): boolean {
  return error instanceof Error
    && /^Desktop Job result timeout: /.test(error.message);
}

function operationFeedback(item: DesktopOperationResult): string {
  const parts = [`Desktop operation ${item.operationId}: ${item.summary}`];
  if (item.stdout?.trim()) parts.push(`stdout:\n${item.stdout.trim()}`);
  if (item.stderr?.trim()) parts.push(`stderr:\n${item.stderr.trim()}`);
  const joined = parts.join("\n");
  return joined.length <= MAX_DESKTOP_FEEDBACK_CHARS
    ? joined
    : `${joined.slice(0, MAX_DESKTOP_FEEDBACK_CHARS)}\n[truncated]`;
}

export function desktopJobFeedback(
  run: HarnessRuntimeRunEnvelope,
  result: DesktopJobResult,
  job?: DesktopJobRecord,
): DesktopFeedback[] {
  return result.operations.map((item) => ({
    kind: evidenceKindForOperation(run.state.stage, job?.pack.operations.find((operation) => operation.id === item.operationId)),
    summary: operationFeedback(item),
    reference: item.reference ?? `desktop-job:${result.jobId}:${item.operationId}`,
  }));
}
function completedResult(
  run: HarnessRuntimeRunEnvelope,
  result: DesktopJobResult,
  job: DesktopJobRecord,
): DesktopCompletedExecutionResult {
  const evidence = result.status === "completed"
    ? result.operations.map((item) => {
      const kind = evidenceKindForOperation(run.state.stage, job.pack.operations.find((operation) => operation.id === item.operationId));
      const operationReference = item.reference;
      const suffix = result.operations.length === 1 ? kind : `${kind}:${item.operationId}`;
      return {
        version: 1 as const,
        id: `desktop-evidence:${run.request.runId}:${job.jobId}:${suffix}`,
        kind,
        stage: run.state.stage,
        recordedAt: result.completedAt,
        summary: `Desktop Job ${result.jobId} completed`,
        provider: "iseol-desktop-agent",
        reference: operationReference ?? `desktop-job:${result.jobId}`,
        ...(run.request.projectId === undefined ? {} : { projectId: run.request.projectId }),
        runId: run.request.runId,
        jobId: job.jobId,
        executionIdentity: job.idempotencyKey,
      };
    })
    : [];
  return {
    type: "completed",
    evidence,
    feedback: desktopJobFeedback(run, result, job),
  };
}
function failureReason(result: DesktopJobResult): string {
  return result.operations.find((item) => !item.ok)?.summary
    ?? `Desktop Job ${result.jobId} returned ${result.status}`;
}

export function createDesktopStageExecutor(
  input: CreateDesktopStageExecutorInput,
): HarnessStageExecutor {
  const now = input.now ?? (() => new Date().toISOString());
  return {
    async execute(run): Promise<HarnessStageExecutionResult> {
      const at = now();
      const agent = await resolveAgent(input, run.request.targetRoot, at);
      if (!agent) return { type: "waiting-agent", reason: "No eligible Desktop Agent is online" };

      const compiled = await input.compileTaskPack(run, agent.agentId);
      if (!compiled) {
        return { type: "waiting-external", reason: `Desktop task intent is not available for ${run.state.stage}` };
      }
      if (compiled.runId !== run.request.runId || compiled.stage !== run.state.stage) {
        return { type: "final-failure", reason: "Desktop Task Pack does not match the active Run stage" };
      }
      if (compiled.agentId !== agent.agentId) {
        return { type: "final-failure", reason: "Desktop Task Pack targets a different Agent" };
      }
      const validatedSessionId = input.transport.getAgentSessionId(agent.agentId);
      if (!validatedSessionId) return { type: "waiting-agent", reason: "Desktop Agent session is unavailable" };
      if (agent.connectionId && agent.connectionId !== validatedSessionId) {
        return { type: "waiting-agent", reason: "Desktop Agent capability snapshot is stale" };
      }
      const requiredCapabilities = [...new Set(compiled.operations
        .filter((operation) => operation.type === "GIT_INIT" || operation.type === "GIT_INSPECT")
        .map((operation) => desktopOperationCapability(operation.type)))];
      const missingCapability = requiredCapabilities.find((capability) => !agent.capabilities.includes(capability));
      if (missingCapability) {
        return { type: "waiting-agent", reason: `Desktop Agent capability is unavailable: ${missingCapability}` };
      }

      const leaseDurationMs = input.leaseDurationMs
        ?? protectedExecutionWindowMs(compiled, 60_000);
      const resultTimeoutMs = input.resultTimeoutMs
        ?? protectedExecutionWindowMs(compiled, 120_000);

      const job = await createDesktopJob(input.jobRoot, compiled, at);
      if (job.status === "completed" && job.result) return completedResult(run, job.result, job);
      if (job.status === "indeterminate") {
        return { type: "waiting-agent", reason: `Desktop Job ${job.jobId} requires reality reconciliation` };
      }
      if (await isDesktopJobContained(input.jobRoot, job.jobId)) {
        return { type: "waiting-agent", reason: `Desktop Job ${job.jobId} is operator-contained pending execution uncertainty` };
      }
      let sessionId = validatedSessionId;

      let leased = await acquireDesktopJobLease(
        input.jobRoot,
        job.jobId,
        sessionId,
        at,
        leaseDurationMs,
      );

      let dispatchPack: DesktopTaskPack = {
        ...leased.pack,
        attempt: leased.attempts,
        leaseUntil: leased.lease?.expiresAt ?? leased.pack.leaseUntil,
      };

      let result: DesktopJobResult;
      let readOnlyTimeoutRetries = 0;

      while (true) {
        try {
          input.transport.sendTask(agent.agentId, dispatchPack, sessionId);
          result = await input.transport.awaitResult(
            job.jobId,
            resultTimeoutMs,
          );
          break;
        } catch (error) {
          const reason =
            error instanceof Error
              ? error.message
              : String(error);

          if (desktopTaskPackMutates(dispatchPack)) {
            await markDesktopJobIndeterminate(
              input.jobRoot,
              job.jobId,
              sessionId,
              now(),
            );

            return {
              type: "waiting-agent",
              reason: `Desktop mutation result is indeterminate: ${reason}`,
            };
          }

          await requeueDesktopJob(
            input.jobRoot,
            job.jobId,
            sessionId,
            now(),
          );

          if (
            !isDesktopResultTimeout(error)
            || readOnlyTimeoutRetries
              >= MAX_READ_ONLY_RESULT_TIMEOUT_RETRIES
          ) {
            return {
              type: "retryable-failure",
              reason,
            };
          }

          readOnlyTimeoutRetries += 1;

          const retrySessionId =
            input.transport.getAgentSessionId(agent.agentId);

          if (!retrySessionId) {
            return {
              type: "waiting-agent",
              reason: "Desktop Agent session is unavailable",
            };
          }

          sessionId = retrySessionId;
          const retryAt = now();

          leased = await acquireDesktopJobLease(
            input.jobRoot,
            job.jobId,
            sessionId,
            retryAt,
            leaseDurationMs,
          );

          dispatchPack = {
            ...leased.pack,
            attempt: leased.attempts,
            leaseUntil:
              leased.lease?.expiresAt
              ?? leased.pack.leaseUntil,
          };
        }
      }

      if (result.status === "retryable-failure") {
        if (input.captureRetryableResultAsFeedback) {
          await completeDesktopJob(input.jobRoot, job.jobId, sessionId, result);
          return completedResult(run, result, leased);
        }
        await requeueDesktopJob(input.jobRoot, job.jobId, sessionId, result.completedAt);
        return { type: "retryable-failure", reason: failureReason(result) };
      }

      await completeDesktopJob(input.jobRoot, job.jobId, sessionId, result);
      if (result.status === "blocked-user") {
        return { type: "blocked-user", reason: failureReason(result) };
      }
      if (result.status === "final-failure") {
        return { type: "final-failure", reason: failureReason(result) };
      }
      return completedResult(run, result, leased);
    },
  };
}

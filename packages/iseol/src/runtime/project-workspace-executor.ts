import { IMPLEMENT_DONE_PAYLOAD } from "../chatgpt-web/patch-frame-contract.js";
import { ChatGptWebStructuredResultError, type ChatGptWebBrowserAdapter } from "../chatgpt-web/browser-adapter.js";
import { patchRejectionDiagnostic } from "../chatgpt-web/patch-diagnostics.js";
import { createHybridStageExecutor } from "../chatgpt-web/hybrid-executor.js";
import { buildValidatedPatchIntent, compileDesktopIntentToTaskPack } from "../chatgpt-web/intent-compiler.js";
import { listDesktopIntents, loadDesktopIntent } from "../chatgpt-web/intent-store.js";
import { createWebReasoningExecutor, type WebDesktopIntentRunner } from "../chatgpt-web/web-reasoning-executor.js";
import { createDesktopStageExecutor, desktopJobFeedback, type DesktopExecutionTransport, type DesktopTaskCompiler } from "../desktop-agent/desktop-executor.js";
import { findDesktopJobByIdempotencyKey } from "../desktop-agent/job-store.js";
import type { HarnessRuntimeRunEnvelope } from "../harness/contracts.js";
import type { HarnessStageExecutor } from "../harness/run-supervisor.js";
import { loadHarnessRun } from "../harness/run-store.js";
import type { WebWorkerSession } from "../chatgpt-web/contracts.js";

export type ProjectWorkspaceExecutorInput = {
  runRoot: string;
  workerRoot: string;
  registryRoot?: string;
  desktopStateRoot: string;
  desktopTransport: DesktopExecutionTransport;
  browserAdapter: ChatGptWebBrowserAdapter;
  desktopTaskCompiler: DesktopTaskCompiler;
  agentId: string;
  now?: () => string;
  /** Optional bounded owner for Web-owned stages, used by isolated local Runtime paths. */
  webExecutor?: HarnessStageExecutor;
  providerExecutor?: HarnessStageExecutor;
};

function safePatchRejection(raw: string, error: unknown): ChatGptWebStructuredResultError {
  const reason = error instanceof Error ? error.message : "Patch validation failed";
  const rejectionClass = /path|workspace/i.test(reason)
    ? "invalid-path"
    : /hunk.*line counts/i.test(reason)
      ? "malformed-hunk"
      : /hunk|diff/i.test(reason)
        ? "malformed-unified-diff"
        : "unknown-safe-class";
  const safeReason = rejectionClass === "malformed-hunk"
    ? "hunk line counts do not match"
    : rejectionClass === "invalid-path"
      ? "workspace path rejected"
      : rejectionClass === "malformed-unified-diff"
        ? "unified diff rejected"
        : "patch validation rejected";
  return new ChatGptWebStructuredResultError(`ChatGPT patch validation failed: ${safeReason}`, {
    ...patchRejectionDiagnostic(raw, rejectionClass),
    diagnosticCategory: "patch-validation-failure",
    validationResult: "rejected",
  });
}

export function createProjectWorkspaceExecutor(input: ProjectWorkspaceExecutorInput): HarnessStageExecutor {
  const now = input.now ?? (() => new Date().toISOString());
  const browserAdapter: ChatGptWebBrowserAdapter = {
    openOrResumeSession: (session, prompt) => input.browserAdapter.openOrResumeSession(session, prompt),
    submitTurn: (session, prompt) => input.browserAdapter.submitTurn(session, prompt),
    probeSession: (session) => input.browserAdapter.probeSession(session),
    closeSession: (session) => input.browserAdapter.closeSession(session),
    recordResultDiagnostic: input.browserAdapter.recordResultDiagnostic
      ? (diagnostic) => input.browserAdapter.recordResultDiagnostic!(diagnostic)
      : undefined,
    async awaitStructuredResult(session, timeoutMs, contract) {
      const raw = await input.browserAdapter.awaitStructuredResult(session, timeoutMs, contract);
      if (contract !== "patch-frame-v1" || typeof raw !== "string") return raw;
      const run = await loadHarnessRun(input.runRoot, session.runId);
      if (!run) throw new ChatGptWebStructuredResultError("ChatGPT patch validation requires the active Run");
      try {
        if (raw.trim() === IMPLEMENT_DONE_PAYLOAD) {
          return { version: 1, runId: run.request.runId, stage: run.state.stage, generation: session.generation,
            summary: "IMPLEMENT patch sequence complete", decisions: [], intents: [], outcome: "stage-complete" };
        }
        const intent = buildValidatedPatchIntent({ run, session, resultGeneration: session.generation, commitAuthorized: false }, raw);
        return { version: 1, runId: run.request.runId, stage: run.state.stage, generation: session.generation,
          summary: "Validated IMPLEMENT patch", decisions: [], intents: [intent], outcome: "continue" };
      } catch (error) {
        throw safePatchRejection(raw, error);
      }
    },
  };

  const runDesktopIntent: WebDesktopIntentRunner = async ({ run, session, intent }) => {
    const pack = compileDesktopIntentToTaskPack({ run, session, resultGeneration: session.generation }, intent, input.agentId, now());
    return createDesktopStageExecutor({
      registryRoot: input.registryRoot ?? input.desktopStateRoot,
      jobRoot: input.desktopStateRoot,
      transport: input.desktopTransport,
      compileTaskPack: async () => pack,
      captureRetryableResultAsFeedback: true,
      now,
    }).execute(run);
  };

  const recoverDesktopFeedback = async ({ run, priorTurns }: { run: HarnessRuntimeRunEnvelope; priorTurns: Array<{ desktopIntentIds: string[] }> }) => {
    const feedback = [];
    const seen = new Set<string>();
    for (const turn of priorTurns) {
      for (const intentId of turn.desktopIntentIds) {
        if (seen.has(intentId)) continue;
        seen.add(intentId);
        const intentRecord = await loadDesktopIntent(input.workerRoot, run.request.runId, intentId);
        if (!intentRecord) throw new Error(`Recovered Desktop intent record is missing: ${intentId}`);
        if (intentRecord.status === "rejected") {
          feedback.push({ kind: "reasoning-rejection" as const, summary: intentRecord.reason ?? "Desktop intent was rejected", reference: `intent:${intentId}` });
          continue;
        }
        const job = await findDesktopJobByIdempotencyKey(input.desktopStateRoot, `web-intent:${run.request.runId}:${intentId}`);
        if (!job || job.status !== "completed" || !job.result) throw new Error(`Recovered Desktop Job is not completed: ${intentId}`);
        if (job.runId !== run.request.runId || job.stage !== run.state.stage) throw new Error(`Recovered Desktop Job identity mismatch: ${intentId}`);
        feedback.push(...desktopJobFeedback(run, job.result, job));
      }
    }
    for (const intentRecord of await listDesktopIntents(input.workerRoot, run.request.runId)) {
      const intentId = intentRecord.intent.intentId;
      if (seen.has(intentId) || intentRecord.status !== "accepted") continue;
      if (intentRecord.intent.runId !== run.request.runId || intentRecord.intent.stage !== run.state.stage) continue;
      const job = await findDesktopJobByIdempotencyKey(input.desktopStateRoot, `web-intent:${run.request.runId}:${intentId}`);
      if (!job || job.status !== "completed" || !job.result) continue;
      if (job.runId !== run.request.runId || job.stage !== run.state.stage) throw new Error(`Recovered Desktop Job identity mismatch: ${intentId}`);
      seen.add(intentId);
      feedback.push(...desktopJobFeedback(run, job.result, job));
    }
    return feedback;
  };

  const web = createWebReasoningExecutor({
    workerRoot: input.workerRoot,
    adapter: browserAdapter,
    runDesktopIntent,
    recoverDesktopFeedback,
    now,
    rateLimitBackoffMs: [30_000, 60_000, 120_000],
    commitAuthorized: false,
  });
  const desktop = createDesktopStageExecutor({
    registryRoot: input.registryRoot ?? input.desktopStateRoot,
    jobRoot: input.desktopStateRoot,
    transport: input.desktopTransport,
    compileTaskPack: input.desktopTaskCompiler,
    now,
  });
  return createHybridStageExecutor({
    webExecutor: input.webExecutor ?? web,
    desktopExecutor: desktop,
    ...(input.providerExecutor ? { providerExecutor: input.providerExecutor } : {}),
  });
}

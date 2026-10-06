import { IMPLEMENT_DONE_PAYLOAD } from "./patch-frame-contract.js";
import { createHash } from "node:crypto";
import type { HarnessEvidenceRecord, HarnessRuntimeRunEnvelope } from "../harness/contracts.js";
import type { HarnessStageExecutor, HarnessStageExecutionResult } from "../harness/run-supervisor.js";
import type { DesktopIntent, ReasoningTurn, WebWorkerSession } from "./contracts.js";
import { assertReasoningTurnResult, persistedWebWorkerResultContract, reasoningResultRejectionDiagnostic } from "./contracts.js";
import type { ChatGptWebBrowserAdapter, ChatGptWebResultContract } from "./browser-adapter.js";
import { ChatGptWebConversationLimitError, ChatGptWebSessionLostError, ChatGptWebStructuredResultError, ChatGptWebTemporarilyLimitedError, ChatGptWebUsageLimitError } from "./browser-adapter.js";
import { compileWebPrompt, type CompiledWebPrompt, type WebPromptEvidence } from "./prompt-compiler.js";
import { createWebWorkerSession, getActiveWebWorkerSession, getPointedWebWorkerSession, repairActiveWebWorkerSession, replaceLostWebWorkerSession, updateWebWorkerSession } from "./session-store.js";
import { appendReasoningTurn, listReasoningTurns } from "./turn-store.js";
import { recordDesktopIntent } from "./intent-store.js";
import { validateDesktopIntent } from "./intent-compiler.js";
import { assertActiveWebWorkerResult, recoverWebWorkerSession } from "./recovery.js";
import type { RequestBudgetStore } from "./request-budget.js";
import { formatUserFacingError } from "../security/user-error.js";

export type WebDesktopIntentRunnerInput = {
  run: HarnessRuntimeRunEnvelope;
  session: WebWorkerSession;
  intent: DesktopIntent;
};
export type WebDesktopIntentExecutionResult =
  | { type: "completed"; evidence: HarnessEvidenceRecord[]; feedback?: WebPromptEvidence[] }
  | Exclude<HarnessStageExecutionResult, { type: "completed" }>;
export type WebDesktopIntentRunner = (input: WebDesktopIntentRunnerInput) => Promise<WebDesktopIntentExecutionResult>;

export type ChatGptWebResultStage = "CONTEXT" | "ANALYZE" | "PLAN" | "IMPLEMENT" | "SELF_REVIEW";

export function resultContractForStage(stage: ChatGptWebResultStage): ChatGptWebResultContract {
  return stage === "IMPLEMENT" ? "patch-frame-v1" : "structured-json";
}

export type CreateWebReasoningExecutorInput = {
  workerRoot: string;
  adapter: ChatGptWebBrowserAdapter;
  runDesktopIntent: WebDesktopIntentRunner;
  recoverDesktopFeedback?: (input: { run: HarnessRuntimeRunEnvelope; priorTurns: ReasoningTurn[] }) => Promise<WebPromptEvidence[]>;
  now?: () => string;
  resultTimeoutMs?: number;
  maxTurnsPerStage?: number;
  maxRecoveryAttempts?: number;
  maxRejectedIntents?: number;
  sleep?: (ms: number) => Promise<void>;
  rateLimitBackoffMs?: readonly number[];
  commitAuthorized?: boolean;
  requestBudget?: RequestBudgetStore;
};
function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function sessionId(runId: string, stage: string, generation: number): string {
  return `web-${digest(`${runId}\n${stage}\n${generation}`).slice(0, 24)}`;
}
function turnId(session: WebWorkerSession, prompt: CompiledWebPrompt, responseSha256: string): string {
  return `turn-${digest(`${session.sessionId}\n${prompt.sha256}\n${responseSha256}`).slice(0, 24)}`;
}
function reasoningEvidence(turn: ReasoningTurn): HarnessEvidenceRecord {
  return {
    version: 1,
    id: `web-${turn.turnId}`,
    kind: turn.stage === "SELF_REVIEW" ? "review" : "command",
    stage: turn.stage,
    recordedAt: turn.recordedAt,
    summary: turn.summary,
    provider: "chatgpt-web",
    reference: `reasoning-turn:${turn.turnId}`,
  };
}
function feedbackEvidence(records: HarnessEvidenceRecord[]): WebPromptEvidence[] {
  return records.map((item) => ({ kind: item.kind, summary: item.summary, ...(item.reference ? { reference: item.reference } : {}) }));
}
function completedStageContext(turns: ReasoningTurn[], run: HarnessRuntimeRunEnvelope): WebPromptEvidence[] {
  const completedStages = new Set(run.state.completedStages);
  const latestByStage = new Map<ReasoningTurn["stage"], ReasoningTurn>();
  for (const turn of turns) {
    if (turn.stage === run.state.stage || turn.outcome !== "stage-complete" || !completedStages.has(turn.stage)) continue;
    latestByStage.set(turn.stage, turn);
  }
  return [...latestByStage.values()].map((turn) => ({
    kind: "reasoning-context",
    summary: [
      `Verified ${turn.stage} summary: ${turn.summary}`,
      ...turn.decisions.map((decision) => `Decision: ${decision}`),
    ].join("\n"),
    reference: `reasoning-turn:${turn.turnId}`,
  }));
}
const STRUCTURED_JSON_CORRECTION = "Previous response was not valid structured output. Return no markdown or prose. Return exactly one JSON object matching the current stage's ReasoningTurnResult contract and only the Desktop intent kinds explicitly allowed by the prompt. All string values must be valid JSON strings. Never place an unescaped double quote inside a string value. In summary and decisions, rewrite quoted identifiers, action keys, commands, and commit messages using single quotes or plain wording.";
const PATCH_FRAME_V1_CORRECTION = `Previous IMPLEMENT response was invalid. The exact first line must be ISEOL_PATCH_V1. After that line, return exactly one git-apply-compatible single-file raw unified diff through EOF. Do not include Markdown fences, a closing marker, prose, JSON, or additional file patches. If more files remain, return only the next single-file patch now. Only if all intended implementation changes were already applied in prior accepted patch turns may the payload instead be exactly ${IMPLEMENT_DONE_PAYLOAD}. Do not return a structured control envelope.`;
function structuredCorrection(reason: string, contract: ChatGptWebResultContract): string {
  const boundedReason = reason.replace(/\s+/g, " ").trim().slice(0, 240);
  const instruction = contract === "patch-frame-v1" ? PATCH_FRAME_V1_CORRECTION : STRUCTURED_JSON_CORRECTION;
  return `${instruction} Validation failure: ${boundedReason}`;
}
function structuredResultFailureClass(
  error: ChatGptWebStructuredResultError,
  contract?: ChatGptWebResultContract,
): string {
  const category = error.diagnostic?.diagnosticCategory;

  if (category === "reasoning-result-schema-failure" && error.diagnostic?.rejectionClass) {
    return String(error.diagnostic.rejectionClass);
  }
  if (error.diagnostic?.rejectionClass && category === "response-envelope-malformed") {
    return String(error.diagnostic.rejectionClass);
  }

  if (category === "patch-frame-format-failure") {
    if (error.diagnostic?.payloadEmpty === true) {
      return "patch frame invalid: payload empty";
    }
    if (/exceeds the allowed size/i.test(error.message)) {
      return "patch frame invalid: result too large";
    }
    return "patch frame invalid: header missing or invalid";
  }

  if (category === "patch-validation-failure") {
    if (/exactly one file diff/i.test(error.message)) {
      return "patch validation invalid: file diff count";
    }
    if (/hunk header is invalid/i.test(error.message)) {
      return "patch validation invalid: hunk header";
    }
    if (/hunk line counts do not match/i.test(error.message)) {
      return "patch validation invalid: hunk line counts";
    }
    if (/hunk body lines require/i.test(error.message)) {
      return "patch validation invalid: hunk body";
    }
    if (/at least one hunk/i.test(error.message)) {
      return "patch validation invalid: missing hunk";
    }
    return "patch validation invalid";
  }

  return contract === "patch-frame-v1" && /patch|propose_patch/i.test(error.message)
    ? "patch appendix invalid"
    : "structured result invalid";
}
function browserFailureClass(error: unknown): string {
  if (error instanceof ChatGptWebTemporarilyLimitedError) return "temporary rate limit";
  if (error instanceof ChatGptWebUsageLimitError) return "usage limit";
  if (error instanceof ChatGptWebConversationLimitError) return "conversation limit";
  if (error instanceof ChatGptWebStructuredResultError) return structuredResultFailureClass(error);
  if (error instanceof ChatGptWebSessionLostError) {
    if (/structured result timed out/i.test(error.message)) return "structured result timeout";
    if (/composer is missing or ambiguous/i.test(error.message)) return "owned-page-stale";
    if (/identity changed while reading result|identity changed after prompt submission/i.test(error.message)) return "conversation-identity-changed";
    if (/identity changed during navigation/i.test(error.message)) return "navigation-state-unexpected";
    if (/assistant source is unavailable/i.test(error.message)) return "assistant-baseline-missing";
    if (/no pending ChatGPT submission/i.test(error.message)) return "persisted-session-stale";
    if (/conversation (?:reference|identity).*(?:unavailable|missing|not assign)|canonical conversation identity.*(?:unavailable|not assign)/i.test(error.message)) {
      return "conversation identity unavailable";
    }
    if (error.failureClass && error.failureClass !== "unknown") return `browser-${error.failureClass}`;
    return "unknown-session-loss";
  }
  return "browser failure";
}
async function ensureSession(input: CreateWebReasoningExecutorInput, run: HarnessRuntimeRunEnvelope, at: string): Promise<WebWorkerSession> {
  await repairActiveWebWorkerSession(input.workerRoot, run.request.runId, run.state.stage);
  const existing = await getActiveWebWorkerSession(input.workerRoot, run.request.runId, run.state.stage);
  if (existing) {
    const projectIdentity = run.request.projectId && !existing.projectId
      ? { projectId: run.request.projectId }
      : {};
    if (existing.resultContract && Object.keys(projectIdentity).length === 0) return existing;
    return updateWebWorkerSession(input.workerRoot, {
      ...existing,
      ...projectIdentity,
      resultContract: existing.resultContract ?? persistedWebWorkerResultContract(existing),
    });
  }
  const policy = run.preflight.policy;
  if (run.preflight.status !== "ready" || !policy) throw new Error("Web reasoning requires ready Harness policy");
  const pointed = await getPointedWebWorkerSession(input.workerRoot, run.request.runId, run.state.stage);
  if (pointed?.status === "lost") {
    const generation = pointed.generation + 1;
    return replaceLostWebWorkerSession(input.workerRoot, pointed.sessionId, {
      version: 1,
      sessionId: sessionId(run.request.runId, run.state.stage, generation),
      runId: run.request.runId,
      stage: run.state.stage,
      generation,
      policySha256: policy.effectiveSha256,
      status: "ready",
      resultContract: persistedWebWorkerResultContract(pointed),
      createdAt: at,
    }, at);
  }
  return createWebWorkerSession(input.workerRoot, {
    version: 1,
    sessionId: sessionId(run.request.runId, run.state.stage, 1),
    runId: run.request.runId,
    ...(run.request.projectId ? { projectId: run.request.projectId } : {}),
    stage: run.state.stage,
    generation: 1,
    policySha256: policy.effectiveSha256,
    status: "ready",
    resultContract: resultContractForStage(run.state.stage as ChatGptWebResultStage),
    createdAt: at,
  });
}
export function createWebReasoningExecutor(input: CreateWebReasoningExecutorInput): HarnessStageExecutor {
  const now = input.now ?? (() => new Date().toISOString());
  const resultTimeoutMs = input.resultTimeoutMs ?? 240_000;
  const maxTurns = input.maxTurnsPerStage ?? 8;
  const maxRecoveryAttempts = input.maxRecoveryAttempts ?? maxTurns;
  const maxRejected = input.maxRejectedIntents ?? 3;
  const sleep = input.sleep
    ?? ((ms: number) => new Promise<void>((resolveDelay) => setTimeout(resolveDelay, ms)));
  const rateLimitBackoffMs = [...(input.rateLimitBackoffMs ?? [])];

  if (!Number.isInteger(maxTurns) || maxTurns <= 0) throw new Error("maxTurnsPerStage must be a positive integer");
  if (!Number.isInteger(maxRecoveryAttempts) || maxRecoveryAttempts <= 0) throw new Error("maxRecoveryAttempts must be a positive integer");
  if (!Number.isInteger(maxRejected) || maxRejected <= 0) throw new Error("maxRejectedIntents must be a positive integer");
  if (rateLimitBackoffMs.some((ms) => !Number.isInteger(ms) || ms < 0)) {
    throw new Error("rateLimitBackoffMs must contain non-negative integers");
  }

  return {
    async execute(run): Promise<HarnessStageExecutionResult> {
      if (!["ANALYZE", "PLAN", "IMPLEMENT", "SELF_REVIEW"].includes(run.state.stage)) {
        return { type: "waiting-external", reason: `${run.state.stage} is not owned by ChatGPT Web reasoning` };
      }
      let session = await ensureSession(input, run, now());
      const allTurns = await listReasoningTurns(input.workerRoot, run.request.runId);
      let priorTurns = allTurns.filter((turn) => turn.stage === run.state.stage);
      const accumulatedEvidence: HarnessEvidenceRecord[] = [];
      const recoveredCurrentStageEvidence = input.recoverDesktopFeedback
        ? await input.recoverDesktopFeedback({ run, priorTurns })
        : [];
      let desktopEvidence: WebPromptEvidence[] = [
        ...completedStageContext(allTurns, run),
        ...recoveredCurrentStageEvidence,
      ];
      let prompt = compileWebPrompt({
        kind: priorTurns.length === 0 ? "initial" : "feedback",
        run, session, priorTurns, desktopEvidence,
      });
      let openedSessionId: string | null = null;
      let acceptedTurns = 0;
      let rejectedCount = 0;
      // Persisted generations bound recovery across Runtime restarts. Older
      // sessions lacked recoveryCount, so generation remains the fallback.
      let recoveries = Math.max(session.recoveryCount ?? 0, session.generation - 1);
      let identitylessRecoveries = 0;
      let rateLimitRetries = 0;
      let finalRecoveryClass = "session lost";
      const resultContract = persistedWebWorkerResultContract(session);

      while (acceptedTurns < maxTurns) {
        let rawResult: unknown;
        let submittedThisAttempt = false;
        const requestId = `external-${digest(`${session.sessionId}\n${prompt.sha256}\n${acceptedTurns}\n${rejectedCount}\n${recoveries}` ).slice(0, 32)}`;
        let requestReserved = false;
        try {
          if (openedSessionId !== session.sessionId) {
            const opened = await input.adapter.openOrResumeSession(session, prompt);
            if (opened.conversationRef && opened.conversationRef !== session.conversationRef) {
              session = await updateWebWorkerSession(input.workerRoot, { ...session, conversationRef: opened.conversationRef });
            }
            openedSessionId = session.sessionId;
          }
          if (input.requestBudget) {
            const reservation = await input.requestBudget.reserve(run.request.runId, requestId, { stage: run.state.stage });
            if (reservation !== "reserved") {
              return { type: "waiting-external", reason: reservation === "exhausted" ? "ChatGPT Web external request budget exhausted" : "ChatGPT Web external request already reserved" };
            }
            requestReserved = true;
          }
          const submitted = await input.adapter.submitTurn(session, prompt);
          if (submitted?.conversationRef && submitted.conversationRef !== session.conversationRef) {
            session = await updateWebWorkerSession(input.workerRoot, { ...session, conversationRef: submitted.conversationRef });
          }
          submittedThisAttempt = true;
          rawResult = await input.adapter.awaitStructuredResult(
            session,
            resultTimeoutMs,
            resultContract,
          );
          if (input.requestBudget && requestReserved) {
            await input.requestBudget.complete(run.request.runId, requestId, "consumed");
            requestReserved = false;
          }
        } catch (error) {
          if (input.requestBudget && requestReserved) {
            if (submittedThisAttempt && error instanceof ChatGptWebStructuredResultError) {
              await input.requestBudget.complete(run.request.runId, requestId, "consumed");
              requestReserved = false;
            } else if (submittedThisAttempt) {
              await input.requestBudget.complete(run.request.runId, requestId, "unknown");
              requestReserved = false;
              return { type: "waiting-external", reason: "ChatGPT Web request outcome is UNKNOWN; automatic resubmission is blocked" };
            } else {
              await input.requestBudget.release(run.request.runId, requestId);
              requestReserved = false;
            }
          }
          if (error instanceof ChatGptWebTemporarilyLimitedError) {
            if (submittedThisAttempt) {
              return { type: "waiting-external", reason: "ChatGPT Web failure: temporary rate limit" };
            }

            const delayMs = rateLimitBackoffMs[rateLimitRetries];

            if (delayMs === undefined) {
              return { type: "waiting-external", reason: "ChatGPT Web failure: temporary rate limit" };
            }

            rateLimitRetries += 1;
            await sleep(delayMs);
            continue;
          }
          if (error instanceof ChatGptWebUsageLimitError) {
            return { type: "waiting-external", reason: "ChatGPT Web failure: usage limit" };
          }
          if (error instanceof ChatGptWebStructuredResultError) {
            const correctionAttempt = rejectedCount + 1;
            rejectedCount = correctionAttempt;
            await input.adapter.recordResultDiagnostic?.({
              session,
              contract: resultContract,
              message: "Structured result correction attempt",
              diagnostic: error.diagnostic ?? { diagnosticCategory: "structured-result-rejection", parserInputReceived: true },
              correctionAttempt,
              correctionBudgetUsed: rejectedCount,
              correctionBudgetLimit: maxRejected,
            });
            if (rejectedCount >= maxRejected) {
              return { type: "retryable-failure", reason: `ChatGPT Web failure: rejected structured-result budget exhausted; ${structuredResultFailureClass(error, resultContract)}` };
            }
            desktopEvidence = [...desktopEvidence, { kind: "reasoning-rejection", summary: structuredCorrection(error.message, resultContract) }];
            prompt = compileWebPrompt({ kind: "feedback", run, session, priorTurns, desktopEvidence });
            continue;
          }
          if (!(error instanceof ChatGptWebSessionLostError) && !(error instanceof ChatGptWebConversationLimitError)) {
            return { type: "retryable-failure", reason: `ChatGPT Web failure: ${browserFailureClass(error)}` };
          }
          finalRecoveryClass = browserFailureClass(error);
          if (!session.conversationRef) {
            identitylessRecoveries += 1;
            if (identitylessRecoveries > 1) {
              return { type: "retryable-failure", reason: `ChatGPT Web recovery budget exhausted: ${finalRecoveryClass}` };
            }
          }
          if (recoveries >= maxRecoveryAttempts) {
            return { type: "retryable-failure", reason: `ChatGPT Web recovery budget exhausted: ${finalRecoveryClass}` };
          }
          recoveries += 1;
          const recovered = await recoverWebWorkerSession({
            workerRoot: input.workerRoot, run, session, priorTurns, desktopEvidence, at: now(),
          });
          session = recovered.session;
          prompt = recovered.prompt;
          openedSessionId = null;
          continue;
        }

        rateLimitRetries = 0;

        let result;
        try {
          assertReasoningTurnResult(rawResult);
          result = await assertActiveWebWorkerResult(input.workerRoot, run, session, rawResult);
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Structured result validation failed";
          if (/result generation is stale/i.test(reason)) {
            rejectedCount += 1;
            if (rejectedCount >= maxRejected) return { type: "retryable-failure", reason: "ChatGPT Web failure: rejected structured-result budget exhausted; structured result invalid" };
            const receivedGeneration = (rawResult as { generation?: unknown }).generation;
            desktopEvidence = [...desktopEvidence, {
              kind: "reasoning-rejection",
              summary: `Expected generation ${session.generation}; received ${String(receivedGeneration)}. ${reason}`,
            }];
            prompt = compileWebPrompt({ kind: "feedback", run, session, priorTurns, desktopEvidence });
            continue;
          }
          if (/policy|stale|generation|active session/i.test(reason)) return { type: "retryable-failure", reason };
          const diagnostic = reasoningResultRejectionDiagnostic(rawResult, error);
          const correctionAttempt = rejectedCount + 1;
          await input.adapter.recordResultDiagnostic?.({
            session,
            contract: resultContract,
            message: "Reasoning result schema validation failed",
            diagnostic,
            correctionAttempt,
            correctionBudgetUsed: correctionAttempt,
            correctionBudgetLimit: maxRejected,
          });
          const boundedReason = String(diagnostic.rejectionClass);
          rejectedCount = correctionAttempt;
          if (rejectedCount >= maxRejected) return { type: "retryable-failure", reason: `ChatGPT Web failure: rejected structured-result budget exhausted; ${boundedReason}` };
          desktopEvidence = [...desktopEvidence, { kind: "reasoning-rejection", summary: `Structured result rejected: ${boundedReason}` }];
          prompt = compileWebPrompt({ kind: "feedback", run, session, priorTurns, desktopEvidence });
          continue;
        }
        const turnDesktopFeedback: WebPromptEvidence[] = [];
        const rejectedFeedback: WebPromptEvidence[] = [];
        for (const intent of result.intents) {
          try {
            validateDesktopIntent({
              run,
              session,
              resultGeneration: result.generation,
              commitAuthorized: input.commitAuthorized ?? false,
            }, intent);
          } catch (error) {
            const reason = formatUserFacingError(error);
            await recordDesktopIntent(input.workerRoot, { intent, status: "rejected", reason, recordedAt: now() });
            rejectedCount += 1;
            rejectedFeedback.push({ kind: "reasoning-rejection", summary: reason, reference: `intent:${intent.intentId}` });
            if (rejectedCount >= maxRejected) {
              return { type: "retryable-failure", reason: `Rejected intent budget exhausted: ${reason}` };
            }
            continue;
          }

          await recordDesktopIntent(input.workerRoot, { intent, status: "accepted", recordedAt: now() });
          let desktopResult: WebDesktopIntentExecutionResult;
          try {
            desktopResult = await input.runDesktopIntent({ run, session, intent });
          } catch (error) {
            return { type: "retryable-failure", reason: formatUserFacingError(error) };
          }
          if (desktopResult.type !== "completed") return desktopResult;
          accumulatedEvidence.push(...desktopResult.evidence);
          turnDesktopFeedback.push(...(desktopResult.feedback ?? feedbackEvidence(desktopResult.evidence)));
        }

        const responseSha256 = digest(JSON.stringify(result));
        const turn: ReasoningTurn = {
          version: 1,
          turnId: turnId(session, prompt, responseSha256),
          sessionId: session.sessionId,
          runId: run.request.runId,
          stage: run.state.stage,
          generation: session.generation,
          promptSha256: prompt.sha256,
          responseSha256,
          summary: result.summary,
          decisions: [...result.decisions],
          desktopIntentIds: result.intents.map((intent) => intent.intentId),
          outcome: result.outcome,
          recordedAt: now(),
        };
        await appendReasoningTurn(input.workerRoot, turn);
        priorTurns = [...priorTurns, turn];
        session = await updateWebWorkerSession(input.workerRoot, { ...session, lastTurnAt: turn.recordedAt, status: "ready" });
        acceptedTurns += 1;

        if (result.outcome === "blocked-user") return { type: "blocked-user", reason: result.blockerReason! };
        if (result.outcome === "retryable") return { type: "retryable-failure", reason: result.summary };
        if (result.outcome === "stage-complete") {
          return { type: "completed", evidence: [...accumulatedEvidence, reasoningEvidence(turn)] };
        }

        desktopEvidence = [
          ...desktopEvidence,
          ...turnDesktopFeedback,
          ...rejectedFeedback,
        ];
        prompt = compileWebPrompt({ kind: "feedback", run, session, priorTurns, desktopEvidence });
      }

      return { type: "retryable-failure", reason: `ChatGPT Web turn budget exhausted after ${maxTurns} turns` };
    },
  };
}

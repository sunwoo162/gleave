import { createHash } from "node:crypto";
import { ChatGptWebSessionLostError } from "../chatgpt-web/browser-adapter.js";
import {
  classifyChatGptBrowserOperationFailure,
  type ChatGptBrowserDriver,
} from "../chatgpt-web/production-browser-adapter.js";
import {
  ChatGptWebAuthenticationRequiredError,
  ChatGptWebConversationLimitError,
  ChatGptWebStructuredResultError,
  ChatGptWebTemporarilyLimitedError,
  ChatGptWebUsageLimitError,
} from "../chatgpt-web/browser-adapter.js";
import {
  ExternalRequestBudgetExhaustedError,
  ExternalRequestOutcomeUnknownError,
  type RequestBudgetStore,
} from "../chatgpt-web/request-budget.js";
import type {
  RequestDiagnosticStage,
  RequestDiagnosticStore,
} from "../chatgpt-web/request-diagnostics.js";
import {
  assertIdeaProposalProviderResult,
  type IdeaProposalProvider,
  type IdeaProposalProviderInput,
} from "./proposal-provider.js";

const DRAFT_FIELDS = [
  "title", "concept", "problemDomain", "targetUser", "jobToBeDone",
  "coreInteractionLoop", "dataModel", "primaryDifferentiator", "whyMateriallyDifferent",
] as const;
const MAX_CONTEXT_BYTES = 128 * 1024;

type ProposalProviderOptions = {
  timeoutMs?: number;
  requestBudget?: RequestBudgetStore;
  diagnostics?: RequestDiagnosticStore;
  now?: () => string;
};

function failureClass(error: unknown): string {
  if (error instanceof ChatGptWebStructuredResultError) return "structured-result-parser-rejection";
  if (error instanceof ChatGptWebSessionLostError) return error.failureClass ?? "unknown-session-loss";
  if (error instanceof ChatGptWebAuthenticationRequiredError) return "auth-or-login-page";
  if (error instanceof ChatGptWebTemporarilyLimitedError) return "temporary-limit";
  if (error instanceof ChatGptWebConversationLimitError) return "conversation-limit";
  if (error instanceof ChatGptWebUsageLimitError) return "usage-limit";
  if (error instanceof ExternalRequestBudgetExhaustedError) return "budget-exhausted";
  return classifyChatGptBrowserOperationFailure(error);
}

function compilePrompt(input: IdeaProposalProviderInput): { body: string; sha256: string } {
  if (!Number.isInteger(input.requestedCount) || input.requestedCount <= 0) {
    throw new Error("Idea proposal requestedCount must be a positive integer");
  }
  const context = {
    seed: input.seed,
    constraints: input.constraints,
    requestedCount: input.requestedCount,
    attempt: input.attempt,
    accepted: input.accepted,
  };
  const contextJson = JSON.stringify(context);
  if (Buffer.byteLength(contextJson, "utf8") > MAX_CONTEXT_BYTES) {
    throw new Error("Idea proposal context exceeds 128 KiB");
  }  const body = [
    "You are the Iseol Idea Lab proposal generator.",
    `Return exactly ${input.requestedCount} materially different proposal(s) as one JSON array and nothing else.`,
    `Each object must contain exactly these string fields: ${DRAFT_FIELDS.join(", ")}.`,
    "Do not add markdown, commentary, metadata, or unknown fields.",
    "New proposals must be materially different from every accepted proposal in problem, user, interaction loop, or data model.",
    `Input context: ${contextJson}`,
  ].join("\n");
  return { body, sha256: createHash("sha256").update(body, "utf8").digest("hex") };
}

export function createChatGptIdeaProposalProvider(
  driver: ChatGptBrowserDriver,
  options: ProposalProviderOptions = {},
): IdeaProposalProvider {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const now = options.now ?? (() => new Date().toISOString());
  return {
    async generate(input) {
      const prompt = compilePrompt(input);
      let conversationRef: string | undefined;
      let primaryError: unknown;
      const budgetIdentity = input.budgetIdentity;
      // Prompt content can legitimately repeat across campaigns. Scope the
      // durable request identity to the campaign when a budget identity is
      // available, while preserving the legacy prompt identity for callers
      // that do not participate in the shared budget.
      const requestIdentity = budgetIdentity
        ? createHash("sha256").update(`${budgetIdentity}\n${prompt.sha256}`, "utf8").digest("hex")
        : prompt.sha256;
      const requestId = `proposal-${requestIdentity.slice(0, 48)}-${input.attempt}`;
      let budgetReserved = false;
      let submitAttempted = false;
      let responseReceived = false;
      let lastCompletedStage: RequestDiagnosticStage | undefined;
      const startedAt = Date.now();
      const record = async (
        stage: RequestDiagnosticStage,
        ok: boolean,
        details: { conversationRefPresent?: boolean; failureClass?: string } = {},
      ): Promise<void> => {
        if (!options.diagnostics || !requestId) return;
        if (ok && stage !== "request-failed") lastCompletedStage = stage;
        await options.diagnostics.record({
          requestId,
          stage,
          at: now(),
          ok,
          elapsedMs: Math.max(0, Date.now() - startedAt),
          ...(details.conversationRefPresent === undefined ? {} : { conversationRefPresent: details.conversationRefPresent }),
          ...(stage === "request-failed" && lastCompletedStage ? { lastCompletedStage } : {}),
          ...(details.failureClass === undefined ? {} : { failureClass: details.failureClass }),
        }).catch(() => undefined);
      };
      try {
        if (options.requestBudget && budgetIdentity && requestId) {
          const reservation = await options.requestBudget.reserve(budgetIdentity, requestId, { stage: "IDEA_PROPOSAL" });
          if (reservation !== "reserved") {
            throw new ExternalRequestBudgetExhaustedError();
          }
          budgetReserved = true;
          await record("request-reserved", true);
        }
        try {
          const opened = await driver.openOrResumeConversation({
            prompt: prompt.body,
            promptSha256: prompt.sha256,
          });
          conversationRef = opened.conversationRef;
          await record("browser-opened", true, { conversationRefPresent: Boolean(conversationRef) });
        } catch (error) {
          await record("browser-opened", false, { failureClass: failureClass(error) });
          throw error;
        }
        submitAttempted = true;
        await record("submit-started", true, { conversationRefPresent: Boolean(conversationRef) });
        try {
          const submitted = await driver.submitPrompt({
            ...(conversationRef ? { conversationRef } : {}),
            prompt: prompt.body,
            promptSha256: prompt.sha256,
          });
          conversationRef = submitted?.conversationRef ?? conversationRef;
          await record("submit-returned", true, { conversationRefPresent: Boolean(conversationRef) });
        } catch (error) {
          await record("submit-returned", false, { conversationRefPresent: Boolean(conversationRef), failureClass: failureClass(error) });
          throw error;
        }
        if (!conversationRef) {
          throw new ChatGptWebSessionLostError("Idea proposal conversation reference is unavailable after submit");
        }
        await record("response-read-started", true, { conversationRefPresent: true });
        let result: unknown;
        try {
          result = await driver.readStructuredResult({ requestId, conversationRef, timeoutMs, contract: "structured-json" });
          responseReceived = true;
          await record("response-read-returned", true, { conversationRefPresent: true });
        } catch (error) {
          if (error instanceof ChatGptWebStructuredResultError) {
            await driver.recordParserDiagnostic?.({
              ...(budgetIdentity ? { runId: budgetIdentity } : {}),
              stage: "IDEA_PROPOSAL",
              sessionId: requestId,
              generation: input.attempt,
              resultContract: "structured-json",
              ...(conversationRef ? { conversationRef } : {}),
              message: "ChatGPT structured result rejected",
              ...(error.diagnostic ? { diagnostic: error.diagnostic } : {}),
            }).catch(() => undefined);
          }
          await record("response-read-returned", false, { conversationRefPresent: true, failureClass: failureClass(error) });
          throw error;
        }
        try {
          assertIdeaProposalProviderResult(result, input.requestedCount);
          await record("structured-result-validated", true, { conversationRefPresent: true });
        } catch (error) {
          await record("structured-result-validated", false, { conversationRefPresent: true, failureClass: "structured-result-validation-failure" });
          throw error;
        }
        if (options.requestBudget && budgetIdentity && requestId && budgetReserved) {
          await options.requestBudget.complete(budgetIdentity, requestId, "consumed");
          budgetReserved = false;
        }
        return result.map((item) => ({ ...item }));
      } catch (error) {
        primaryError = error;
        await record("request-failed", false, {
          conversationRefPresent: Boolean(conversationRef),
          failureClass: failureClass(error),
        });
        if (options.requestBudget && budgetIdentity && requestId && budgetReserved) {
          if (submitAttempted && !responseReceived) {
            await options.requestBudget.complete(budgetIdentity, requestId, "unknown");
            budgetReserved = false;
            if (!(error instanceof ExternalRequestBudgetExhaustedError)) {
              throw new ExternalRequestOutcomeUnknownError();
            }
          } else if (submitAttempted) {
            await options.requestBudget.complete(budgetIdentity, requestId, "consumed");
            budgetReserved = false;
          } else {
            await options.requestBudget.release(budgetIdentity, requestId);
            budgetReserved = false;
          }
        }
        throw error;
      } finally {
        if (conversationRef) {
          try {
            await driver.closeConversation(conversationRef);
          } catch (closeError) {
            if (primaryError === undefined) throw closeError;
          }
        }
      }
    },
  };
}

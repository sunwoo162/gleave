import type { ReasoningTurnResult, WebWorkerResultContract, WebWorkerSession } from "./contracts.js";
import type { CompiledWebPrompt } from "./prompt-compiler.js";

export type ChatGptWebSessionProbe =
  | "ready" | "lost" | "auth-required" | "temporarily-limited"
  | "conversation-exhausted" | "usage-limited";
export type ChatGptWebOpenResult = { conversationRef?: string };
export type ChatGptWebResultContract = WebWorkerResultContract;
export type ChatGptBrowserOperationFailureClass =
  | "page-closed" | "context-closed" | "browser-disconnected" | "target-closed"
  | "page-missing" | "owned-page-missing" | "navigation-failed" | "locator-missing"
  | "execution-context-destroyed" | "timeout" | "session-not-found"
  | "conversation-not-found" | "auth-or-login-page" | "operation-aborted"
  | "conversation-identity-changed" | "pending-submission-missing"
  | "assistant-response-extraction-failed" | "clipboard-capture-failed"
  | "response-timeout" | "structured-result-parser-rejection"
  | "driver-error" | "unknown";

export class ChatGptWebSessionLostError extends Error {
  readonly failureClass?: ChatGptBrowserOperationFailureClass;
  constructor(message: string, failureClass?: ChatGptBrowserOperationFailureClass) {
    super(message);
    this.name = "ChatGptWebSessionLostError";
    this.failureClass = failureClass;
  }
}
export class ChatGptWebAuthenticationRequiredError extends Error {
  constructor(message: string) { super(message); this.name = "ChatGptWebAuthenticationRequiredError"; }
}
export class ChatGptWebTemporarilyLimitedError extends Error {
  constructor(message: string) { super(message); this.name = "ChatGptWebTemporarilyLimitedError"; }
}
export class ChatGptWebConversationLimitError extends Error {
  constructor(message: string) { super(message); this.name = "ChatGptWebConversationLimitError"; }
}
export class ChatGptWebUsageLimitError extends Error {
  constructor(message: string) { super(message); this.name = "ChatGptWebUsageLimitError"; }
}
export class ChatGptWebStructuredResultError extends Error {
  readonly diagnostic?: Record<string, string | boolean>;
  constructor(message: string, diagnostic?: Record<string, string | boolean>) { super(message); this.name = "ChatGptWebStructuredResultError"; this.diagnostic = diagnostic; }
}

export interface ChatGptWebBrowserAdapter {
  openOrResumeSession(session: WebWorkerSession, prompt: CompiledWebPrompt): Promise<ChatGptWebOpenResult>;
  submitTurn(session: WebWorkerSession, prompt: CompiledWebPrompt): Promise<ChatGptWebOpenResult | void>;
  awaitStructuredResult(session: WebWorkerSession, timeoutMs: number, contract: ChatGptWebResultContract): Promise<unknown>;
  probeSession(session: WebWorkerSession): Promise<ChatGptWebSessionProbe>;
  closeSession(session: WebWorkerSession): Promise<void>;
  recordResultDiagnostic?(input: {
    session: WebWorkerSession;
    contract: ChatGptWebResultContract;
    message: string;
    diagnostic: Record<string, string | boolean>;
    correctionAttempt?: number;
    correctionBudgetUsed?: number;
    correctionBudgetLimit?: number;
  }): Promise<void>;
}

export function asReasoningTurnResult(value: unknown): ReasoningTurnResult {
  return value as ReasoningTurnResult;
}

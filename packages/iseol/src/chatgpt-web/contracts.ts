import type { HarnessRunStage } from "../harness/contracts.js";
import { assertCheckHttpUrl, MAX_DESKTOP_TIMEOUT_MS } from "../desktop-agent/contracts.js";
import { assertNoCredentialShapedWebData } from "./credential-safety.js";

export const ISEOL_CHATGPT_WEB_PROTOCOL_VERSION = 1 as const;

export type WebWorkerSessionStatus = "starting" | "ready" | "busy" | "lost" | "closed";
export type WebWorkerResultContract = "structured-json" | "patch-frame-v1" | "legacy-structured-json";
export type ReasoningOutcome = "continue" | "stage-complete" | "blocked-user" | "retryable";

export type WebWorkerSession = {
  version: 1;
  sessionId: string;
  runId: string;
  projectId?: string;
  stage: HarnessRunStage;
  generation: number;
  /** Number of lost-session replacements already consumed for this Run/stage. */
  recoveryCount?: number;
  conversationRef?: string;
  policySha256: string;
  status: WebWorkerSessionStatus;
  resultContract?: WebWorkerResultContract;
  createdAt: string;
  lastTurnAt?: string;
  closedAt?: string;
};

export type DesktopIntentBase = {
  version: 1;
  intentId: string;
  runId: string;
  stage: HarnessRunStage;
  workspaceRoot: string;
  policySha256: string;
};
export type DesktopIntent =
  | (DesktopIntentBase & { kind: "READ_CONTEXT"; path: string })
  | (DesktopIntentBase & { kind: "PROPOSE_PATCH"; path: string; patch: string; patchText?: string })
  | (DesktopIntentBase & { kind: "RUN_TEST" | "RUN_BUILD"; cwd: string; executable: string; args: string[]; timeoutMs: number })
  | (DesktopIntentBase & { kind: "GIT_INSPECT"; cwd: string })
  | (DesktopIntentBase & { kind: "REQUEST_COMMIT"; cwd: string; message: string; expectedHead?: string })
  | (DesktopIntentBase & { kind: "CHECK_HTTP"; url: string; timeoutMs: number });

export type ReasoningTurnResult = {
  version: 1;
  runId: string;
  stage: HarnessRunStage;
  generation: number;
  summary: string;
  decisions: string[];
  intents: DesktopIntent[];
  outcome: ReasoningOutcome;
  blockerReason?: string;
};

export type ReasoningTurn = {
  version: 1;
  turnId: string;
  sessionId: string;
  runId: string;
  stage: HarnessRunStage;
  generation: number;
  promptSha256: string;
  responseSha256: string;
  summary: string;
  decisions: string[];
  desktopIntentIds: string[];
  outcome: ReasoningOutcome;
  recordedAt: string;
};
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const STAGES = new Set<HarnessRunStage>([
  "PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN", "IMPLEMENT", "TEST", "SELF_REVIEW",
  "COMMIT", "PR", "CI", "MERGE", "DEPLOY", "PRODUCTION_VERIFY", "DONE",
]);
const OUTCOMES = new Set<ReasoningOutcome>(["continue", "stage-complete", "blocked-user", "retryable"]);
const SESSION_STATUSES = new Set<WebWorkerSessionStatus>(["starting", "ready", "busy", "lost", "closed"]);
const RESULT_CONTRACTS = new Set<WebWorkerResultContract>(["structured-json", "patch-frame-v1", "legacy-structured-json"]);
const COMMON_INTENT_KEYS = ["version", "intentId", "runId", "stage", "workspaceRoot", "policySha256", "kind"] as const;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value;
}
function id(value: unknown, field: string): string {
  const result = text(value, field);
  if (!ID_PATTERN.test(result)) throw new Error(`${field} is invalid`);
  return result;
}
function iso(value: unknown, field: string): string {
  const result = text(value, field);
  if (Number.isNaN(Date.parse(result))) throw new Error(`${field} must be an ISO timestamp`);
  return result;
}
function generation(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1) throw new Error("generation must be a positive integer");
  return Number(value);
}
function recoveryCount(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 64) throw new Error("recoveryCount must be a bounded non-negative integer");
  return Number(value);
}
function stage(value: unknown): HarnessRunStage {
  const result = text(value, "stage") as HarnessRunStage;
  if (!STAGES.has(result)) throw new Error(`Unsupported Harness stage: ${result}`);
  return result;
}
function version(value: unknown): asserts value is 1 {
  if (value !== ISEOL_CHATGPT_WEB_PROTOCOL_VERSION) throw new Error(`Unsupported ChatGPT Web protocol version: ${String(value)}`);
}
function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`${field} must be a string array`);
  return value as string[];
}
function positiveTimeout(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0 || Number(value) > MAX_DESKTOP_TIMEOUT_MS) {
    throw new Error(`${field} must be a positive integer within the supported timer range`);
  }
  return Number(value);
}
function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unexpected) throw new Error(`${label} has unexpected field: ${unexpected}`);
}

export function assertWebWorkerSession(value: unknown): asserts value is WebWorkerSession {
  const item = record(value, "Web worker session");
  version(item.version); id(item.sessionId, "sessionId"); id(item.runId, "runId"); if (item.projectId !== undefined) id(item.projectId, "projectId"); stage(item.stage); generation(item.generation); if (item.recoveryCount !== undefined) recoveryCount(item.recoveryCount);
  text(item.policySha256, "policySha256"); iso(item.createdAt, "createdAt");
  if (!SESSION_STATUSES.has(item.status as WebWorkerSessionStatus)) throw new Error(`Unsupported session status: ${String(item.status)}`);
  if (item.resultContract !== undefined) {
    if (!RESULT_CONTRACTS.has(item.resultContract as WebWorkerResultContract)) throw new Error(`Unsupported Web worker result contract: ${String(item.resultContract)}`);
    if (item.stage === "IMPLEMENT" ? item.resultContract === "structured-json" : item.resultContract !== "structured-json") {
      throw new Error(`Web worker result contract is incompatible with stage ${String(item.stage)}`);
    }
  }
  if (item.conversationRef !== undefined) text(item.conversationRef, "conversationRef");
  if (item.lastTurnAt !== undefined) iso(item.lastTurnAt, "lastTurnAt");
  if (item.closedAt !== undefined) iso(item.closedAt, "closedAt");
}

export function persistedWebWorkerResultContract(session: WebWorkerSession): WebWorkerResultContract {
  if (session.resultContract) return session.resultContract;
  return session.stage === "IMPLEMENT" ? "patch-frame-v1" : "structured-json";
}
export function assertDesktopIntent(value: unknown): asserts value is DesktopIntent {
  const item = record(value, "Desktop intent");
  version(item.version); id(item.intentId, "intentId"); id(item.runId, "runId"); stage(item.stage);
  text(item.workspaceRoot, "workspaceRoot"); text(item.policySha256, "policySha256");
  const kind = text(item.kind, "intent kind");

  if (kind === "READ_CONTEXT") {
    exactKeys(item, [...COMMON_INTENT_KEYS, "path"], "Desktop intent"); text(item.path, "path"); return;
  }
  if (kind === "PROPOSE_PATCH") {
    exactKeys(item, [...COMMON_INTENT_KEYS, "path", "patch", "patchText"], "Desktop intent"); text(item.path, "path"); text(item.patch, "patch"); if (item.patchText !== undefined) text(item.patchText, "patchText"); return;
  }
  if (kind === "RUN_TEST" || kind === "RUN_BUILD") {
    exactKeys(item, [...COMMON_INTENT_KEYS, "cwd", "executable", "args", "timeoutMs"], "Desktop intent");
    text(item.cwd, "cwd"); text(item.executable, "executable"); stringArray(item.args, "args"); positiveTimeout(item.timeoutMs, "timeoutMs"); return;
  }
  if (kind === "GIT_INSPECT") {
    exactKeys(item, [...COMMON_INTENT_KEYS, "cwd"], "Desktop intent"); text(item.cwd, "cwd"); return;
  }
  if (kind === "REQUEST_COMMIT") {
    exactKeys(item, [...COMMON_INTENT_KEYS, "cwd", "message", "expectedHead"], "Desktop intent");
    text(item.cwd, "cwd"); text(item.message, "message"); if (item.expectedHead !== undefined) text(item.expectedHead, "expectedHead"); return;
  }
  if (kind === "CHECK_HTTP") {
    exactKeys(item, [...COMMON_INTENT_KEYS, "url", "timeoutMs"], "Desktop intent");
    assertCheckHttpUrl(item.url);
    positiveTimeout(item.timeoutMs, "timeoutMs");
    return;
  }
  throw new Error(`Unsupported Desktop intent kind: ${kind}`);
}
export function assertReasoningTurn(value: unknown): asserts value is ReasoningTurn {
  const item = record(value, "Reasoning turn");
  version(item.version); id(item.turnId, "turnId"); id(item.sessionId, "sessionId"); id(item.runId, "runId");
  stage(item.stage); generation(item.generation); text(item.promptSha256, "promptSha256"); text(item.responseSha256, "responseSha256");
  text(item.summary, "summary"); stringArray(item.decisions, "decisions"); stringArray(item.desktopIntentIds, "desktopIntentIds");
  if (!OUTCOMES.has(item.outcome as ReasoningOutcome)) throw new Error(`Unsupported reasoning outcome: ${String(item.outcome)}`);
  iso(item.recordedAt, "recordedAt");
}

export function assertReasoningTurnResult(value: unknown): asserts value is ReasoningTurnResult {
  assertNoCredentialShapedWebData(value);
  const item = record(value, "Reasoning result");
  version(item.version); const runId = id(item.runId, "runId"); const activeStage = stage(item.stage); generation(item.generation);
  text(item.summary, "summary"); stringArray(item.decisions, "decisions");
  if (!OUTCOMES.has(item.outcome as ReasoningOutcome)) throw new Error(`Unsupported reasoning outcome: ${String(item.outcome)}`);
  if (!Array.isArray(item.intents)) throw new Error("intents must be an array");
  const seen = new Set<string>();
  for (const intent of item.intents) {
    assertDesktopIntent(intent);
    if (intent.runId !== runId) throw new Error(`Desktop intent runId mismatch: ${intent.runId}`);
    if (intent.stage !== activeStage) throw new Error(`Desktop intent stage mismatch: ${intent.stage}`);
    if (seen.has(intent.intentId)) throw new Error(`Reasoning result has duplicate intent id: ${intent.intentId}`);
    seen.add(intent.intentId);
  }
  if (item.outcome === "blocked-user") text(item.blockerReason, "blockerReason");
  else if (item.blockerReason !== undefined) throw new Error("blockerReason is only allowed for blocked-user");
}

/**
 * Classify schema failures without retaining the model response.  This is
 * deliberately separate from the strict validator so diagnostics cannot make
 * an otherwise invalid result executable.
 */
export function reasoningResultRejectionDiagnostic(value: unknown, error: unknown): Record<string, string | boolean> {
  const message = error instanceof Error ? error.message : "";
  const topLevelType = value === null ? "null" : Array.isArray(value) ? "array" : typeof value === "object" ? "object" : typeof value;
  let rejectionClass = "schema-invalid";
  if (topLevelType !== "object") rejectionClass = "top-level-not-object";
  else if (/unexpected field/i.test(message)) rejectionClass = "unexpected-field";
  else if (/runId mismatch/i.test(message)) rejectionClass = "intent-run-id-mismatch";
  else if (/stage mismatch/i.test(message)) rejectionClass = "intent-stage-mismatch";
  else if (/duplicate intent/i.test(message)) rejectionClass = "duplicate-intent-id";
  else if (/Unsupported Desktop intent kind/i.test(message)) rejectionClass = "unsupported-intent-kind";
  else if (/intent kind|Desktop intent|intents must be an array/i.test(message)) rejectionClass = "intent-shape-invalid";
  else if (/outcome/i.test(message)) rejectionClass = "outcome-invalid";
  else if (/blockerReason/i.test(message)) rejectionClass = "blocker-reason-invalid";
  else if (/stage/i.test(message)) rejectionClass = "stage-invalid";
  else if (/generation/i.test(message)) rejectionClass = "generation-invalid";
  else if (/summary/i.test(message)) rejectionClass = "summary-invalid";
  else if (/decisions/i.test(message)) rejectionClass = "decisions-invalid";
  else if (/version/i.test(message)) rejectionClass = "protocol-version-invalid";
  else if (/runId/i.test(message)) rejectionClass = "run-id-invalid";
  return {
    diagnosticCategory: "reasoning-result-schema-failure",
    rejectionClass,
    parserInputReceived: true,
    topLevelType,
  };
}

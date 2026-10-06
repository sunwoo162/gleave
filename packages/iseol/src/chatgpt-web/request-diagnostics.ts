import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { withDurableFileStateLock } from "../services/file-state-lock.js";

export type RequestDiagnosticStage =
  | "request-reserved"
  | "browser-opened"
  | "submit-started"
  | "submit-returned"
  | "response-read-started"
  | "response-read-returned"
  | "structured-result-validated"
  | "request-failed";

export type RequestDiagnosticEvent = {
  version: 1;
  requestId: string;
  stage: RequestDiagnosticStage;
  at: string;
  ok: boolean;
  elapsedMs: number;
  conversationRefPresent?: boolean;
  lastCompletedStage?: RequestDiagnosticStage;
  failureClass?: string;
};

export type RequestDiagnosticStore = {
  record(event: Omit<RequestDiagnosticEvent, "version">): Promise<void>;
};

export type ResponseReadDiagnosticStage =
  | "pending-submission"
  | "conversation-identity"
  | "authentication-state"
  | "assistant-locator"
  | "generation-control"
  | "assistant-text"
  | "assistant-stability"
  | "final-identity"
  | "dom-extraction"
  | "response-parse"
  | "clipboard-fallback";

export type ResponseReadDiagnosticPhase = "start" | "complete" | "failure";

export type ResponseReadDiagnosticEvent = {
  version: 1;
  type: "response-read-stage";
  requestId: string;
  stage: ResponseReadDiagnosticStage;
  phase: ResponseReadDiagnosticPhase;
  at: string;
  elapsedMs: number;
  ok: boolean;
  failureClass?: string;
  assistantCount?: number;
  baselineAssistantCount?: number;
  awaitingAssistant?: boolean;
  generationControlCount?: number;
  domExtractionAttempted?: boolean;
  domExtractionSucceeded?: boolean;
  responseLengthBucket?: "empty" | "short" | "medium" | "large" | "oversize";
  responseSource?: "assistant-dom" | "assistant-copy" | "assistant-copy-fallback";
  assistantTextCallPoint?: string;
  assistantTextRetryable?: boolean;
};

export type ResponseReadDiagnosticStore = {
  record(event: Omit<ResponseReadDiagnosticEvent, "version" | "type">): Promise<void>;
};

const queues = new Map<string, Promise<unknown>>();

function fileFor(root: string): string {
  return resolve(root, "web-workers", "request-diagnostics.jsonl");
}

function responseReadFileFor(root: string): string {
  return resolve(root, "web-workers", "response-read-diagnostics.jsonl");
}

async function serialized<T>(key: string, action: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(action);
  queues.set(key, current);
  try { return await current; }
  finally { if (queues.get(key) === current) queues.delete(key); }
}

export function appendDiagnosticLine(path: string, event: Record<string, unknown>): Promise<void> {
  return withDurableFileStateLock(path, async () => {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(event)}\n`, "utf8");
  }, { waitForMs: 2_000 });
}

export function createRequestDiagnosticStore(
  root: string,
  now: () => string = () => new Date().toISOString(),
): RequestDiagnosticStore {
  const path = fileFor(root);
  return {
    record(event) {
      const persisted: RequestDiagnosticEvent = { version: 1, ...event, at: event.at || now() };
      return serialized(path, () => appendDiagnosticLine(path, persisted));
    },
  };
}

export function createResponseReadDiagnosticStore(
  root: string,
  now: () => string = () => new Date().toISOString(),
): ResponseReadDiagnosticStore {
  const path = responseReadFileFor(root);
  return {
    record(event) {
      const persisted: ResponseReadDiagnosticEvent = { version: 1, type: "response-read-stage", ...event, at: event.at || now() };
      return serialized(path, () => appendDiagnosticLine(path, persisted));
    },
  };
}

export async function readRequestDiagnosticEvents(root: string): Promise<RequestDiagnosticEvent[]> {
  const path = fileFor(root);
  return withDurableFileStateLock(path, async () => {
    try {
      const content = await readFile(path, "utf8");
      return content.split("\n").filter(Boolean).map((line) => JSON.parse(line) as RequestDiagnosticEvent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }, { waitForMs: 2_000 });
}

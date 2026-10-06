import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { ClaimLatch } from "./gate.js";
import type { GatePolicy, VerificationInput, VerificationReport } from "./types.js";

export interface VerifiedAnswer {
  answer: string;
  report: VerificationReport;
}

export class ClaimLatchBlockedError extends Error {
  readonly report: VerificationReport;

  constructor(report: VerificationReport) {
    super("ClaimLatch blocked the answer; do not release it to the user.");
    this.name = "ClaimLatchBlockedError";
    this.report = report;
  }
}

export async function verifyBeforeRelease(
  gate: ClaimLatch,
  input: VerificationInput,
): Promise<VerifiedAnswer> {
  const report = await gate.verify(input);
  if (!report.passed) {
    throw new ClaimLatchBlockedError(report);
  }

  return { answer: input.answer, report };
}

interface GuardedAnswerRouteOptions {
  healthPath?: string;
  answerPath?: string;
}

export interface GuardedAnswerServerOptions extends GuardedAnswerRouteOptions {
  gate: ClaimLatch;
  policy?: Partial<GatePolicy>;
  maxRequestBytes?: number;
}

export interface GuardedAnswerFetchHandlerOptions extends GuardedAnswerRouteOptions {
  gate: ClaimLatch;
  policy?: Partial<GatePolicy>;
  maxRequestBytes?: number;
}

export type GuardedAnswerFetchHandler = (request: Request) => Promise<Response>;

export interface GuardedAnswerServer {
  server: Server;
  listen(port: number, host?: string): Promise<void>;
  close(): Promise<void>;
}

const DEFAULT_GUARDED_ANSWER_MAX_REQUEST_BYTES = 1_000_000;
const DEFAULT_HEALTH_PATH = "/health";
const DEFAULT_ANSWER_PATH = "/answer";

export function createGuardedAnswerServer(options: GuardedAnswerServerOptions): GuardedAnswerServer {
  const maxRequestBytes = normalizeMaxRequestBytes(
    options.maxRequestBytes ?? DEFAULT_GUARDED_ANSWER_MAX_REQUEST_BYTES,
  );
  const healthPath = normalizeRoutePath(options.healthPath ?? DEFAULT_HEALTH_PATH, "healthPath");
  const answerPath = normalizeRoutePath(options.answerPath ?? DEFAULT_ANSWER_PATH, "answerPath");
  const server = createServer(async (request, response) => {
    try {
      await handleGuardedAnswerRequest(request, response, options, maxRequestBytes, healthPath, answerPath);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        writeIntegrationJson(response, 413, {
          error: {
            type: "invalid_request_error",
            code: "request_too_large",
            message: "Request body exceeds the configured size limit.",
          },
        });
        return;
      }
      writeIntegrationJson(response, 502, {
        error: {
          type: "claimlatch_integration_error",
          code: "claimlatch_verification_error",
          message: "ClaimLatch verification failed; the answer was not released.",
        },
      });
    }
  });

  return {
    server,
    listen(port: number, host = "127.0.0.1") {
      return new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.removeListener("error", reject);
          resolve();
        });
      });
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

export function createGuardedAnswerFetchHandler(
  options: GuardedAnswerFetchHandlerOptions,
): GuardedAnswerFetchHandler {
  const maxRequestBytes = normalizeMaxRequestBytes(
    options.maxRequestBytes ?? DEFAULT_GUARDED_ANSWER_MAX_REQUEST_BYTES,
  );
  const healthPath = normalizeRoutePath(options.healthPath ?? DEFAULT_HEALTH_PATH, "healthPath");
  const answerPath = normalizeRoutePath(options.answerPath ?? DEFAULT_ANSWER_PATH, "answerPath");

  return async (request) => {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === healthPath) {
      return createIntegrationJsonResponse(200, { ok: true, service: "claimlatch-guarded-answer" });
    }
    if (request.method !== "POST" || path !== answerPath) {
      return createIntegrationJsonResponse(404, {
        error: { type: "not_found", code: "not_found", message: "Route not found." },
      });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(await readFetchRequestBody(request, maxRequestBytes)) as unknown;
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return createIntegrationJsonResponse(413, {
          error: {
            type: "invalid_request_error",
            code: "request_too_large",
            message: "Request body exceeds the configured size limit.",
          },
        });
      }
      return createIntegrationJsonResponse(400, {
        error: { type: "invalid_request_error", code: "invalid_json", message: "Request body must be valid JSON." },
      });
    }

    const input = parseGuardedAnswerInput(payload);
    if (!input) {
      return createIntegrationJsonResponse(400, {
        error: {
          type: "invalid_request_error",
          code: "invalid_request_error",
          message: "Request body must contain non-empty string fields: question and draft.",
        },
      });
    }

    try {
      const verified = await verifyBeforeRelease(options.gate, {
        question: input.question,
        answer: input.draft,
        ...(options.policy ? { policy: options.policy } : {}),
      });
      return createIntegrationJsonResponse(200, verified);
    } catch (error) {
      if (error instanceof ClaimLatchBlockedError) {
        return createIntegrationJsonResponse(422, {
          error: {
            type: "claimlatch_blocked",
            code: "claimlatch_blocked",
            message: "ClaimLatch blocked the answer; do not release it.",
            report: error.report,
          },
        });
      }
      return createIntegrationJsonResponse(502, {
        error: {
          type: "claimlatch_integration_error",
          code: "claimlatch_verification_error",
          message: "ClaimLatch verification failed; the answer was not released.",
        },
      });
    }
  };
}

async function handleGuardedAnswerRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: GuardedAnswerServerOptions,
  maxRequestBytes: number,
  healthPath: string,
  answerPath: string,
): Promise<void> {
  const path = request.url?.split("?")[0] ?? "/";
  if (request.method === "GET" && path === healthPath) {
    writeIntegrationJson(response, 200, { ok: true, service: "claimlatch-guarded-answer" });
    return;
  }
  if (request.method !== "POST" || path !== answerPath) {
    writeIntegrationJson(response, 404, {
      error: { type: "not_found", code: "not_found", message: "Route not found." },
    });
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await readIntegrationRequestBody(request, maxRequestBytes)) as unknown;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) throw error;
    writeIntegrationJson(response, 400, {
      error: { type: "invalid_request_error", code: "invalid_json", message: "Request body must be valid JSON." },
    });
    return;
  }

  const input = parseGuardedAnswerInput(payload);
  if (!input) {
    writeIntegrationJson(response, 400, {
      error: {
        type: "invalid_request_error",
        code: "invalid_request_error",
        message: "Request body must contain non-empty string fields: question and draft.",
      },
    });
    return;
  }

  try {
    const verified = await verifyBeforeRelease(options.gate, {
      question: input.question,
      answer: input.draft,
      ...(options.policy ? { policy: options.policy } : {}),
    });
    writeIntegrationJson(response, 200, verified);
  } catch (error) {
    if (error instanceof ClaimLatchBlockedError) {
      writeIntegrationJson(response, 422, {
        error: {
          type: "claimlatch_blocked",
          code: "claimlatch_blocked",
          message: "ClaimLatch blocked the answer; do not release it to the user.",
          report: error.report,
        },
      });
      return;
    }
    throw error;
  }
}

function parseGuardedAnswerInput(payload: unknown): { question: string; draft: string } | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.question !== "string" || typeof record.draft !== "string") return null;
  const question = record.question.trim();
  const draft = record.draft.trim();
  return question && draft ? { question, draft } : null;
}

async function readIntegrationRequestBody(request: IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
    total += bytes.byteLength;
    if (total > maxBytes) throw new RequestBodyTooLargeError();
    chunks.push(bytes);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

async function readFetchRequestBody(request: Request, maxBytes: number): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    if (Number.isInteger(parsed) && parsed > maxBytes) throw new RequestBodyTooLargeError();
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (!next.value) continue;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function writeIntegrationJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(body)}\n`);
}

function createIntegrationJsonResponse(status: number, body: unknown): Response {
  return new Response(`${JSON.stringify(body)}\n`, {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function normalizeMaxRequestBytes(value: number): number {
  if (!Number.isFinite(value) || value < 1_024 || value > 10_000_000) {
    throw new Error("maxRequestBytes must be a finite number between 1024 and 10000000.");
  }
  return Math.floor(value);
}

function normalizeRoutePath(value: string, optionName: string): string {
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("?") || path.includes("#")) {
    throw new TypeError(`${optionName} must be an absolute path without a query or fragment.`);
  }
  return path;
}

class RequestBodyTooLargeError extends Error {}

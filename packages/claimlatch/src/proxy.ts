import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { ClaimLatch } from "./gate.js";
import { calculateCoverage } from "./policy.js";
import type { GatePolicy, VerificationCounts, VerificationReport } from "./types.js";
import { createPinnedProxyFetch, type ProxyDnsLookup, type ProxyPinnedRequest } from "./proxy-network.js";

export interface OpenAIProxyOptions {
  gate: ClaimLatch;
  upstreamBaseUrl: string;
  upstreamApiKey?: string;
  upstreamApiKeyHeader?: string;
  upstreamApiKeyPrefix?: string;
  upstreamChatCompletionsPath?: string;
  upstreamModelsPath?: string | null;
  upstreamModelRetrievalPath?: string | null;
  upstreamModelIdEncoding?: "encoded" | "path";
  upstreamRequestHeaders?: Record<string, string>;
  upstreamResponseHeaderNames?: string[];
  upstreamResponseHeaderPrefixes?: string[];
  policy?: Partial<GatePolicy>;
  structuredOutputVerifier?: OpenAIProxyStructuredOutputVerifier;
  fetchImpl?: typeof fetch;
  lookupImpl?: ProxyDnsLookup;
  requestImpl?: ProxyPinnedRequest;
  maxRequestBytes?: number;
  maxBufferedResponseBytes?: number;
  maxBufferedChoices?: number;
  maxBufferedChoiceBytes?: number;
  upstreamTimeoutMs?: number;
}

export interface OpenAIProxyStructuredOutputVerifier {
  verify(input: {
    question: string;
    choice: unknown;
    stream: boolean;
  }): Promise<VerificationReport>;
}

export interface OpenAIProxyServer {
  server: Server;
  listen(port: number, host?: string): Promise<void>;
  close(): Promise<void>;
}

interface ChatMessage {
  role?: unknown;
  content?: unknown;
}

interface ChatRequest {
  stream?: unknown;
  messages?: unknown;
  [key: string]: unknown;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  [key: string]: unknown;
}

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const REQUEST_HEADERS_TO_STRIP = new Set([
  ...HOP_BY_HOP_HEADERS,
  "authorization",
  "content-length",
  "cookie",
  "host",
  "proxy-authorization",
]);

const REQUEST_HEADERS_NEVER_CONFIGURE = new Set([
  ...REQUEST_HEADERS_TO_STRIP,
  "content-type",
]);

const RESPONSE_HEADERS_TO_FORWARD = new Set([
  "apim-request-id",
  "content-type",
  "retry-after",
  "x-request-id",
]);

const RESPONSE_HEADERS_NEVER_FORWARD = new Set([
  ...HOP_BY_HOP_HEADERS,
  "content-encoding",
  "content-length",
  "set-cookie",
]);

const DEFAULT_UPSTREAM_TIMEOUT_MS = 120_000;

export function createOpenAIProxy(options: OpenAIProxyOptions): OpenAIProxyServer {
  const baseUrl = normalizeUpstreamBaseUrl(options.upstreamBaseUrl);
  const fetchImpl = options.fetchImpl ?? createPinnedProxyFetch(options.lookupImpl, options.requestImpl);
  const maxRequestBytes = clampInteger(options.maxRequestBytes ?? 2_000_000, 1_024, 10_000_000);
  const maxBufferedResponseBytes = clampInteger(options.maxBufferedResponseBytes ?? 10_000_000, 1_024, 50_000_000);
  const maxBufferedChoices = clampInteger(options.maxBufferedChoices ?? 16, 1, 128);
  const maxBufferedChoiceBytes = clampInteger(options.maxBufferedChoiceBytes ?? 2_000_000, 1_024, 10_000_000);
  const upstreamTimeoutMs = normalizeTimeout(options.upstreamTimeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS);
  const upstreamApiKeyHeader = normalizeUpstreamApiKeyHeader(options.upstreamApiKeyHeader ?? "authorization");
  const upstreamApiKeyPrefix = normalizeUpstreamApiKeyPrefix(
    options.upstreamApiKeyPrefix ?? (upstreamApiKeyHeader === "authorization" ? "Bearer" : undefined),
  );
  const upstreamChatCompletionsPath = normalizeUpstreamChatCompletionsPath(
    options.upstreamChatCompletionsPath ?? "/chat/completions",
  );
  const upstreamModelsPath = options.upstreamModelsPath === null
    ? undefined
    : normalizeUpstreamModelsPath(options.upstreamModelsPath ?? "/models");
  const upstreamModelRetrievalPath = options.upstreamModelRetrievalPath === null
    ? undefined
    : options.upstreamModelRetrievalPath !== undefined
      ? normalizeUpstreamModelsPath(options.upstreamModelRetrievalPath)
      : upstreamModelsPath;
  const upstreamModelIdEncoding = normalizeUpstreamModelIdEncoding(options.upstreamModelIdEncoding ?? "encoded");
  const upstreamRequestHeaders = normalizeUpstreamRequestHeaders(options.upstreamRequestHeaders ?? {});
  const upstreamResponseHeaderNames = normalizeResponseHeaderConfiguration(
    options.upstreamResponseHeaderNames ?? [],
    "name",
  );
  const upstreamResponseHeaderPrefixes = normalizeResponseHeaderConfiguration(
    options.upstreamResponseHeaderPrefixes ?? [],
    "prefix",
  );

  const server = createServer(async (request, response) => {
    try {
      await handleRequest({
        request,
        response,
        options,
        baseUrl,
        fetchImpl,
        maxRequestBytes,
        maxBufferedResponseBytes,
        maxBufferedChoices,
        maxBufferedChoiceBytes,
        upstreamTimeoutMs,
        upstreamApiKeyHeader,
        upstreamApiKeyPrefix,
        upstreamChatCompletionsPath,
        upstreamModelsPath,
        upstreamModelRetrievalPath,
        upstreamModelIdEncoding,
        upstreamRequestHeaders,
        upstreamResponseHeaderNames,
        upstreamResponseHeaderPrefixes,
      });
    } catch (error) {
      writeJson(response, 500, {
        error: {
          type: "claimlatch_proxy_error",
          code: "claimlatch_proxy_error",
          message: error instanceof Error ? error.message : String(error),
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

async function handleRequest(input: {
  request: IncomingMessage;
  response: ServerResponse;
  options: OpenAIProxyOptions;
  baseUrl: string;
  fetchImpl: typeof fetch;
  maxRequestBytes: number;
  maxBufferedResponseBytes: number;
  maxBufferedChoices: number;
  maxBufferedChoiceBytes: number;
  upstreamTimeoutMs: number;
  upstreamApiKeyHeader: string;
  upstreamApiKeyPrefix: string | undefined;
  upstreamChatCompletionsPath: string;
  upstreamModelsPath: string | undefined;
  upstreamModelRetrievalPath: string | undefined;
  upstreamModelIdEncoding: "encoded" | "path";
  upstreamRequestHeaders: ReadonlyMap<string, string>;
  upstreamResponseHeaderNames: ReadonlySet<string>;
  upstreamResponseHeaderPrefixes: ReadonlySet<string>;
}): Promise<void> {
  const { request, response } = input;
  const requestTarget = request.url ?? "/";
  const queryStart = requestTarget.indexOf("?");
  const path = queryStart === -1 ? requestTarget : requestTarget.slice(0, queryStart);
  const query = queryStart === -1 ? "" : requestTarget.slice(queryStart + 1);

  if (request.method === "GET" && path === "/health") {
    writeJson(response, 200, { ok: true, service: "claimlatch-proxy" });
    return;
  }

  const modelId = request.method === "GET"
    ? extractModelId(path, input.upstreamModelIdEncoding)
    : undefined;
  if (request.method === "GET" && modelId !== undefined) {
    if (input.upstreamModelsPath === undefined) {
      writeUnavailableModelRoute(response);
      return;
    }
    if (input.upstreamModelRetrievalPath === undefined) {
      writeUnavailableModelRetrievalRoute(response);
      return;
    }
    await handleModelsRequest({
      ...input,
      ...(input.options.upstreamApiKey ? { upstreamApiKey: input.options.upstreamApiKey } : {}),
      upstreamModelsPath: appendModelId(input.upstreamModelRetrievalPath, modelId, input.upstreamModelIdEncoding),
      requestQuery: query,
    });
    return;
  }

  if (request.method === "GET" && (path === "/v1/models" || path === "/models")) {
    const upstreamModelsPath = input.upstreamModelsPath;
    if (upstreamModelsPath === undefined) {
      writeUnavailableModelRoute(response);
      return;
    }
    await handleModelsRequest({
      ...input,
      ...(input.options.upstreamApiKey ? { upstreamApiKey: input.options.upstreamApiKey } : {}),
      upstreamModelsPath,
      requestQuery: query,
    });
    return;
  }

  if (request.method !== "POST" || (path !== "/v1/chat/completions" && path !== "/chat/completions")) {
    writeJson(response, 404, {
      error: { type: "not_found", code: "not_found", message: "Route not found." },
    });
    return;
  }

  const bodyText = await readRequestBody(request, input.maxRequestBytes);
  let body: ChatRequest;
  try {
    body = JSON.parse(bodyText) as ChatRequest;
  } catch {
    writeJson(response, 400, {
      error: { type: "invalid_request_error", code: "invalid_json", message: "Request body must be valid JSON." },
    });
    return;
  }

  const question = lastUserMessageText(body.messages);
  if (!question) {
    writeJson(response, 400, {
      error: {
        type: "invalid_request_error",
        code: "claimlatch_missing_user_message",
        message: "A textual user message is required so ClaimLatch can verify the generated answer in context.",
      },
    });
    return;
  }

  const incomingAuthorization = headerValue(request.headers.authorization);

  const upstreamAbort = createUpstreamAbortControl(request, response, input.upstreamTimeoutMs);
  let upstream: Response;
  try {
    upstream = await input.fetchImpl(`${input.baseUrl}${input.upstreamChatCompletionsPath}`, {
      method: "POST",
      headers: upstreamRequestHeaders(
        request,
        incomingAuthorization,
        input.options.upstreamApiKey,
        input.upstreamApiKeyHeader,
        input.upstreamApiKeyPrefix,
        input.upstreamRequestHeaders,
      ),
      body: bodyText,
      signal: upstreamAbort.signal,
    });
  } catch (error) {
    if (handleUpstreamAbort(upstreamAbort, response)) return;
    upstreamAbort.cleanup();
    throw error;
  }
  if (upstreamAbort.aborted()) {
    handleUpstreamAbort(upstreamAbort, response);
    return;
  }

  if (!upstream.ok) {
    let upstreamText: string;
    try {
      upstreamText = await upstream.text();
    } catch (error) {
      if (handleUpstreamAbort(upstreamAbort, response)) return;
      upstreamAbort.cleanup();
      throw error;
    }
    if (upstreamAbort.aborted()) {
      handleUpstreamAbort(upstreamAbort, response);
      return;
    }
    upstreamAbort.cleanup();
    response.statusCode = upstream.status;
    const copiedContentType = copyResponseHeaders(
      upstream,
      response,
      input.upstreamResponseHeaderNames,
      input.upstreamResponseHeaderPrefixes,
    );
    if (!copiedContentType) response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(upstreamText);
    return;
  }

  if (body.stream === true) {
    let streamText: string;
    let streamingChoices: StreamingChoice[] | null;
    try {
      streamText = await readBufferedResponse(upstream, input.maxBufferedResponseBytes);
      if (upstreamAbort.aborted()) {
        handleUpstreamAbort(upstreamAbort, response);
        return;
      }
      streamingChoices = parseStreamingChoices(streamText, input.maxBufferedChoices, input.maxBufferedChoiceBytes);
    } catch (error) {
      if (handleUpstreamAbort(upstreamAbort, response)) return;
      upstreamAbort.cleanup();
      writeJson(response, 502, {
        error: {
          type: "claimlatch_upstream_error",
          code: "claimlatch_invalid_upstream_stream",
          message: "Upstream returned a malformed, truncated, or unsupported chat completion stream.",
        },
      });
      return;
    }
    upstreamAbort.cleanup();

    if (!streamingChoices) {
      writeJson(response, 502, {
        error: {
          type: "claimlatch_upstream_error",
          code: "claimlatch_missing_assistant_text",
          message: "Upstream chat completion stream did not contain textual assistant output.",
        },
      });
      return;
    }

    let reports: VerificationReport[] | null;
    try {
      reports = await verifyStreamingChoices({
        choices: streamingChoices,
        question,
        options: input.options,
      });
    } catch {
      writeJson(response, 502, {
        error: {
          type: "claimlatch_upstream_error",
          code: "claimlatch_structured_output_verifier_error",
          message: "The configured structured output verifier failed closed.",
        },
      });
      return;
    }

    if (!reports) {
      writeJson(response, 502, {
        error: {
          type: "claimlatch_upstream_error",
          code: "claimlatch_missing_assistant_text",
          message: "Upstream chat completion stream did not contain textual assistant output.",
        },
      });
      return;
    }

    const report = aggregateReports(reports);

    setGateHeaders(response, report);
    if (!report.passed) {
      writeJson(response, 422, {
        error: {
          type: "claimlatch_blocked",
          code: "claimlatch_blocked",
          message: "ClaimLatch blocked the generated answer because it did not satisfy the configured evidence policy.",
        },
        claimlatch: report,
        claimlatchReports: reports,
      });
      return;
    }

    copyResponseHeaders(
      upstream,
      response,
      input.upstreamResponseHeaderNames,
      input.upstreamResponseHeaderPrefixes,
    );
    response.statusCode = 200;
    response.setHeader("content-type", "text/event-stream");
    response.end(streamText);
    return;
  }

  let upstreamText: string;
  try {
    upstreamText = await upstream.text();
  } catch (error) {
    if (handleUpstreamAbort(upstreamAbort, response)) return;
    upstreamAbort.cleanup();
    throw error;
  }
  if (upstreamAbort.aborted()) {
    handleUpstreamAbort(upstreamAbort, response);
    return;
  }
  upstreamAbort.cleanup();

  let payload: ChatCompletionResponse;
  try {
    payload = JSON.parse(upstreamText) as ChatCompletionResponse;
  } catch {
    writeJson(response, 502, {
      error: {
        type: "claimlatch_upstream_error",
        code: "claimlatch_invalid_upstream_json",
        message: "Upstream returned a non-JSON chat completion.",
      },
    });
    return;
  }

  let reports: VerificationReport[] | null;
  try {
    reports = await verifyNonStreamingChoices({
      payload,
      question,
      options: input.options,
    });
  } catch {
    writeJson(response, 502, {
      error: {
        type: "claimlatch_upstream_error",
        code: "claimlatch_structured_output_verifier_error",
        message: "The configured structured output verifier failed closed.",
      },
    });
    return;
  }

  if (!reports) {
    writeJson(response, 502, {
      error: {
        type: "claimlatch_upstream_error",
        code: "claimlatch_missing_assistant_text",
        message: "Upstream chat completion did not contain textual assistant output.",
      },
    });
    return;
  }

  const report = aggregateReports(reports);

  setGateHeaders(response, report);
  if (!report.passed) {
    writeJson(response, 422, {
      error: {
        type: "claimlatch_blocked",
        code: "claimlatch_blocked",
        message: "ClaimLatch blocked the generated answer because it did not satisfy the configured evidence policy.",
      },
      claimlatch: report,
      claimlatchReports: reports,
    });
    return;
  }

  response.statusCode = 200;
  const copiedContentType = copyResponseHeaders(
    upstream,
    response,
    input.upstreamResponseHeaderNames,
    input.upstreamResponseHeaderPrefixes,
  );
  if (!copiedContentType) response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(upstreamText);
}

function writeUnavailableModelRoute(response: ServerResponse): void {
  writeJson(response, 404, {
    error: {
      type: "claimlatch_proxy_error",
      code: "claimlatch_model_route_unavailable",
      message: "The configured provider does not expose a model-list route.",
    },
  });
}

function writeUnavailableModelRetrievalRoute(response: ServerResponse): void {
  writeJson(response, 404, {
    error: {
      type: "claimlatch_proxy_error",
      code: "claimlatch_model_retrieval_route_unavailable",
      message: "The configured provider does not expose a model-retrieval route.",
    },
  });
}

async function handleModelsRequest(input: {
  request: IncomingMessage;
  response: ServerResponse;
  baseUrl: string;
  fetchImpl: typeof fetch;
  maxBufferedResponseBytes: number;
  upstreamTimeoutMs: number;
  upstreamApiKey?: string;
  upstreamApiKeyHeader: string;
  upstreamApiKeyPrefix: string | undefined;
  upstreamModelsPath: string;
  upstreamRequestHeaders: ReadonlyMap<string, string>;
  upstreamResponseHeaderNames: ReadonlySet<string>;
  upstreamResponseHeaderPrefixes: ReadonlySet<string>;
  requestQuery: string;
}): Promise<void> {
  const { request, response } = input;
  const upstreamAbort = createUpstreamAbortControl(request, response, input.upstreamTimeoutMs);
  const upstreamPath = appendQuery(input.upstreamModelsPath, input.requestQuery);
  let upstream: Response;
  try {
    upstream = await input.fetchImpl(`${input.baseUrl}${upstreamPath}`, {
      method: "GET",
      headers: upstreamRequestHeaders(
        request,
        headerValue(request.headers.authorization),
        input.upstreamApiKey,
        input.upstreamApiKeyHeader,
        input.upstreamApiKeyPrefix,
        input.upstreamRequestHeaders,
      ),
      signal: upstreamAbort.signal,
    });
  } catch (error) {
    if (handleUpstreamAbort(upstreamAbort, response)) return;
    upstreamAbort.cleanup();
    throw error;
  }
  if (upstreamAbort.aborted()) {
    handleUpstreamAbort(upstreamAbort, response);
    return;
  }

  let upstreamText: string;
  try {
    upstreamText = await readBufferedResponse(upstream, input.maxBufferedResponseBytes);
  } catch {
    if (handleUpstreamAbort(upstreamAbort, response)) return;
    upstreamAbort.cleanup();
    writeJson(response, 502, {
      error: {
        type: "claimlatch_upstream_error",
        code: "claimlatch_invalid_upstream_models_response",
        message: "Upstream returned an unreadable or over-limit model listing.",
      },
    });
    return;
  }
  if (upstreamAbort.aborted()) {
    handleUpstreamAbort(upstreamAbort, response);
    return;
  }
  upstreamAbort.cleanup();

  response.statusCode = upstream.status;
  const copiedContentType = copyResponseHeaders(
    upstream,
    response,
    input.upstreamResponseHeaderNames,
    input.upstreamResponseHeaderPrefixes,
  );
  if (!copiedContentType) response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(upstreamText);
}

function upstreamRequestHeaders(
  request: IncomingMessage,
  incomingAuthorization: string | undefined,
  upstreamApiKey: string | undefined,
  upstreamApiKeyHeader: string,
  upstreamApiKeyPrefix: string | undefined,
  configuredHeaders: ReadonlyMap<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };

  for (const [rawName, rawValue] of Object.entries(request.headers)) {
    const name = rawName.toLowerCase();
    if (REQUEST_HEADERS_TO_STRIP.has(name) || rawValue === undefined) continue;
    headers[name] = Array.isArray(rawValue) ? rawValue.join(", ") : rawValue;
  }

  for (const [name, value] of configuredHeaders) {
    headers[name] = value;
  }

  // The built-in pinned transport intentionally does not decompress response bodies.
  // Keep upstream JSON/SSE responses readable and bounded by disabling content encoding.
  headers["accept-encoding"] = "identity";

  if (upstreamApiKey) {
    headers[upstreamApiKeyHeader] = upstreamApiKeyPrefix
      ? `${upstreamApiKeyPrefix} ${upstreamApiKey}`
      : upstreamApiKey;
  } else if (incomingAuthorization) {
    headers.authorization = incomingAuthorization;
  }
  return headers;
}

function normalizeUpstreamRequestHeaders(value: Record<string, string>): ReadonlyMap<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("upstreamRequestHeaders must be an object.");
  }

  const normalized = new Map<string, string>();
  for (const [rawName, rawValue] of Object.entries(value)) {
    const name = rawName.trim().toLowerCase();
    if (!/^[!#$%&'*+\-.^_`|~0-9a-z]+$/u.test(name)) {
      throw new Error("upstreamRequestHeaders must contain valid HTTP header names.");
    }
    if (REQUEST_HEADERS_NEVER_CONFIGURE.has(name)) {
      throw new Error("upstreamRequestHeaders cannot include a restricted proxy request header.");
    }
    if (typeof rawValue !== "string" || /[\r\n]/u.test(rawValue)) {
      throw new Error("upstreamRequestHeaders must contain valid HTTP header values.");
    }
    normalized.set(name, rawValue);
  }
  return normalized;
}

function copyResponseHeaders(
  upstream: Response,
  response: ServerResponse,
  responseHeaderNames: ReadonlySet<string>,
  responseHeaderPrefixes: ReadonlySet<string>,
): boolean {
  let copiedContentType = false;
  for (const [name, value] of upstream.headers) {
    const normalizedName = name.toLowerCase();
    if (RESPONSE_HEADERS_NEVER_FORWARD.has(normalizedName)) continue;
    if (
      RESPONSE_HEADERS_TO_FORWARD.has(normalizedName)
      || normalizedName.startsWith("openai-")
      || normalizedName.startsWith("x-ratelimit-")
      || normalizedName.startsWith("ratelimit-")
      || normalizedName.startsWith("x-ms-")
      || normalizedName.startsWith("x-goog-")
      || normalizedName.startsWith("x-amzn-")
      || normalizedName.startsWith("anthropic-")
      || responseHeaderNames.has(normalizedName)
      || [...responseHeaderPrefixes].some((prefix) => normalizedName.startsWith(prefix))
    ) {
      response.setHeader(name, value);
      if (normalizedName === "content-type") copiedContentType = true;
    }
  }
  return copiedContentType;
}

function normalizeResponseHeaderConfiguration(values: string[], kind: "name" | "prefix"): Set<string> {
  if (!Array.isArray(values)) throw new Error(`upstreamResponseHeader${kind === "name" ? "Names" : "Prefixes"} must be an array.`);
  const normalizedValues = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") {
      throw new Error(`upstreamResponseHeader${kind === "name" ? "Names" : "Prefixes"} must contain strings.`);
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized || !/^[!#$%&'*+\-.^_`|~0-9a-z]+$/u.test(normalized)) {
      throw new Error(`upstreamResponseHeader${kind === "name" ? "Names" : "Prefixes"} must contain valid HTTP header ${kind}s.`);
    }
    if (RESPONSE_HEADERS_NEVER_FORWARD.has(normalized)) {
      throw new Error(`upstreamResponseHeader${kind === "name" ? "Names" : "Prefixes"} cannot include a restricted proxy response header.`);
    }
    if (normalizedValues.has(normalized)) {
      throw new Error(`duplicate proxy response header ${kind}: ${value}.`);
    }
    normalizedValues.add(normalized);
  }
  return normalizedValues;
}

function lastUserMessageText(messages: unknown): string | null {
  if (!Array.isArray(messages)) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const raw = messages[index];
    if (!raw || typeof raw !== "object") continue;
    const message = raw as ChatMessage;
    if (message.role !== "user") continue;
    const text = contentToText(message.content);
    if (text) return text;
  }
  return null;
}

function hasUnsupportedAssistantMetadata(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const record = message as Record<string, unknown>;
  return record.tool_calls !== undefined || record.function_call !== undefined;
}

async function verifyNonStreamingChoices(input: {
  payload: ChatCompletionResponse;
  question: string;
  options: OpenAIProxyOptions;
}): Promise<VerificationReport[] | null> {
  if (!Array.isArray(input.payload.choices) || input.payload.choices.length === 0) return null;

  const reports: VerificationReport[] = [];
  for (const choice of input.payload.choices) {
    const message = choice?.message;
    const text = contentToText(message?.content);
    if (text !== null && !hasUnsupportedAssistantMetadata(message)) {
      reports.push(await input.options.gate.verify({
        question: input.question,
        answer: text,
        ...(input.options.policy ? { policy: input.options.policy } : {}),
      }));
      continue;
    }

    if (!input.options.structuredOutputVerifier || !isStructuredChoice(choice)) return null;
    reports.push(await input.options.structuredOutputVerifier.verify({
      question: input.question,
      choice,
      stream: false,
    }));
  }
  return reports;
}

function isStructuredChoice(choice: unknown): choice is Record<string, unknown> & { message: Record<string, unknown> } {
  if (!choice || typeof choice !== "object") return false;
  const message = (choice as Record<string, unknown>).message;
  return Boolean(message && typeof message === "object");
}

interface StreamingChoice {
  text: string | null;
  choice: Record<string, unknown>;
}

interface StreamingChoiceAccumulator {
  index: number;
  role?: unknown;
  content?: string | unknown[];
  toolCalls: Map<number, StreamingToolCallAccumulator>;
  functionCall?: StreamingFunctionCallAccumulator;
  finishReason?: unknown;
}

interface StreamingToolCallAccumulator {
  id?: unknown;
  type?: unknown;
  function?: StreamingFunctionCallAccumulator;
}

interface StreamingFunctionCallAccumulator {
  name?: string;
  arguments: string;
}

function parseStreamingChoices(streamText: string, maxChoices: number, maxChoiceBytes: number): StreamingChoice[] | null {
  const normalized = streamText.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n");
  if (!normalized.endsWith("\n\n")) throw new Error("SSE stream did not end at a complete frame.");

  const choicesByIndex = new Map<number, StreamingChoiceAccumulator>();
  const blocks = normalized.split("\n\n");
  let done = false;

  for (const block of blocks.slice(0, -1)) {
    const dataLines: string[] = [];
    let eventType: string | undefined;
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) continue;
      if (line.startsWith("event:")) {
        eventType = line.slice("event:".length).trim();
        continue;
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).replace(/^ /u, ""));
        continue;
      }
      if (line.trim()) throw new Error("SSE stream contained an unsupported field.");
    }

    if (dataLines.length === 0) continue;
    if (done) throw new Error("SSE stream contained data after [DONE].");
    const data = dataLines.join("\n");
    if (data === "[DONE]") {
      done = true;
      continue;
    }
    if (eventType === "error") throw new Error("SSE stream contained an error event.");

    const payload = JSON.parse(data) as Record<string, unknown>;
    if (payload.error !== undefined) throw new Error("SSE stream contained an error payload.");
    if (!Array.isArray(payload.choices)) throw new Error("SSE frame did not contain choices.");

    const frameIndexes = new Set<number>();
    for (const rawChoice of payload.choices) {
      if (!rawChoice || typeof rawChoice !== "object") throw new Error("SSE choice is malformed.");
      const choice = rawChoice as Record<string, unknown>;
      if (!Number.isInteger(choice.index) || (choice.index as number) < 0) {
        throw new Error("SSE choice index is malformed.");
      }
      const index = choice.index as number;
      if (frameIndexes.has(index)) throw new Error("SSE frame contained a duplicate choice index.");
      frameIndexes.add(index);
      if (!choicesByIndex.has(index) && choicesByIndex.size >= maxChoices) {
        throw new Error("SSE stream exceeded the configured choice limit.");
      }
      if (!choice.delta || typeof choice.delta !== "object") throw new Error("SSE delta is malformed.");
      const accumulator = choicesByIndex.get(index) ?? {
        index,
        toolCalls: new Map<number, StreamingToolCallAccumulator>(),
      } satisfies StreamingChoiceAccumulator;
      mergeStreamingDelta(accumulator, choice.delta as Record<string, unknown>);
      if (choice.finish_reason !== undefined) accumulator.finishReason = choice.finish_reason;
      if (streamingChoiceByteSize(accumulator) > maxChoiceBytes) {
        throw new Error("SSE choice exceeded the configured text limit.");
      }
      choicesByIndex.set(index, accumulator);
    }
  }

  if (!done || choicesByIndex.size === 0) throw new Error("SSE stream did not contain a complete response.");

  return [...choicesByIndex.values()]
    .sort((left, right) => left.index - right.index)
    .map(toStreamingChoice);
}

function mergeStreamingDelta(accumulator: StreamingChoiceAccumulator, delta: Record<string, unknown>): void {
  if (delta.role !== undefined) accumulator.role = delta.role;

  if (delta.content !== undefined && delta.content !== null) {
    if (typeof delta.content === "string") {
      if (Array.isArray(accumulator.content)) throw new Error("SSE delta mixed textual and structured content.");
      accumulator.content = `${typeof accumulator.content === "string" ? accumulator.content : ""}${delta.content}`;
    } else if (Array.isArray(delta.content)) {
      if (typeof accumulator.content === "string") throw new Error("SSE delta mixed textual and structured content.");
      for (const part of delta.content) {
        if (!part || typeof part !== "object") throw new Error("SSE delta content part is malformed.");
      }
      accumulator.content = [...(accumulator.content ?? []), ...delta.content];
    } else {
      throw new Error("SSE delta content is malformed.");
    }
  }

  if (delta.tool_calls !== undefined) {
    if (!Array.isArray(delta.tool_calls)) throw new Error("SSE tool calls are malformed.");
    for (const rawToolCall of delta.tool_calls) {
      if (!rawToolCall || typeof rawToolCall !== "object") throw new Error("SSE tool call is malformed.");
      const toolCall = rawToolCall as Record<string, unknown>;
      if (!Number.isInteger(toolCall.index) || (toolCall.index as number) < 0) {
        throw new Error("SSE tool call index is malformed.");
      }
      const index = toolCall.index as number;
      const toolCallAccumulator = accumulatorForToolCall(accumulator.toolCalls, index);
      if (toolCall.id !== undefined) toolCallAccumulator.id = toolCall.id;
      if (toolCall.type !== undefined) toolCallAccumulator.type = toolCall.type;
      if (toolCall.function !== undefined) {
        toolCallAccumulator.function = mergeFunctionCall(toolCallAccumulator.function, toolCall.function);
      }
    }
  }

  if (delta.function_call !== undefined) {
    accumulator.functionCall = mergeFunctionCall(accumulator.functionCall, delta.function_call);
  }
}

function accumulatorForToolCall(
  toolCalls: Map<number, StreamingToolCallAccumulator>,
  index: number,
): StreamingToolCallAccumulator {
  const existing = toolCalls.get(index) ?? {};
  toolCalls.set(index, existing);
  return existing;
}

function mergeFunctionCall(existing: StreamingFunctionCallAccumulator | undefined, rawFunction: unknown): StreamingFunctionCallAccumulator {
  if (!rawFunction || typeof rawFunction !== "object") throw new Error("SSE function call is malformed.");
  const functionCall = rawFunction as Record<string, unknown>;
  const merged = existing ?? { arguments: "" };
  if (functionCall.name !== undefined) {
    if (typeof functionCall.name !== "string") throw new Error("SSE function name is malformed.");
    merged.name = `${merged.name ?? ""}${functionCall.name}`;
  }
  if (functionCall.arguments !== undefined) {
    if (typeof functionCall.arguments !== "string") throw new Error("SSE function arguments are malformed.");
    merged.arguments += functionCall.arguments;
  }
  return merged;
}

function toStreamingChoice(accumulator: StreamingChoiceAccumulator): StreamingChoice {
  const message: Record<string, unknown> = {};
  if (accumulator.role !== undefined) message.role = accumulator.role;
  if (accumulator.content !== undefined) message.content = accumulator.content;
  if (accumulator.content === undefined && (accumulator.toolCalls.size > 0 || accumulator.functionCall !== undefined)) {
    message.content = null;
  }
  if (accumulator.toolCalls.size > 0) {
    message.tool_calls = [...accumulator.toolCalls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, toolCall]) => ({
        ...(toolCall.id === undefined ? {} : { id: toolCall.id }),
        ...(toolCall.type === undefined ? {} : { type: toolCall.type }),
        ...(toolCall.function === undefined ? {} : { function: toolCall.function }),
      }));
  }
  if (accumulator.functionCall !== undefined) message.function_call = accumulator.functionCall;

  const choice = {
    index: accumulator.index,
    message,
    ...(accumulator.finishReason === undefined ? {} : { finish_reason: accumulator.finishReason }),
  };
  const text = typeof accumulator.content === "string" && accumulator.content.length > 0 && accumulator.toolCalls.size === 0 && accumulator.functionCall === undefined
    ? accumulator.content
    : null;
  if (text === null && accumulator.content === undefined && accumulator.toolCalls.size === 0 && accumulator.functionCall === undefined) {
    throw new Error("SSE choice did not contain assistant output.");
  }
  return { text, choice };
}

function streamingChoiceByteSize(accumulator: StreamingChoiceAccumulator): number {
  return new TextEncoder().encode(JSON.stringify({
    index: accumulator.index,
    role: accumulator.role,
    content: accumulator.content,
    tool_calls: [...accumulator.toolCalls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, toolCall]) => toolCall),
    function_call: accumulator.functionCall,
    finish_reason: accumulator.finishReason,
  })).byteLength;
}

async function verifyStreamingChoices(input: {
  choices: StreamingChoice[];
  question: string;
  options: OpenAIProxyOptions;
}): Promise<VerificationReport[] | null> {
  const reports: VerificationReport[] = [];
  for (const choice of input.choices) {
    if (choice.text !== null) {
      reports.push(await input.options.gate.verify({
        question: input.question,
        answer: choice.text,
        ...(input.options.policy ? { policy: input.options.policy } : {}),
      }));
      continue;
    }
    if (!input.options.structuredOutputVerifier) return null;
    reports.push(await input.options.structuredOutputVerifier.verify({
      question: input.question,
      choice: choice.choice,
      stream: true,
    }));
  }
  return reports;
}

async function readBufferedResponse(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) throw new Error("Upstream response did not contain a readable body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  let completed = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) throw new Error("Buffered upstream response exceeds the configured size limit.");
      text += decoder.decode(value, { stream: true });
    }
    completed = true;
    return text + decoder.decode();
  } finally {
    if (!completed) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function aggregateReports(reports: VerificationReport[]): VerificationReport {
  const counts: VerificationCounts = {
    total: 0,
    supported: 0,
    contradicted: 0,
    unsupported: 0,
    unverifiable: 0,
  };

  for (const report of reports) {
    counts.total += report.counts.total;
    counts.supported += report.counts.supported;
    counts.contradicted += report.counts.contradicted;
    counts.unsupported += report.counts.unsupported;
    counts.unverifiable += report.counts.unverifiable;
  }

  const generatedAt = reports.reduce(
    (latest, report) => report.generatedAt > latest ? report.generatedAt : latest,
    reports[0]?.generatedAt ?? new Date().toISOString(),
  );

  return {
    passed: reports.every((report) => report.passed),
    coverage: calculateCoverage(counts),
    counts,
    claims: reports.flatMap((report) => report.claims),
    violations: reports.flatMap((report) => report.violations),
    generatedAt,
  };
}

function contentToText(content: unknown): string | null {
  if (typeof content === "string") return content.trim() || null;
  if (!Array.isArray(content)) return null;

  const parts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") return null;
    const record = part as Record<string, unknown>;
    if (record.type !== "text" || typeof record.text !== "string") return null;
    parts.push(record.text);
  }

  const joined = parts.join("\n").trim();
  return joined || null;
}

async function readRequestBody(request: IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
    total += bytes.byteLength;
    if (total > maxBytes) throw new Error("Request body exceeds configured size limit.");
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

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(body)}\n`);
}

function setGateHeaders(response: ServerResponse, report: VerificationReport): void {
  response.setHeader("x-claimlatch-result", report.passed ? "pass" : "blocked");
  response.setHeader("x-claimlatch-coverage", report.coverage.toFixed(3));
  response.setHeader("x-claimlatch-claims", String(report.counts.total));
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function normalizeTimeout(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("upstreamTimeoutMs must be a finite non-negative number.");
  }
  return Math.floor(value);
}

function normalizeUpstreamBaseUrl(value: string): string {
  const baseUrl = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("upstreamBaseUrl must be an absolute HTTP URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("upstreamBaseUrl must be an absolute HTTP URL.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("upstreamBaseUrl cannot include credentials.");
  }
  if (parsed.search || parsed.hash) {
    throw new Error(
      "upstreamBaseUrl cannot include a query or fragment; put provider query parameters in upstreamChatCompletionsPath.",
    );
  }

  return baseUrl.replace(/\/+$/, "");
}

function normalizeUpstreamApiKeyHeader(value: string): string {
  const header = value.trim().toLowerCase();
  if (!/^[!#$%&'*+\-.^_`|~0-9a-z]+$/u.test(header)) {
    throw new Error("upstreamApiKeyHeader must be a valid HTTP header name.");
  }
  if (header !== "authorization" && (REQUEST_HEADERS_TO_STRIP.has(header) || header === "content-type")) {
    throw new Error("upstreamApiKeyHeader cannot target a restricted proxy header.");
  }
  return header;
}

function normalizeUpstreamApiKeyPrefix(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const prefix = value.trim();
  if (!prefix) return undefined;
  if (!/^[A-Za-z][A-Za-z0-9._-]*$/u.test(prefix)) {
    throw new Error("upstreamApiKeyPrefix must be an HTTP authentication scheme token.");
  }
  return prefix;
}

function normalizeUpstreamChatCompletionsPath(value: string): string {
  return normalizeUpstreamRelativePath(value, "upstreamChatCompletionsPath");
}

function normalizeUpstreamModelsPath(value: string): string {
  return normalizeUpstreamRelativePath(value, "upstreamModelsPath");
}

function normalizeUpstreamRelativePath(value: string, optionName: string): string {
  const path = value.trim();
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("#") ||
    /^[a-z][a-z\d+.-]*:/iu.test(path)
  ) {
    throw new Error(`${optionName} must be a relative HTTP path with optional query.`);
  }

  try {
    const parsed = new URL(`http://claimlatch.invalid${path}`);
    if (parsed.origin !== "http://claimlatch.invalid" || !parsed.pathname.startsWith("/")) {
      throw new Error("invalid path");
    }
  } catch {
    throw new Error(`${optionName} must be a valid HTTP path.`);
  }

  return path;
}

function appendQuery(path: string, query: string): string {
  if (!query) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${query}`;
}

function extractModelId(path: string, encoding: "encoded" | "path"): string | undefined {
  const prefixes = ["/v1/models/", "/models/"];
  const prefix = prefixes.find((candidate) => path.startsWith(candidate));
  if (!prefix) return undefined;

  const rawModelId = path.slice(prefix.length);
  if (!rawModelId || (encoding === "encoded" && rawModelId.includes("/"))) return undefined;

  try {
    const modelId = decodeURIComponent(rawModelId);
    if (!modelId || modelId === "." || modelId === "..") return undefined;
    if (encoding === "path") {
      const segments = modelId.split("/");
      if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) return undefined;
    }
    return modelId;
  } catch {
    return undefined;
  }
}

function appendModelId(path: string, modelId: string, encoding: "encoded" | "path"): string {
  const queryStart = path.indexOf("?");
  const pathname = queryStart === -1 ? path : path.slice(0, queryStart);
  const query = queryStart === -1 ? "" : path.slice(queryStart);
  const encodedModelId = encodeURIComponent(modelId);
  const modelPath = encoding === "path"
    ? encodedModelId.replace(/%2F/giu, "/")
    : encodedModelId;
  return `${pathname.replace(/\/+$/u, "")}/${modelPath}${query}`;
}

function normalizeUpstreamModelIdEncoding(value: "encoded" | "path"): "encoded" | "path" {
  if (value !== "encoded" && value !== "path") {
    throw new Error("upstreamModelIdEncoding must be either encoded or path.");
  }
  return value;
}

function createUpstreamAbortControl(
  request: IncomingMessage,
  response: ServerResponse,
  timeoutMs: number,
): {
  signal: AbortSignal;
  aborted(): boolean;
  timedOut(): boolean;
  clientDisconnected(): boolean;
  cleanup(): void;
} {
  const controller = new AbortController();
  let timedOut = false;
  let clientDisconnected = false;
  let finished = false;

  const abortForClientDisconnect = (): void => {
    if (finished || response.writableEnded) return;
    clientDisconnected = true;
    controller.abort(new DOMException("The client disconnected.", "AbortError"));
  };
  const abortForRequestDisconnect = (): void => {
    if (finished) return;
    clientDisconnected = true;
    controller.abort(new DOMException("The client disconnected.", "AbortError"));
  };
  const timeout = timeoutMs > 0
    ? setTimeout(() => {
      if (finished) return;
      timedOut = true;
      controller.abort(new DOMException("The upstream request timed out.", "TimeoutError"));
    }, timeoutMs)
    : undefined;

  response.on("close", abortForClientDisconnect);
  request.on("aborted", abortForRequestDisconnect);

  return {
    signal: controller.signal,
    aborted: () => timedOut || clientDisconnected,
    timedOut: () => timedOut,
    clientDisconnected: () => clientDisconnected,
    cleanup() {
      if (finished) return;
      finished = true;
      if (timeout !== undefined) clearTimeout(timeout);
      response.removeListener("close", abortForClientDisconnect);
      request.removeListener("aborted", abortForRequestDisconnect);
    },
  };
}

function handleUpstreamAbort(
  control: ReturnType<typeof createUpstreamAbortControl>,
  response: ServerResponse,
): boolean {
  const timedOut = control.timedOut();
  const clientDisconnected = control.clientDisconnected();
  control.cleanup();
  if (clientDisconnected) return true;
  if (!timedOut) return false;

  writeJson(response, 504, {
    error: {
      type: "claimlatch_upstream_error",
      code: "claimlatch_upstream_timeout",
      message: "The upstream provider did not complete within the configured timeout.",
    },
  });
  return true;
}

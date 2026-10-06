import {
  createDefaultClaimLatch,
  createGuardedAnswerFetchHandler,
  type GuardedAnswerFetchHandler,
} from "../src/index.js";
import { getResponseCookies } from "./response-cookies.js";

export interface KoaRequest {
  method?: string;
  protocol?: string;
  host?: string;
  originalUrl?: string;
  url?: string;
  body?: unknown;
  get?(name: string): string | undefined;
}

export interface KoaResponse {
  status: number;
  set(name: string, value: string | string[]): void;
  body: unknown;
}

export interface KoaContext {
  request: KoaRequest;
  response: KoaResponse;
}

let cachedHandler: GuardedAnswerFetchHandler | undefined;

function getHandler(): GuardedAnswerFetchHandler {
  if (cachedHandler) return cachedHandler;

  const llmModel = process.env.CLAIMLATCH_LLM_MODEL;
  const tavilyApiKey = process.env.TAVILY_API_KEY;
  if (!llmModel) throw new Error("Set CLAIMLATCH_LLM_MODEL.");
  if (!tavilyApiKey) throw new Error("Set TAVILY_API_KEY.");

  const gate = createDefaultClaimLatch({
    llmModel,
    tavilyApiKey,
    ...(process.env.CLAIMLATCH_LLM_API_KEY ? { llmApiKey: process.env.CLAIMLATCH_LLM_API_KEY } : {}),
    ...(process.env.CLAIMLATCH_LLM_BASE_URL ? { llmBaseUrl: process.env.CLAIMLATCH_LLM_BASE_URL } : {}),
  });
  cachedHandler = createGuardedAnswerFetchHandler({
    gate,
    policy: {
      minimumCoverage: 1,
      maxUnsupportedClaims: 0,
      maxUnverifiableClaims: 0,
      blockOnContradiction: true,
    },
  });
  return cachedHandler;
}

export function createKoaGuardedAnswerHandler(
  fetchHandler: GuardedAnswerFetchHandler = getHandler(),
): (context: KoaContext) => Promise<void> {
  return async (context) => {
    const request = context.request;
    const protocol = request.protocol ?? "http";
    const host = request.host ?? request.get?.("host") ?? "localhost";
    const path = request.url ?? request.originalUrl ?? "/";
    const method = request.method ?? "GET";
    const init: RequestInit = { method };
    if (request.body !== undefined && method !== "GET" && method !== "HEAD") {
      const body = JSON.stringify(request.body);
      if (body === undefined) throw new TypeError("Koa request body must be JSON-serializable.");
      init.body = body;
      init.headers = { "content-type": "application/json" };
    }

    const upstreamResponse = await fetchHandler(new Request(new URL(path, `${protocol}://${host}`), init));
    const responseCookies = getResponseCookies(upstreamResponse.headers);
    upstreamResponse.headers.forEach((value, name) => {
      if (name !== "set-cookie") context.response.set(name, value);
    });
    if (responseCookies.length > 0) context.response.set("set-cookie", responseCookies);
    context.response.body = await upstreamResponse.text();
    context.response.status = upstreamResponse.status;
  };
}

// Copy this adapter into a Koa route after enabling a JSON body parser.

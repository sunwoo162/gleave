import {
  createDefaultClaimLatch,
  createGuardedAnswerFetchHandler,
  type GuardedAnswerFetchHandler,
} from "../src/index.js";
import { getResponseCookies } from "./response-cookies.js";

export interface HapiRequest {
  method?: string;
  url?: string;
  path?: string;
  headers?: Record<string, string | string[] | undefined>;
  payload?: unknown;
  server?: {
    info?: {
      protocol?: string;
    };
  };
  info?: {
    host?: string;
  };
}

export interface HapiResponseObject {
  code(statusCode: number): HapiResponseObject;
  header(name: string, value: string): HapiResponseObject;
}

export interface HapiResponseToolkit {
  response(payload: string): HapiResponseObject;
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

export function createHapiGuardedAnswerHandler(
  fetchHandler: GuardedAnswerFetchHandler = getHandler(),
): (request: HapiRequest, h: HapiResponseToolkit) => Promise<HapiResponseObject> {
  return async (request, h) => {
    const method = (request.method ?? "GET").toUpperCase();
    const protocol = request.server?.info?.protocol ?? "http";
    const host = request.info?.host ?? getHeaderValue(request.headers?.host) ?? "localhost";
    const path = request.url ?? request.path ?? "/";
    const init: RequestInit = { method };
    if (request.payload !== undefined && method !== "GET" && method !== "HEAD") {
      const body = JSON.stringify(request.payload);
      if (body === undefined) throw new TypeError("Hapi request payload must be JSON-serializable.");
      init.body = body;
      init.headers = { "content-type": "application/json" };
    }

    const upstreamResponse = await fetchHandler(new Request(new URL(path, `${protocol}://${host}`), init));
    const response = h.response(await upstreamResponse.text());
    upstreamResponse.headers.forEach((value, name) => {
      if (name !== "set-cookie") response.header(name, value);
    });
    for (const cookie of getResponseCookies(upstreamResponse.headers)) {
      response.header("set-cookie", cookie);
    }
    return response.code(upstreamResponse.status);
  };
}

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Copy this adapter into a Hapi route after enabling a JSON payload parser.

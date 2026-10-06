import {
  createDefaultClaimLatch,
  createGuardedAnswerFetchHandler,
  type GuardedAnswerFetchHandler,
} from "../src/index.js";
import { getResponseCookies } from "./response-cookies.js";

export interface ExpressRequest {
  method?: string;
  protocol?: string;
  originalUrl?: string;
  url?: string;
  body?: unknown;
  get(name: string): string | undefined;
}

export interface ExpressResponse {
  status(code: number): ExpressResponse;
  setHeader(name: string, value: string | string[]): ExpressResponse;
  send(body: string): ExpressResponse;
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

export function createExpressGuardedAnswerHandler(
  fetchHandler: GuardedAnswerFetchHandler = getHandler(),
): (request: ExpressRequest, response: ExpressResponse) => Promise<void> {
  return async (request, response) => {
    const protocol = request.protocol ?? "http";
    const host = request.get("host") ?? "localhost";
    const path = request.url ?? request.originalUrl ?? "/";
    const method = request.method ?? "GET";
    const init: RequestInit = { method };
    if (request.body !== undefined && method !== "GET" && method !== "HEAD") {
      init.body = JSON.stringify(request.body);
      init.headers = { "content-type": "application/json" };
    }

    const upstreamResponse = await fetchHandler(new Request(new URL(path, `${protocol}://${host}`), init));
    const responseCookies = getResponseCookies(upstreamResponse.headers);
    upstreamResponse.headers.forEach((value, name) => {
      if (name !== "set-cookie") response.setHeader(name, value);
    });
    if (responseCookies.length > 0) response.setHeader("set-cookie", responseCookies);
    response.status(upstreamResponse.status).send(await upstreamResponse.text());
  };
}

// Copy this adapter into an Express route after installing `express.json()`.

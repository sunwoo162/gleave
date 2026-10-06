import {
  createDefaultClaimLatch,
  createGuardedAnswerFetchHandler,
  type GuardedAnswerFetchHandler,
} from "../src/index.js";
import { getResponseCookies } from "./response-cookies.js";

export interface AwsLambdaHttpApiV2Event {
  version: "2.0";
  rawPath: string;
  rawQueryString: string;
  headers?: Readonly<Record<string, string>>;
  cookies?: readonly string[];
  requestContext: {
    http: {
      method: string;
    };
  };
  body?: string | null;
  isBase64Encoded?: boolean;
}

export interface AwsLambdaHttpApiV2Response {
  statusCode: number;
  headers: Record<string, string>;
  cookies?: string[];
  body: string;
  isBase64Encoded: true;
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

export function createAwsLambdaHttpApiV2Handler(
  fetchHandler: GuardedAnswerFetchHandler = getHandler(),
): (event: AwsLambdaHttpApiV2Event) => Promise<AwsLambdaHttpApiV2Response> {
  return async (event) => {
    const headers = new Headers();
    for (const [name, value] of Object.entries(event.headers ?? {})) {
      headers.set(name, value);
    }
    if (!headers.has("cookie") && event.cookies && event.cookies.length > 0) {
      headers.set("cookie", event.cookies.join("; "));
    }

    const path = event.rawPath.startsWith("/") ? event.rawPath : `/${event.rawPath}`;
    const query = event.rawQueryString.length > 0 ? `?${event.rawQueryString}` : "";
    const requestInit: RequestInit = {
      method: event.requestContext.http.method,
      headers,
    };
    const method = event.requestContext.http.method.toUpperCase();
    if (
      event.body !== undefined &&
      event.body !== null &&
      event.body.length > 0 &&
      method !== "GET" &&
      method !== "HEAD"
    ) {
      requestInit.body = event.isBase64Encoded
        ? new Blob([decodeBase64(event.body)])
        : event.body;
    }

    const response = await fetchHandler(new Request(`https://lambda.invalid${path}${query}`, requestInit));
    const responseHeaders: Record<string, string> = {};
    const responseCookies = getResponseCookies(response.headers);
    response.headers.forEach((value, name) => {
      if (name !== "set-cookie") responseHeaders[name] = value;
    });

    return {
      statusCode: response.status,
      headers: responseHeaders,
      ...(responseCookies.length > 0 ? { cookies: responseCookies } : {}),
      body: encodeBase64(new Uint8Array(await response.arrayBuffer())),
      isBase64Encoded: true,
    };
  };
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return buffer;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

// Copy this adapter into a Lambda handler: export const handler = createAwsLambdaHttpApiV2Handler().

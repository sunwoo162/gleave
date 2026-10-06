import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const nativeFetch = globalThis.fetch.bind(globalThis);
const ALLCON_HOSTS = new Set(["all-con.co.kr", "www.all-con.co.kr"]);
const CURL_STATUS_MARKER = "__ISEOL_CURL_STATUS__";
const ALLCON_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_ALLCON_REDIRECTS = 5;

function requestUrl(input: Parameters<typeof globalThis.fetch>[0]): string | null {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export function getAllconRedirectMode(
  input: Parameters<typeof globalThis.fetch>[0],
  init?: Parameters<typeof globalThis.fetch>[1],
): string {
  return init?.redirect ?? (input instanceof Request ? input.redirect : "follow");
}

function requestMethod(
  input: Parameters<typeof globalThis.fetch>[0],
  init?: Parameters<typeof globalThis.fetch>[1],
): string {
  return (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
}

function assertCurlFallbackRequestSupported(
  input: Parameters<typeof globalThis.fetch>[0],
  init?: Parameters<typeof globalThis.fetch>[1],
): string {
  const method = requestMethod(input, init);
  const hasInitBody = init?.body !== undefined && init.body !== null;
  const hasRequestBody = input instanceof Request && input.body !== null;
  if (method !== "GET" || hasInitBody || hasRequestBody) {
    throw new Error("Allcon curl fallback supports only GET requests without a body");
  }
  return method;
}

function buildCurlFallbackInit(
  input: Parameters<typeof globalThis.fetch>[0],
  init?: Parameters<typeof globalThis.fetch>[1],
): Parameters<typeof globalThis.fetch>[1] {
  const method = assertCurlFallbackRequestSupported(input, init);
  const inheritedHeaders = input instanceof Request && init?.headers === undefined
    ? new Headers(input.headers)
    : init?.headers;
  return {
    ...init,
    method,
    ...(inheritedHeaders === undefined ? {} : { headers: inheritedHeaders }),
  };
}

export function isAllconUrl(url: string | null): boolean {
  if (!url || url.includes("\\") || /%5c/i.test(url)) return false;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:"
      && ALLCON_HOSTS.has(parsed.hostname.toLowerCase())
      && !parsed.username
      && !parsed.password
      && !parsed.port;
  } catch {
    return false;
  }
}

export function resolveAllconRedirect(currentUrl: string, response: Response): string | null {
  if (!ALLCON_REDIRECT_STATUSES.has(response.status)) return null;

  const location = response.headers.get("location");
  if (!location) return null;

  let target: string;
  try {
    target = new URL(location, currentUrl).toString();
  } catch {
    throw new Error("Allcon redirect target is invalid");
  }

  if (!isAllconUrl(target) || new URL(target).origin !== new URL(currentUrl).origin) {
    throw new Error("Allcon redirect target is not allowed");
  }
  return target;
}

export function buildAllconCurlArgs(
  url: string,
  init?: Parameters<typeof globalThis.fetch>[1],
): string[] {
  if (!isAllconUrl(url)) throw new Error("Allcon fallback URL is not allowed");
  assertCurlFallbackRequestSupported(url, init);

  const headers = new Headers(init?.headers);
  const args = [
    "--fail",
    "--silent",
    "--show-error",
    "--compressed",
    "--insecure",
    "--max-time",
    "15",
    "--max-redirs",
    "0",
    "--write-out",
    `\n${CURL_STATUS_MARKER}%{http_code}\t%{redirect_url}`,
  ];

  for (const [name, value] of headers.entries()) {
    args.push("--header", `${name}: ${value}`);
  }

  args.push(url);
  return args;
}

export function parseAllconCurlOutput(output: string): { body: string | null; location: string | null; status: number } {
  const marker = `\n${CURL_STATUS_MARKER}`;
  const markerIndex = output.lastIndexOf(marker);
  if (markerIndex < 0) throw new Error("Allcon fallback response status is missing");

  const metadata = output.slice(markerIndex + marker.length).trim();
  const separatorIndex = metadata.indexOf("\t");
  const status = Number(separatorIndex < 0 ? metadata : metadata.slice(0, separatorIndex));
  if (!Number.isInteger(status) || status < 200 || status > 599) {
    throw new Error("Allcon fallback response status is invalid");
  }

  return {
    body: new Set([204, 205, 304]).has(status) ? null : output.slice(0, markerIndex),
    location: separatorIndex < 0 ? null : metadata.slice(separatorIndex + 1).trim() || null,
    status,
  };
}

function isCertificateChainError(error: unknown): boolean {
  let current: unknown = error;

  while (current && typeof current === "object") {
    const code = "code" in current ? String(current.code) : "";
    if (
      code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
      || code === "UNABLE_TO_GET_ISSUER_CERT"
      || code === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY"
      || code === "CERT_UNTRUSTED"
    ) {
      return true;
    }

    current = "cause" in current ? current.cause : null;
  }

  return false;
}

async function fetchAllconWithCurl(
  url: string,
  init?: Parameters<typeof globalThis.fetch>[1],
): Promise<Response> {
  const result = await execFileAsync("curl", buildAllconCurlArgs(url, init), {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  const { body, location, status } = parseAllconCurlOutput(String(result.stdout));
  const responseHeaders: Record<string, string> = { "content-type": "text/html; charset=utf-8" };
  if (location) responseHeaders.location = location;

  return new Response(body, {
    status,
    headers: responseHeaders,
  });
}

export async function fetchAllconWithValidatedRedirects(
  input: Parameters<typeof globalThis.fetch>[0],
  init?: Parameters<typeof globalThis.fetch>[1],
  fetcher: typeof globalThis.fetch = nativeFetch,
): Promise<Response> {
  const initialUrl = requestUrl(input);
  if (!isAllconUrl(initialUrl) || !initialUrl) throw new Error("Allcon fallback URL is not allowed");

  const inheritedHeaders = input instanceof Request && init?.headers === undefined
    ? new Headers(input.headers)
    : init?.headers;
  let currentInput: Parameters<typeof globalThis.fetch>[0] = input;
  let currentInit: Parameters<typeof globalThis.fetch>[1] = {
    ...init,
    ...(inheritedHeaders === undefined ? {} : { headers: inheritedHeaders }),
    redirect: "manual",
  };
  let currentUrl: string = initialUrl;

  for (let redirectCount = 0; ; redirectCount += 1) {
    let response: Response;
    try {
      response = await fetcher(currentInput, currentInit);
    } catch (error) {
      if (!isCertificateChainError(error)) throw error;
      console.warn("올콘 HTTPS 인증서 체인 검증 실패: 올콘 전용 비검증 curl fallback으로 재시도합니다.");
      response = await fetchAllconWithCurl(currentUrl, buildCurlFallbackInit(currentInput, currentInit));
    }

    const nextUrl = resolveAllconRedirect(currentUrl, response);
    if (!nextUrl) return response;
    if (redirectCount >= MAX_ALLCON_REDIRECTS) throw new Error("Allcon redirect limit exceeded");

    const method: string = requestMethod(currentInput, currentInit);
    const nextMethod: string = ((response.status === 301 || response.status === 302) && method === "POST")
      || (response.status === 303 && method !== "GET" && method !== "HEAD")
      ? "GET"
      : method;
    const hasBody = (currentInit?.body !== undefined && currentInit.body !== null)
      || (currentInput instanceof Request && currentInput.body !== null);
    if (hasBody && nextMethod !== "GET" && nextMethod !== "HEAD") {
      throw new Error("Allcon redirects with a request body are not supported");
    }

    currentInput = nextUrl;
    currentInit = {
      ...currentInit,
      method: nextMethod,
      body: nextMethod === "GET" || nextMethod === "HEAD" ? undefined : currentInit?.body,
      redirect: "manual",
    };
    currentUrl = nextUrl;
  }
}

const fetchWithAllconFallback: typeof globalThis.fetch = async (input, init) => {
  const url = requestUrl(input);
  if (!url || !isAllconUrl(url)) return nativeFetch(input, init);

  const redirectMode = getAllconRedirectMode(input, init);
  if (redirectMode === "error" || redirectMode === "manual") {
    try {
      return await nativeFetch(input, init);
    } catch (error) {
      if (!isCertificateChainError(error)) throw error;
      console.warn("올콘 HTTPS 인증서 체인 검증 실패: 올콘 전용 비검증 curl fallback으로 재시도합니다.");
      const response = await fetchAllconWithCurl(url, buildCurlFallbackInit(input, init));
      if (redirectMode === "error" && resolveAllconRedirect(url, response)) {
        throw new TypeError("Allcon redirect rejected by redirect mode");
      }
      return response;
    }
  }

  return fetchAllconWithValidatedRedirects(input, init);
};

globalThis.fetch = fetchWithAllconFallback;

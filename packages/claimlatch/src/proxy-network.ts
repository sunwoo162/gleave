import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { isSafePublicHttpUrl } from "./providers/provenance.js";

export type ProxyDnsLookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<Array<{ address: string; family: 4 | 6 }>>;

export interface ProxyPinnedRequestOptions {
  address: string;
  family: 4 | 6;
  headers: Record<string, string>;
  method: string;
  body?: string;
  signal: AbortSignal;
}

export type ProxyPinnedRequest = (url: URL, options: ProxyPinnedRequestOptions) => Promise<Response>;

interface ClientRequestLike {
  destroy(error?: Error): void;
  end(): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
  write(body: string): void;
}

export function createPinnedProxyFetch(
  lookupImpl: ProxyDnsLookup = lookupAllAddresses,
  requestImpl: ProxyPinnedRequest = requestWithPinnedAddress,
): typeof fetch {
  return async (input, init) => {
    const url = input instanceof Request
      ? new URL(input.url)
      : new URL(String(input));
    const request = input instanceof Request && !init ? input : undefined;
    const headers = new Headers(init?.headers ?? request?.headers);
    const body = init?.body ?? (request ? await request.text() : undefined);
    return fetchWithPinnedAddress(url, {
      method: init?.method ?? request?.method ?? "GET",
      headers,
      ...(typeof body === "string" ? { body } : {}),
      signal: init?.signal ?? request?.signal ?? new AbortController().signal,
    }, lookupImpl, requestImpl);
  };
}

async function fetchWithPinnedAddress(
  url: URL,
  options: {
    method: string;
    headers: Headers;
    body?: string;
    signal: AbortSignal;
  },
  lookupImpl: ProxyDnsLookup,
  requestImpl: ProxyPinnedRequest,
): Promise<Response> {
  if (!isSafePublicHttpUrl(url)) throw new Error("Upstream URL must resolve to a public HTTP(S) target.");
  const addresses = await lookupWithAbort(url.hostname, lookupImpl, options.signal);
  if (addresses.length === 0 || addresses.some(({ address }) => !isSafePublicIp(address))) {
    throw new Error("Upstream hostname resolved to a non-public address.");
  }
  const selected = addresses[0];
  if (!selected) throw new Error("Upstream hostname did not resolve to an address.");
  const headers: Record<string, string> = {};
  options.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return requestImpl(url, {
    address: selected.address,
    family: selected.family,
    headers,
    method: options.method,
    ...(options.body !== undefined ? { body: options.body } : {}),
    signal: options.signal,
  });
}

async function lookupWithAbort(
  hostname: string,
  lookupImpl: ProxyDnsLookup,
  signal: AbortSignal,
): Promise<Array<{ address: string; family: 4 | 6 }>> {
  if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Upstream DNS lookup was aborted.");
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => signal.removeEventListener("abort", onAbort);
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = (): void => finish(() => reject(signal.reason instanceof Error ? signal.reason : new Error("Upstream DNS lookup was aborted.")));
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve()
      .then(() => lookupImpl(hostname.replace(/^\[|\]$/g, ""), { all: true, verbatim: true }))
      .then((addresses) => finish(() => resolve(addresses)), (error: unknown) => finish(() => reject(error)));
  });
}

async function lookupAllAddresses(hostname: string, options: { all: true; verbatim: true }): Promise<Array<{ address: string; family: 4 | 6 }>> {
  return lookup(hostname, options);
}

function requestWithPinnedAddress(url: URL, options: ProxyPinnedRequestOptions): Promise<Response> {
  const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const requestOptions: RequestOptions = {
    hostname,
    ...(url.port ? { port: url.port } : {}),
    path: `${url.pathname}${url.search}`,
    method: options.method,
    headers: options.headers,
    signal: options.signal,
    ...(url.protocol === "https:" ? { servername: hostname } : {}),
    lookup: (_lookupHostname, _lookupOptions, callback) => callback(null, options.address, options.family),
  };

  return new Promise((resolve, reject) => {
    const request = transport(requestOptions, (response) => resolve(createResponse(response, request as unknown as ClientRequestLike))) as unknown as ClientRequestLike;
    request.on("error", reject);
    if (options.body !== undefined) request.write(options.body);
    request.end();
  });
}

function createResponse(response: IncomingMessage, request: { destroy(error?: Error): void }): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      response.on("data", (chunk: Uint8Array | string) => controller.enqueue(typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk)));
      response.on("end", () => controller.close());
      response.on("error", (error) => controller.error(error));
    },
    cancel(reason) {
      request.destroy(reason instanceof Error ? reason : new Error("Upstream response cancelled."));
    },
  });
  const headers = Object.entries(response.headers).flatMap(([name, value]) => {
    if (Array.isArray(value)) return value.map((item) => [name, item] as [string, string]);
    return value === undefined ? [] : [[name, value] as [string, string]];
  });
  return new Response(body, { status: response.statusCode ?? 500, headers });
}

function isSafePublicIp(address: string): boolean {
  const normalized = address.toLowerCase();
  try {
    return isSafePublicHttpUrl(new URL(normalized.includes(":") ? `http://[${normalized}]/` : `http://${normalized}/`));
  } catch {
    return false;
  }
}

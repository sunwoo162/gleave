import { lookup } from "node:dns/promises";
import { request as httpRequest, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import type { Claim, Evidence, EvidenceProvider, EvidenceProvenance } from "../types.js";
import { extractPdfPages, type PdfPageText, type PdfTextParser } from "./pdf.js";

export type DnsLookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<Array<{ address: string; family: 4 | 6 }>>;

export interface PinnedRequestOptions {
  address: string;
  family: 4 | 6;
  headers: Record<string, string>;
  maxBytes: number;
  method: string;
  signal: AbortSignal;
}

export type PinnedRequest = (url: URL, options: PinnedRequestOptions) => Promise<Response>;

export interface OutboundAllowlist {
  hosts?: readonly string[];
  ports?: readonly number[];
}

export interface ProvenanceEvidenceProviderOptions {
  provider: EvidenceProvider;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxDocumentBytes?: number;
  maxQuoteChars?: number;
  maxRedirects?: number;
  lookupImpl?: DnsLookup;
  requestImpl?: PinnedRequest;
  pdfParser?: PdfTextParser;
  outboundAllowlist?: OutboundAllowlist;
}

export class ProvenanceEvidenceProvider implements EvidenceProvider {
  readonly #provider: EvidenceProvider;
  readonly #fetch: typeof fetch | undefined;
  readonly #lookup: DnsLookup;
  readonly #request: PinnedRequest;
  readonly #pdfParser: PdfTextParser;
  readonly #timeoutMs: number;
  readonly #maxDocumentBytes: number;
  readonly #maxQuoteChars: number;
  readonly #maxRedirects: number;
  readonly #outboundAllowlist: NormalizedOutboundAllowlist | undefined;

  constructor(options: ProvenanceEvidenceProviderOptions) {
    this.#provider = options.provider;
    this.#fetch = options.fetchImpl;
    this.#lookup = options.lookupImpl ?? lookupAllAddresses;
    this.#request = options.requestImpl ?? requestWithPinnedAddress;
    this.#pdfParser = options.pdfParser ?? extractPdfPages;
    this.#timeoutMs = clampInteger(options.timeoutMs ?? 8_000, 250, 60_000);
    this.#maxDocumentBytes = clampInteger(options.maxDocumentBytes ?? 1_000_000, 1_024, 5_000_000);
    this.#maxQuoteChars = clampInteger(options.maxQuoteChars ?? 700, 120, 2_000);
    this.#maxRedirects = clampInteger(options.maxRedirects ?? 3, 0, 10);
    this.#outboundAllowlist = normalizeOutboundAllowlist(options.outboundAllowlist);
  }

  async search(claim: Claim): Promise<Evidence[]> {
    const raw = await this.#provider.search(claim);
    return Promise.all(raw.map((evidence) => this.#hydrate(claim, evidence)));
  }

  async #hydrate(claim: Claim, evidence: Evidence): Promise<Evidence> {
    const fallback = withSearchSnippetProvenance(evidence);

    let url: URL;
    try {
      url = new URL(evidence.url);
    } catch {
      return fallback;
    }

    if (!isSafePublicHttpUrl(url) || !isAllowedOutboundUrl(url, this.#outboundAllowlist)) return fallback;

    try {
      const fetched = await fetchPublicDocument({
        url,
        ...(this.#fetch ? { fetchImpl: this.#fetch } : {}),
        lookupImpl: this.#lookup,
        requestImpl: this.#request,
        timeoutMs: this.#timeoutMs,
        maxBytes: this.#maxDocumentBytes,
        maxRedirects: this.#maxRedirects,
        ...(this.#outboundAllowlist ? { outboundAllowlist: this.#outboundAllowlist } : {}),
      });
      if (!fetched) return fallback;

      const document = await selectDocumentQuote({
        body: fetched.body,
        claimText: claim.text,
        contentType: fetched.contentType,
        maxQuoteChars: this.#maxQuoteChars,
        pdfParser: this.#pdfParser,
      });
      if (!document) return fallback;

      const selected = document.selected;
      if (!selected) return fallback;

      const provenance: EvidenceProvenance = {
        kind: "retrieved-document",
        sourceUrl: fetched.finalUrl,
        retrievedAt: fetched.retrievedAt,
        quote: selected.quote,
        ...(selected.page !== undefined ? { page: selected.page } : {}),
        quoteStart: selected.start,
        quoteEnd: selected.end,
        contentSha256: await sha256Hex(document.normalizedText),
        contentType: fetched.contentType,
      };

      return {
        ...evidence,
        url: fetched.finalUrl,
        snippet: selected.quote,
        retrievedAt: fetched.retrievedAt,
        provenance,
      };
    } catch {
      return fallback;
    }
  }
}

interface FetchedDocument {
  finalUrl: string;
  body: string | Uint8Array;
  contentType: string;
  retrievedAt: string;
}

async function fetchPublicDocument(input: {
  url: URL;
  fetchImpl?: typeof fetch;
  lookupImpl: DnsLookup;
  requestImpl: PinnedRequest;
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  outboundAllowlist?: NormalizedOutboundAllowlist;
}): Promise<FetchedDocument | null> {
  let current = input.url;

  for (let redirect = 0; redirect <= input.maxRedirects; redirect += 1) {
    if (!isSafePublicHttpUrl(current) || !isAllowedOutboundUrl(current, input.outboundAllowlist)) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const requestOptions = {
        method: "GET",
        redirect: "manual" as const,
        signal: controller.signal,
        headers: {
          accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.8,*/*;q=0.1",
          "user-agent": "ClaimLatch/0.2 evidence fetcher",
        },
      };
      const response = input.fetchImpl
        ? await input.fetchImpl(current, requestOptions)
        : await fetchWithPinnedAddress(current, requestOptions, input.lookupImpl, input.requestImpl, input.maxBytes);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirect === input.maxRedirects) return null;
        current = new URL(location, current);
        continue;
      }

      if (!response.ok) return null;

      const contentType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
      if (!isTextualContentType(contentType) && contentType !== "application/pdf") return null;

      const body = contentType === "application/pdf"
        ? await readBytesWithLimit(response, input.maxBytes)
        : await readTextWithLimit(response, input.maxBytes);
      return {
        finalUrl: current.toString(),
        body,
        contentType: contentType || "text/plain",
        retrievedAt: new Date().toISOString(),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}

async function fetchWithPinnedAddress(
  url: URL,
  options: {
    method: string;
    headers: Record<string, string>;
    signal: AbortSignal;
  },
  lookupImpl: DnsLookup,
  requestImpl: PinnedRequest,
  maxBytes: number,
): Promise<Response> {
  const addresses = await lookupWithAbort(
    url.hostname.replace(/^\[|\]$/g, ""),
    lookupImpl,
    options.signal,
  );
  if (addresses.length === 0 || addresses.some(({ address }) => !isSafePublicIp(address))) {
    throw new Error("Evidence hostname resolved to a non-public address.");
  }

  const selected = addresses[0];
  if (!selected) throw new Error("Evidence hostname did not resolve to an address.");
  return requestImpl(url, {
    ...options,
    address: selected.address,
    family: selected.family,
    maxBytes,
  });
}

async function lookupWithAbort(
  hostname: string,
  lookupImpl: DnsLookup,
  signal: AbortSignal,
): Promise<Array<{ address: string; family: 4 | 6 }>> {
  if (signal.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new Error("Evidence DNS lookup was aborted.");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => {
      signal.removeEventListener("abort", onAbort);
    };
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = (): void => {
      finish(() => reject(signal.reason instanceof Error ? signal.reason : new Error("Evidence DNS lookup was aborted.")));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }

    Promise.resolve()
      .then(() => lookupImpl(hostname, { all: true, verbatim: true }))
      .then(
        (addresses) => finish(() => resolve(addresses)),
        (error: unknown) => finish(() => reject(error)),
      );
  });
}

async function lookupAllAddresses(hostname: string, options: { all: true; verbatim: true }): Promise<Array<{ address: string; family: 4 | 6 }>> {
  return lookup(hostname, options);
}

async function requestWithPinnedAddress(url: URL, options: PinnedRequestOptions): Promise<Response> {
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
    lookup: (_lookupHostname, _lookupOptions, callback) => {
      callback(null, options.address, options.family);
    },
  };

  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const request = transport(requestOptions, (response) => {
      const chunks: Uint8Array[] = [];
      let total = 0;

      response.on("data", (chunk) => {
        const bytes = typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
        total += bytes.byteLength;
        if (total > options.maxBytes) {
          request.destroy(new Error("Evidence document exceeds configured size limit."));
          fail(new Error("Evidence document exceeds configured size limit."));
          return;
        }
        chunks.push(bytes);
      });
      response.on("error", fail);
      response.on("end", () => {
        if (settled) return;
        const body = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          body.set(chunk, offset);
          offset += chunk.byteLength;
        }

        const headers = Object.entries(response.headers).flatMap(([name, value]) => {
          if (Array.isArray(value)) return value.map((item) => [name, item] as [string, string]);
          return value === undefined ? [] : [[name, value] as [string, string]];
        });
        settled = true;
        const bodyBuffer = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
        resolve(new Response(bodyBuffer, {
          status: response.statusCode ?? 500,
          headers,
        }));
      });
    });
    request.on("error", fail);
  });
}

async function readTextWithLimit(response: Response, maxBytes: number): Promise<string> {
  return new TextDecoder().decode(await readBytesWithLimit(response, maxBytes));
}

async function readBytesWithLimit(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) throw new Error("Evidence document exceeds configured size limit.");
      chunks.push(value);
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
  return merged;
}

function isTextualContentType(contentType: string): boolean {
  return (
    contentType === "" ||
    contentType === "text/html" ||
    contentType === "application/xhtml+xml" ||
    contentType === "text/plain" ||
    contentType === "application/json" ||
    contentType.endsWith("+json")
  );
}

function normalizeDocumentText(body: string, contentType: string): string {
  if (contentType.includes("html") || /<html[\s>]/i.test(body)) {
    return htmlToText(body);
  }
  return collapseWhitespace(body);
}

function htmlToText(html: string): string {
  return collapseWhitespace(
    decodeHtmlEntities(
      html
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
        .replace(/<(br|\/p|\/div|\/li|\/section|\/article|\/h[1-6]|\/tr)>/gi, ". ")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, token: string) => {
    if (token[0] === "#") {
      const hex = token[1]?.toLowerCase() === "x";
      const parsed = Number.parseInt(token.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : match;
    }
    return named[token.toLowerCase()] ?? match;
  });
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

interface SelectedQuote {
  quote: string;
  start: number;
  end: number;
  score: number;
  page?: number;
}

async function selectDocumentQuote(input: {
  body: string | Uint8Array;
  claimText: string;
  contentType: string;
  maxQuoteChars: number;
  pdfParser: PdfTextParser;
}): Promise<{ normalizedText: string; selected: SelectedQuote } | null> {
  if (input.contentType === "application/pdf") {
    if (!(input.body instanceof Uint8Array)) return null;
    const pages = await input.pdfParser(input.body);
    const selected = selectPdfQuote(pages, input.claimText, input.maxQuoteChars);
    if (!selected) return null;
    return {
      normalizedText: pages.map((page) => page.text).join("\n\f\n"),
      selected,
    };
  }

  const text = normalizeDocumentText(input.body as string, input.contentType);
  const selected = selectQuote(text, input.claimText, input.maxQuoteChars);
  return text && selected ? { normalizedText: text, selected } : null;
}

function selectPdfQuote(pages: PdfPageText[], claimText: string, maxChars: number): SelectedQuote | null {
  let best: SelectedQuote | null = null;
  for (const page of pages) {
    const selected = selectQuote(page.text, claimText, maxChars);
    if (!selected) continue;
    const candidate = { ...selected, page: page.page };
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best;
}

function selectQuote(documentText: string, claimText: string, maxChars: number): SelectedQuote | null {
  const claimTokens = new Set(tokenize(claimText));
  if (claimTokens.size === 0) return null;

  const candidates = sentenceRanges(documentText);
  let best: { start: number; end: number; overlap: number; score: number } | null = null;

  for (const candidate of candidates) {
    const sentence = documentText.slice(candidate.start, candidate.end);
    const sentenceTokens = new Set(tokenize(sentence));
    let overlap = 0;
    for (const token of claimTokens) if (sentenceTokens.has(token)) overlap += 1;
    if (overlap === 0) continue;

    const score = overlap / claimTokens.size;
    if (!best || score > best.score || (score === best.score && overlap > best.overlap)) {
      best = { ...candidate, overlap, score };
    }
  }

  if (!best) return null;

  let start = Math.max(0, best.start - Math.floor(maxChars * 0.15));
  let end = Math.min(documentText.length, Math.max(best.end, start + maxChars));
  if (end - start > maxChars) end = start + maxChars;

  const quote = documentText.slice(start, end).trim();
  if (!quote) return null;
  const actualStart = documentText.indexOf(quote, start);
  return { quote, start: actualStart, end: actualStart + quote.length, score: best.score };
}

function sentenceRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const regex = /[^.!?。！？]+(?:[.!?。！？]+|$)/gu;
  for (const match of text.matchAll(regex)) {
    const raw = match[0];
    const start = match.index;
    if (start === undefined || !raw.trim()) continue;
    const leftTrim = raw.length - raw.trimStart().length;
    const rightTrim = raw.length - raw.trimEnd().length;
    ranges.push({ start: start + leftTrim, end: start + raw.length - rightTrim });
  }
  return ranges.length > 0 ? ranges : [{ start: 0, end: text.length }];
}

function tokenize(value: string): string[] {
  return (value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => token.length > 1);
}

function withSearchSnippetProvenance(evidence: Evidence): Evidence {
  const redactedUrl = redactUrlCredentials(evidence.url);
  if (evidence.provenance) {
    const redactedSourceUrl = redactUrlCredentials(evidence.provenance.sourceUrl);
    if (redactedUrl === evidence.url && redactedSourceUrl === evidence.provenance.sourceUrl) return evidence;
    return {
      ...evidence,
      url: redactedUrl,
      provenance: {
        ...evidence.provenance,
        sourceUrl: redactedSourceUrl,
      },
    };
  }
  return {
    ...evidence,
    url: redactedUrl,
    provenance: {
      kind: "search-snippet",
      sourceUrl: redactedUrl,
      retrievedAt: evidence.retrievedAt,
      quote: evidence.snippet,
    },
  };
}

function redactUrlCredentials(value: string): string {
  try {
    const parsed = new URL(value);
    if (!parsed.username && !parsed.password) return value;
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    return value;
  }
}

export function isSafePublicHttpUrl(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/u, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return false;

  if (hostname === "::1" || hostname === "0:0:0:0:0:0:0:1" || hostname.startsWith("::ffff:")) return false;

  const ipv4 = parseIpv4(hostname);
  if (ipv4) return isSafePublicIpv4(ipv4);
  if (hostname.includes(":")) return isSafePublicIpv6(hostname);
  return true;
}

function isSafePublicIpv4(ipv4: number[]): boolean {
  const [a, b, c] = ipv4;
  if (a === undefined || b === undefined) return false;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 2) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && b >= 18 && b <= 19) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isSafePublicIp(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized.includes(":")) {
    try {
      return isSafePublicHttpUrl(new URL(`http://[${normalized}]/`));
    } catch {
      return false;
    }
  }
  return isSafePublicHttpUrl(new URL(`http://${normalized}/`));
}

type Ipv6Groups = [number, number, number, number, number, number, number, number];

function isSafePublicIpv6(hostname: string): boolean {
  const groups = parseIpv6(hostname);
  if (!groups) return false;

  const [a, b, c, d, e, f] = groups;
  const firstSixAreZero = [a, b, c, d, e, f].every((value) => value === 0);
  const isIpv4Mapped = [a, b, c, d, e].every((value) => value === 0) && f === 0xffff;

  return !(
    firstSixAreZero ||
    isIpv4Mapped ||
    (a & 0xfe00) === 0xfc00 ||
    (a & 0xffc0) === 0xfe80 ||
    (a & 0xffc0) === 0xfec0 ||
    (a & 0xff00) === 0xff00 ||
    (a === 0x0100 && b === 0 && c === 0 && d === 0) ||
    (a === 0x2001 && b === 0x0002 && c === 0) ||
    (a === 0x2001 && (b & 0xfff0) === 0x0010) ||
    (a === 0x2001 && b === 0x0db8)
  );
}

function parseIpv6(value: string): Ipv6Groups | null {
  if (!value || value.includes("%")) return null;

  const separatorIndex = value.indexOf("::");
  if (separatorIndex !== value.lastIndexOf("::")) return null;

  const hasCompression = separatorIndex >= 0;
  const headText = hasCompression ? value.slice(0, separatorIndex) : value;
  const tailText = hasCompression ? value.slice(separatorIndex + 2) : "";
  const head = parseIpv6Part(headText);
  const tail = hasCompression ? parseIpv6Part(tailText) : [];
  if (!head || !tail) return null;

  const zeroCount = 8 - head.length - tail.length;
  if ((hasCompression && zeroCount < 1) || (!hasCompression && zeroCount !== 0)) return null;

  const groups = [...head, ...(hasCompression ? Array.from({ length: zeroCount }, () => 0) : []), ...tail];
  return groups.length === 8 ? groups as Ipv6Groups : null;
}

function parseIpv6Part(value: string): number[] | null {
  if (!value) return [];

  const parts = value.split(":");
  const groups: number[] = [];
  for (const [index, part] of parts.entries()) {
    if (part.includes(".")) {
      if (index !== parts.length - 1) return null;
      const ipv4 = parseIpv4(part);
      if (!ipv4 || ipv4.length !== 4) return null;
      groups.push((ipv4[0] ?? 0) * 256 + (ipv4[1] ?? 0));
      groups.push((ipv4[2] ?? 0) * 256 + (ipv4[3] ?? 0));
      continue;
    }
    if (!/^[0-9a-f]{1,4}$/iu.test(part)) return null;
    groups.push(Number.parseInt(part, 16));
  }
  return groups;
}

function parseIpv4(hostname: string): number[] | null {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return null;
  const parts = hostname.split(".").map(Number);
  return parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

interface NormalizedOutboundAllowlist {
  hosts?: readonly string[];
  ports?: readonly number[];
}

function normalizeOutboundAllowlist(value: OutboundAllowlist | undefined): NormalizedOutboundAllowlist | undefined {
  if (!value) return undefined;

  const hosts = value.hosts?.map(normalizeAllowlistHost);
  const ports = value.ports?.map((port) => {
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new TypeError(`Outbound allowlist port must be an integer from 1 to 65535: ${String(port)}`);
    }
    return port;
  });

  return {
    ...(hosts ? { hosts: [...new Set(hosts)] } : {}),
    ...(ports ? { ports: [...new Set(ports)] } : {}),
  };
}

function normalizeAllowlistHost(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("?") || trimmed.includes("#") || trimmed.includes("@")) {
    throw new TypeError(`Outbound allowlist host must be a hostname or IP address: ${value}`);
  }
  if (!trimmed.startsWith("[") && trimmed.includes(":")) {
    throw new TypeError(`Outbound allowlist host must not include a port: ${value}`);
  }

  let parsed: URL;
  try {
    parsed = new URL(`http://${trimmed}/`);
  } catch {
    throw new TypeError(`Outbound allowlist host is invalid: ${value}`);
  }
  if (parsed.port) throw new TypeError(`Outbound allowlist host must not include a port: ${value}`);
  return parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function isAllowedOutboundUrl(url: URL, allowlist: NormalizedOutboundAllowlist | undefined): boolean {
  if (!allowlist) return true;

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (allowlist.hosts && !allowlist.hosts.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`))) {
    return false;
  }

  if (allowlist.ports) {
    const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
    if (!allowlist.ports.includes(port)) return false;
  }

  return true;
}

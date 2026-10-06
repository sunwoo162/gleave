import type { Claim, Evidence, EvidenceProvider, SourceType } from "../types.js";

export type OfficialDomainResolver = (claim: Claim) => readonly string[] | Promise<readonly string[]>;

export interface DomainPolicy {
  officialDomains?: readonly string[];
  resolveOfficialDomains?: OfficialDomainResolver;
}

export interface TavilyEvidenceProviderOptions {
  apiKey: string;
  maxResults?: number;
  primaryDomains?: readonly string[];
  domainPolicy?: DomainPolicy;
  fetchImpl?: typeof fetch;
}

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string;
}

interface TavilyResponse {
  results?: TavilyResult[];
}

export class TavilyEvidenceProvider implements EvidenceProvider {
  readonly #apiKey: string;
  readonly #maxResults: number;
  readonly #primaryDomains: Set<string>;
  readonly #domainPolicy: NormalizedDomainPolicy | undefined;
  readonly #fetch: typeof fetch;

  constructor(options: TavilyEvidenceProviderOptions) {
    this.#apiKey = options.apiKey;
    this.#maxResults = Math.max(1, Math.min(options.maxResults ?? 5, 10));
    this.#primaryDomains = new Set((options.primaryDomains ?? []).map(normalizeDomain));
    this.#domainPolicy = normalizeDomainPolicy(options.domainPolicy);
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async search(claim: Claim): Promise<Evidence[]> {
    const officialDomains = await this.#resolveOfficialDomains(claim);
    if (officialDomains && officialDomains.length === 0) return [];

    const body: Record<string, unknown> = {
      api_key: this.#apiKey,
      query: claim.text,
      search_depth: "advanced",
      max_results: this.#maxResults,
      include_answer: false,
      include_images: false,
      ...(officialDomains ? { include_domains: officialDomains } : {}),
    };
    const response = await this.#fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Tavily search failed (${response.status}): ${detail.slice(0, 500)}`);
    }

    const payload = (await response.json()) as TavilyResponse;
    const now = new Date().toISOString();
    const results = Array.isArray(payload.results) ? payload.results : [];

    return results
      .filter((result) => typeof result.url === "string" && typeof result.content === "string")
      .filter((result) => !officialDomains || isWithinDomains(result.url as string, officialDomains))
      .map((result, index) => {
        const url = result.url as string;
        return {
          id: `${claim.id}_ev_${index + 1}`,
          claimId: claim.id,
          title: result.title?.trim() || url,
          url,
          snippet: (result.content as string).trim(),
          sourceType: officialDomains ? "primary" : this.#classifySource(url),
          ...(result.published_date ? { publishedAt: result.published_date } : {}),
          retrievedAt: now,
          provider: "tavily",
          provenance: {
            kind: "search-snippet",
            sourceUrl: url,
            retrievedAt: now,
            quote: (result.content as string).trim(),
          },
        } satisfies Evidence;
      });
  }

  #classifySource(url: string): SourceType {
    try {
      const hostname = normalizeDomain(new URL(url).hostname);
      return [...this.#primaryDomains].some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
      )
        ? "primary"
        : "unknown";
    } catch {
      return "unknown";
    }
  }

  async #resolveOfficialDomains(claim: Claim): Promise<readonly string[] | undefined> {
    if (!this.#domainPolicy) return undefined;

    const fixedDomains = this.#domainPolicy.officialDomains ?? [];
    if (!this.#domainPolicy.resolveOfficialDomains) return fixedDomains;

    try {
      const resolved = await this.#domainPolicy.resolveOfficialDomains(claim);
      const resolvedDomains = resolved.map(normalizeDomain);
      return [...new Set([...fixedDomains, ...resolvedDomains])];
    } catch {
      return [];
    }
  }
}

interface NormalizedDomainPolicy {
  officialDomains?: readonly string[];
  resolveOfficialDomains?: OfficialDomainResolver;
}

function normalizeDomainPolicy(value: DomainPolicy | undefined): NormalizedDomainPolicy | undefined {
  if (!value) return undefined;
  const officialDomains = value.officialDomains
    ? [...new Set(value.officialDomains.map(normalizeDomain))]
    : undefined;
  if (!value.resolveOfficialDomains && (!officialDomains || officialDomains.length === 0)) return { officialDomains: [] };
  return {
    ...(officialDomains ? { officialDomains } : {}),
    ...(value.resolveOfficialDomains ? { resolveOfficialDomains: value.resolveOfficialDomains } : {}),
  };
}

function normalizeDomain(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("?") || trimmed.includes("#") || trimmed.includes("@")) {
    throw new TypeError(`Official domain must be a hostname: ${value}`);
  }
  if (!trimmed.startsWith("[") && trimmed.includes(":")) {
    throw new TypeError(`Official domain must not include a port: ${value}`);
  }

  let parsed: URL;
  try {
    parsed = new URL(`http://${trimmed}/`);
  } catch {
    throw new TypeError(`Official domain is invalid: ${value}`);
  }
  if (parsed.port) throw new TypeError(`Official domain must not include a port: ${value}`);
  return parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "").replace(/^www\./, "");
}

function isWithinDomains(url: string, domains: readonly string[]): boolean {
  try {
    const hostname = normalizeDomain(new URL(url).hostname);
    return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

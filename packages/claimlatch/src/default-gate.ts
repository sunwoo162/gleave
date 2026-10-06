import { ClaimLatch } from "./gate.js";
import { LlmClaimExtractor, LlmClaimVerifier, OpenAICompatibleClient } from "./providers/openai-compatible.js";
import { ProvenanceEvidenceProvider, type OutboundAllowlist } from "./providers/provenance.js";
import { TavilyEvidenceProvider, type DomainPolicy } from "./providers/tavily.js";

export interface DefaultClaimLatchOptions {
  llmModel: string;
  tavilyApiKey: string;
  llmApiKey?: string;
  llmBaseUrl?: string;
  primaryDomains?: string[];
  domainPolicy?: DomainPolicy;
  hydrateDocuments?: boolean;
  fetchImpl?: typeof fetch;
  outboundAllowlist?: OutboundAllowlist;
  concurrency?: number;
}

export function createDefaultClaimLatch(options: DefaultClaimLatchOptions): ClaimLatch {
  const client = new OpenAICompatibleClient({
    ...(options.llmApiKey ? { apiKey: options.llmApiKey } : {}),
    model: options.llmModel,
    ...(options.llmBaseUrl ? { baseUrl: options.llmBaseUrl } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });

  const search = new TavilyEvidenceProvider({
    apiKey: options.tavilyApiKey,
    ...(options.primaryDomains ? { primaryDomains: options.primaryDomains } : {}),
    ...(options.domainPolicy ? { domainPolicy: options.domainPolicy } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });

  return new ClaimLatch({
    extractor: new LlmClaimExtractor(client),
    evidenceProvider:
      options.hydrateDocuments === false
        ? search
        : new ProvenanceEvidenceProvider({
            provider: search,
            ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
            ...(options.outboundAllowlist ? { outboundAllowlist: options.outboundAllowlist } : {}),
          }),
    verifier: new LlmClaimVerifier(client),
    ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
  });
}

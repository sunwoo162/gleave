#!/usr/bin/env node
import { createDefaultClaimLatch } from "./default-gate.js";
import { createOpenAIProxy } from "./proxy.js";
import {
  parseProxyHeaderList,
  renderProxyHelp,
  resolveProxyProviderConfiguration,
} from "./proxy-cli-options.js";

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    process.stdout.write(renderProxyHelp());
    return;
  }

  const providerConfiguration = resolveProxyProviderConfiguration(process.env);
  const llmModel = process.env.CLAIMLATCH_LLM_MODEL;
  const tavilyApiKey = process.env.TAVILY_API_KEY;
  const port = parsePort(process.env.CLAIMLATCH_PROXY_PORT ?? "4317");
  const host = process.env.CLAIMLATCH_PROXY_HOST ?? "127.0.0.1";

  if (!llmModel) throw new Error("Set CLAIMLATCH_LLM_MODEL for the verifier model.");
  if (!tavilyApiKey) throw new Error("Set TAVILY_API_KEY for evidence retrieval.");

  const llmApiKey = process.env.CLAIMLATCH_LLM_API_KEY ?? process.env.OPENAI_API_KEY;
  const llmBaseUrl = process.env.CLAIMLATCH_LLM_BASE_URL;
  const upstreamTimeoutMs = process.env.CLAIMLATCH_PROXY_UPSTREAM_TIMEOUT_MS;
  const upstreamResponseHeaderNames = process.env.CLAIMLATCH_PROXY_UPSTREAM_RESPONSE_HEADER_NAMES;
  const upstreamResponseHeaderPrefixes = process.env.CLAIMLATCH_PROXY_UPSTREAM_RESPONSE_HEADER_PREFIXES;
  const gate = createDefaultClaimLatch({
    llmModel,
    tavilyApiKey,
    ...(llmApiKey ? { llmApiKey } : {}),
    ...(llmBaseUrl ? { llmBaseUrl } : {}),
  });

  const proxy = createOpenAIProxy({
    gate,
    upstreamBaseUrl: providerConfiguration.upstreamBaseUrl,
    ...(process.env.CLAIMLATCH_PROXY_UPSTREAM_API_KEY
      ? { upstreamApiKey: process.env.CLAIMLATCH_PROXY_UPSTREAM_API_KEY }
      : {}),
    upstreamApiKeyHeader: providerConfiguration.upstreamApiKeyHeader,
    ...(providerConfiguration.upstreamApiKeyPrefix !== undefined
      ? { upstreamApiKeyPrefix: providerConfiguration.upstreamApiKeyPrefix }
      : {}),
    upstreamChatCompletionsPath: providerConfiguration.upstreamChatCompletionsPath,
    upstreamModelsPath: providerConfiguration.upstreamModelsPath,
    ...(providerConfiguration.upstreamModelRetrievalPath !== undefined
      ? { upstreamModelRetrievalPath: providerConfiguration.upstreamModelRetrievalPath }
      : {}),
    ...(providerConfiguration.upstreamModelIdEncoding !== undefined
      ? { upstreamModelIdEncoding: providerConfiguration.upstreamModelIdEncoding }
      : {}),
    ...(providerConfiguration.upstreamRequestHeaders
      ? { upstreamRequestHeaders: providerConfiguration.upstreamRequestHeaders }
      : {}),
    ...(upstreamResponseHeaderNames !== undefined
      ? { upstreamResponseHeaderNames: parseProxyHeaderList(upstreamResponseHeaderNames, "CLAIMLATCH_PROXY_UPSTREAM_RESPONSE_HEADER_NAMES") }
      : {}),
    ...(upstreamResponseHeaderPrefixes !== undefined
      ? { upstreamResponseHeaderPrefixes: parseProxyHeaderList(upstreamResponseHeaderPrefixes, "CLAIMLATCH_PROXY_UPSTREAM_RESPONSE_HEADER_PREFIXES") }
      : {}),
    policy: {
      requireRetrievedDocumentForDecisiveClaims:
        process.env.CLAIMLATCH_REQUIRE_DOCUMENT_PROVENANCE === "1",
    },
    ...(upstreamTimeoutMs !== undefined && upstreamTimeoutMs !== ""
      ? { upstreamTimeoutMs: parseTimeout(upstreamTimeoutMs) }
      : {}),
  });

  await proxy.listen(port, host);
  process.stdout.write(`ClaimLatch proxy listening on http://${host}:${port}/v1\n`);
}

function parsePort(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("CLAIMLATCH_PROXY_PORT must be an integer between 1 and 65535.");
  }
  return parsed;
}

function parseTimeout(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("CLAIMLATCH_PROXY_UPSTREAM_TIMEOUT_MS must be a finite non-negative number.");
  }
  return parsed;
}

main().catch((error: unknown) => {
  process.stderr.write(`claimlatch-proxy: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});

import { createDefaultClaimLatch, createOpenAIProxy } from "../src/index.js";
import {
  parseProxyHeaderList,
  resolveProxyProviderConfiguration,
} from "../src/proxy-cli-options.js";

export function resolveProviderCompatibleProxyConfiguration(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const configuration = resolveProxyProviderConfiguration(env);
  return {
    ...configuration,
    ...(env.CLAIMLATCH_PROXY_UPSTREAM_API_KEY
      ? { upstreamApiKey: env.CLAIMLATCH_PROXY_UPSTREAM_API_KEY }
      : {}),
  };
}

async function main(): Promise<void> {
  const providerConfiguration = resolveProviderCompatibleProxyConfiguration();
  const {
    upstreamBaseUrl,
    upstreamApiKey,
    upstreamApiKeyHeader,
    upstreamApiKeyPrefix,
    upstreamChatCompletionsPath,
    upstreamModelsPath,
    upstreamModelRetrievalPath,
    upstreamModelIdEncoding,
    upstreamRequestHeaders,
  } = providerConfiguration;
  const upstreamResponseHeaderNames = process.env.CLAIMLATCH_PROXY_UPSTREAM_RESPONSE_HEADER_NAMES;
  const upstreamResponseHeaderPrefixes = process.env.CLAIMLATCH_PROXY_UPSTREAM_RESPONSE_HEADER_PREFIXES;
  const llmModel = process.env.CLAIMLATCH_LLM_MODEL;
  const tavilyApiKey = process.env.TAVILY_API_KEY;
  const host = process.env.CLAIMLATCH_PROXY_HOST ?? "127.0.0.1";
  const port = parsePort(process.env.CLAIMLATCH_PROXY_PORT ?? "4317");

  if (!upstreamBaseUrl) {
    throw new Error("Set CLAIMLATCH_PROXY_UPSTREAM_BASE_URL to the provider base URL.");
  }
  if (!llmModel) throw new Error("Set CLAIMLATCH_LLM_MODEL for the verifier model.");
  if (!tavilyApiKey) throw new Error("Set TAVILY_API_KEY for evidence retrieval.");

  const gate = createDefaultClaimLatch({
    llmModel,
    tavilyApiKey,
    ...(process.env.CLAIMLATCH_LLM_API_KEY
      ? { llmApiKey: process.env.CLAIMLATCH_LLM_API_KEY }
      : {}),
    ...(process.env.CLAIMLATCH_LLM_BASE_URL
      ? { llmBaseUrl: process.env.CLAIMLATCH_LLM_BASE_URL }
      : {}),
  });

  const proxy = createOpenAIProxy({
    gate,
    upstreamBaseUrl,
    upstreamChatCompletionsPath,
    upstreamModelsPath,
    ...(upstreamModelRetrievalPath !== undefined ? { upstreamModelRetrievalPath } : {}),
    ...(upstreamModelIdEncoding !== undefined ? { upstreamModelIdEncoding } : {}),
    upstreamApiKeyHeader,
    ...(upstreamApiKeyPrefix !== undefined ? { upstreamApiKeyPrefix } : {}),
    ...(upstreamApiKey ? { upstreamApiKey } : {}),
    ...(process.env.CLAIMLATCH_PROXY_UPSTREAM_TIMEOUT_MS
      ? { upstreamTimeoutMs: parseTimeout(process.env.CLAIMLATCH_PROXY_UPSTREAM_TIMEOUT_MS) }
      : {}),
    ...(upstreamRequestHeaders ? { upstreamRequestHeaders } : {}),
    ...(upstreamResponseHeaderNames !== undefined
      ? { upstreamResponseHeaderNames: parseProxyHeaderList(upstreamResponseHeaderNames, "CLAIMLATCH_PROXY_UPSTREAM_RESPONSE_HEADER_NAMES") }
      : {}),
    ...(upstreamResponseHeaderPrefixes !== undefined
      ? { upstreamResponseHeaderPrefixes: parseProxyHeaderList(upstreamResponseHeaderPrefixes, "CLAIMLATCH_PROXY_UPSTREAM_RESPONSE_HEADER_PREFIXES") }
      : {}),
  });

  await proxy.listen(port, host);
  process.stdout.write(
    `Provider-compatible ClaimLatch proxy listening on http://${host}:${port}/v1\n`,
  );
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

if (isProviderCompatibleProxyMainModule(import.meta.url, process.argv[1])) {
  main().catch((error: unknown) => {
    process.stderr.write(`provider-compatible-proxy: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

export function isProviderCompatibleProxyMainModule(moduleUrl: string, scriptPath: string | undefined): boolean {
  if (!scriptPath) return false;
  try {
    const modulePath = decodeURIComponent(moduleUrl.replace(/^file:\/\//u, ""))
      .replace(/^\/([A-Za-z]:)\//u, "$1/")
      .replace(/\\/gu, "/");
    const normalizedScriptPath = scriptPath.replace(/\\/gu, "/");
    const isWindowsPath = /^[A-Za-z]:\//u.test(modulePath) || /^[A-Za-z]:\//u.test(normalizedScriptPath);
    return isWindowsPath
      ? modulePath.toLowerCase() === normalizedScriptPath.toLowerCase()
      : modulePath === normalizedScriptPath;
  } catch {
    return false;
  }
}

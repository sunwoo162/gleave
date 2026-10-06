import { formatProxyProviderProfileNames, resolveProxyProviderProfile } from "./proxy-profiles.js";

export interface ProxyProviderConfiguration {
  upstreamBaseUrl: string;
  upstreamApiKeyHeader: string;
  upstreamApiKeyPrefix?: string;
  upstreamChatCompletionsPath: string;
  upstreamModelsPath: string | null;
  upstreamModelRetrievalPath?: string | null;
  upstreamModelIdEncoding?: "encoded" | "path";
  upstreamRequestHeaders?: Record<string, string>;
}

export function parseProxyHeaderList(
  value: string,
  variableName = "CLAIMLATCH_PROXY_UPSTREAM_RESPONSE_HEADER_NAMES",
): string[] {
  const headers = value.split(",").map((header) => header.trim()).filter(Boolean);
  if (value.trim() !== "" && headers.length === 0) {
    throw new Error(`${variableName} must contain a comma-separated header list.`);
  }
  const headerNames = new Set<string>();
  for (const header of headers) {
    const normalizedHeader = header.toLowerCase();
    if (headerNames.has(normalizedHeader)) {
      throw new Error(`${variableName} contains a duplicate header entry: ${header}.`);
    }
    headerNames.add(normalizedHeader);
  }
  return headers;
}

export function parseProxyHeaderMap(value: string, variableName = "CLAIMLATCH_PROXY_UPSTREAM_REQUEST_HEADERS"): Record<string, string> {
  const headers: Record<string, string> = {};
  const headerNames = new Set<string>();
  for (const entry of value.split(",").map((part) => part.trim()).filter(Boolean)) {
    const separator = entry.indexOf("=");
    if (separator <= 0) {
      throw new Error(`${variableName} must contain comma-separated name=value entries.`);
    }
    const name = entry.slice(0, separator).trim();
    const headerValue = entry.slice(separator + 1).trim();
    if (!name) throw new Error(`${variableName} must contain non-empty header names.`);
    const normalizedName = name.toLowerCase();
    if (headerNames.has(normalizedName)) {
      throw new Error(`${variableName} contains a duplicate header name: ${name}.`);
    }
    headerNames.add(normalizedName);
    headers[name] = headerValue;
  }
  return headers;
}

export function resolveProxyProviderConfiguration(
  env: Readonly<Record<string, string | undefined>>,
): ProxyProviderConfiguration {
  const profile = resolveProxyProviderProfile(env.CLAIMLATCH_PROXY_PROVIDER_PROFILE, {
    ...(env.CLAIMLATCH_PROXY_OPENROUTER_SITE_URL
      ? { siteUrl: env.CLAIMLATCH_PROXY_OPENROUTER_SITE_URL }
      : {}),
    ...(env.CLAIMLATCH_PROXY_OPENROUTER_APP_NAME
      ? { appName: env.CLAIMLATCH_PROXY_OPENROUTER_APP_NAME }
      : {}),
  });
  const upstreamBaseUrl = env.CLAIMLATCH_PROXY_UPSTREAM_BASE_URL ?? profile.upstreamBaseUrl;
  if (!upstreamBaseUrl) {
    throw new Error("Set CLAIMLATCH_PROXY_UPSTREAM_BASE_URL to the generation provider base URL.");
  }
  const upstreamRequestHeaders = {
    ...profile.upstreamRequestHeaders,
    ...(env.CLAIMLATCH_PROXY_UPSTREAM_REQUEST_HEADERS !== undefined
      ? parseProxyHeaderMap(env.CLAIMLATCH_PROXY_UPSTREAM_REQUEST_HEADERS)
      : {}),
  };
  return {
    upstreamBaseUrl,
    upstreamApiKeyHeader: env.CLAIMLATCH_PROXY_UPSTREAM_API_KEY_HEADER ?? profile.upstreamApiKeyHeader,
    ...(env.CLAIMLATCH_PROXY_UPSTREAM_API_KEY_PREFIX !== undefined || profile.upstreamApiKeyPrefix !== undefined
      ? { upstreamApiKeyPrefix: env.CLAIMLATCH_PROXY_UPSTREAM_API_KEY_PREFIX ?? profile.upstreamApiKeyPrefix }
      : {}),
    upstreamChatCompletionsPath:
      env.CLAIMLATCH_PROXY_UPSTREAM_CHAT_COMPLETIONS_PATH ?? profile.upstreamChatCompletionsPath,
    upstreamModelsPath: env.CLAIMLATCH_PROXY_UPSTREAM_MODELS_PATH !== undefined
      ? env.CLAIMLATCH_PROXY_UPSTREAM_MODELS_PATH
      : profile.upstreamModelsPath === null
        ? null
        : profile.upstreamModelsPath ?? "/models",
    ...(env.CLAIMLATCH_PROXY_UPSTREAM_MODEL_RETRIEVAL_PATH !== undefined
      ? { upstreamModelRetrievalPath: env.CLAIMLATCH_PROXY_UPSTREAM_MODEL_RETRIEVAL_PATH }
      : profile.upstreamModelRetrievalPath !== undefined
        ? { upstreamModelRetrievalPath: profile.upstreamModelRetrievalPath }
        : {}),
    ...(profile.upstreamModelIdEncoding !== undefined
      ? { upstreamModelIdEncoding: profile.upstreamModelIdEncoding }
      : {}),
    ...(Object.keys(upstreamRequestHeaders).length > 0 ? { upstreamRequestHeaders } : {}),
  };
}

export function renderProxyHelp(): string {
  return [
    "ClaimLatch OpenAI-compatible verification proxy",
    "",
    "Usage:",
    "  claimlatch-proxy",
    "",
    "Required environment variables:",
    "  CLAIMLATCH_PROXY_UPSTREAM_BASE_URL  Generation provider base URL (required unless profile supplies one)",
    "  CLAIMLATCH_LLM_MODEL                 Verification model",
    "  TAVILY_API_KEY                       Evidence search credential",
    "",
    "Optional environment variables:",
    "  CLAIMLATCH_PROXY_UPSTREAM_API_KEY   Upstream provider credential",
    `  CLAIMLATCH_PROXY_PROVIDER_PROFILE   Example profile: ${formatProxyProviderProfileNames()}`,
    "  CLAIMLATCH_PROXY_OPENROUTER_SITE_URL / _APP_NAME",
    "  CLAIMLATCH_LLM_API_KEY               Verification model credential",
    "  CLAIMLATCH_PROXY_HOST / _PORT        Bind host and port (127.0.0.1 / 4317)",
    "  CLAIMLATCH_PROXY_UPSTREAM_API_KEY_HEADER",
    "  CLAIMLATCH_PROXY_UPSTREAM_API_KEY_PREFIX   Authentication scheme prefix (default Bearer for Authorization)",
    "  CLAIMLATCH_PROXY_UPSTREAM_CHAT_COMPLETIONS_PATH",
    "  CLAIMLATCH_PROXY_UPSTREAM_MODELS_PATH       Relative model-list path (default /models unless the provider profile supplies one)",
    "  CLAIMLATCH_PROXY_UPSTREAM_MODEL_RETRIEVAL_PATH Relative model-retrieval path (defaults to the model-list path unless the provider profile supplies one)",
    "  CLAIMLATCH_PROXY_UPSTREAM_REQUEST_HEADERS   Comma-separated name=value headers",
    "  CLAIMLATCH_PROXY_UPSTREAM_RESPONSE_HEADER_NAMES",
    "  CLAIMLATCH_PROXY_UPSTREAM_RESPONSE_HEADER_PREFIXES",
    "  CLAIMLATCH_PROXY_UPSTREAM_TIMEOUT_MS",
    "  CLAIMLATCH_REQUIRE_DOCUMENT_PROVENANCE",
    "",
    "Routes:",
    "  GET  /health",
    "  GET  /v1/models, /models, /v1/models/:id, /models/:id",
    "  POST /v1/chat/completions",
    "  POST /chat/completions",
    "",
    "PASS releases the verified completion. BLOCK returns HTTP 422.",
    "Malformed, unsupported, truncated, or unverifiable responses fail closed.",
    "This credential-free claimlatch-proxy --help command displays this help without credentials.",
    "",
  ].join("\n");
}

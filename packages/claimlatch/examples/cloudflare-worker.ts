import {
  createDefaultClaimLatch,
  createGuardedAnswerFetchHandler,
  type GuardedAnswerFetchHandler,
} from "../src/index.js";

export interface CloudflareWorkerEnv {
  CLAIMLATCH_LLM_MODEL: string;
  TAVILY_API_KEY: string;
  CLAIMLATCH_LLM_API_KEY?: string;
  CLAIMLATCH_LLM_BASE_URL?: string;
}

let cachedHandler: GuardedAnswerFetchHandler | undefined;

function getHandler(env: CloudflareWorkerEnv): GuardedAnswerFetchHandler {
  if (cachedHandler) return cachedHandler;
  if (!env.CLAIMLATCH_LLM_MODEL) throw new Error("Set CLAIMLATCH_LLM_MODEL.");
  if (!env.TAVILY_API_KEY) throw new Error("Set TAVILY_API_KEY.");

  const gate = createDefaultClaimLatch({
    llmModel: env.CLAIMLATCH_LLM_MODEL,
    tavilyApiKey: env.TAVILY_API_KEY,
    ...(env.CLAIMLATCH_LLM_API_KEY ? { llmApiKey: env.CLAIMLATCH_LLM_API_KEY } : {}),
    ...(env.CLAIMLATCH_LLM_BASE_URL ? { llmBaseUrl: env.CLAIMLATCH_LLM_BASE_URL } : {}),
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

// Export this object as the default Worker module in wrangler.toml.
export default {
  async fetch(request: Request, env: CloudflareWorkerEnv): Promise<Response> {
    return getHandler(env)(request);
  },
};

import {
  createDefaultClaimLatch,
  createGuardedAnswerFetchHandler,
  type GuardedAnswerFetchHandler,
} from "../src/index.js";

interface BunEnvironment {
  [name: string]: string | undefined;
}

interface BunRuntime {
  env: BunEnvironment;
}

declare const Bun: BunRuntime;

let cachedHandler: GuardedAnswerFetchHandler | undefined;

function getHandler(): GuardedAnswerFetchHandler {
  if (cachedHandler) return cachedHandler;

  const llmModel = Bun.env.CLAIMLATCH_LLM_MODEL;
  const tavilyApiKey = Bun.env.TAVILY_API_KEY;
  if (!llmModel) throw new Error("Set CLAIMLATCH_LLM_MODEL.");
  if (!tavilyApiKey) throw new Error("Set TAVILY_API_KEY.");

  const llmApiKey = Bun.env.CLAIMLATCH_LLM_API_KEY;
  const llmBaseUrl = Bun.env.CLAIMLATCH_LLM_BASE_URL;
  const gate = createDefaultClaimLatch({
    llmModel,
    tavilyApiKey,
    ...(llmApiKey ? { llmApiKey } : {}),
    ...(llmBaseUrl ? { llmBaseUrl } : {}),
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

export function createBunGuardedAnswerHandler(
  fetchHandler: GuardedAnswerFetchHandler = getHandler(),
): GuardedAnswerFetchHandler {
  return (request) => fetchHandler(request);
}

// After `npm run build`, run with `bun --port 4318 dist/examples/bun-server.js`.
// Bun starts the default Fetch-native export as an HTTP server.
export default {
  fetch(request: Request): Promise<Response> {
    return getHandler()(request);
  },
};

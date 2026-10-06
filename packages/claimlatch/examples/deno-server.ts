import {
  createDefaultClaimLatch,
  createGuardedAnswerFetchHandler,
  type GuardedAnswerFetchHandler,
} from "../src/index.js";

interface DenoEnvironment {
  get(name: string): string | undefined;
}

interface DenoRuntime {
  env: DenoEnvironment;
}

declare const Deno: DenoRuntime;

let cachedHandler: GuardedAnswerFetchHandler | undefined;

function getHandler(): GuardedAnswerFetchHandler {
  if (cachedHandler) return cachedHandler;

  const llmModel = Deno.env.get("CLAIMLATCH_LLM_MODEL");
  const tavilyApiKey = Deno.env.get("TAVILY_API_KEY");
  if (!llmModel) throw new Error("Set CLAIMLATCH_LLM_MODEL.");
  if (!tavilyApiKey) throw new Error("Set TAVILY_API_KEY.");

  const llmApiKey = Deno.env.get("CLAIMLATCH_LLM_API_KEY");
  const llmBaseUrl = Deno.env.get("CLAIMLATCH_LLM_BASE_URL");
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

export function createDenoGuardedAnswerHandler(
  fetchHandler: GuardedAnswerFetchHandler = getHandler(),
): GuardedAnswerFetchHandler {
  return (request) => fetchHandler(request);
}

// After `npm run build`, run with `deno serve --allow-env --allow-net --port 4318 dist/examples/deno-server.js`.
// Deno invokes the default Fetch-native export for every request.
export default {
  fetch(request: Request): Promise<Response> {
    return getHandler()(request);
  },
};

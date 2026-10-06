import {
  createDefaultClaimLatch,
  createGuardedAnswerFetchHandler,
  type GuardedAnswerFetchHandler,
} from "../src/index.js";

export interface HonoContext {
  req: {
    raw: Request;
  };
}

let cachedHandler: GuardedAnswerFetchHandler | undefined;

function getHandler(): GuardedAnswerFetchHandler {
  if (cachedHandler) return cachedHandler;

  const llmModel = process.env.CLAIMLATCH_LLM_MODEL;
  const tavilyApiKey = process.env.TAVILY_API_KEY;
  if (!llmModel) throw new Error("Set CLAIMLATCH_LLM_MODEL.");
  if (!tavilyApiKey) throw new Error("Set TAVILY_API_KEY.");

  const gate = createDefaultClaimLatch({
    llmModel,
    tavilyApiKey,
    ...(process.env.CLAIMLATCH_LLM_API_KEY ? { llmApiKey: process.env.CLAIMLATCH_LLM_API_KEY } : {}),
    ...(process.env.CLAIMLATCH_LLM_BASE_URL ? { llmBaseUrl: process.env.CLAIMLATCH_LLM_BASE_URL } : {}),
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

export function createHonoGuardedAnswerHandler(
  fetchHandler: GuardedAnswerFetchHandler = getHandler(),
): (context: HonoContext) => Promise<Response> {
  return (context) => fetchHandler(context.req.raw);
}

// Copy this adapter into a Hono route: app.post("/answer", createHonoGuardedAnswerHandler()).

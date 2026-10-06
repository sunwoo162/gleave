import { createDefaultClaimLatch, createGuardedAnswerServer } from "../src/index.js";

async function main(): Promise<void> {
  const llmModel = process.env.CLAIMLATCH_LLM_MODEL;
  const tavilyApiKey = process.env.TAVILY_API_KEY;
  const host = process.env.CLAIMLATCH_EXAMPLE_HOST ?? "127.0.0.1";
  const port = parsePort(process.env.CLAIMLATCH_EXAMPLE_PORT ?? "4318");

  if (!llmModel) throw new Error("Set CLAIMLATCH_LLM_MODEL.");
  if (!tavilyApiKey) throw new Error("Set TAVILY_API_KEY.");

  const gate = createDefaultClaimLatch({
    llmModel,
    tavilyApiKey,
    ...(process.env.CLAIMLATCH_LLM_API_KEY ? { llmApiKey: process.env.CLAIMLATCH_LLM_API_KEY } : {}),
    ...(process.env.CLAIMLATCH_LLM_BASE_URL ? { llmBaseUrl: process.env.CLAIMLATCH_LLM_BASE_URL } : {}),
  });
  const service = createGuardedAnswerServer({
    gate,
    policy: {
      minimumCoverage: 1,
      maxUnsupportedClaims: 0,
      maxUnverifiableClaims: 0,
      blockOnContradiction: true,
    },
  });

  await service.listen(port, host);
  process.stdout.write(`ClaimLatch guarded answer service listening on http://${host}:${port}\n`);
}

function parsePort(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("CLAIMLATCH_EXAMPLE_PORT must be an integer between 1 and 65535.");
  }
  return parsed;
}

main().catch((error: unknown) => {
  process.stderr.write(`guarded-http-service: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});

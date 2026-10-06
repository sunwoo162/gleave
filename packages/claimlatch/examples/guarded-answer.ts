import {
  ClaimLatchBlockedError,
  createDefaultClaimLatch,
  verifyBeforeRelease,
} from "../src/index.js";

async function main(): Promise<void> {
  const question = process.env.CLAIMLATCH_EXAMPLE_QUESTION;
  const draft = process.env.CLAIMLATCH_EXAMPLE_DRAFT;
  const llmModel = process.env.CLAIMLATCH_LLM_MODEL;
  const tavilyApiKey = process.env.TAVILY_API_KEY;

  if (!question?.trim()) throw new Error("Set CLAIMLATCH_EXAMPLE_QUESTION.");
  if (!draft?.trim()) throw new Error("Set CLAIMLATCH_EXAMPLE_DRAFT.");
  if (!llmModel) throw new Error("Set CLAIMLATCH_LLM_MODEL.");
  if (!tavilyApiKey) throw new Error("Set TAVILY_API_KEY.");

  const gate = createDefaultClaimLatch({
    llmModel,
    tavilyApiKey,
    ...(process.env.CLAIMLATCH_LLM_API_KEY ? { llmApiKey: process.env.CLAIMLATCH_LLM_API_KEY } : {}),
    ...(process.env.CLAIMLATCH_LLM_BASE_URL ? { llmBaseUrl: process.env.CLAIMLATCH_LLM_BASE_URL } : {}),
  });

  try {
    const verified = await verifyBeforeRelease(gate, {
      question,
      answer: draft,
      policy: {
        minimumCoverage: 1,
        maxUnsupportedClaims: 0,
        maxUnverifiableClaims: 0,
        blockOnContradiction: true,
      },
    });

    // Replace this line with the application's user-facing response path.
    process.stdout.write(`${verified.answer}\n`);
  } catch (error) {
    if (error instanceof ClaimLatchBlockedError) {
      process.stderr.write(`${JSON.stringify({ blocked: true, report: error.report }, null, 2)}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`guarded-answer: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});

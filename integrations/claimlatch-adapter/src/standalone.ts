import { createDefaultClaimLatch } from "../../../packages/claimlatch/src/index.ts";
import { createClaimLatchAdapterServer } from "./server.js";
import { verifyStructuredAction } from "./structured-output-verifier.js";

const portArgument = process.argv.indexOf("--port");
const port = Number(portArgument >= 0 ? process.argv[portArgument + 1] : process.env.CLAIMLATCH_ADAPTER_PORT ?? "4318");
const host = process.env.CLAIMLATCH_ADAPTER_HOST ?? "127.0.0.1";
const model = process.env.CLAIMLATCH_LLM_MODEL;
const tavilyApiKey = process.env.TAVILY_API_KEY;

if (!model) throw new Error("Set CLAIMLATCH_LLM_MODEL before starting the ClaimLatch plugin.");
if (!tavilyApiKey) throw new Error("Set TAVILY_API_KEY before starting the ClaimLatch plugin.");

const claimLatch = createDefaultClaimLatch({
  llmModel: model,
  tavilyApiKey,
  ...(process.env.CLAIMLATCH_LLM_API_KEY ? { llmApiKey: process.env.CLAIMLATCH_LLM_API_KEY } : {}),
  ...(process.env.CLAIMLATCH_LLM_BASE_URL ? { llmBaseUrl: process.env.CLAIMLATCH_LLM_BASE_URL } : {}),
});
const server = createClaimLatchAdapterServer({
  claimLatch,
  verifyStructured: (payload) => verifyStructuredAction(payload as {
    action: { tool: string; path?: string };
    workspaceRoot: string;
    allowedTools: string[];
  }),
});
const baseUrl = await server.listen(port, host);
console.log(`ClaimLatch Official Plugin listening at ${baseUrl}`);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

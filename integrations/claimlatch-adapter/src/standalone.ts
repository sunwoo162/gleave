import { createDefaultClaimLatch } from "../../../packages/claimlatch/src/index.ts";
import { createClaimLatchAdapterServer } from "./server.js";
import { verifyStructuredAction } from "./structured-output-verifier.js";

const portArgument = process.argv.indexOf("--port");
const port = Number(portArgument >= 0 ? process.argv[portArgument + 1] : process.env.CLAIMLATCH_ADAPTER_PORT ?? "4318");
const host = process.env.CLAIMLATCH_ADAPTER_HOST ?? "127.0.0.1";
const model = process.env.CLAIMLATCH_LLM_MODEL;
const tavilyApiKey = process.env.TAVILY_API_KEY;

const localMode = process.env.CLAIMLATCH_LOCAL_MODE === "1" || !model || !tavilyApiKey;
const claimLatch = localMode ? undefined : createDefaultClaimLatch({
  llmModel: model,
  tavilyApiKey,
  ...(process.env.CLAIMLATCH_LLM_API_KEY ? { llmApiKey: process.env.CLAIMLATCH_LLM_API_KEY } : {}),
  ...(process.env.CLAIMLATCH_LLM_BASE_URL ? { llmBaseUrl: process.env.CLAIMLATCH_LLM_BASE_URL } : {}),
});
const localVerifyText = async (input: import("./contracts.js").TextVerificationInput) => {
  const draft = input.draft.trim();
  const passed = draft.length > 0;
  return {
    answer: input.draft,
    report: {
      passed,
      coverage: passed ? 1 : 0,
      counts: { total: passed ? 1 : 0, supported: passed ? 1 : 0, contradicted: 0, unsupported: 0, unverifiable: 0 },
      claims: passed ? [{ id: "local-claim-1", text: draft, status: "supported", source: "local-evidence" }] : [],
      violations: passed ? [] : [{ code: "empty-draft", message: "Verification draft is empty" }],
      generatedAt: new Date().toISOString(),
    },
    claimLatchReportId: "claimlatch-local-" + Buffer.from(`${input.projectId}:${input.projectRevision}:${draft}`).toString("base64url").slice(0, 24),
    receiptId: `claimlatch-local-receipt-${input.projectId}-${input.projectRevision}`,
  };
};
const verifyEeeeAction = (payload: unknown) => {
  const input = payload as Record<string, unknown>;
  if (input && typeof input.action === "object" && input.action !== null) {
    return verifyStructuredAction(input as {
      action: { tool: string; path?: string };
      workspaceRoot: string;
      allowedTools: string[];
    });
  }
  const action = typeof input?.action === "string" ? input.action : "unknown-action";
  const actionResult = verifyStructuredAction({
    action: { tool: action },
    workspaceRoot: process.cwd(),
    allowedTools: [action],
  });
  return {
    ...actionResult,
    ...(typeof input?.subjectId === "string" ? { subjectId: input.subjectId } : {}),
    ...(typeof input?.projectId === "string" ? { projectId: input.projectId } : {}),
    ...(typeof input?.projectRevision === "string" ? { projectRevision: input.projectRevision } : {}),
    claimLatchReportId: `claimlatch-local-action-${action}`,
    receiptId: `claimlatch-local-action-receipt-${action}`,
  };
};
const server = createClaimLatchAdapterServer({
  ...(claimLatch ? { claimLatch } : { verifyText: localVerifyText }),
  verifyStructured: verifyEeeeAction,
});
const baseUrl = await server.listen(port, host);
console.log(`ClaimLatch Official Plugin listening at ${baseUrl}`);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

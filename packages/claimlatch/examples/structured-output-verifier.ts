import {
  createDefaultClaimLatch,
  createOpenAIProxy,
} from "../src/index.js";
import type {
  Claim,
  ClaimVerification,
  Evidence,
  PolicyViolation,
  VerificationReport,
  VerificationStatus,
} from "../src/types.js";

const upstreamBaseUrl = process.env.CLAIMLATCH_PROXY_UPSTREAM_BASE_URL ?? "https://api.openai.com/v1";
const upstreamApiKey = process.env.CLAIMLATCH_PROXY_UPSTREAM_API_KEY;
const host = process.env.CLAIMLATCH_PROXY_HOST ?? "127.0.0.1";
const port = parsePort(process.env.CLAIMLATCH_PROXY_PORT ?? "4317");
const allowedTools = parseAllowedTools(process.env.CLAIMLATCH_ALLOWED_TOOLS ?? "lookup");

function parsePort(value: string): number {
  const portValue = Number(value);
  if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65_535) {
    throw new Error("CLAIMLATCH_PROXY_PORT must be an integer between 1 and 65535.");
  }
  return portValue;
}

function parseAllowedTools(value: string): ReadonlySet<string> {
  const tools = value.split(",").map((tool) => tool.trim()).filter(Boolean);
  if (tools.length === 0) throw new Error("CLAIMLATCH_ALLOWED_TOOLS must contain at least one tool name.");
  return new Set(tools);
}

function toolNamesFromChoice(choice: unknown): string[] | null {
  if (!choice || typeof choice !== "object") return null;
  const message = (choice as Record<string, unknown>).message;
  if (!message || typeof message !== "object") return null;
  const toolCalls = (message as Record<string, unknown>).tool_calls;
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return null;

  const names: string[] = [];
  for (const rawToolCall of toolCalls) {
    if (!rawToolCall || typeof rawToolCall !== "object") return null;
    const functionValue = (rawToolCall as Record<string, unknown>).function;
    if (!functionValue || typeof functionValue !== "object") return null;
    const name = (functionValue as Record<string, unknown>).name;
    if (typeof name !== "string" || !name.trim()) return null;
    names.push(name);
  }
  return names;
}

function createToolPolicyReport(
  question: string,
  toolNames: string[] | null,
  allowed: ReadonlySet<string>,
): VerificationReport {
  const generatedAt = new Date().toISOString();
  const claim: Claim = {
    id: "claimlatch_tool_policy",
    text: "The assistant requested only tools allowed by the application policy.",
    kind: "fact",
    importance: "critical",
  };
  const evidence: Evidence = {
    id: "claimlatch_application_tool_policy",
    claimId: claim.id,
    title: "Application tool allowlist",
    url: "urn:claimlatch:application-tool-policy",
    snippet: `Allowed tools: ${[...allowed].sort().join(", ")}`,
    sourceType: "primary",
    retrievedAt: generatedAt,
    provider: "application-policy",
  };

  let status: VerificationStatus;
  let reason: string;
  let evidenceIds: string[];
  let violations: PolicyViolation[];
  if (!toolNames) {
    status = "UNSUPPORTED";
    reason = `The application policy only accepts well-formed tool calls for question: ${question}`;
    evidenceIds = [];
    violations = [
      {
        code: "UNSUPPORTED_LIMIT",
        claimId: claim.id,
        message: "Structured output did not contain a well-formed tool-call payload.",
      },
      {
        code: "CRITICAL_CLAIM_NOT_SUPPORTED",
        claimId: claim.id,
        message: "The structured output policy claim was not supported.",
      },
    ];
  } else {
    const disallowed = toolNames.filter((name) => !allowed.has(name));
    const passed = disallowed.length === 0;
    status = passed ? "SUPPORTED" : "CONTRADICTED";
    reason = passed
      ? `All requested tools are allowlisted: ${toolNames.join(", ")}.`
      : `Disallowed tool calls: ${disallowed.join(", ")}.`;
    evidenceIds = [evidence.id];
    violations = passed
      ? []
      : [{
        code: "CONTRADICTION",
        claimId: claim.id,
        message: reason,
      }];
  }

  const claimVerification: ClaimVerification = {
    claim,
    status,
    reason,
    evidenceIds,
    evidence: evidenceIds.length === 0 ? [] : [evidence],
  };
  return {
    passed: status === "SUPPORTED",
    coverage: status === "UNSUPPORTED" ? 0 : 1,
    counts: {
      total: 1,
      supported: status === "SUPPORTED" ? 1 : 0,
      contradicted: status === "CONTRADICTED" ? 1 : 0,
      unsupported: status === "UNSUPPORTED" ? 1 : 0,
      unverifiable: 0,
    },
    claims: [claimVerification],
    violations,
    generatedAt,
  };
}

async function main(): Promise<void> {
  const llmModel = process.env.CLAIMLATCH_LLM_MODEL;
  const tavilyApiKey = process.env.TAVILY_API_KEY;
  if (!llmModel) throw new Error("Set CLAIMLATCH_LLM_MODEL for textual response verification.");
  if (!tavilyApiKey) throw new Error("Set TAVILY_API_KEY for textual response verification.");

  const gate = createDefaultClaimLatch({
    llmModel,
    tavilyApiKey,
    ...(process.env.CLAIMLATCH_LLM_API_KEY ? { llmApiKey: process.env.CLAIMLATCH_LLM_API_KEY } : {}),
    ...(process.env.CLAIMLATCH_LLM_BASE_URL ? { llmBaseUrl: process.env.CLAIMLATCH_LLM_BASE_URL } : {}),
  });
  const proxy = createOpenAIProxy({
    gate,
    upstreamBaseUrl,
    ...(upstreamApiKey ? { upstreamApiKey } : {}),
    structuredOutputVerifier: {
      async verify({ question, choice }) {
        return createToolPolicyReport(question, toolNamesFromChoice(choice), allowedTools);
      },
    },
  });

  await proxy.listen(port, host);
  process.stdout.write(`${JSON.stringify({
    service: "claimlatch-structured-output-example",
    baseUrl: `http://${host}:${port}/v1`,
    upstreamBaseUrl,
    allowedTools: [...allowedTools].sort(),
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`structured-output-verifier: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

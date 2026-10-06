import type { AiTeamProposalDispatchResult, AiTeamProposalDispatcher, AiTeamDiscussionDispatcher, AiTeamDiscussionResult } from "./contracts.js";

const AI_TEAM_SYSTEM_PROMPT = "You are an ISEOL AI team member helping with a user-owned project. Use only the bounded project/team/role context supplied in the request. Never execute commands, change files, approve work, claim verified results, or expose another user's private data. Return exactly one JSON object matching the requested schema and no markdown.";
const MAX_RESPONSE_BYTES = 256 * 1024;

export type OllamaAiTeamRuntimeOptions = {
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type OllamaAiTeamRuntimeConfig = {
  enabled: boolean;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
};

function loopback(value: string): string {
  const raw = value.trim();
  if (!raw || raw !== value || /[\\\u0000-\u001f\u007f]/.test(raw) || /%5c/i.test(raw) || raw.includes("?") || raw.includes("#")) {
    throw new Error("Local AI Runtime URL is invalid");
  }
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error("Local AI Runtime URL is invalid"); }
  const host = parsed.hostname.toLowerCase();
  if (!(parsed.protocol === "http:" || parsed.protocol === "https:") || !["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) throw new Error("Local AI Runtime URL must use a loopback endpoint");
  if (parsed.username || parsed.password) throw new Error("Local AI Runtime URL must not contain credentials");
  return parsed.toString().replace(/\/$/, "");
}

function required(value: unknown, label: string, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

function boundedList(value: unknown, maxItems: number, maxItemLength: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const result = value.map((item) => required(item, "AI team item", maxItemLength));
  return result.some((item) => item === null) ? null : result as string[];
}

function parseJsonContent(content: string): unknown | null {
  const trimmed = content.trim();
  const candidates = [trimmed];
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)?.[1];
  if (fenced) candidates.push(fenced.trim());
  for (const candidate of candidates) {
    try { return JSON.parse(candidate) as unknown; } catch { /* try the next bounded representation */ }
  }
  return null;
}

function normalizeOptions(options: OllamaAiTeamRuntimeOptions): OllamaAiTeamRuntimeOptions {
  const baseUrl = loopback(options.baseUrl);
  const model = required(options.model, "Local AI Runtime model", 200);
  if (!model) throw new Error("Local AI Runtime model is required");
  const timeoutMs = options.timeoutMs ?? 120_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error("Local AI Runtime timeout must be a positive integer");
  return { ...options, baseUrl, model, timeoutMs };
}

async function requestJson<T>(options: OllamaAiTeamRuntimeOptions, userPrompt: string, validate: (value: unknown) => T | null): Promise<{ value: T } | { blocker: string }> {
  const baseUrl = loopback(options.baseUrl);
  const model = required(options.model, "Local AI Runtime model", 200);
  if (!model) throw new Error("Local AI Runtime model is required");
  const timeoutMs = options.timeoutMs ?? 120_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error("Local AI Runtime timeout must be a positive integer");
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, stream: false, format: "json", messages: [{ role: "system", content: AI_TEAM_SYSTEM_PROMPT }, { role: "user", content: userPrompt }] }),
      signal: controller.signal,
    });
    if (!response.ok) return { blocker: "local AI Runtime request was not accepted" };
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_RESPONSE_BYTES) return { blocker: "local AI Runtime response was too large" };
    let envelope: unknown;
    try { envelope = JSON.parse(raw) as unknown; } catch { return { blocker: "local AI Runtime response was malformed" }; }
    const content = envelope && typeof envelope === "object" && !Array.isArray(envelope) && "message" in envelope && (envelope as { message?: unknown }).message && typeof (envelope as { message?: unknown }).message === "object"
      ? (envelope as { message: { content?: unknown } }).message.content
      : undefined;
    if (typeof content !== "string" || !content.trim()) return { blocker: "local AI Runtime returned no answer" };
    const parsed = parseJsonContent(content);
    if (parsed === null) return { blocker: "local AI Runtime response was malformed" };
    const validated = validate(parsed);
    return validated === null ? { blocker: "local AI Runtime returned an invalid AI team response" } : { value: validated };
  } catch {
    return { blocker: "local AI Runtime unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

function proposalPrompt(input: Parameters<AiTeamProposalDispatcher>[0]): string {
  return [
    "request: ai-team-proposal",
    `project scope: ${input.projectId}`,
    `team scope: ${input.teamId}`,
    `assigned agent: ${input.agentId}`,
    `assignment role: ${input.assignmentRole}`,
    `capabilities: ${input.capabilities.join(", ")}`,
    "Return JSON with title, objective, acceptanceCriteria (array), and rationale.",
    "The result is a proposal only and requires human approval before any Work Request or execution.",
  ].join("\n");
}

function discussionPrompt(input: Parameters<AiTeamDiscussionDispatcher>[0]): string {
  return [
    "request: ai-team-technical-discussion",
    `project scope: ${input.projectId}`,
    `team scope: ${input.teamId}`,
    `assigned agent: ${input.agentId}`,
    `assignment role: ${input.assignmentRole}`,
    `capabilities: ${input.capabilities.join(", ")}`,
    `question: ${input.question}`,
    "Return JSON with answer, keyPoints (array), alternatives (array), and risks (array).",
    "Discuss options and risks only; do not claim execution, verification, or approval.",
  ].join("\n");
}

function validateProposal(value: unknown): AiTeamProposalDispatchResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const title = required(raw.title, "AI proposal title", 160);
  const objective = required(raw.objective, "AI proposal objective", 4_000);
  const rationale = required(raw.rationale, "AI proposal rationale", 1_000);
  const acceptanceCriteria = boundedList(raw.acceptanceCriteria, 8, 300);
  if (!title || !objective || !rationale || !acceptanceCriteria) return null;
  return { status: "proposed", draft: { title, objective, acceptanceCriteria, rationale } };
}

function validateDiscussion(value: unknown): AiTeamDiscussionResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const answer = required(raw.answer, "AI discussion answer", 10_000);
  const keyPoints = boundedList(raw.keyPoints, 8, 500);
  const alternatives = boundedList(raw.alternatives, 8, 500);
  const risks = boundedList(raw.risks, 8, 500);
  if (!answer || !keyPoints || !alternatives || !risks) return null;
  return { status: "completed", answer, keyPoints, alternatives, risks };
}

export function createOllamaAiTeamProposalDispatcher(options: OllamaAiTeamRuntimeOptions): AiTeamProposalDispatcher {
  const normalizedOptions = normalizeOptions(options);
  return async (input) => {
    const result = await requestJson(normalizedOptions, proposalPrompt(input), validateProposal);
    return "value" in result ? result.value : { status: "waiting", blocker: result.blocker };
  };
}

export function createOllamaAiTeamDiscussionDispatcher(options: OllamaAiTeamRuntimeOptions): AiTeamDiscussionDispatcher {
  const normalizedOptions = normalizeOptions(options);
  return async (input) => {
    const result = await requestJson(normalizedOptions, discussionPrompt(input), validateDiscussion);
    return "value" in result ? result.value : { status: "waiting", blocker: result.blocker };
  };
}

export function resolveOllamaAiTeamRuntimeConfig(env: Record<string, string | undefined> = process.env): OllamaAiTeamRuntimeConfig {
  const enabled = env.ISEOL_LOCAL_AI_RUNTIME_ENABLED?.trim().toLowerCase() === "true";
  const configuredBaseUrl = env.ISEOL_LOCAL_AI_RUNTIME_URL;
  const baseUrl = configuredBaseUrl === undefined || !configuredBaseUrl.trim() ? "http://127.0.0.1:11434" : configuredBaseUrl;
  const model = env.ISEOL_LOCAL_AI_RUNTIME_MODEL?.trim() || "";
  const timeoutText = env.ISEOL_LOCAL_AI_RUNTIME_TIMEOUT_MS?.trim() || "120000";
  const timeoutMs = Number(timeoutText);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error("ISEOL_LOCAL_AI_RUNTIME_TIMEOUT_MS must be a positive integer");
  if (enabled && !model) throw new Error("ISEOL_LOCAL_AI_RUNTIME_MODEL is required when local AI Runtime is enabled");
  return { enabled, baseUrl, model, timeoutMs };
}

import type {
  LearningActionDispatcher,
  LearningContentDispatcher,
  LearningFeedbackDispatcher,
  LearningPlanDispatcher,
  LearningPlanProposal,
  LearningLessonInput,
  LearningFeedbackEvaluationInput,
} from "./contracts.js";

const MAX_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_BASE_URL = "http://127.0.0.1:11434";

export type OllamaLearningRuntimeOptions = {
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type OllamaLearningRuntimeConfig = {
  enabled: boolean;
  baseUrl: string;
  model: string;
  timeoutMs: number;
};

function loopback(value: string): string {
  const raw = value.trim();
  if (!raw || raw !== value || /[\\\u0000-\u001f\u007f]/.test(raw) || /%5c/i.test(raw) || raw.includes("?") || raw.includes("#")) {
    throw new Error("Local learning Runtime URL is invalid");
  }
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error("Local learning Runtime URL is invalid"); }
  const host = parsed.hostname.toLowerCase();
  if (!(parsed.protocol === "http:" || parsed.protocol === "https:") || !["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
    throw new Error("Local learning Runtime URL must use a loopback endpoint");
  }
  if (parsed.username || parsed.password) throw new Error("Local learning Runtime URL must not contain credentials");
  return parsed.toString().replace(/\/$/, "");
}

function required(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) throw new Error(`${label} is required`);
  return trimmed;
}

function clip(value: string, max = 12_000): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

type OllamaResult = { status: "completed"; value: unknown } | { status: "waiting"; blocker: string };

function validateOptions(options: OllamaLearningRuntimeOptions): { baseUrl: string; model: string; timeoutMs: number } {
  const baseUrl = loopback(options.baseUrl);
  const model = required(options.model, "Local learning Runtime model");
  const timeoutMs = options.timeoutMs ?? 120_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error("Local learning Runtime timeout must be a positive integer");
  return { baseUrl, model, timeoutMs };
}

async function askOllama(options: OllamaLearningRuntimeOptions, system: string, prompt: string): Promise<OllamaResult> {
  const { baseUrl, model, timeoutMs } = validateOptions(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, stream: false, format: "json", messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
      signal: controller.signal,
    });
    if (!response.ok) return { status: "waiting", blocker: "local learning Runtime request was not accepted" };
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_RESPONSE_BYTES) return { status: "waiting", blocker: "local learning Runtime response was too large" };
    let envelope: unknown;
    try { envelope = JSON.parse(raw); } catch { return { status: "waiting", blocker: "local learning Runtime response was malformed" }; }
    const content = envelope && typeof envelope === "object" && !Array.isArray(envelope)
      ? (envelope as { message?: unknown }).message && typeof (envelope as { message?: unknown }).message === "object"
        ? (envelope as { message: { content?: unknown } }).message.content
        : undefined
      : undefined;
    if (typeof content !== "string" || !content.trim()) return { status: "waiting", blocker: "local learning Runtime returned no structured answer" };
    try { return { status: "completed", value: JSON.parse(content) }; } catch { return { status: "waiting", blocker: "local learning Runtime returned malformed structured JSON" }; }
  } catch {
    return { status: "waiting", blocker: "local learning Runtime unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

const CONTENT_SYSTEM = "You are a private ISEOL learning-content generator. Return JSON only. Do not claim a code execution, score, mastery, or external verification. Keep the lesson within the supplied daily minute budget.";
const ACTION_SYSTEM = "You are a private ISEOL learning coach. Return JSON only. Give one bounded explanation, example, or hint for the supplied learning action. Do not claim code execution, score, mastery, or external verification.";
const FEEDBACK_SYSTEM = "You are a private ISEOL learning evaluator. Return JSON only. Do not claim verified correctness without verifier evidence; use needs-review when execution evidence is absent.";
const PLAN_SYSTEM = "You are a private ISEOL learning planner. Return JSON only. Interpret the learner goal and produce a bounded plan proposal. Do not claim mastery, external verification, or work that was not executed. Respect the supplied daily and total time budgets.";

export function createOllamaLearningPlanDispatcher(options: OllamaLearningRuntimeOptions): LearningPlanDispatcher {
  validateOptions(options);
  return async (request) => {
    const result = await askOllama(options, PLAN_SYSTEM, json({
      scope: "private",
      task: "learning-goal-plan",
      requestId: request.requestId,
      inputHash: request.inputHash,
      timezone: request.timezone,
      goal: { id: request.goal.id, revision: request.goal.revision, input: request.goal.input, optionalSettings: request.goal.optionalSettings },
      output: {
        normalizedSubject: "string",
        assumptions: ["string"],
        feasibleOutcomes: ["string"],
        exclusions: ["string"],
        prerequisites: ["string"],
        level: { value: "unknown|beginner|intermediate|advanced", evidenceRefs: ["string"] },
        feasibleMinutes: "positive integer within the total budget",
        segments: [{ id: "string", dayFrom: "integer", dayTo: "integer", outcomeIds: ["string from feasibleOutcomes"] }],
        days: [{ dayIndex: "integer", conceptIds: ["string"], minutes: "positive integer within the daily budget", activities: [{ kind: "review|concept|practice|feedback", minutes: "positive integer" }], checkpoint: "none|midpoint|final" }],
      },
    }));
    if (result.status === "waiting") return result;
    return { status: "completed", proposal: result.value as LearningPlanProposal };
  };
}

export function createOllamaLearningContentDispatcher(options: OllamaLearningRuntimeOptions): LearningContentDispatcher {
  validateOptions(options);
  return async (request) => {
    const result = await askOllama(options, CONTENT_SYSTEM, json({
      scope: "private",
      task: "learning-day-content",
      subject: request.plan.outcomes,
      day: { id: request.day.id, dayIndex: request.day.dayIndex, localDate: request.day.localDate, conceptIds: request.day.conceptIds, minutes: request.day.minutes, activities: request.day.activities },
      output: { title: "string", estimatedMinutes: "integer <= day.minutes", blocks: [{ id: "unique string", kind: "review|concept|example|question|practice|feedback", conceptIds: ["string"], minutes: "positive integer", title: "string", content: "string" }] },
    }));
    if (result.status === "waiting") return result;
    return { status: "completed", lesson: result.value as LearningLessonInput };
  };
}

export function createOllamaLearningActionDispatcher(options: OllamaLearningRuntimeOptions): LearningActionDispatcher {
  validateOptions(options);
  return async (request) => {
    const result = await askOllama(options, ACTION_SYSTEM, json({
      scope: "private",
      task: "learning-session-action",
      action: { type: request.action.type, contentRef: request.action.contentRef, question: clip(request.action.question ?? "", 2_000) },
      session: { id: request.session.id, goalId: request.session.goalId, planVersionId: request.session.planVersionId, dayId: request.session.dayId },
      output: { response: "string; concise and actionable; do not reveal an answer before the learner attempts it unless the action explicitly asks for an explanation" },
    }));
    if (result.status === "waiting") return result;
    const value = result.value && typeof result.value === "object" && !Array.isArray(result.value)
      ? (result.value as { response?: unknown }).response
      : undefined;
    if (typeof value !== "string" || !value.trim()) return { status: "waiting", blocker: "local learning Runtime returned no action response" };
    const action = await request.complete(value);
    return { status: "completed", action };
  };
}

export function createOllamaLearningFeedbackDispatcher(options: OllamaLearningRuntimeOptions): LearningFeedbackDispatcher {
  validateOptions(options);
  return async (request) => {
    const result = await askOllama(options, FEEDBACK_SYSTEM, json({
      scope: "private",
      task: "learning-answer-feedback",
      answerStatus: request.answer.status,
      exercise: { id: request.exercise.id, title: clip(request.exercise.title, 500), prompt: clip(request.exercise.prompt, 4_000), language: request.exercise.language },
      attempt: { id: request.attempt.id, response: clip(request.attempt.response, 8_000), practiceResult: request.attempt.practiceResult },
      output: { attemptId: request.attempt.id, rubricVersion: "string", evaluatorVersion: "string", criteriaResults: [{ criterionId: "string", result: "correct|partial|incorrect|undetermined", evidenceRefs: ["string"], explanation: "string" }], feedback: "string", misconceptions: [{ conceptId: "string", observedEvidence: "string" }], verification: "tentative|verified|needs-review", nextAction: "string" },
    }));
    if (result.status === "waiting") return result;
    const feedback = await request.complete(result.value as LearningFeedbackEvaluationInput);
    return { status: "completed", feedback };
  };
}

export function resolveOllamaLearningRuntimeConfig(env: Record<string, string | undefined> = process.env): OllamaLearningRuntimeConfig {
  const enabled = env.ISEOL_LEARNING_RUNTIME_ENABLED?.trim().toLowerCase() === "true";
  const configuredBaseUrl = env.ISEOL_LEARNING_RUNTIME_URL;
  const baseUrl = configuredBaseUrl === undefined || !configuredBaseUrl.trim() ? DEFAULT_BASE_URL : configuredBaseUrl;
  const model = env.ISEOL_LEARNING_RUNTIME_MODEL?.trim() || "";
  const timeoutText = env.ISEOL_LEARNING_RUNTIME_TIMEOUT_MS?.trim() || "120000";
  const timeoutMs = Number(timeoutText);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error("ISEOL_LEARNING_RUNTIME_TIMEOUT_MS must be a positive integer");
  if (enabled && !model) throw new Error("ISEOL_LEARNING_RUNTIME_MODEL is required when learning Runtime is enabled");
  if (enabled) loopback(baseUrl);
  return { enabled, baseUrl, model, timeoutMs };
}

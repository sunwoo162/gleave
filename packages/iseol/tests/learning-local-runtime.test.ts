import assert from "node:assert/strict";
import test from "node:test";
import type { LearningActionDispatchRequest, LearningContentDispatchRequest, LearningFeedbackDispatchRequest } from "../src/learning/contracts.js";
import { createOllamaLearningContentDispatcher, createOllamaLearningFeedbackDispatcher, createOllamaLearningPlanDispatcher, resolveOllamaLearningRuntimeConfig } from "../src/learning/local-runtime.js";

const principal = { userId: "local-learning-user", sessionId: "local-learning-session", roles: ["user"] as const };

function contentDispatchRequest(complete: LearningContentDispatchRequest["complete"]): LearningContentDispatchRequest {
  return {
    principal,
    request: {
      version: 1, id: "learning-content-request-1", userId: principal.userId, sessionId: "learning-session-1", goalId: "goal-1", planVersionId: "plan-1", dayId: "plan-1-day-1",
      templateId: "learning-day-content", templateVersion: "learning-day-content-v1", scope: "private", inputHash: "hash", state: "waiting-runtime", budget: { maxMinutes: 30 }, createdAt: "2026-09-26T12:00:00.000Z", updatedAt: "2026-09-26T12:00:00.000Z",
    },
    session: { version: 1, id: "learning-session-1", userId: principal.userId, planId: "plan-1", status: "active", startedAt: "2026-09-26T12:00:00.000Z", resumedAt: "2026-09-26T12:00:00.000Z", goalId: "goal-1", planVersionId: "plan-1", dayId: "plan-1-day-1", contentStatus: "pending" },
    plan: { version: 1, id: "plan-1", userId: principal.userId, goalId: "goal-1", inputRevision: 1, templateVersion: "learning-plan-template-v1", interpretationId: "interpretation-1", segments: [], outcomes: ["generic-types"], budget: { durationDays: 1, dailyMinutes: 30, totalMinutes: 30 }, days: [{ id: "plan-1-day-1", dayIndex: 1, localDate: "2026-09-26", conceptIds: ["generic-types"], minutes: 30, activities: [{ kind: "concept", minutes: 30 }], checkpoint: "final" }], status: "active", createdAt: "2026-09-26T12:00:00.000Z", updatedAt: "2026-09-26T12:00:00.000Z" },
    day: { id: "plan-1-day-1", dayIndex: 1, localDate: "2026-09-26", conceptIds: ["generic-types"], minutes: 30, activities: [{ kind: "concept", minutes: 30 }], checkpoint: "final" },
    complete,
  };
}

function feedbackDispatchRequest(complete: LearningFeedbackDispatchRequest["complete"]): LearningFeedbackDispatchRequest {
  return {
    principal,
    answer: { version: 1, id: "answer-1", userId: principal.userId, sessionId: "learning-session-1", exerciseId: "exercise-1", attemptId: "attempt-1", response: "function identity<T>(value: T): T { return value; }", artifactRefs: [], status: "evaluation-pending", evaluationRequestId: "evaluation-1", revealedBeforeEvaluation: false, submittedAt: "2026-09-26T12:00:00.000Z" },
    feedback: { version: 1, id: "feedback-1", userId: principal.userId, answerId: "answer-1", status: "pending", createdAt: "2026-09-26T12:00:00.000Z", updatedAt: "2026-09-26T12:00:00.000Z" },
    exercise: { version: 1, id: "exercise-1", userId: principal.userId, sessionId: "learning-session-1", title: "제네릭 identity", prompt: "입력 타입을 보존하는 함수를 작성하세요.", language: "typescript", estimatedMinutes: 15, verifier: { kind: "runtime-required", spec: "local-runtime-executor" }, createdAt: "2026-09-26T12:00:00.000Z" },
    attempt: { version: 1, id: "attempt-1", userId: principal.userId, exerciseId: "exercise-1", clientRequestId: "attempt-1", response: "function identity<T>(value: T): T { return value; }", submittedAt: "2026-09-26T12:00:00.000Z", revealedBeforeSubmit: false, practiceResult: { status: "environment-required", artifactRefs: [], executorId: "none", policyRef: "local-runtime-executor" } },
    complete,
  };
}

function actionDispatchRequest(complete: LearningActionDispatchRequest["complete"]): LearningActionDispatchRequest {
  return {
    principal,
    action: { version: 1, id: "action-1", userId: principal.userId, sessionId: "learning-session-1", actionId: "hint-1", type: "hint", contentRef: "generic-types", question: "힌트를 주세요", status: "waiting-runtime", blocker: "local learning action Runtime is not configured", createdAt: "2026-09-26T12:00:00.000Z" },
    session: { version: 1, id: "learning-session-1", userId: principal.userId, planId: "plan-1", status: "active", startedAt: "2026-09-26T12:00:00.000Z", resumedAt: "2026-09-26T12:00:00.000Z", goalId: "goal-1", planVersionId: "plan-1", dayId: "plan-1-day-1", contentStatus: "ready" },
    complete,
  };
}

test("learning local Runtime config is disabled by default and loopback-only when enabled", () => {
  assert.deepEqual(resolveOllamaLearningRuntimeConfig({}), { enabled: false, baseUrl: "http://127.0.0.1:11434", model: "", timeoutMs: 120_000 });
  assert.throws(() => resolveOllamaLearningRuntimeConfig({ ISEOL_LEARNING_RUNTIME_ENABLED: "true" }), /MODEL is required/);
  assert.deepEqual(resolveOllamaLearningRuntimeConfig({ ISEOL_LEARNING_RUNTIME_ENABLED: "true", ISEOL_LEARNING_RUNTIME_URL: "http://localhost:11434", ISEOL_LEARNING_RUNTIME_MODEL: "qwen-local", ISEOL_LEARNING_RUNTIME_TIMEOUT_MS: "5000" }), { enabled: true, baseUrl: "http://localhost:11434", model: "qwen-local", timeoutMs: 5000 });
  assert.doesNotThrow(() => createOllamaLearningContentDispatcher({ baseUrl: "http://[::1]:11434", model: "qwen-local" }));
  const whitespaceUrl = " http://127.0.0.1:11434 ";
  assert.throws(() => resolveOllamaLearningRuntimeConfig({ ISEOL_LEARNING_RUNTIME_ENABLED: "true", ISEOL_LEARNING_RUNTIME_URL: whitespaceUrl, ISEOL_LEARNING_RUNTIME_MODEL: "qwen-local" }), /Local learning Runtime URL/);
  for (const baseUrl of [
    "http://127.0.0.1:11434\\@attacker.example",
    "http://127.0.0.1:11434/%5C@attacker.example",
    "http://127.0.0.1:11434/api?",
    "http://127.0.0.1:11434/api#fragment",
    "http://127.0.0.1:11434/api\n",
    "http://127.0.0.1:11434/api\t",
  ]) {
    assert.throws(() => createOllamaLearningContentDispatcher({ baseUrl, model: "qwen-local" }), /Local learning Runtime/);
  }
});

test("learning content dispatcher sends a private structured request and completes through the owner callback", async () => {
  let requestedBody: any;
  let completed: any;
  const dispatcher = createOllamaLearningContentDispatcher({ baseUrl: "http://127.0.0.1:11434", model: "qwen-local", fetchImpl: async (_input, init) => {
    requestedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ title: "오늘의 제네릭", estimatedMinutes: 20, blocks: [{ id: "concept-1", kind: "concept", conceptIds: ["generic-types"], minutes: 20, title: "타입 매개변수", content: "타입 매개변수는 입력과 출력의 관계를 보존합니다." }] }) } }), { status: 200 });
  } });
  const result = await dispatcher(contentDispatchRequest(async (lesson) => { completed = lesson; return {} as never; }));
  assert.equal(result.status, "completed");
  assert.equal(completed, undefined);
  assert.equal(requestedBody.model, "qwen-local");
  assert.equal(requestedBody.format, "json");
  assert.match(requestedBody.messages[1].content, /generic-types/);
  assert.match(requestedBody.messages[1].content, /private/);
});

test("learning feedback dispatcher maps structured evaluation through the owner callback", async () => {
  let requestedBody: any;
  let completed: any;
  const dispatcher = createOllamaLearningFeedbackDispatcher({ baseUrl: "http://localhost:11434", model: "qwen-local", fetchImpl: async (_input, init) => {
    requestedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ attemptId: "attempt-1", rubricVersion: "rubric-v1", evaluatorVersion: "ollama-qwen-local-v1", criteriaResults: [{ criterionId: "type-preservation", result: "correct", evidenceRefs: [], explanation: "제네릭 타입이 입력 타입을 보존합니다." }], feedback: "핵심 구현은 맞습니다.", misconceptions: [], verification: "needs-review", nextAction: "반환 타입 추론을 설명해 보세요." }) } }), { status: 200 });
  } });
  const result = await dispatcher(feedbackDispatchRequest(async (evaluation) => { completed = evaluation; return {} as never; }));
  assert.equal(result.status, "completed");
  assert.equal(completed.evaluatorVersion, "ollama-qwen-local-v1");
  assert.deepEqual(result.feedback, {});
  assert.equal(requestedBody.format, "json");
  assert.match(requestedBody.messages[1].content, /evaluation-pending/);
  assert.match(requestedBody.messages[1].content, /function identity/);
});

test("learning action dispatcher sends a private request and completes through the owner callback", async () => {
  let requestedBody: any;
  let completed: any;
  const dispatcher = (await import("../src/learning/local-runtime.js")).createOllamaLearningActionDispatcher({ baseUrl: "http://127.0.0.1:11434", model: "qwen-local", fetchImpl: async (_input, init) => {
    requestedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ response: "먼저 타입 매개변수가 입력 타입을 보존하는 이유를 떠올려 보세요." }) } }), { status: 200 });
  } });
  const result = await dispatcher(actionDispatchRequest(async (response) => { completed = response; return { response } as never; }));
  assert.equal(result.status, "completed");
  assert.equal(completed, "먼저 타입 매개변수가 입력 타입을 보존하는 이유를 떠올려 보세요.");
  assert.equal(requestedBody.format, "json");
  assert.match(requestedBody.messages[1].content, /learning-session-action/);
  assert.match(requestedBody.messages[1].content, /private/);
  assert.match(requestedBody.messages[1].content, /힌트를 주세요/);
});

test("learning plan dispatcher sends a private structured goal request and returns a proposal", async () => {
  let requestedBody: any;
  const dispatcher = createOllamaLearningPlanDispatcher({ baseUrl: "http://127.0.0.1:11434", model: "qwen-local", fetchImpl: async (_input, init) => {
    requestedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ message: { content: JSON.stringify({
      normalizedSubject: "TypeScript 제네릭", assumptions: [], feasibleOutcomes: ["generic-types"], exclusions: [], prerequisites: [],
      level: { value: "beginner", evidenceRefs: [] }, feasibleMinutes: 30,
      segments: [{ id: "segment-a", dayFrom: 1, dayTo: 1, outcomeIds: ["generic-types"] }],
      days: [{ dayIndex: 1, conceptIds: ["generic-types"], minutes: 30, activities: [{ kind: "concept", minutes: 30 }], checkpoint: "final" }],
    }) } }), { status: 200 });
  } });
  const result = await dispatcher({
    principal,
    requestId: "plan-request-1",
    inputHash: "hash",
    timezone: "Asia/Seoul",
    goal: { version: 1, id: "goal-1", userId: principal.userId, input: { subjectText: "TypeScript 제네릭", duration: { days: 1 }, dailyMinutes: 30 }, status: "draft", revision: 1, createdAt: "2026-09-26T12:00:00.000Z", updatedAt: "2026-09-26T12:00:00.000Z" },
  });
  assert.equal(result.status, "completed");
  if (result.status === "completed") assert.equal(result.proposal.normalizedSubject, "TypeScript 제네릭");
  assert.equal(requestedBody.format, "json");
  assert.match(requestedBody.messages[1].content, /learning-goal-plan/);
  assert.match(requestedBody.messages[1].content, /private/);
  assert.match(requestedBody.messages[1].content, /Asia\/Seoul/);
  assert.match(requestedBody.messages[1].content, /hash/);
});

test("learning local Runtime returns an honest waiting result for malformed or unavailable responses", async () => {
  const malformed = createOllamaLearningContentDispatcher({ baseUrl: "http://127.0.0.1:11434", model: "qwen-local", fetchImpl: async () => new Response("not-json", { status: 200 }) });
  const unavailable = createOllamaLearningFeedbackDispatcher({ baseUrl: "http://127.0.0.1:11434", model: "qwen-local", fetchImpl: async () => { throw new Error("connection refused"); } });
  const malformedResult = await malformed(contentDispatchRequest(async () => { throw new Error("must not complete"); }));
  const unavailableResult = await unavailable(feedbackDispatchRequest(async () => { throw new Error("must not complete"); }));
  assert.equal(malformedResult.status, "waiting");
  assert.equal(unavailableResult.status, "waiting");
  assert.match(malformedResult.blocker ?? "", /malformed|JSON/i);
  assert.match(unavailableResult.blocker ?? "", /unavailable/i);
  assert.throws(() => createOllamaLearningContentDispatcher({ baseUrl: "https://example.com", model: "qwen-local" }), /loopback/);
});

import assert from "node:assert/strict";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import type { AiTeamProposalDispatcher, AiTeamDiscussionDispatcher } from "../src/ai-team/contracts.js";
import { createOllamaAiTeamProposalDispatcher, createOllamaAiTeamDiscussionDispatcher, resolveOllamaAiTeamRuntimeConfig } from "../src/ai-team/local-runtime.js";

const principal: Principal = { userId: "ai-team-local-user", sessionId: "ai-team-local-session", roles: ["user"] };

const proposalInput: Parameters<AiTeamProposalDispatcher>[0] = {
  principal,
  projectId: "project-local-ai-team",
  teamId: "team-local-ai-team",
  agentId: "agent-architect",
  assignmentRole: "설계 검토자",
  capabilities: ["context.read", "task.propose"],
};

const discussionInput: Parameters<AiTeamDiscussionDispatcher>[0] = {
  ...proposalInput,
  capabilities: ["context.read", "discussion.propose"],
  question: "이 작업을 어떤 순서로 안전하게 나눌까요?",
};

test("AI Team local Runtime config is disabled by default and requires an explicit model", () => {
  assert.deepEqual(resolveOllamaAiTeamRuntimeConfig({}), { enabled: false, baseUrl: "http://127.0.0.1:11434", model: "", timeoutMs: 120_000 });
  assert.throws(() => resolveOllamaAiTeamRuntimeConfig({ ISEOL_LOCAL_AI_RUNTIME_ENABLED: "true" }), /MODEL is required/);
  assert.deepEqual(resolveOllamaAiTeamRuntimeConfig({ ISEOL_LOCAL_AI_RUNTIME_ENABLED: "true", ISEOL_LOCAL_AI_RUNTIME_MODEL: "qwen-local", ISEOL_LOCAL_AI_RUNTIME_TIMEOUT_MS: "5000" }), { enabled: true, baseUrl: "http://127.0.0.1:11434", model: "qwen-local", timeoutMs: 5000 });
});

test("AI Team local proposal dispatcher sends a bounded JSON request and maps the draft", async () => {
  let requestedBody: Record<string, unknown> | undefined;
  const dispatcher = createOllamaAiTeamProposalDispatcher({
    baseUrl: "http://127.0.0.1:11434/",
    model: "qwen-local",
    fetchImpl: async (_input, init) => {
      requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ message: { content: JSON.stringify({ title: "안전한 작업 분해", objective: "승인 가능한 단위로 작업을 나눕니다.", acceptanceCriteria: ["사람이 검토할 수 있음"], rationale: "실행 전 검토 지점을 보존합니다." }) } }), { status: 200 });
    },
  });

  const result = await dispatcher(proposalInput);

  assert.deepEqual(result, { status: "proposed", draft: { title: "안전한 작업 분해", objective: "승인 가능한 단위로 작업을 나눕니다.", acceptanceCriteria: ["사람이 검토할 수 있음"], rationale: "실행 전 검토 지점을 보존합니다." } });
  assert.equal(requestedBody?.model, "qwen-local");
  assert.equal(requestedBody?.format, "json");
  assert.equal(requestedBody?.stream, false);
  const messages = requestedBody?.messages as Array<{ role: string; content: string }>;
  assert.equal(messages[0]?.role, "system");
  assert.match(messages[0]?.content ?? "", /never execute/i);
  assert.match(messages[1]?.content ?? "", /project-local-ai-team/);
  assert.match(messages[1]?.content ?? "", /설계 검토자/);
});

test("AI Team local discussion dispatcher maps a structured answer and keeps malformed/unavailable responses waiting", async () => {
  const dispatcher = createOllamaAiTeamDiscussionDispatcher({
    baseUrl: "http://localhost:11434",
    model: "qwen-local",
    fetchImpl: async () => new Response(JSON.stringify({ message: { content: "```json\n{\"answer\":\"작업을 작은 단계로 나누고 먼저 읽기 검증을 합니다.\",\"keyPoints\":[\"권한 확인\"],\"alternatives\":[\"작은 실험\"],\"risks\":[\"검토 누락\"]}\n```" } }), { status: 200 }),
  });
  const result = await dispatcher(discussionInput);
  assert.deepEqual(result, { status: "completed", answer: "작업을 작은 단계로 나누고 먼저 읽기 검증을 합니다.", keyPoints: ["권한 확인"], alternatives: ["작은 실험"], risks: ["검토 누락"] });

  const malformed = createOllamaAiTeamDiscussionDispatcher({ baseUrl: "http://127.0.0.1:11434", model: "qwen-local", fetchImpl: async () => new Response("not-json", { status: 200 }) });
  const unavailable = createOllamaAiTeamProposalDispatcher({ baseUrl: "http://127.0.0.1:11434", model: "qwen-local", fetchImpl: async () => { throw new Error("connection refused"); } });
  const malformedResult = await malformed(discussionInput);
  const unavailableResult = await unavailable(proposalInput);
  assert.deepEqual(malformedResult, { status: "waiting", blocker: "local AI Runtime response was malformed" });
  assert.deepEqual(unavailableResult, { status: "waiting", blocker: "local AI Runtime unavailable" });
});

test("AI Team local Runtime rejects non-loopback endpoints", () => {
  assert.throws(() => createOllamaAiTeamProposalDispatcher({ baseUrl: "https://example.com", model: "qwen-local" }), /loopback/);
  assert.doesNotThrow(() => createOllamaAiTeamProposalDispatcher({ baseUrl: "http://[::1]:11434", model: "qwen-local" }));
  for (const baseUrl of [
    "http://127.0.0.1:11434\\@attacker.example",
    "http://127.0.0.1:11434/%5C@attacker.example",
    "http://127.0.0.1:11434/api?",
    "http://127.0.0.1:11434/api#fragment",
    "http://127.0.0.1:11434/api\n",
    "http://127.0.0.1:11434/api\t",
  ]) {
    assert.throws(() => createOllamaAiTeamProposalDispatcher({ baseUrl, model: "qwen-local" }), /Local AI Runtime/);
  }
});

test("AI Team Runtime configuration preserves malformed URL input for strict validation", () => {
  const whitespaceUrl = " http://127.0.0.1:11434 ";
  const config = resolveOllamaAiTeamRuntimeConfig({ ISEOL_LOCAL_AI_RUNTIME_ENABLED: "true", ISEOL_LOCAL_AI_RUNTIME_URL: whitespaceUrl, ISEOL_LOCAL_AI_RUNTIME_MODEL: "qwen-local" });
  assert.equal(config.baseUrl, whitespaceUrl);
  assert.throws(() => createOllamaAiTeamProposalDispatcher({ baseUrl: config.baseUrl, model: config.model }), /Local AI Runtime URL/);
});

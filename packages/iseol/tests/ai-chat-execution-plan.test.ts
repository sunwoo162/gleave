import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createAiChatService } from "../src/ai-chat/service.js";
import type { UserProjectService } from "../src/project-model/user-project-service.js";

const principal = (userId: string): Principal => ({ userId, sessionId: `${userId}-session`, roles: ["user"] });
const proposal = { title: "안전한 검토 계획", summary: "파일 변경 없이 현재 프로젝트 상태를 검토합니다.", steps: [{ id: "step-1", title: "상태 읽기", description: "허가된 프로젝트 메타데이터를 읽습니다.", operation: "read" as const, approvalRequired: true }] };

test("AI Chat persists a Runtime-proposed execution plan and keeps approval separate from execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-execution-plan-"));
  const owner = principal("ai-execution-plan-owner");
  const chat = createAiChatService(root, {
    now: () => "2026-09-27T00:00:00.000Z",
    runtimeDispatcher: async () => ({ status: "completed", assistantContent: "계획을 제안합니다.", executionPlan: proposal }),
  });
  const conversation = await chat.createConversation(owner);
  const result = await chat.sendMessage(owner, conversation.id, "실행 계획을 제안해줘");
  const assistant = result.conversation.messages.find((message) => message.role === "assistant");

  assert.equal(assistant?.executionPlan?.status, "proposed");
  assert.equal(assistant?.executionPlan?.steps[0]?.approvalRequired, true);
  assert.equal(result.runtimeStatus, "completed");
  const approved = await chat.approveExecutionPlan(owner, conversation.id, assistant!.id);
  const approvedPlan = approved.messages.find((message) => message.id === assistant!.id)?.executionPlan;
  assert.equal(approvedPlan?.status, "approved");
  assert.equal(approvedPlan?.approvedAt, "2026-09-27T00:00:00.000Z");
  assert.equal(approved.messages.length, 2);
});

test("AI Chat execution-plan rejection is owner-bound and durable without dispatching work", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-execution-plan-reject-"));
  const owner = principal("ai-execution-plan-reject-owner");
  const outsider = principal("ai-execution-plan-reject-outsider");
  const chat = createAiChatService(root, {
    now: () => "2026-09-27T00:00:00.000Z",
    runtimeDispatcher: async () => ({ status: "completed", assistantContent: "계획을 제안합니다.", executionPlan: proposal }),
  });
  const conversation = await chat.createConversation(owner);
  const result = await chat.sendMessage(owner, conversation.id, "계획을 검토해줘");
  const assistant = result.conversation.messages.find((message) => message.role === "assistant")!;

  await assert.rejects(() => chat.rejectExecutionPlan(outsider, conversation.id, assistant.id), /conversation|plan/i);
  const rejected = await chat.rejectExecutionPlan(owner, conversation.id, assistant.id);
  assert.equal(rejected.messages.find((message) => message.id === assistant.id)?.executionPlan?.status, "rejected");
  const restarted = createAiChatService(root, { now: () => "2026-09-27T00:00:00.000Z" });
  assert.equal((await restarted.getConversation(owner, conversation.id))?.messages.find((message) => message.id === assistant.id)?.executionPlan?.status, "rejected");
});

test("an approved AI Chat plan creates one queued owner project work request only when explicitly handed off", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-execution-plan-handoff-"));
  const owner = principal("ai-execution-plan-handoff-owner");
  let createCount = 0;
  const project = { version: 1 as const, id: "project-plan-handoff", ownerUserId: owner.userId, name: "계획 연결 프로젝트", objective: "승인된 계획을 작업 요청으로 연결합니다.", purpose: "portfolio" as const, teamMode: "solo" as const, workspaceRoot: join(root, "workspace"), status: "active" as const, createdAt: "2026-09-27T00:00:00.000Z", updatedAt: "2026-09-27T00:00:00.000Z" };
  const userProjectService = {
    listProjects: async () => [project],
    createWorkRequest: async (_principal: Principal, projectId: string, input: { title: string; objective: string; idempotencyKey: string }) => {
      createCount += 1;
      return { created: createCount === 1, request: { version: 1 as const, id: "work-request-plan-handoff", projectId, title: input.title, objective: input.objective, status: "queued" as const, idempotencyKey: input.idempotencyKey, attempts: 0, createdAt: "2026-09-27T00:00:00.000Z", updatedAt: "2026-09-27T00:00:00.000Z" } };
    },
  } as unknown as UserProjectService;
  const chat = createAiChatService(root, {
    now: () => "2026-09-27T00:00:00.000Z",
    userProjectService,
    runtimeDispatcher: async () => ({ status: "completed", assistantContent: "계획을 제안합니다.", executionPlan: proposal }),
  });
  const conversation = await chat.createConversation(owner);
  const result = await chat.sendMessage(owner, conversation.id, "계획을 작업으로 연결해줘", { projectId: project.id });
  const assistant = result.conversation.messages.find((message) => message.role === "assistant")!;
  await chat.approveExecutionPlan(owner, conversation.id, assistant.id);

  const handedOff = await chat.createExecutionPlanWorkRequest(owner, conversation.id, assistant.id);
  assert.equal(handedOff.workRequest.status, "queued");
  assert.equal(handedOff.workRequest.projectId, project.id);
  assert.equal(handedOff.created, true);
  assert.equal(handedOff.conversation.messages.find((message) => message.id === assistant.id)?.executionPlan?.workRequestId, handedOff.workRequest.id);

  const repeated = await chat.createExecutionPlanWorkRequest(owner, conversation.id, assistant.id);
  assert.equal(repeated.created, false);
  assert.equal(repeated.workRequest.id, handedOff.workRequest.id);
  assert.equal(createCount, 2);
});

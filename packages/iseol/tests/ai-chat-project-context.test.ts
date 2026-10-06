import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createAiChatService } from "../src/ai-chat/service.js";
import { createSettingsService } from "../src/settings/service.js";
import { createUserProjectService } from "../src/project-model/user-project-service.js";

const principal = (userId: string): Principal => ({ userId, sessionId: `${userId}-session`, roles: ["user"] });

test("AI Chat attaches only the selected owner-accessible project context and persists the selection", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-selected-project-"));
  const now = () => "2026-09-27T12:00:00.000Z";
  const settings = createSettingsService(root, { now });
  const projects = createUserProjectService({ platformRoot: root, projectModelRoot: join(root, "project-model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, now });
  const captured: string[][] = [];
  const chat = createAiChatService(root, {
    settingsService: settings,
    userProjectService: projects,
    now,
    runtimeDispatcher: async (request) => {
      captured.push(request.context.projects?.map((project) => project.id) ?? []);
      return { status: "accepted", blocker: "test dispatcher does not complete" };
    },
  });
  const owner = principal("ai-selected-project-owner");
  const project = await projects.createProject(owner, { name: "연결할 프로젝트", objective: "선택한 프로젝트 맥락만 사용합니다.", purpose: "rapid-prototype", teamMode: "solo" });
  const conversation = await chat.createConversation(owner);

  const result = await chat.sendMessage(owner, conversation.id, "이 프로젝트 맥락을 참고해줘", { projectId: project.id });

  assert.equal(result.runtimeStatus, "waiting_runtime");
  assert.deepEqual(captured, [[project.id]]);
  assert.equal(result.conversation.messages[0]?.projectId, project.id);
  const restarted = createAiChatService(root, { settingsService: settings, userProjectService: projects, now });
  assert.equal((await restarted.getConversation(owner, conversation.id))?.messages[0]?.projectId, project.id);
});

test("AI Chat rejects a project context that is not visible to the authenticated user", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-project-acl-"));
  const now = () => "2026-09-27T12:00:00.000Z";
  const projects = createUserProjectService({ platformRoot: root, projectModelRoot: join(root, "project-model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, now });
  const chat = createAiChatService(root, { userProjectService: projects, now, runtimeDispatcher: async () => ({ status: "accepted" as const }) });
  const owner = principal("ai-selected-project-acl-owner");
  const outsider = principal("ai-selected-project-acl-outsider");
  const foreignProject = await projects.createProject(owner, { name: "비공개 프로젝트", objective: "다른 사용자에게 노출하지 않습니다.", purpose: "rapid-prototype", teamMode: "solo" });
  const conversation = await chat.createConversation(outsider);

  await assert.rejects(() => chat.sendMessage(outsider, conversation.id, "다른 사용자의 프로젝트를 읽어줘", { projectId: foreignProject.id }), /project context/i);
  assert.equal((await chat.getConversation(outsider, conversation.id))?.messages.length, 0);
});

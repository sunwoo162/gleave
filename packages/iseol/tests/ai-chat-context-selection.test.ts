import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createAiChatService } from "../src/ai-chat/service.js";
import { createSettingsService } from "../src/settings/service.js";

const principal = (userId: string): Principal => ({ userId, sessionId: `${userId}-session`, roles: ["user"] });

test("AI Chat persists a user-selected context scope and sends only the selected private sections", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-context-selection-"));
  const now = () => "2026-09-27T12:00:00.000Z";
  const settings = createSettingsService(root, { now });
  const owner = principal("ai-context-selection-owner");
  await settings.updateSettings(owner, { aiAccess: { memory: true, learningHistory: true, projectFiles: true, activityTimeline: true, teamDocs: true } });
  const captured: Array<{ memories: number; learning: boolean; projects: boolean; activity: boolean; teamDocs: boolean }> = [];
  const chat = createAiChatService(root, {
    settingsService: settings,
    memoryService: {
      appendPrivateMemory: async () => ({ version: 1, id: "memory-1", userId: owner.userId, kind: "chat", content: "private", visibility: "private", createdAt: now(), updatedAt: now() }),
      listPrivateMemories: async () => [{ version: 1, id: "memory-1", userId: owner.userId, kind: "chat", content: "private", visibility: "private", createdAt: now(), updatedAt: now() }],
      listSharedMemories: async () => [],
      updatePrivateMemory: async () => null,
      updatePrivateMemorySharing: async () => null,
      deletePrivateMemory: async () => false,
    },
    now,
    runtimeDispatcher: async (request) => {
      captured.push({ memories: request.context.memories.length, learning: Boolean(request.context.learning), projects: Boolean(request.context.projects), activity: Boolean(request.context.activityTimeline), teamDocs: Boolean(request.context.teamDocs) });
      return { status: "accepted", blocker: "test dispatcher does not complete" };
    },
  });
  const conversation = await chat.createConversation(owner);
  const contextSelection = { memory: false, projectFiles: false, learningHistory: false, activityTimeline: false, teamDocs: false } as const;

  const result = await chat.sendMessage(owner, conversation.id, "선택한 맥락만 사용해줘", { contextSelection });

  assert.equal(result.runtimeStatus, "waiting_runtime");
  assert.deepEqual(captured, [{ memories: 0, learning: false, projects: false, activity: false, teamDocs: false }]);
  assert.deepEqual(result.conversation.messages[0]?.contextSelection, contextSelection);
  const restarted = createAiChatService(root, { settingsService: settings, now });
  assert.deepEqual((await restarted.getConversation(owner, conversation.id))?.messages[0]?.contextSelection, contextSelection);
});

test("AI Chat rejects a selected project when project context is disabled for that message", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-context-selection-project-"));
  const now = () => "2026-09-27T12:00:00.000Z";
  const settings = createSettingsService(root, { now });
  const owner = principal("ai-context-selection-project-owner");
  const chat = createAiChatService(root, { settingsService: settings, now });
  const conversation = await chat.createConversation(owner);

  await assert.rejects(() => chat.sendMessage(owner, conversation.id, "프로젝트 없이 보내야 함", { projectId: "project-not-used", contextSelection: { memory: true, projectFiles: false, learningHistory: true, activityTimeline: true, teamDocs: false } }), /project context/i);
  assert.equal((await chat.getConversation(owner, conversation.id))?.messages.length, 0);
});

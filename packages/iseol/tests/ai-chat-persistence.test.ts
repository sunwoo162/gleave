import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createMemoryService } from "../src/memory/service.js";
import { createAiChatService } from "../src/ai-chat/service.js";
import { withDurableAiChatConversationLock } from "../src/ai-chat/conversation-lock.js";
import { listConversations, loadConversation, saveConversation, saveConversationUnlocked } from "../src/ai-chat/store.js";

const principal = (userId: string): Principal => ({ userId, sessionId: `${userId}-session`, roles: ["user"] });
test("AI conversations and waiting Runtime messages persist per user and append private memory", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-"));
  const memory = createMemoryService(root, { now: () => "2026-09-26T12:00:00.000Z" });
  const chat = createAiChatService(root, { memoryService: memory, now: () => "2026-09-26T12:00:00.000Z" });
  const a = principal("ai-chat-a"); const b = principal("ai-chat-b");
  const conversation = await chat.createConversation(a, "학습 대화");
  const sent = await chat.sendMessage(a, conversation.id, "TypeScript 제네릭을 예제로 설명해줘");
  assert.equal(sent.runtimeStatus, "waiting_runtime");
  assert.equal(sent.conversation.messages[0].status, "waiting_runtime");
  const restarted = createAiChatService(root, { memoryService: memory, now: () => "2026-09-26T12:00:00.000Z" });
  assert.equal((await restarted.getConversation(a, conversation.id))?.messages.length, 1);
  assert.equal((await memory.listPrivateMemories(a, {})).length, 1);
  assert.equal((await restarted.getConversation(b, conversation.id)), null);
});

test("AI conversation mutations across service instances preserve both messages", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-cross-service-mutation-"));
  const owner = principal("ai-chat-cross-service-owner");
  const firstService = createAiChatService(root, { now: () => "2026-09-28T12:00:00.000Z" });
  const secondService = createAiChatService(root, { now: () => "2026-09-28T12:00:00.000Z" });
  const conversation = await firstService.createConversation(owner, "교차 서비스 대화");

  await Promise.all([
    firstService.sendMessage(owner, conversation.id, "첫 번째 서비스 메시지"),
    secondService.sendMessage(owner, conversation.id, "두 번째 서비스 메시지"),
  ]);

  const persisted = await createAiChatService(root).getConversation(owner, conversation.id);
  assert.deepEqual(persisted?.messages.map((message) => message.content).sort(), ["두 번째 서비스 메시지", "첫 번째 서비스 메시지"].sort());
});

test("AI conversation reads wait for the durable conversation lock before projecting state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-read-lock-"));
  const owner = principal("ai-chat-read-owner");
  const chat = createAiChatService(root, { now: () => "2026-09-29T12:00:00.000Z" });
  const conversation = await chat.createConversation(owner, "기존 제목");
  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableAiChatConversationLock(root, owner.userId, conversation.id, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let settled = false;
  const read = chat.getConversation(owner, conversation.id).then((result) => { settled = true; return result; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  const updated = { ...conversation, title: "잠금 해제 후 제목", updatedAt: "2026-09-29T12:00:01.000Z" };
  await saveConversationUnlocked(root, updated);
  releaseHolder();
  await lockHeld;
  assert.equal((await read)?.title, "잠금 해제 후 제목");
});

test("AI conversation lists wait for each durable conversation lock before projecting state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-list-read-lock-"));
  const owner = principal("ai-chat-list-read-owner");
  const chat = createAiChatService(root, { now: () => "2026-09-29T12:00:00.000Z" });
  const conversation = await chat.createConversation(owner, "기존 목록 제목");
  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableAiChatConversationLock(root, owner.userId, conversation.id, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let settled = false;
  const read = chat.listConversations(owner).then((result) => { settled = true; return result; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  const updated = { ...conversation, title: "잠금 해제 후 목록 제목", updatedAt: "2026-09-29T12:00:01.000Z" };
  await saveConversationUnlocked(root, updated);
  releaseHolder();
  await lockHeld;
  assert.equal((await read)[0]?.title, "잠금 해제 후 목록 제목");
});

test("public AI conversation store reads and writes wait for the shared conversation lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-store-lock-"));
  const owner = principal("ai-chat-store-lock-owner");
  const chat = createAiChatService(root, { now: () => "2026-09-29T12:00:00.000Z" });
  const conversation = await chat.createConversation(owner, "기존 제목");
  const updated = { ...conversation, title: "잠금 해제 후 제목", updatedAt: "2026-09-29T12:00:01.000Z" };
  const holdConversationLock = async () => {
    let release!: () => void;
    let acquired!: () => void;
    const acquiredPromise = new Promise<void>((resolve) => { acquired = resolve; });
    const holder = withDurableAiChatConversationLock(root, owner.userId, conversation.id, async () => {
      acquired();
      await new Promise<void>((resolve) => { release = resolve; });
    }, { waitForMs: 0 });
    await acquiredPromise;
    return { holder, release };
  };

  const saveLock = await holdConversationLock();
  let saveSettled = false;
  const pendingSave = saveConversation(root, updated).then(() => { saveSettled = true; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  saveLock.release();
  await saveLock.holder;
  await pendingSave;

  const loadLock = await holdConversationLock();
  let loadSettled = false;
  const pendingLoad = loadConversation(root, owner.userId, conversation.id).then((value) => {
    loadSettled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(loadSettled, false);
  loadLock.release();
  await loadLock.holder;
  assert.equal((await pendingLoad)?.title, "잠금 해제 후 제목");

  const listLock = await holdConversationLock();
  let listSettled = false;
  const pendingList = listConversations(root, owner.userId).then((value) => {
    listSettled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(listSettled, false);
  listLock.release();
  await listLock.holder;
  assert.equal((await pendingList)[0]?.title, "잠금 해제 후 제목");
});

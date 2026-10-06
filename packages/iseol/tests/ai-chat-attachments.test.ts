import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createAiChatService } from "../src/ai-chat/service.js";

const principal = (userId: string): Principal => ({ userId, sessionId: `${userId}-session`, roles: ["user"] });

test("AI Chat persists owner-bound text attachments and passes them only to the injected local Runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-attachments-"));
  const captured: Array<{ userId: string; attachments: Array<{ name: string; mimeType: string; size: number; content: string }> }> = [];
  const chat = createAiChatService(root, {
    now: () => "2026-09-27T15:00:00.000Z",
    runtimeDispatcher: async (request) => {
      captured.push({ userId: request.principal.userId, attachments: request.attachments ?? [] });
      return { status: "accepted", blocker: "isolated Runtime waits for this test" };
    },
  });
  const owner = principal("attachment-owner");
  const outsider = principal("attachment-outsider");
  const conversation = await chat.createConversation(owner, "첨부 맥락");

  const sent = await chat.sendMessage(owner, conversation.id, "이 학습 메모의 핵심을 정리해줘", {
    attachments: [{ name: "../typescript-notes.md", mimeType: "text/markdown", content: "# 제네릭\n\n타입 매개변수로 재사용성을 높입니다." }],
  } as never);

  assert.equal(sent.runtimeStatus, "waiting_runtime");
  const message = sent.conversation.messages[0];
  assert.equal(message.attachments?.length, 1);
  assert.deepEqual(message.attachments?.[0] && {
    name: message.attachments[0].name,
    mimeType: message.attachments[0].mimeType,
    size: message.attachments[0].size,
    content: message.attachments[0].content,
  }, {
    name: "typescript-notes.md",
    mimeType: "text/markdown",
    size: Buffer.byteLength("# 제네릭\n\n타입 매개변수로 재사용성을 높입니다.", "utf8"),
    content: "# 제네릭\n\n타입 매개변수로 재사용성을 높입니다.",
  });
  assert.deepEqual(captured, [{
    userId: owner.userId,
    attachments: [message.attachments![0]],
  }]);

  const restarted = createAiChatService(root, { now: () => "2026-09-27T15:00:01.000Z" });
  assert.equal((await restarted.getConversation(owner, conversation.id))?.messages[0]?.attachments?.[0]?.content, "# 제네릭\n\n타입 매개변수로 재사용성을 높입니다.");
  assert.equal(await restarted.getConversation(outsider, conversation.id), null);
});

test("AI Chat rejects binary, empty, oversized, and excessive attachment input before persisting a message", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-attachment-validation-"));
  const chat = createAiChatService(root, { now: () => "2026-09-27T15:00:00.000Z" });
  const owner = principal("attachment-validation-owner");
  const conversation = await chat.createConversation(owner);
  const send = (attachments: unknown) => chat.sendMessage(owner, conversation.id, "첨부 검증", { attachments } as never);

  await assert.rejects(() => send([{ name: "secret.exe", mimeType: "application/octet-stream", content: "MZ" }]), /text files/i);
  await assert.rejects(() => send([{ name: "empty.md", mimeType: "text/markdown", content: "" }]), /content/i);
  await assert.rejects(() => send([{ name: "large.txt", mimeType: "text/plain", content: "x".repeat(25 * 1024) }]), /too large/i);
  await assert.rejects(() => send(Array.from({ length: 4 }, (_, index) => ({ name: `note-${index}.md`, mimeType: "text/markdown", content: "note" }))), /attachments/i);
  assert.equal((await chat.getConversation(owner, conversation.id))?.messages.length, 0);
});

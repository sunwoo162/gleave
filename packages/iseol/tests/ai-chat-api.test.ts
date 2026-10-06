import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createMemoryService } from "../src/memory/service.js";
import { createAiChatService } from "../src/ai-chat/service.js";
import type { AiChatService } from "../src/ai-chat/contracts.js";
import { routeAiChatRequest } from "../src/ai-chat/router.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("AI chat API redacts credential-shaped service errors without changing not-found status", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-error-redaction-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => "2026-09-26T12:00:00.000Z" });
  const user = await users.createUser({ id: "ai-chat-error-user", email: "ai-chat-error@example.com", displayName: "AI Chat Error", timezone: "Asia/Seoul" });
  const session = await users.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const failingChat = {
    listConversations: async () => { throw new Error("AI chat not found token%ZZ=ai-chat-secret"); },
  } as unknown as AiChatService;

  const result = await routeAiChatRequest({ method: "GET", path: "/api/user/ai-chat/conversations", headers: { authorization: `Bearer ${session.token}` } }, { platformUserService: users, aiChatService: failingChat });

  assert.equal(result.status, 404);
  const message = (result.body as { error: string }).error;
  assert.equal(message.includes("ai-chat-secret"), false);
  assert.match(message, /\[redacted\]/i);
});

test("AI chat API keeps conversations private and reports Runtime waiting honestly", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-api-")); const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => "2026-09-26T12:00:00.000Z" });
  const user = await users.createUser({ id: "ai-chat-api-user", email: "ai-chat-api@example.com", displayName: "AI Chat API", timezone: "Asia/Seoul" });
  const session = await users.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "control", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"), userService: users, memoryService: createMemoryService(platformRoot), aiChatService: createAiChatService(platformRoot, { memoryService: createMemoryService(platformRoot), now: () => "2026-09-26T12:00:00.000Z" }) });
  const address = server.address() as AddressInfo; const base = `http://127.0.0.1:${address.port}/api/user/ai-chat/conversations`; const auth = { authorization: `Bearer ${session.token}`, "content-type": "application/json" };
  try {
    assert.equal((await fetch(base)).status, 401);
    const createdResponse = await fetch(base, { method: "POST", headers: auth, body: JSON.stringify({ title: "API 대화" }) }); assert.equal(createdResponse.status, 201);
    const conversation = (await createdResponse.json() as { conversation: { id: string } }).conversation;
    const sentResponse = await fetch(`${base}/${conversation.id}/messages`, { method: "POST", headers: auth, body: JSON.stringify({ content: "Runtime 연결 상태를 알려줘" }) }); assert.equal(sentResponse.status, 201);
    const sent = await sentResponse.json() as { runtimeStatus: string; conversation: { messages: Array<{ status: string }> } };
    assert.equal(sent.runtimeStatus, "waiting_runtime"); assert.equal(sent.conversation.messages[0].status, "waiting_runtime");
  } finally { await server.closeForShutdown(); }
});

test("AI chat API persists bounded text attachments and rejects binary input without appending a message", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-attachment-api-")); const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => "2026-09-27T15:30:00.000Z" });
  const user = await users.createUser({ id: "ai-chat-attachment-api-user", email: "ai-chat-attachment-api@example.com", displayName: "AI Chat Attachment API", timezone: "Asia/Seoul" });
  const session = await users.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-28T15:30:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "control", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"), userService: users, aiChatService: createAiChatService(platformRoot, { now: () => "2026-09-27T15:30:00.000Z" }) });
  const address = server.address() as AddressInfo; const base = `http://127.0.0.1:${address.port}/api/user/ai-chat/conversations`; const auth = { authorization: `Bearer ${session.token}`, "content-type": "application/json" };
  try {
    const createdResponse = await fetch(base, { method: "POST", headers: auth, body: JSON.stringify({ title: "첨부 API 대화" }) });
    const conversation = (await createdResponse.json() as { conversation: { id: string } }).conversation;
    const attached = await fetch(`${base}/${conversation.id}/messages`, { method: "POST", headers: auth, body: JSON.stringify({ content: "이 파일을 읽어줘", attachments: [{ name: "notes.md", mimeType: "text/markdown", content: "# 개인 메모" }] }) });
    assert.equal(attached.status, 201);
    const attachedBody = await attached.json() as { conversation: { messages: Array<{ attachments?: Array<{ name: string; content: string }> }> } };
    assert.deepEqual(attachedBody.conversation.messages[0]?.attachments?.map((item) => ({ name: item.name, content: item.content })), [{ name: "notes.md", content: "# 개인 메모" }]);

    const rejected = await fetch(`${base}/${conversation.id}/messages`, { method: "POST", headers: auth, body: JSON.stringify({ content: "실행 파일", attachments: [{ name: "run.exe", mimeType: "application/octet-stream", content: "MZ" }] }) });
    assert.equal(rejected.status, 400);
    const conversationAfterReject = await fetch(`${base}/${conversation.id}`, { headers: { authorization: `Bearer ${session.token}` } });
    const afterReject = await conversationAfterReject.json() as { conversation: { messages: unknown[] } };
    assert.equal(afterReject.conversation.messages.length, 1);
  } finally { await server.closeForShutdown(); }
});

test("AI chat routes reject malformed ids and raw backslash normalization before mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-chat-router-paths-")); const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => "2026-09-28T15:30:00.000Z" });
  const user = await users.createUser({ id: "ai-chat-router-user", email: "ai-chat-router@example.com", displayName: "AI Chat Router", timezone: "Asia/Seoul" });
  const session = await users.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-29T15:30:00.000Z" });
  const chat = createAiChatService(platformRoot, { now: () => "2026-09-28T15:30:00.000Z" });
  const conversation = await chat.createConversation({ userId: user.id, sessionId: session.id, roles: ["user"] }, "경로 경계 테스트");
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "control", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"), userService: users, aiChatService: chat });
  const address = server.address() as AddressInfo; const base = `http://127.0.0.1:${address.port}/api/user/ai-chat/conversations`; const headers = { authorization: `Bearer ${session.token}`, "content-type": "application/json" };
  try {
    const malformedConversation = await fetch(`${base}/%E0%A4%A`, { headers });
    assert.equal(malformedConversation.status, 404);
    const malformedPlanMessage = await fetch(`${base}/${conversation.id}/execution-plans/%E0%A4%A/approve`, { method: "POST", headers, body: "{}" });
    assert.equal(malformedPlanMessage.status, 404);
    const queryConversation = await fetch(`${base}/${conversation.id}?next=%2F`, { headers });
    assert.equal(queryConversation.status, 200);
    const queryMessage = await fetch(`${base}/${conversation.id}/messages?next=%2F`, { method: "POST", headers, body: JSON.stringify({ content: "query string이 붙은 메시지" }) });
    assert.equal(queryMessage.status, 201);
    const rawBody = JSON.stringify({ content: "서버 우회 메시지" });
    const rawServerStatus = await new Promise<number>((resolve, reject) => {
      const rawRequest = httpRequest({ hostname: "127.0.0.1", port: address.port, method: "POST", path: `/api/user\\ai-chat/conversations/${conversation.id}/messages`, headers: { ...headers, "content-length": String(Buffer.byteLength(rawBody)) } }, (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      });
      rawRequest.on("error", reject);
      rawRequest.end(rawBody);
    });
    assert.equal(rawServerStatus, 404);
    const unchanged = await chat.getConversation({ userId: user.id, sessionId: session.id, roles: ["user"] }, conversation.id);
    assert.equal(unchanged?.messages.length, 1);
  } finally { await server.closeForShutdown(); }
});

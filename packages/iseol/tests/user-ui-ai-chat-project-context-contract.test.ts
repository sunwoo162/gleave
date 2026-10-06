import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const pageSource = resolve(process.cwd(), "user-ui/src/pages/AIChat.tsx");
const apiSource = resolve(process.cwd(), "user-ui/src/api/userApi.ts");

test("AI Chat exposes an owner-scoped project context selector", async () => {
  const [page, api] = await Promise.all([readFile(pageSource, "utf8"), readFile(apiSource, "utf8")]);

  assert.match(api, /listUserProjects/);
  assert.match(api, /sendAiChatMessage\(conversationId: string, content: string, options\?/);
  assert.match(page, /listUserProjects/);
  assert.match(page, /AI 대화 프로젝트 연결/);
  assert.match(page, /selectedProjectId/);
  assert.match(page, /projectIdForMessage/);
  assert.match(page, /제한된 프로젝트 메타데이터/);
  assert.match(page, /프로젝트 맥락 연결됨/);
});

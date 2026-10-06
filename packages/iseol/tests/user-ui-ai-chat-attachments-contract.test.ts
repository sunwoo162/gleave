import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("AI Chat exposes a real bounded text-file attachment flow without granting execution rights", async () => {
  const [api, page, browser] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "pages", "AIChat.tsx"), "utf8"),
    readFile(join(process.cwd(), "scripts", "iseol-user-ui-e2e.ts"), "utf8"),
  ]);
  assert.match(api, /AiChatAttachmentInput/);
  assert.match(api, /attachments\?: AiChatAttachmentInput\[\]/);
  assert.match(page, /type="file"/);
  assert.match(page, /multiple/);
  assert.match(page, /setInputAttachments/);
  assert.match(page, /sendAiChatMessage\(conversationId, content/);
  assert.match(page, /첨부 파일/);
  assert.match(page, /텍스트 파일/);
  assert.match(page, /파일 내용이나 실행 권한은 자동으로 공유하지 않습니다/);
  assert.match(browser, /setInputFiles/);
  assert.match(browser, /browser-learning-notes\.md/);
  assert.match(browser, /aiChatAttachmentsUi/);
});

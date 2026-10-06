import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("AI Chat UI uses the durable private conversation boundary and shows Runtime waiting honestly", async () => {
  const [source, navigation, browserJourney] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "pages", "AIChat.tsx"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "components", "Navigation.tsx"), "utf8"),
    readFile(join(process.cwd(), "scripts", "iseol-user-ui-e2e.ts"), "utf8"),
  ]);
  assert.match(source, /listAiChatConversations/);
  assert.match(source, /createAiChatConversation/);
  assert.match(source, /getAiChatConversation/);
  assert.match(source, /sendAiChatMessage/);
  assert.match(source, /exportConversation/);
  assert.match(source, /대화 내보내기/);
  assert.match(source, /new Blob/);
  assert.match(source, /iseol-ai-conversation-/);
  assert.match(source, /conversation\.id\.replace\(\/\^conversation-\//);
  assert.match(source, /getRuntimeStatus/);
  assert.match(source, /runtimeStatus/);
  assert.match(source, /runtimeStatus\?\.aiChat === 'ready'/);
  assert.match(source, /AI 이설에게 메시지 보내기/);
  assert.match(source, /개인 AI Runtime 연결을 기다리고 있습니다/);
  assert.match(source, /사용자 전용 대화/);
  assert.match(source, /message\.status === 'waiting_runtime'/);
  assert.match(source, /runtimeReady/);
  assert.match(source, /AICompanionAsset size=\{100\} alt="ISEOL 개인 AI 동반자"/);
  assert.match(source, /Runtime 연결됨/);
  assert.doesNotMatch(source, /답변을 생성했습니다/);
  assert.match(navigation, /getRuntimeStatus/);
  assert.match(navigation, /aiChatStatus/);
  assert.match(navigation, /AI Runtime 준비/);
  assert.match(navigation, /AI Runtime 연결 대기/);
  assert.match(browserJourney, /대화 내보내기/);
  assert.match(browserJourney, /waitForEvent\("download"\)/);
});

test("AI Chat keeps project context selection disabled when the user permission is off", async () => {
  const [page, api] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "pages", "AIChat.tsx"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8"),
  ]);
  assert.match(api, /export async function getSettings\(\)/);
  assert.match(page, /getSettings/);
  assert.match(page, /projectFiles/);
  assert.match(page, /프로젝트 맥락 권한 꺼짐/);
  assert.match(page, /disabled=\{!conversation \|\| busy \|\| !projectContextAllowed\}/);
});

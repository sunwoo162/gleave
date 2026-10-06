import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("AI Chat exposes truthful execution-plan approval controls without starting execution", async () => {
  const [page, api, browserJourney] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "pages", "AIChat.tsx"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8"),
    readFile(join(process.cwd(), "scripts", "iseol-user-ui-e2e.ts"), "utf8"),
  ]);
  assert.match(page, /executionPlan/);
  assert.match(page, /실행 계획 승인/);
  assert.match(page, /실행 계획 거절/);
  assert.match(page, /프로젝트 작업 요청 만들기/);
  assert.match(page, /프로젝트 작업실에서 실행 승인 검토/);
  assert.match(page, /\/projects\/\$\{encodeURIComponent\(message\.projectId\)\}/);
  assert.match(page, /실행은 시작되지 않았습니다/);
  assert.match(page, /별도 실행|실행되지 않습니다/);
  assert.match(page, /useRef/);
  assert.match(page, /loadGeneration/);
  assert.match(page, /generation !== loadGeneration\.current/);
  assert.match(page, /conversation\?\.id/);
  assert.match(page, /conversationMutationInFlight/);
  assert.match(api, /approveAiChatExecutionPlan/);
  assert.match(api, /rejectAiChatExecutionPlan/);
  assert.match(api, /createAiChatExecutionPlanWorkRequest/);
  assert.match(browserJourney, /execution-plan|실행 계획 승인/);
  assert.doesNotMatch(page, /startUserProjectRun/);
});

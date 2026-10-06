import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("NPC user UI exposes an editable per-user 이설 profile", async () => {
  const [api, settings, chat, navigation, landing] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "pages", "Settings.tsx"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "pages", "AIChat.tsx"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "components", "Navigation.tsx"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "pages", "Landing.tsx"), "utf8"),
  ]);

  assert.match(api, /export type AiAgentProfile/);
  assert.match(api, /export async function getAiAgentProfile/);
  assert.match(api, /export async function updateAiAgentProfile/);
  assert.match(settings, /AI 프로필/);
  assert.match(settings, /에이전트 이름/);
  assert.match(settings, /프로필 이미지 URL/);
  assert.match(settings, /개인 AI 프로필을 저장했습니다/);
  assert.match(chat, /getAiAgentProfile/);
  assert.match(chat, /agentProfile\?\.name/);
  assert.match(navigation, />NPC</);
  assert.match(landing, />NPC</);
});

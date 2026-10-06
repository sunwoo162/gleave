import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("approved Teams UI exposes membership-scoped team chat", async () => {
  const [api, page] = await Promise.all([
    readFile(new URL("../user-ui/src/api/userApi.ts", import.meta.url), "utf8"),
    readFile(new URL("../user-ui/src/pages/Teams.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(api, /export async function listTeamMessages/);
  assert.match(api, /export async function sendTeamMessage/);
  assert.match(api, /\/api\/user\/teams\/\$\{encodeURIComponent\(teamId\)\}\/messages/);
  assert.match(page, /팀 채팅/);
  assert.match(page, /팀 메시지 입력/);
  assert.match(page, /listTeamMessages/);
  assert.match(page, /sendTeamMessage/);
});

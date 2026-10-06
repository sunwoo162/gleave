import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("friends UI is connected to the durable private friendship and message API", async () => {
  const [api, page] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "pages", "Friends.tsx"), "utf8"),
  ]);
  assert.match(api, /listProfiles/);
  assert.match(api, /createFriendRequest/);
  assert.match(api, /respondToFriendRequest/);
  assert.match(api, /listDirectMessages/);
  assert.match(api, /sendDirectMessage/);
  assert.match(page, /친구 추가/);
  assert.match(page, /친구 요청을 처리하지 못했습니다/);
  assert.match(page, /메시지를 저장했습니다/);
  assert.match(page, /listDirectMessages\(selected\.userId\)/);
  assert.match(page, /메시지를 보내지 못했습니다/);
});

test("friends UI links searchable and selected users to their owner-scoped public profile", async () => {
  const page = await readFile(join(process.cwd(), "user-ui", "src", "pages", "Friends.tsx"), "utf8");
  assert.match(page, /to=\{`\/profile\?userId=\$\{encodeURIComponent\(profile\.userId\)\}`\}/);
  assert.match(page, /to=\{`\/profile\?userId=\$\{encodeURIComponent\(selected\.userId\)\}`\}/);
  assert.match(page, /프로필 보기/);
});

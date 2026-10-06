import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Friends surface exposes durable block and report controls", async () => {
  const api = await readFile(new URL("../user-ui/src/api/userApi.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../user-ui/src/pages/Friends.tsx", import.meta.url), "utf8");
  assert.match(api, /blockUser/);
  assert.match(api, /unblockUser/);
  assert.match(api, /reportUser/);
  assert.match(page, /차단/);
  assert.match(page, /신고/);
  assert.match(page, /차단된 사용자는 친구 검색과 메시지에서 제외됩니다/);
});

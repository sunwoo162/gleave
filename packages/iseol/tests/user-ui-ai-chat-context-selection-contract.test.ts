import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("AI Chat exposes an honest editable context scope without execution controls", async () => {
  const [page, api] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "pages", "AIChat.tsx"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8"),
  ]);
  assert.match(page, /맥락 편집/);
  assert.match(page, /contextSelection/);
  assert.match(page, /개인 기억/);
  assert.match(page, /학습 기록/);
  assert.match(page, /활동 타임라인/);
  assert.match(page, /팀 공유 문서/);
  assert.match(page, /파일 변경|실행 권한/);
  assert.match(api, /contextSelection/);
});

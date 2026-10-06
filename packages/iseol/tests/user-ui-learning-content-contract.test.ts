import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Learning UI exposes the durable today-content request boundary", async () => {
  const page = await readFile(new URL("../user-ui/src/pages/Learning.tsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../user-ui/src/api/userApi.ts", import.meta.url), "utf8");
  assert.match(page, /오늘 수업 콘텐츠 준비 요청/);
  assert.match(page, /로컬 Runtime 대기/);
  assert.match(page, /검증된 오늘 수업/);
  assert.match(api, /requestLearningSessionContent/);
  assert.match(page, /const \{ sessions: refreshedSessions \} = await listLearningSessions\(\)/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Learning UI exposes the goal-to-day-session activation boundary", async () => {
  const page = await readFile(new URL("../user-ui/src/pages/Learning.tsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../user-ui/src/api/userApi.ts", import.meta.url), "utf8");
  assert.match(page, /오늘의 학습 세션 시작/);
  assert.match(page, /AI 콘텐츠 요청 전/);
  assert.match(api, /startLearningGoalSession/);
});

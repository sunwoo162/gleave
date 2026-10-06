import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Learning UI renders evidence-based progress states without a fabricated percentage", async () => {
  const page = await readFile(new URL("../user-ui/src/pages/Learning.tsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../user-ui/src/api/userApi.ts", import.meta.url), "utf8");
  assert.match(page, /진도 근거/);
  assert.match(page, /오늘 상태/);
  assert.match(page, /예정/);
  assert.match(page, /실제/);
  assert.match(page, /평가 대기/);
  assert.match(page, /코딩 실습/);
  assert.match(page, /숙달률을 임의 계산하지 않습니다/);
  assert.match(api, /getLearningGoalProgress/);
  assert.match(api, /getLearningGoalToday/);
  assert.match(api, /LearningProgress/);
  assert.doesNotMatch(page, /숙달률\s*[:：]/);
});

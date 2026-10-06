import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Learning UI exposes self-report and pending answer evaluation states", async () => {
  const page = await readFile(new URL("../user-ui/src/pages/Learning.tsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../user-ui/src/api/userApi.ts", import.meta.url), "utf8");
  assert.match(page, /이해했어요 기록/);
  assert.match(page, /숙달 증거가 아님/);
  assert.match(page, /평가 대기/);
  assert.match(page, /학습 도움 요청/);
  assert.match(page, /로컬 Runtime 응답|로컬 Runtime 대기/);
  assert.match(api, /recordLearningSessionAction/);
  assert.match(api, /listLearningSessionActions/);
  assert.match(api, /submitLearningAnswer/);
});

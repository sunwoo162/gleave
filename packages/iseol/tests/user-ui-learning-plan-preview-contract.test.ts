import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Learning UI exposes an explicit local-template plan preview action", async () => {
  const page = await readFile(new URL("../user-ui/src/pages/Learning.tsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../user-ui/src/api/userApi.ts", import.meta.url), "utf8");
  assert.match(page, /학습 계획 미리보기/);
  assert.match(page, /local-template/);
  assert.match(page, /preview\.interpretation\.source\.kind/);
  assert.match(page, /학습 계획 재조정/);
  assert.match(page, /재조정안 만들기/);
  assert.match(page, /이 재조정안 수락/);
  assert.match(api, /createLearningPlanPreview/);
  assert.match(api, /local-runtime/);
  assert.match(api, /createLearningPlanAdjustment/);
  assert.match(api, /acceptLearningPlanAdjustment/);
});

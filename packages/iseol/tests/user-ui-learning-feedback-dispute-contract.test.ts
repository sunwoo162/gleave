import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Learning UI exposes an explicit feedback dispute action without hiding the pending boundary", async () => {
  const page = await readFile(new URL("../user-ui/src/pages/Learning.tsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../user-ui/src/api/userApi.ts", import.meta.url), "utf8");
  assert.match(page, /평가 이의 제기 사유/);
  assert.match(page, /평가 이의 제기 저장/);
  assert.match(page, /재평가 대기/);
  assert.match(api, /disputeLearningFeedback/);
  assert.match(api, /LearningFeedbackDispute/);
});

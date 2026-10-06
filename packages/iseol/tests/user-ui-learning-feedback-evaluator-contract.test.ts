import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Learning UI and API expose structured evaluator feedback without claiming verified mastery", async () => {
  const page = await readFile(new URL("../user-ui/src/pages/Learning.tsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../user-ui/src/api/userApi.ts", import.meta.url), "utf8");
  assert.match(api, /LearningFeedbackEvaluation/);
  assert.match(api, /criteriaResults/);
  assert.match(api, /tentative/);
  assert.match(page, /평가 결과/);
  assert.match(page, /검증되지 않았습니다|검증 대기/);
  assert.match(page, /listLearningAnswers/);
  assert.match(page, /getLearningAnswerFeedback/);
  assert.match(api, /listLearningAnswers/);
});

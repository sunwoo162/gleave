import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd(), "user-ui", "src");

test("learning UI exposes the approved three-input goal draft flow", async () => {
  const [api, page] = await Promise.all([
    readFile(join(root, "api", "userApi.ts"), "utf8"),
    readFile(join(root, "pages", "Learning.tsx"), "utf8"),
  ]);
  assert.match(api, /LearningGoal/);
  assert.match(api, /\/api\/user\/learning\/goals/);
  assert.match(page, /createLearningGoal/);
  assert.match(page, /subjectText/);
  assert.match(page, /dailyMinutes/);
  assert.match(page, /학습 목표 초안/);
  assert.doesNotMatch(page, /fake|demo|todo-app/i);
});

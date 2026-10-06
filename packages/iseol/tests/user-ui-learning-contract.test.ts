import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd(), "user-ui", "src");

test("learning UI restores a durable active session after reconnect", async () => {
  const [api, page] = await Promise.all([
    readFile(join(root, "api", "userApi.ts"), "utf8"),
    readFile(join(root, "pages", "Learning.tsx"), "utf8"),
  ]);
  assert.match(api, /listLearningSessions/);
  assert.match(api, /\/api\/user\/learning\/sessions/);
  assert.match(page, /listLearningSessions/);
  assert.match(page, /resumeLearningSession/);
  assert.match(api, /completeLearningSession/);
  assert.match(api, /expectedRevision/);
  assert.match(page, /session\.revision/);
  assert.match(page, /학습 세션 완료/);
  assert.match(page, /listStudyAttempts/);
  assert.match(page, /활성 세션/);
  assert.doesNotMatch(page, /demo|fake|todo-app/i);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("learning UI exposes durable coding exercise and attempt states", async () => {
  const [api, page] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "pages", "Learning.tsx"), "utf8"),
  ]);
  assert.match(api, /createCodingExercise/);
  assert.match(api, /submitCodingAttempt/);
  assert.match(api, /listCodingAttempts/);
  assert.match(api, /coding-exercises/);
  assert.match(page, /코딩 테스트/);
  assert.match(page, /환경 필요/);
  assert.match(page, /구문 확인됨/);
  assert.match(page, /구문 오류/);
  assert.match(page, /clientRequestId/);
  assert.match(page, /artifactRefs: result\.attempt\.practiceResult\.artifactRefs/);
  assert.doesNotMatch(page, /채점 완료|테스트 통과/);
});

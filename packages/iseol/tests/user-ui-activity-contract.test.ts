import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("activity timeline renders the durable growth snapshot alongside verified evidence", async () => {
  const [api, page] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "pages", "PortfolioScreen.tsx"), "utf8"),
  ]);
  assert.match(api, /getGrowth/);
  assert.match(api, /listActivityEvents/);
  assert.match(page, /getGrowth/);
  assert.match(page, /listActivityEvents/);
  assert.match(page, /UserActivityEvent/);
  assert.match(page, /전체 활동 원장/);
  assert.match(page, /event\.eventType/);
  assert.match(page, /코딩 연습 답안 제출/);
  assert.match(page, /GrowthSnapshot/);
  assert.match(page, /growth\.level/);
  assert.match(page, /growth\.actorBreakdown/);
  assert.match(page, /growth\.stats/);
  assert.doesNotMatch(page, /프로젝트 3개 완료|연속 학습 7일/);
});

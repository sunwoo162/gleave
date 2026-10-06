import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Learning UI exposes an evidence-separated weekly/final report flow", async () => {
  const [api, page] = await Promise.all([
    readFile(new URL("../user-ui/src/api/userApi.ts", import.meta.url), "utf8"),
    readFile(new URL("../user-ui/src/pages/Learning.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(api, /listLearningReports/);
  assert.match(api, /createLearningReport/);
  assert.match(api, /\/reports/);
  assert.match(page, /학습 주간·최종 보고/);
  assert.match(page, /보고 유형/);
  assert.match(page, /근거 기반 보고서 생성/);
  assert.match(page, /검증된 이해/);
  assert.match(page, /미검증 기록/);
  assert.match(page, /미검증 기록 상세/);
  assert.match(page, /unverifiedOutcomes\.map/);
  assert.match(page, /숙달|역량을 주장하지 않습니다/);
  assert.match(page, /createPortfolioEntry/);
  assert.match(page, /학습 보고서를 포트폴리오 초안/);
});

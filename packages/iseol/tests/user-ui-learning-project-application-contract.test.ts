import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Learning UI exposes an approval-gated project application flow", async () => {
  const [api, page] = await Promise.all([
    readFile(new URL("../user-ui/src/api/userApi.ts", import.meta.url), "utf8"),
    readFile(new URL("../user-ui/src/pages/Learning.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(api, /listLearningProjectApplications/);
  assert.match(api, /createLearningProjectApplication/);
  assert.match(api, /acceptLearningProjectApplication/);
  assert.match(api, /project-proposals/);
  assert.match(page, /학습 내용을 프로젝트에 적용/);
  assert.match(page, /적용 초안 만들기/);
  assert.match(page, /학습 적용 작업 수락/);
  assert.match(page, /실행·배포·push는 별도 승인 전까지 시작되지 않습니다/);
});

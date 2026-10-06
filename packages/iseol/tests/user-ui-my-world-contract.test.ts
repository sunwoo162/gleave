import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const pageSource = resolve(process.cwd(), "user-ui/src/pages/MyWorld.tsx");
const apiSource = resolve(process.cwd(), "user-ui/src/api/userApi.ts");

test("my world uses durable project and learning data instead of placeholder progress", async () => {
  const [page, api] = await Promise.all([readFile(pageSource, "utf8"), readFile(apiSource, "utf8")]);

  assert.match(page, /listUserProjects/);
  assert.match(page, /getUserProject/);
  assert.match(page, /currentProjectView/);
  assert.match(page, /projectRuntimeSummary/);
  assert.match(page, /프로젝트 실행 상태 확인 불가/);
  assert.match(page, /Run 완료/);
  assert.doesNotMatch(page, /currentProject\.status === 'active' \? '활성' : '보관됨'/);
  assert.match(page, /listLearningPlans/);
  assert.match(page, /listDueReviewItems/);
  assert.match(page, /listActivityEvents/);
  assert.match(page, /getRuntimeStatus/);
  assert.match(page, /aiRuntimeStatus/);
  assert.match(page, /개인 AI 준비됨/);
  assert.match(page, /개인 AI 연결 대기/);
  assert.match(page, /개인 AI 상태 확인 중/);
  assert.doesNotMatch(page, /오늘도 함께 해요! 새로운 작업이 기다리고 있어요/);
  assert.match(page, /최근 활동/);
  assert.match(page, /event\.eventType/);
  assert.match(page, /\/activity\?event=\$\{encodeURIComponent\(event\.id\)\}/);
  assert.match(page, /활동 상세 보기/);
  assert.match(page, /Promise\.all\(/);
  assert.match(page, /currentProject\.id/);
  assert.match(page, /role="alert"/);
  assert.match(page, /role="status"/);
  assert.match(page, /projects\.length/);
  assert.match(page, /plans\.length/);
  assert.match(page, /growth\.achievements/);
  assert.match(page, /achievement\.evidenceEventIds/);
  assert.doesNotMatch(page, /todo-app/);
  assert.doesNotMatch(page, /progress: 45/);
  assert.doesNotMatch(page, /progress: 1, total: 1/);
  assert.match(api, /export async function listUserProjects\(\)/);
  assert.match(api, /export async function listLearningPlans\(\)/);
  assert.match(api, /export async function listDueReviewItems\(/);
  assert.match(api, /export async function listActivityEvents\(\)/);
});

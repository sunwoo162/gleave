import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("approved Teams surface exposes study workspace APIs without exposing other users' answers", async () => {
  const api = await readFile(new URL("../user-ui/src/api/userApi.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../user-ui/src/pages/Teams.tsx", import.meta.url), "utf8");
  assert.match(api, /createStudySpace/);
  assert.match(api, /getStudySpace/);
  assert.match(api, /createStudyTask/);
  assert.match(api, /saveStudyTaskSubmission/);
  assert.match(page, /공유 수업/);
  assert.match(page, /팀 과제/);
  assert.match(page, /내 답변/);
  assert.match(page, /개인 답변은 다른 팀원에게 공개되지 않습니다/);
});

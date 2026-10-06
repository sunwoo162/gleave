import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("project UI exposes AI proposal waiting and human approval without autonomous execution", async () => {
  const [api, page] = await Promise.all([readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8"), readFile(join(process.cwd(), "user-ui", "src", "pages", "Projects.tsx"), "utf8")]);
  assert.match(api, /listAiTeamProposals/);
  assert.match(api, /acceptAiTeamProposal/);
  assert.match(page, /AI 팀 협업 제안/);
  assert.match(page, /Runtime이 없으면 대기 상태/);
  assert.match(page, /사람 승인 전에는 Work Request나 실행이 생성되지 않습니다/);
  assert.match(page, /제안 승인/);
});

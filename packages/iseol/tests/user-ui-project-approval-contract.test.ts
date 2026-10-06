import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("project workspace turns the persisted build approval setting into an explicit checkpoint", async () => {
  const [api, page] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "pages", "Projects.tsx"), "utf8"),
  ]);
  assert.match(api, /getSettings/);
  assert.match(api, /aiApproval/);
  assert.match(page, /실행 승인 확인/);
  assert.match(page, /승인하고 실행/);
  assert.match(page, /승인 취소/);
  assert.match(page, /buildRun/);
  assert.match(page, /approved: true/);
  assert.doesNotMatch(page, /실행 성공/);
});

test("isolated browser runner verifies approval before a configured Runtime dispatch", async () => {
  const runner = await readFile(join(process.cwd(), "scripts", "iseol-user-ui-e2e.ts"), "utf8");
  assert.match(runner, /verifyProjectRuntimeApprovalUi/);
  assert.match(runner, /projectRuntimeApprovalUi: \"passed\"/);
});

test("isolated browser runner verifies AI proposal execution stays behind the user approval checkpoint", async () => {
  const runner = await readFile(join(process.cwd(), "scripts", "iseol-user-ui-e2e.ts"), "utf8");
  assert.match(runner, /verifyAiTeamProposalExecutionApprovalUi/);
  assert.match(runner, /aiTeamProposalExecutionApprovalUi: \"passed\"/);
});

import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("project workspace exposes mobile task, AI, and evidence tabs without replacing desktop sections", async () => {
  const source = await readFile("user-ui/src/pages/Projects.tsx", "utf8");

  assert.match(source, /workspaceTab/);
  assert.match(source, /role=["']tablist["']/);
  assert.match(source, /role=["']tab["']/);
  assert.match(source, /data-workspace-tab/);
  assert.match(source, /md:hidden/);
  assert.match(source, /hidden md:block/);
  assert.match(source, /label: ['"]개요['"]/);
  assert.match(source, /label: ['"]작업['"]/);
  assert.match(source, /label: ['"]AI 협업['"]/);
  assert.match(source, /label: ['"]실행·증거['"]/);
  assert.match(source, /ProjectLifecyclePanel/);
  assert.match(source, /AiTeamProposalPanel/);
  assert.match(source, /ProjectHistoryPanel/);
});

test("project task creation exposes bounded dependencies and preserves them in the user API request", async () => {
  const [api, page] = await Promise.all([
    readFile("user-ui/src/api/userApi.ts", "utf8"),
    readFile("user-ui/src/pages/Projects.tsx", "utf8"),
  ]);
  assert.match(api, /idempotencyKey: string; dependencies\?: string\[\]/);
  assert.match(page, /선행 작업/);
  assert.match(page, /selectedDependencies/);
  assert.match(page, /dependencies: selectedDependencies/);
  assert.match(page, /request\.dependencies/);
});

test("project workspace exposes an explicit bounded queue scheduler with an approval checkpoint", async () => {
  const [api, page] = await Promise.all([
    readFile("user-ui/src/api/userApi.ts", "utf8"),
    readFile("user-ui/src/pages/Projects.tsx", "utf8"),
  ]);
  assert.match(api, /scheduleUserProjectRuns/);
  assert.match(page, /ProjectQueueScheduler/);
  assert.match(page, /최대 동시 실행/);
  assert.match(page, /준비된 작업 실행/);
  assert.match(page, /실행 승인 필요/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("isolated browser runner includes a real project Runtime completion journey", async () => {
  const [server, runner] = await Promise.all([
    readFile(join(process.cwd(), "scripts", "iseol-user-ui-isolated-server.ts"), "utf8"),
    readFile(join(process.cwd(), "scripts", "iseol-user-ui-e2e.ts"), "utf8"),
  ]);
  assert.match(server, /ISEOL_BROWSER_PROJECT_RUNTIME/);
  assert.match(server, /superviseHarnessRun/);
  assert.match(runner, /verifyProjectRuntimeExecutionUi/);
  assert.match(runner, /verifyLearningProjectRuntimeIntegrationUi/);
  assert.match(runner, /원 프로젝트 보기/);
  assert.match(runner, /활동 원장 보기/);
  assert.match(runner, /projectRuntimeExecutionUi: "passed"/);
  assert.match(server, /ISEOL_BROWSER_PROJECT_RUNTIME_MODE/);
  assert.match(server, /startDesktopAgentCoreService/);
  assert.match(server, /connectFakeDesktopAgent/);
  assert.match(server, /createProjectWorkspaceExecutor/);
  assert.match(server, /providerExecutor/);
  assert.match(server, /canAccessTeamWithinMembershipLock: \(principal, teamId\) => teamService\.canAccessWithinMembershipLock\(principal, teamId\)/);
  assert.match(runner, /verifyProjectLocalAgentRuntimeUi/);
  assert.match(runner, /파일 열기 package\.json/);
  assert.match(runner, /파일 열기 image\.bin/);
  assert.match(runner, /Binary files cannot be previewed\./);
  assert.match(runner, /iseol-browser-local-agent/);
  assert.match(runner, /projectRuntimeLocalAgentUi: "passed"/);
  assert.match(runner, /learningProjectRuntimeIntegrationUi: "passed"/);
  assert.match(runner, /const LEARNING_PROJECT_RUNTIME_TIMEOUT_MS = 30_000;/);
  assert.match(runner, /elapsed < LEARNING_PROJECT_RUNTIME_TIMEOUT_MS/);
});

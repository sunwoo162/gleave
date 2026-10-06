import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("isolated browser runner includes a private AI Runtime response journey", async () => {
  const [server, runner] = await Promise.all([
    readFile(join(process.cwd(), "scripts", "iseol-user-ui-isolated-server.ts"), "utf8"),
    readFile(join(process.cwd(), "scripts", "iseol-user-ui-e2e.ts"), "utf8"),
  ]);
  assert.match(server, /ISEOL_BROWSER_AI_RUNTIME/);
  assert.match(server, /runtimeDispatcher/);
  assert.match(runner, /verifyAiChatRuntimeResponse/);
  assert.match(runner, /privateAiChatRuntimeResponse: "passed"/);
  assert.match(runner, /AI 대화 프로젝트 연결/);
  assert.match(runner, /AI chat did not persist the selected project context/);
  assert.match(runner, /프로젝트 맥락 권한 꺼짐/);
});

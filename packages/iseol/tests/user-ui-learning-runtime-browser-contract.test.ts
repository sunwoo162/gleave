import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("isolated browser runner includes the owner-bound Learning Runtime journey", async () => {
  const [server, runner] = await Promise.all([
    readFile(join(process.cwd(), "scripts", "iseol-user-ui-isolated-server.ts"), "utf8"),
    readFile(join(process.cwd(), "scripts", "iseol-user-ui-e2e.ts"), "utf8"),
  ]);
  assert.match(server, /ISEOL_BROWSER_LEARNING_RUNTIME/);
  assert.match(server, /LearningContentDispatcher/);
  assert.match(server, /LearningActionDispatcher/);
  assert.match(server, /LearningFeedbackDispatcher/);
  assert.match(runner, /verifyLearningRuntimeResponse/);
  assert.match(runner, /learningRuntimeResponse: "passed"/);
});

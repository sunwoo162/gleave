import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveHarnessPolicy } from "../src/harness/policy-resolver.js";
import type { HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";
import { createWebReasoningExecutor } from "../src/chatgpt-web/web-reasoning-executor.js";
import { createFakeChatGptWebBrowserAdapter } from "../src/chatgpt-web/test-support/fake-browser-adapter.js";
import { appendReasoningTurn } from "../src/chatgpt-web/turn-store.js";

test("later Web reasoning stages reuse verified context from completed prior stages", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-web-cross-stage-"));
  const repo = join(root, "repo");
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(join(repo, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "HARNESS_ENGINEERING.md"), "# Global Harness\n", "utf8");
  await writeFile(join(repo, "docs", "HARNESS_ENGINEERING.md"), "# Project Harness\n", "utf8");
  const policy = await resolveHarnessPolicy({ iseolRoot: root, targetRoot: repo, loadedAt: "2026-09-16T01:00:00.000Z" });
  const run: HarnessRuntimeRunEnvelope = {
    version: 1,
    request: { version: 1, runId: "run-cross-stage", mode: "project-workspace", objective: "Implement the verified plan", targetRoot: repo },
    preflight: { version: 1, runId: "run-cross-stage", status: "ready", policy },
    state: { version: 1, stage: "PLAN", status: "RUNNING", completedStages: ["PREFLIGHT", "CONTEXT", "ANALYZE"], skippedStages: [], updatedAt: "2026-09-16T01:05:00.000Z" },
    evidence: [],
    updatedAt: "2026-09-16T01:05:00.000Z",
  };
  await appendReasoningTurn(root, {
    version: 1,
    turnId: "turn-analyze-complete",
    sessionId: "session-analyze",
    runId: "run-cross-stage",
    stage: "ANALYZE",
    generation: 1,
    promptSha256: "a".repeat(64),
    responseSha256: "b".repeat(64),
    summary: "Repository analysis completed with verified frontend structure.",
    decisions: ["Verified frontend entry is index.html", "Verified styles are in style.css"],
    desktopIntentIds: ["intent-read-index", "intent-read-style"],
    outcome: "stage-complete",
    recordedAt: "2026-09-16T01:04:00.000Z",
  });
  const fake = createFakeChatGptWebBrowserAdapter([
    { version: 1, runId: "run-cross-stage", stage: "PLAN", generation: 1, summary: "Plan complete", decisions: [], intents: [], outcome: "stage-complete" },
  ]);
  const executor = createWebReasoningExecutor({
    workerRoot: root,
    adapter: fake.adapter,
    now: () => "2026-09-16T01:06:00.000Z",
    runDesktopIntent: async () => { throw new Error("Desktop must not run"); },
  });

  assert.equal((await executor.execute(run)).type, "completed");
  assert.equal(fake.submittedPrompts.length, 1);
  const prompt = JSON.parse(fake.submittedPrompts[0]!.body) as any;
  assert.match(JSON.stringify(prompt.desktopEvidence), /reasoning-context/i);
  assert.match(JSON.stringify(prompt.desktopEvidence), /Repository analysis completed/i);
  assert.match(JSON.stringify(prompt.desktopEvidence), /Verified frontend entry is index\.html/i);
  assert.match(JSON.stringify(prompt.desktopEvidence), /Verified styles are in style\.css/i);
});

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveHarnessPolicy } from "../src/harness/policy-resolver.js";
import type { HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";
import { createWebWorkerSession, getActiveWebWorkerSession, loadWebWorkerSession } from "../src/chatgpt-web/session-store.js";
import { recoverWebWorkerSession, assertActiveWebWorkerResult } from "../src/chatgpt-web/recovery.js";
import { createWebReasoningExecutor } from "../src/chatgpt-web/web-reasoning-executor.js";
import { createFakeChatGptWebBrowserAdapter, ChatGptWebSessionLostError } from "../src/chatgpt-web/test-support/fake-browser-adapter.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "iseol-web-recovery-"));
  const repo = join(root, "repo");
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(repo, { recursive: true });
  await writeFile(join(root, "docs", "HARNESS_ENGINEERING.md"), "# Global Harness\n", "utf8");
  const policy = await resolveHarnessPolicy({ iseolRoot: root, targetRoot: repo, loadedAt: "2026-09-08T01:00:00.000Z" });
  const run: HarnessRuntimeRunEnvelope = {
    version: 1,
    request: { version: 1, runId: "run-recovery", mode: "project-workspace", objective: "Recover reasoning", targetRoot: repo },
    preflight: { version: 1, runId: "run-recovery", status: "ready", policy },
    state: { version: 1, stage: "IMPLEMENT", status: "RUNNING", completedStages: [], skippedStages: [], updatedAt: "2026-09-08T01:00:00.000Z" },
    evidence: [], updatedAt: "2026-09-08T01:00:00.000Z",
  };
  return { root, repo, run };
}
test("lost session is replaced by the next generation with a recovery prompt", async () => {
  const { root, run } = await fixture();
  const session = { version: 1 as const, sessionId: "session-old", runId: "run-recovery", stage: "IMPLEMENT" as const, generation: 1, policySha256: run.preflight.policy!.effectiveSha256, status: "ready" as const, resultContract: "patch-frame-v1" as const, createdAt: "2026-09-08T01:00:00.000Z" };
  await createWebWorkerSession(root, session);
  const recovered = await recoverWebWorkerSession({ workerRoot: root, run, session, priorTurns: [], desktopEvidence: [{ kind: "file-change", summary: "Already patched feature.txt" }], at: "2026-09-08T01:05:00.000Z" });
  assert.equal(recovered.session.generation, 2);
  assert.equal(recovered.prompt.kind, "recovery");
  assert.match(recovered.prompt.body, /Already patched feature\.txt/);
  assert.match(recovered.prompt.body, /do not repeat verified side effects/i);
  assert.equal((await loadWebWorkerSession(root, "session-old"))?.status, "lost");
  assert.equal((await getActiveWebWorkerSession(root, "run-recovery", "IMPLEMENT"))?.generation, 2);
  assert.equal((await getActiveWebWorkerSession(root, "run-recovery", "IMPLEMENT"))?.recoveryCount, 1);
});

test("late old-generation result is rejected after replacement", async () => {
  const { root, run } = await fixture();
  const session = { version: 1 as const, sessionId: "session-old", runId: "run-recovery", stage: "IMPLEMENT" as const, generation: 1, policySha256: run.preflight.policy!.effectiveSha256, status: "ready" as const, resultContract: "patch-frame-v1" as const, createdAt: "2026-09-08T01:00:00.000Z" };
  await createWebWorkerSession(root, session);
  await recoverWebWorkerSession({ workerRoot: root, run, session, priorTurns: [], desktopEvidence: [], at: "2026-09-08T01:05:00.000Z" });
  await assert.rejects(
    assertActiveWebWorkerResult(root, run, session, { version: 1, runId: "run-recovery", stage: "IMPLEMENT", generation: 1, summary: "Late", decisions: [], intents: [], outcome: "stage-complete" }),
    /stale|generation|active/i,
  );
});

test("executor recovers a lost browser session and continues the same Run", async () => {
  const { root, run } = await fixture();
  const fake = createFakeChatGptWebBrowserAdapter([
    new ChatGptWebSessionLostError("tab disappeared"),
    { version: 1, runId: "run-recovery", stage: "IMPLEMENT", generation: 2, summary: "Recovered and complete", decisions: ["Continue same Run"], intents: [], outcome: "stage-complete" },
  ]);
  const observedContracts: unknown[] = [];
  const adapter = {
    ...fake.adapter,
    async awaitStructuredResult(session: any, timeoutMs: number, contract: unknown) {
      observedContracts.push(contract);
      return fake.adapter.awaitStructuredResult(session, timeoutMs, contract as any);
    },
  };
  const executor = createWebReasoningExecutor({ workerRoot: root, adapter, now: () => "2026-09-08T01:06:00.000Z", runDesktopIntent: async () => { throw new Error("unused"); } });
  const result = await executor.execute(run);
  assert.equal(result.type, "completed");
  assert.deepEqual(observedContracts, ["patch-frame-v1", "patch-frame-v1"]);
  assert.equal((await getActiveWebWorkerSession(root, "run-recovery", "IMPLEMENT"))?.generation, 2);
  assert.equal(fake.submittedPrompts.length, 2);
  assert.equal(fake.submittedPrompts[1]?.kind, "recovery");
});

test("session-loss recovery budget survives a new executor invocation", async () => {
  const { root, run } = await fixture();
  const first = createFakeChatGptWebBrowserAdapter([
    new ChatGptWebSessionLostError("first session disappeared"),
    new ChatGptWebSessionLostError("replacement session disappeared"),
  ]);
  const firstExecutor = createWebReasoningExecutor({
    workerRoot: root, adapter: first.adapter, maxRecoveryAttempts: 1,
    runDesktopIntent: async () => { throw new Error("unused"); },
  });
  assert.deepEqual(await firstExecutor.execute(run), {
    type: "retryable-failure",
    reason: "ChatGPT Web recovery budget exhausted: unknown-session-loss",
  });
  const persisted = await getActiveWebWorkerSession(root, "run-recovery", "IMPLEMENT");
  assert.equal(persisted?.generation, 2);
  assert.equal(persisted?.recoveryCount, 1);

  const second = createFakeChatGptWebBrowserAdapter([
    new ChatGptWebSessionLostError("restart session disappeared"),
  ]);
  const secondExecutor = createWebReasoningExecutor({
    workerRoot: root, adapter: second.adapter, maxRecoveryAttempts: 1,
    runDesktopIntent: async () => { throw new Error("unused"); },
  });
  assert.deepEqual(await secondExecutor.execute(run), {
    type: "retryable-failure",
    reason: "ChatGPT Web recovery budget exhausted: unknown-session-loss",
  });
  assert.equal((await getActiveWebWorkerSession(root, "run-recovery", "IMPLEMENT"))?.generation, 2);
});

test("recovery preserves an explicitly persisted legacy result contract", async () => {
  const { root, run } = await fixture();
  const session = {
    version: 1 as const,
    sessionId: "session-legacy",
    runId: "run-recovery",
    stage: "IMPLEMENT" as const,
    generation: 1,
    policySha256: run.preflight.policy!.effectiveSha256,
    status: "ready" as const,
    resultContract: "legacy-structured-json" as const,
    createdAt: "2026-09-08T01:00:00.000Z",
  };
  await createWebWorkerSession(root, session);

  const recovered = await recoverWebWorkerSession({
    workerRoot: root,
    run,
    session,
    priorTurns: [],
    desktopEvidence: [],
    at: "2026-09-08T01:05:00.000Z",
  });

  assert.equal(recovered.session.resultContract, "legacy-structured-json");
  assert.equal((await getActiveWebWorkerSession(root, "run-recovery", "IMPLEMENT"))?.resultContract, "legacy-structured-json");
});

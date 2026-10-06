import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveHarnessPolicy } from "../src/harness/policy-resolver.js";
import type { HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";
import { createWebReasoningExecutor, resultContractForStage } from "../src/chatgpt-web/web-reasoning-executor.js";
import { ChatGptWebStructuredResultError } from "../src/chatgpt-web/browser-adapter.js";
import { createFakeChatGptWebBrowserAdapter, ChatGptWebSessionLostError } from "../src/chatgpt-web/test-support/fake-browser-adapter.js";
import { getActiveWebWorkerSession } from "../src/chatgpt-web/session-store.js";
import { appendReasoningTurn, listReasoningTurns } from "../src/chatgpt-web/turn-store.js";
import { loadDesktopIntent } from "../src/chatgpt-web/intent-store.js";
import { createRequestBudgetStore } from "../src/chatgpt-web/request-budget.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "iseol-web-reasoning-"));
  const repo = join(root, "repo");
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(join(repo, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "HARNESS_ENGINEERING.md"), "# Global Harness\n", "utf8");
  await writeFile(join(repo, "docs", "HARNESS_ENGINEERING.md"), "# Project Harness\n", "utf8");
  const policy = await resolveHarnessPolicy({ iseolRoot: root, targetRoot: repo, loadedAt: "2026-09-08T01:00:00.000Z" });
  const run: HarnessRuntimeRunEnvelope = {
    version: 1,
    request: { version: 1, runId: "run-web", mode: "project-workspace", objective: "Implement web bridge", targetRoot: repo },
    preflight: { version: 1, runId: "run-web", status: "ready", policy },
    state: { version: 1, stage: "IMPLEMENT", status: "RUNNING", completedStages: [], skippedStages: [], updatedAt: "2026-09-08T01:00:00.000Z" },
    evidence: [], updatedAt: "2026-09-08T01:00:00.000Z",
  };
  return { root, repo, run };
}
test("reasoning selects the result contract explicitly from the Harness stage", async () => {
  assert.equal(resultContractForStage("CONTEXT"), "structured-json");
  assert.equal(resultContractForStage("ANALYZE"), "structured-json");
  assert.equal(resultContractForStage("PLAN"), "structured-json");
  assert.equal(resultContractForStage("IMPLEMENT"), "patch-frame-v1");
  assert.equal(resultContractForStage("SELF_REVIEW"), "structured-json");

  for (const stage of ["ANALYZE", "PLAN", "IMPLEMENT", "SELF_REVIEW"] as const) {
    const { root, run } = await fixture();
    const observedContracts: unknown[] = [];
    const adapter = {
      openOrResumeSession: async () => ({ conversationRef: `conv-${stage.toLowerCase()}` }),
      submitTurn: async () => undefined,
      awaitStructuredResult: async (_session: unknown, _timeoutMs: number, contract: unknown) => {
        observedContracts.push(contract);
        return {
          version: 1, runId: run.request.runId, stage, generation: 1,
          summary: `${stage} complete`, decisions: [], intents: [], outcome: "stage-complete",
        };
      },
      probeSession: async () => "ready",
      closeSession: async () => undefined,
    } as any;
    const executor = createWebReasoningExecutor({
      workerRoot: root,
      adapter,
      now: () => "2026-09-08T01:00:00.000Z",
      runDesktopIntent: async () => { throw new Error("unused"); },
    });

    const result = await executor.execute({ ...run, state: { ...run.state, stage } });

    assert.equal(result.type, "completed");
    assert.deepEqual(observedContracts, [stage === "IMPLEMENT" ? "patch-frame-v1" : "structured-json"]);
  }
});
test("reasoning stage loops through Desktop feedback and completes from structured output", async () => {
  const { root, repo, run } = await fixture();
  const policySha256 = run.preflight.policy!.effectiveSha256;
  const intent = { version: 1 as const, intentId: "intent-patch", runId: "run-web", stage: "IMPLEMENT" as const, workspaceRoot: repo, policySha256, kind: "PROPOSE_PATCH" as const, path: "feature.txt", patch: "--- a/feature.txt\n+++ b/feature.txt\n@@ -1 +1 @@\n-old\n+new\n" };
  const fake = createFakeChatGptWebBrowserAdapter([
    { version: 1, runId: "run-web", stage: "IMPLEMENT", generation: 1, summary: "Patch the feature", decisions: ["Use one guarded patch"], intents: [intent], outcome: "continue" },
    { version: 1, runId: "run-web", stage: "IMPLEMENT", generation: 1, summary: "Implementation is complete", decisions: ["Patch verified"], intents: [], outcome: "stage-complete" },
  ]);
  const desktopCalls: string[] = [];
  const executor = createWebReasoningExecutor({
    workerRoot: root,
    adapter: fake.adapter,
    now: () => "2026-09-08T01:01:00.000Z",
    runDesktopIntent: async ({ intent: item }) => {
      desktopCalls.push(item.intentId);
      return { type: "completed", evidence: [{ version: 1, id: "evidence-patch", kind: "file-change", stage: "IMPLEMENT", recordedAt: "2026-09-08T01:01:00.000Z", summary: "Patched feature.txt", provider: "iseol-desktop-agent", reference: "desktop-job:patch" }] };
    },
  });

  const result = await executor.execute(run);
  assert.equal(result.type, "completed");
  assert.deepEqual(desktopCalls, ["intent-patch"]);
  assert.equal(fake.submittedPrompts.length, 2);
  assert.match(fake.submittedPrompts[1]!.body, /Patched feature\.txt/);
  assert.equal((await listReasoningTurns(root, "run-web")).length, 2);
  assert.equal((await loadDesktopIntent(root, "run-web", "intent-patch"))?.status, "accepted");
  assert.equal((await getActiveWebWorkerSession(root, "run-web", "IMPLEMENT"))?.generation, 1);
  assert.equal("sendTask" in fake.adapter, false);
});
test("blocked-user and Desktop waiting-agent propagate without stage completion", async () => {
  const blocked = await fixture();
  const blockedFake = createFakeChatGptWebBrowserAdapter([
    { version: 1, runId: "run-web", stage: "IMPLEMENT", generation: 1, summary: "Need a product decision", decisions: [], intents: [], outcome: "blocked-user", blockerReason: "Choose A or B" },
  ]);
  const blockedExecutor = createWebReasoningExecutor({ workerRoot: blocked.root, adapter: blockedFake.adapter, now: () => "2026-09-08T01:02:00.000Z", runDesktopIntent: async () => { throw new Error("desktop should not run"); } });
  assert.deepEqual(await blockedExecutor.execute(blocked.run), { type: "blocked-user", reason: "Choose A or B" });

  const waiting = await fixture();
  const policySha256 = waiting.run.preflight.policy!.effectiveSha256;
  const waitingFake = createFakeChatGptWebBrowserAdapter([
    { version: 1, runId: "run-web", stage: "IMPLEMENT", generation: 1, summary: "Inspect repository", decisions: [], intents: [{ version: 1, intentId: "intent-inspect", runId: "run-web", stage: "IMPLEMENT", workspaceRoot: waiting.repo, policySha256, kind: "GIT_INSPECT", cwd: "." }], outcome: "continue" },
  ]);
  const waitingExecutor = createWebReasoningExecutor({ workerRoot: waiting.root, adapter: waitingFake.adapter, now: () => "2026-09-08T01:02:00.000Z", runDesktopIntent: async () => ({ type: "waiting-agent", reason: "Desktop offline" }) });
  assert.deepEqual(await waitingExecutor.execute(waiting.run), { type: "waiting-agent", reason: "Desktop offline" });
});

test("Desktop failure results and durable intent reasons redact credentials", async () => {
  const { root, run } = await fixture();
  const policySha256 = run.preflight.policy!.effectiveSha256;
  const fake = createFakeChatGptWebBrowserAdapter([
    { version: 1, runId: "run-web", stage: "IMPLEMENT", generation: 1, summary: "Inspect repository", decisions: [], intents: [{ version: 1, intentId: "intent-failure", runId: "run-web", stage: "IMPLEMENT", workspaceRoot: run.request.workspaceRoot, policySha256, kind: "GIT_INSPECT", cwd: "." }], outcome: "continue" },
  ]);
  const result = await createWebReasoningExecutor({
    workerRoot: root,
    adapter: fake.adapter,
    now: () => "2026-09-08T01:02:00.000Z",
    runDesktopIntent: async () => { throw new Error("token=desktop-secret"); },
  }).execute(run);

  assert.equal(result.type, "retryable-failure");
  assert.doesNotMatch(result.reason, /desktop-secret/);
  assert.equal((await loadDesktopIntent(root, "run-web", "intent-failure"))?.reason, undefined);
});

test("turn and rejection budgets are bounded", async () => {
  const turns = await fixture();
  const continueResult = { version: 1 as const, runId: "run-web", stage: "IMPLEMENT" as const, generation: 1, summary: "Still working", decisions: [], intents: [], outcome: "continue" as const };
  const turnFake = createFakeChatGptWebBrowserAdapter([continueResult, continueResult]);
  const turnExecutor = createWebReasoningExecutor({ workerRoot: turns.root, adapter: turnFake.adapter, maxTurnsPerStage: 2, now: () => "2026-09-08T01:03:00.000Z", runDesktopIntent: async () => { throw new Error("unused"); } });
  const turnResult = await turnExecutor.execute(turns.run);
  assert.equal(turnResult.type, "retryable-failure");
  assert.match(turnResult.reason, /turn budget/i);

  const rejected = await fixture();
  const policySha256 = rejected.run.preflight.policy!.effectiveSha256;
  const unsafeIntent = { version: 1 as const, intentId: "unsafe-1", runId: "run-web", stage: "IMPLEMENT" as const, workspaceRoot: rejected.repo, policySha256, kind: "READ_CONTEXT" as const, path: "../secret.txt" };
  const rejectFake = createFakeChatGptWebBrowserAdapter([
    { version: 1, runId: "run-web", stage: "IMPLEMENT", generation: 1, summary: "Read outside", decisions: [], intents: [unsafeIntent], outcome: "continue" },
  ]);
  const rejectExecutor = createWebReasoningExecutor({ workerRoot: rejected.root, adapter: rejectFake.adapter, maxRejectedIntents: 1, now: () => "2026-09-08T01:03:00.000Z", runDesktopIntent: async () => { throw new Error("rejected intent must not run"); } });
  const rejectResult = await rejectExecutor.execute(rejected.run);
  assert.equal(rejectResult.type, "retryable-failure");
  assert.match(rejectResult.reason, /rejected intent/i);
  assert.equal((await loadDesktopIntent(rejected.root, "run-web", "unsafe-1"))?.status, "rejected");
});
test("malformed structured results use the same bounded rejection budget", async () => {
  const { root, run } = await fixture();
  const fake = createFakeChatGptWebBrowserAdapter([
    { version: 1, runId: "run-web", stage: "IMPLEMENT", generation: 1, summary: "missing outcome", decisions: [], intents: [] },
    { version: 1, runId: "run-web", stage: "IMPLEMENT", generation: 1, summary: "still malformed", decisions: [], intents: [] },
  ]);
  const executor = createWebReasoningExecutor({
    workerRoot: root,
    adapter: fake.adapter,
    maxRejectedIntents: 2,
    now: () => "2026-09-08T01:04:00.000Z",
    runDesktopIntent: async () => { throw new Error("unused"); },
  });
  const result = await executor.execute(run);
  assert.equal(result.type, "retryable-failure");
  assert.equal(result.reason, "ChatGPT Web failure: rejected structured-result budget exhausted; outcome-invalid");
  assert.equal(fake.submittedPrompts.length, 2);
});
test("structured-json PROPOSE_PATCH rejection stays a generic structured-result failure", async () => {
  const { root, run } = await fixture();

  const planRun = {
    ...run,
    state: {
      ...run.state,
      stage: "PLAN" as const,
    },
  };

  const submittedPrompts: Array<{ body: string }> = [];
  let resultReads = 0;

  const adapter = {
    openOrResumeSession: async () => ({}),

    submitTurn: async (_session: unknown, prompt: { body: string }) => {
      submittedPrompts.push(prompt);
      return undefined;
    },

    awaitStructuredResult: async () => {
      resultReads += 1;

      if (resultReads === 1) {
        throw new ChatGptWebStructuredResultError(
          "ChatGPT structured JSON contract does not accept PROPOSE_PATCH payloads",
        );
      }

      return {
        version: 1,
        runId: planRun.request.runId,
        stage: "PLAN",
        generation: 1,
        summary: "Plan completed",
        decisions: [],
        intents: [],
        outcome: "stage-complete",
      };
    },

    probeSession: async () => "ready",
    closeSession: async () => undefined,
  } as any;

  const executor = createWebReasoningExecutor({
    workerRoot: root,
    adapter,
    maxRejectedIntents: 2,
    now: () => "2026-09-08T01:04:20.000Z",
    runDesktopIntent: async () => {
      throw new Error("unused");
    },
  });

  const result = await executor.execute(planRun);

  assert.equal(result.type, "completed");
  assert.equal(submittedPrompts.length, 2);

  assert.match(
    submittedPrompts[1]?.body ?? "",
    /matching the current stage's ReasoningTurnResult contract/i,
  );

  assert.doesNotMatch(
    submittedPrompts[1]?.body ?? "",
    /include exactly one intent with path|patchText containing|complete git-apply-compatible unified diff/i,
  );

  assert.match(
    submittedPrompts[1]?.body ?? "",
    /unescaped double quote/i,
  );

  assert.match(
    submittedPrompts[1]?.body ?? "",
    /single quotes/i,
  );
});

test("IMPLEMENT rejection preserves the safe patch-frame failure class", async () => {
  const { root, run } = await fixture();

  const adapter = {
    openOrResumeSession: async () => ({}),
    submitTurn: async () => undefined,
    awaitStructuredResult: async () => {
      throw new ChatGptWebStructuredResultError(
        "ChatGPT PATCH_FRAME_V1 header is missing or invalid",
        {
          diagnosticCategory: "patch-frame-format-failure",
          frameHeaderPresent: false,
          payloadEmpty: false,
        },
      );
    },
    probeSession: async () => "ready",
    closeSession: async () => undefined,
  } as any;

  const executor = createWebReasoningExecutor({
    workerRoot: root,
    adapter,
    maxRejectedIntents: 1,
    now: () => "2026-09-08T01:04:30.000Z",
    runDesktopIntent: async () => { throw new Error("unused"); },
  });

  const result = await executor.execute(run);

  assert.equal(result.type, "retryable-failure");
  assert.equal(
    result.reason,
    "ChatGPT Web failure: rejected structured-result budget exhausted; patch frame invalid: header missing or invalid",
  );
});

test("reasoning executor persists a conversation ref assigned by first submit before reading the result", async () => {
  const { root, run } = await fixture();
  const adapter = {
    openOrResumeSession: async () => ({}),
    submitTurn: async () => ({ conversationRef: "conv-after-submit" }),
    awaitStructuredResult: async () => ({
      version: 1, runId: "run-web", stage: "IMPLEMENT", generation: 1,
      summary: "done", decisions: [], intents: [], outcome: "stage-complete",
    }),
    probeSession: async () => "ready",
    closeSession: async () => undefined,
  } as any;
  const executor = createWebReasoningExecutor({
    workerRoot: root,
    adapter,
    now: () => "2026-09-08T01:05:00.000Z",
    runDesktopIntent: async () => { throw new Error("unused"); },
  });
  assert.equal((await executor.execute(run)).type, "completed");
  assert.equal((await getActiveWebWorkerSession(root, "run-web", "IMPLEMENT"))?.conversationRef, "conv-after-submit");
});

test("fresh IMPLEMENT sessions persist their selected result contract", async () => {
  const { root, run } = await fixture();
  const fake = createFakeChatGptWebBrowserAdapter([
    { version: 1, runId: "run-web", stage: "IMPLEMENT", generation: 1, summary: "done", decisions: [], intents: [], outcome: "stage-complete" },
  ]);
  const executor = createWebReasoningExecutor({
    workerRoot: root,
    adapter: fake.adapter,
    now: () => "2026-09-08T01:05:00.000Z",
    runDesktopIntent: async () => { throw new Error("unused"); },
  });

  assert.equal((await executor.execute(run)).type, "completed");
  assert.equal((await getActiveWebWorkerSession(root, "run-web", "IMPLEMENT"))?.resultContract, "patch-frame-v1");
});

test("restart reads the explicit persisted legacy contract without stage fallback", async () => {
  const { root, run } = await fixture();
  const { createWebWorkerSession } = await import("../src/chatgpt-web/session-store.js");
  await createWebWorkerSession(root, {
    version: 1,
    sessionId: "session-legacy-restart",
    runId: "run-web",
    stage: "IMPLEMENT",
    generation: 1,
    policySha256: run.preflight.policy!.effectiveSha256,
    status: "ready",
    resultContract: "legacy-structured-json",
    createdAt: "2026-09-08T01:00:00.000Z",
  });
  const observedContracts: unknown[] = [];
  const adapter = {
    openOrResumeSession: async () => ({ conversationRef: "conv-legacy" }),
    submitTurn: async () => ({ conversationRef: "conv-legacy" }),
    awaitStructuredResult: async (_session: unknown, _timeoutMs: number, contract: unknown) => {
      observedContracts.push(contract);
      return { version: 1, runId: "run-web", stage: "IMPLEMENT", generation: 1, summary: "legacy done", decisions: [], intents: [], outcome: "stage-complete" };
    },
    probeSession: async () => "ready",
    closeSession: async () => undefined,
  } as any;
  const executor = createWebReasoningExecutor({
    workerRoot: root,
    adapter,
    now: () => "2026-09-08T01:06:00.000Z",
    runDesktopIntent: async () => { throw new Error("unused"); },
  });

  assert.equal((await executor.execute(run)).type, "completed");
  assert.deepEqual(observedContracts, ["legacy-structured-json"]);
});

test("restart normalizes a persisted IMPLEMENT session without contract metadata to patch-frame-v1", async () => {
  const { root, run } = await fixture();
  const session = {
    version: 1,
    sessionId: "session-pre-contract-restart",
    runId: "run-web",
    stage: "IMPLEMENT",
    generation: 1,
    policySha256: run.preflight.policy!.effectiveSha256,
    status: "ready",
    createdAt: "2026-09-08T01:00:00.000Z",
  };
  const sessionDirectory = join(root, "web-workers", "sessions");
  const activeDirectory = join(root, "web-workers", "runs", "run-web", "stages", "IMPLEMENT");
  await mkdir(sessionDirectory, { recursive: true });
  await mkdir(activeDirectory, { recursive: true });
  await writeFile(join(sessionDirectory, `${session.sessionId}.json`), JSON.stringify(session), "utf8");
  await writeFile(
    join(activeDirectory, "active-session.json"),
    JSON.stringify({ version: 1, sessionId: session.sessionId, generation: 1 }),
    "utf8",
  );
  const observedContracts: unknown[] = [];
  const adapter = {
    openOrResumeSession: async () => ({ conversationRef: "conv-pre-contract" }),
    submitTurn: async () => ({ conversationRef: "conv-pre-contract" }),
    awaitStructuredResult: async (_session: unknown, _timeoutMs: number, contract: unknown) => {
      observedContracts.push(contract);
      return { version: 1, runId: "run-web", stage: "IMPLEMENT", generation: 1, summary: "done", decisions: [], intents: [], outcome: "stage-complete" };
    },
    probeSession: async () => "ready",
    closeSession: async () => undefined,
  } as any;
  const executor = createWebReasoningExecutor({
    workerRoot: root,
    adapter,
    now: () => "2026-09-08T01:06:00.000Z",
    runDesktopIntent: async () => { throw new Error("unused"); },
  });

  assert.equal((await executor.execute(run)).type, "completed");
  assert.deepEqual(observedContracts, ["patch-frame-v1"]);
  assert.equal((await getActiveWebWorkerSession(root, "run-web", "IMPLEMENT"))?.resultContract, "patch-frame-v1");
});

test("reasoning feedback prefers ephemeral Desktop payload over durable completion summary", async () => {
  const { root, run } = await fixture();
  const policySha256 = run.preflight.policy!.effectiveSha256;
  const intent = { version: 1 as const, intentId: "intent-read", runId: "run-web", stage: "IMPLEMENT" as const, workspaceRoot: run.request.targetRoot, policySha256, kind: "READ_CONTEXT" as const, path: "README.md" };
  const fake = createFakeChatGptWebBrowserAdapter([
    { version: 1, runId: "run-web", stage: "IMPLEMENT", generation: 1, summary: "Inspect", decisions: [], intents: [intent], outcome: "continue" },
    { version: 1, runId: "run-web", stage: "IMPLEMENT", generation: 1, summary: "Done", decisions: [], intents: [], outcome: "stage-complete" },
  ]);
  let calls = 0;
  const executor = createWebReasoningExecutor({
    workerRoot: root, adapter: fake.adapter, now: () => "2026-09-08T01:06:00.000Z",
    runDesktopIntent: async () => {
      calls += 1;
      return { type: "completed", evidence: [{ version: 1, id: "evidence-read", kind: "command", stage: "IMPLEMENT", recordedAt: "2026-09-08T01:06:00.000Z", summary: "Desktop Job completed", provider: "iseol-desktop-agent" }], feedback: [{ kind: "command", summary: "actual repository payload" }] } as any;
    },
  });
  assert.equal((await executor.execute(run)).type, "completed");
  assert.equal(calls, 1);
  assert.match(fake.submittedPrompts[1]!.body, /actual repository payload/);
  assert.doesNotMatch(fake.submittedPrompts[1]!.body, /Desktop Job completed/);
});
test("restarted reasoning hydrates recovered Desktop payload before the next turn", async () => {
  const { root, run } = await fixture();
  await appendReasoningTurn(root, {
    version: 1, turnId: "turn-prior", sessionId: "session-prior", runId: "run-web", stage: "IMPLEMENT", generation: 1,
    promptSha256: "a".repeat(64), responseSha256: "b".repeat(64), summary: "Inspected repository", decisions: ["Need package context"],
    desktopIntentIds: ["intent-prior-read"], outcome: "continue", recordedAt: "2026-09-08T01:05:30.000Z",
  });
  const fake = createFakeChatGptWebBrowserAdapter([
    { version: 1, runId: "run-web", stage: "IMPLEMENT", generation: 1, summary: "Recovered context is sufficient", decisions: [], intents: [], outcome: "stage-complete" },
  ]);
  const recoveredIntentIds: string[] = [];
  const executor = createWebReasoningExecutor({
    workerRoot: root, adapter: fake.adapter, now: () => "2026-09-08T01:06:00.000Z",
    runDesktopIntent: async () => { throw new Error("recovered Desktop intent must not rerun"); },
    recoverDesktopFeedback: async ({ priorTurns }: any) => {
      recoveredIntentIds.push(...priorTurns.flatMap((turn: any) => turn.desktopIntentIds));
      return [{ kind: "command", summary: "recovered package payload" }];
    },
  } as any);
  assert.equal((await executor.execute(run)).type, "completed");
  assert.deepEqual(recoveredIntentIds, ["intent-prior-read"]);
  assert.equal(fake.submittedPrompts.length, 1);
  assert.equal(fake.submittedPrompts[0]!.kind, "feedback");
  assert.match(fake.submittedPrompts[0]!.body, /recovered package payload/);
});


test("structured JSON syntax errors get bounded corrective feedback", async () => {
  const { root, run } = await fixture();
  const { ChatGptWebStructuredResultError } = await import("../src/chatgpt-web/browser-adapter.js");
  const fake = createFakeChatGptWebBrowserAdapter([
    new ChatGptWebStructuredResultError("ChatGPT structured result is not exactly one JSON value"),
    { version: 1, runId: "run-web", stage: "IMPLEMENT", generation: 1, summary: "Corrected", decisions: [], intents: [], outcome: "stage-complete" },
  ]);
  const executor = createWebReasoningExecutor({
    workerRoot: root, adapter: fake.adapter, maxRejectedIntents: 2,
    now: () => "2026-09-08T01:07:00.000Z",
    runDesktopIntent: async () => { throw new Error("unused"); },
  });
  assert.equal((await executor.execute(run)).type, "completed");
  assert.equal(fake.submittedPrompts.length, 2);
  const feedback = JSON.parse(fake.submittedPrompts[1]!.body) as any;
  assert.match(JSON.stringify(feedback.desktopEvidence), /ISEOL_PATCH_V1/i);
  assert.match(JSON.stringify(feedback.desktopEvidence), /git-apply-compatible/i);
  assert.doesNotMatch(JSON.stringify(feedback.desktopEvidence), /patchText|JSON string/i);
});


test("restart advances past a lost session still referenced by the active pointer", async () => {
  const { root, run } = await fixture();
  const { createHash } = await import("node:crypto");
  const { createWebWorkerSession, getActiveWebWorkerSession, loadWebWorkerSession, updateWebWorkerSession } = await import("../src/chatgpt-web/session-store.js");
  const staleId = `web-${createHash("sha256").update("run-web\nIMPLEMENT\n1").digest("hex").slice(0, 24)}`;
  const stale = {
    version: 1 as const, sessionId: staleId, runId: "run-web", stage: "IMPLEMENT" as const,
    generation: 1, policySha256: run.preflight.policy!.effectiveSha256, status: "ready" as const,
    resultContract: "patch-frame-v1" as const,
    createdAt: "2026-09-08T01:00:00.000Z",
  };
  await createWebWorkerSession(root, stale);
  await updateWebWorkerSession(root, { ...stale, status: "lost", closedAt: "2026-09-08T01:01:00.000Z" });
  assert.equal(await getActiveWebWorkerSession(root, "run-web", "IMPLEMENT"), null);

  const fake = createFakeChatGptWebBrowserAdapter([
    { version: 1, runId: "run-web", stage: "IMPLEMENT", generation: 2, summary: "Recovered", decisions: [], intents: [], outcome: "stage-complete" },
  ]);
  const executor = createWebReasoningExecutor({
    workerRoot: root, adapter: fake.adapter, now: () => "2026-09-08T01:02:00.000Z",
    runDesktopIntent: async () => { throw new Error("unused"); },
  });

  assert.equal((await executor.execute(run)).type, "completed");
  const active = await getActiveWebWorkerSession(root, "run-web", "IMPLEMENT");
  assert.equal(active?.generation, 2);
  assert.equal((await loadWebWorkerSession(root, staleId))?.status, "lost");
});

test("request budget records an unknown submitted turn and blocks automatic resubmission", async () => {
  const { root, run } = await fixture();
  let submissions = 0;
  const adapter = {
    openOrResumeSession: async () => ({ conversationRef: "conv-budget" }),
    submitTurn: async () => { submissions += 1; return undefined; },
    awaitStructuredResult: async () => { throw new ChatGptWebSessionLostError("response lost"); },
    probeSession: async () => "lost",
    closeSession: async () => undefined,
  } as any;
  const budget = createRequestBudgetStore(root, 1, () => "2026-09-08T01:00:00.000Z");
  const first = createWebReasoningExecutor({ workerRoot: root, adapter, requestBudget: budget, now: () => "2026-09-08T01:00:00.000Z", runDesktopIntent: async () => { throw new Error("unused"); } });
  const firstResult = await first.execute(run);
  assert.deepEqual(firstResult, { type: "waiting-external", reason: "ChatGPT Web request outcome is UNKNOWN; automatic resubmission is blocked" });
  assert.equal(submissions, 1);
  assert.equal((await budget.inspect(run.request.runId))?.unknown, 1);
  const second = createWebReasoningExecutor({ workerRoot: root, adapter, requestBudget: budget, now: () => "2026-09-08T01:00:00.000Z", runDesktopIntent: async () => { throw new Error("unused"); } });
  const secondResult = await second.execute(run);
  assert.deepEqual(secondResult, { type: "waiting-external", reason: "ChatGPT Web external request already reserved" });
  assert.equal(submissions, 1);
});

test("structured rejection diagnostics retain correction attempt and budget without response text", async () => {
  const { root, run } = await fixture();
  const diagnostics: Array<Record<string, unknown>> = [];
  const fake = createFakeChatGptWebBrowserAdapter([
    { version: 1, runId: "run-web", stage: "IMPLEMENT", generation: 1, summary: "missing outcome", decisions: [], intents: [] },
    { version: 1, runId: "run-web", stage: "IMPLEMENT", generation: 1, summary: "still malformed", decisions: [], intents: [] },
  ]);
  fake.adapter.recordResultDiagnostic = async (input) => {
    diagnostics.push({ ...input.diagnostic, correctionAttempt: input.correctionAttempt, correctionBudgetUsed: input.correctionBudgetUsed, correctionBudgetLimit: input.correctionBudgetLimit });
  };
  const result = await createWebReasoningExecutor({
    workerRoot: root,
    adapter: fake.adapter,
    maxRejectedIntents: 2,
    now: () => "2026-09-08T01:04:00.000Z",
    runDesktopIntent: async () => { throw new Error("unused"); },
  }).execute(run);
  assert.equal(result.type, "retryable-failure");
  assert.deepEqual(diagnostics.map((item) => [item.correctionAttempt, item.correctionBudgetUsed, item.correctionBudgetLimit]), [[1, 1, 2], [2, 2, 2]]);
  assert.ok(diagnostics.every((item) => !Object.hasOwn(item, "response") && !Object.hasOwn(item, "prompt")));
});

test("recovered sessions inherit the project identity for bounded diagnostics", async () => {
  const { root, run } = await fixture();
  const projectRun = { ...run, request: { ...run.request, projectId: "project-web" } };
  const { createWebWorkerSession } = await import("../src/chatgpt-web/session-store.js");
  await createWebWorkerSession(root, {
    version: 1,
    sessionId: "web-existing-project",
    runId: projectRun.request.runId,
    stage: projectRun.state.stage,
    generation: 1,
    policySha256: projectRun.preflight.policy!.effectiveSha256,
    status: "ready",
    resultContract: "patch-frame-v1",
    createdAt: "2026-09-08T01:00:00.000Z",
  });
  let observedProjectId: string | undefined;
  const fake = createFakeChatGptWebBrowserAdapter([
    { version: 1, runId: projectRun.request.runId, stage: "IMPLEMENT", generation: 1, summary: "Complete", decisions: [], intents: [], outcome: "stage-complete" },
  ]);
  const adapter = {
    ...fake.adapter,
    async openOrResumeSession(session: any, prompt: any) {
      observedProjectId = session.projectId;
      return fake.adapter.openOrResumeSession(session, prompt);
    },
  };
  const executor = createWebReasoningExecutor({ workerRoot: root, adapter, now: () => "2026-09-08T01:01:00.000Z", runDesktopIntent: async () => { throw new Error("unused"); } });
  assert.equal((await executor.execute(projectRun)).type, "completed");
  assert.equal(observedProjectId, "project-web");
});


test("IMPLEMENT correction repeats the exact PATCH_FRAME_V1 contract", async () => {
  const { root, run } = await fixture();
  const { ChatGptWebStructuredResultError } = await import("../src/chatgpt-web/browser-adapter.js");
  const fake = createFakeChatGptWebBrowserAdapter([
    new ChatGptWebStructuredResultError("ChatGPT patch appendix end marker is missing"),
    { version: 1, runId: "run-web", stage: "IMPLEMENT", generation: 1, summary: "Corrected", decisions: [], intents: [], outcome: "stage-complete" },
  ]);
  const observedContracts: unknown[] = [];
  const adapter = {
    ...fake.adapter,
    async awaitStructuredResult(session: any, timeoutMs: number, contract: unknown) {
      observedContracts.push(contract);
      return fake.adapter.awaitStructuredResult(session, timeoutMs, contract as any);
    },
  };
  const executor = createWebReasoningExecutor({ workerRoot: root, adapter, maxRejectedIntents: 2,
    now: () => "2026-09-08T01:08:00.000Z", runDesktopIntent: async () => { throw new Error("unused"); } });
  assert.equal((await executor.execute(run)).type, "completed");
  assert.deepEqual(observedContracts, ["patch-frame-v1", "patch-frame-v1"]);
  const feedback = JSON.parse(fake.submittedPrompts[1]!.body) as any;
  const text = JSON.stringify(feedback.desktopEvidence);
  assert.match(text, /patch appendix end marker is missing/i);
  assert.match(text, /ISEOL_PATCH_V1/i);
  assert.match(text, /first line/i);
  assert.match(text, /raw unified diff through EOF/i);
  assert.doesNotMatch(text, /patchText|JSON string|ISEOL_PATCH_BEGIN|ISEOL_PATCH_END/i);
});


test("generation echo mismatch gets corrective feedback without replacing the active session", async () => {
  const { root, run } = await fixture();
  const fake = createFakeChatGptWebBrowserAdapter([
    { version: 1, runId: "run-web", stage: "IMPLEMENT", generation: 2, summary: "Wrong generation", decisions: [], intents: [], outcome: "continue" },
    { version: 1, runId: "run-web", stage: "IMPLEMENT", generation: 1, summary: "Corrected generation", decisions: [], intents: [], outcome: "stage-complete" },
  ]);
  const executor = createWebReasoningExecutor({
    workerRoot: root,
    adapter: fake.adapter,
    maxRejectedIntents: 2,
    now: () => "2026-09-08T01:09:00.000Z",
    runDesktopIntent: async () => { throw new Error("unused"); },
  });

  assert.equal((await executor.execute(run)).type, "completed");
  assert.equal(fake.submittedPrompts.length, 2);
  const correction = JSON.parse(fake.submittedPrompts[1]!.body) as any;
  assert.match(JSON.stringify(correction.desktopEvidence), /expected generation 1/i);
  assert.match(JSON.stringify(correction.desktopEvidence), /received 2/i);
  assert.equal((await getActiveWebWorkerSession(root, "run-web", "IMPLEMENT"))?.generation, 1);
  assert.equal((await listReasoningTurns(root, "run-web")).length, 1);
});


test("reasoning default result timeout allows slow live ChatGPT responses", async () => {
  const { root, run } = await fixture();
  let observedTimeout = 0;
  const adapter = {
    openOrResumeSession: async () => ({ conversationRef: "conv-slow-live" }),
    submitTurn: async () => ({ conversationRef: "conv-slow-live" }),
    awaitStructuredResult: async (_session: unknown, timeoutMs: number) => {
      observedTimeout = timeoutMs;
      return { version: 1, runId: "run-web", stage: "IMPLEMENT", generation: 1,
        summary: "done", decisions: [], intents: [], outcome: "stage-complete" };
    },
    probeSession: async () => "ready",
    closeSession: async () => undefined,
  } as any;
  const executor = createWebReasoningExecutor({ workerRoot: root, adapter,
    now: () => "2026-09-08T01:10:00.000Z", runDesktopIntent: async () => { throw new Error("unused"); } });
  assert.equal((await executor.execute(run)).type, "completed");
  assert.equal(observedTimeout, 240_000);
});


test("configured temporary rate-limit backoff retries before submit and resumes the same session", async () => {
  const { root, run } = await fixture();
  const browserModule = await import("../src/chatgpt-web/browser-adapter.js") as any;
  const LimitedError = browserModule.ChatGptWebTemporarilyLimitedError;

  let openCalls = 0;
  let submitCalls = 0;
  const delays: number[] = [];

  const adapter = {
    openOrResumeSession: async () => {
      openCalls += 1;
      if (openCalls <= 2) {
        throw new LimitedError("ChatGPT Web is temporarily rate limited");
      }
      return {};
    },
    submitTurn: async () => {
      submitCalls += 1;
      return undefined;
    },
    awaitStructuredResult: async (session: any) => ({
      version: 1,
      runId: session.runId,
      stage: session.stage,
      generation: session.generation,
      summary: "Recovered after temporary rate limit",
      decisions: [],
      intents: [],
      outcome: "stage-complete",
    }),
    probeSession: async () => "ready",
    closeSession: async () => undefined,
  } as any;

  const executor = createWebReasoningExecutor({
    workerRoot: root,
    adapter,
    rateLimitBackoffMs: [30_000, 60_000, 120_000],
    sleep: async (ms) => { delays.push(ms); },
    now: () => "2026-09-08T01:10:30.000Z",
    runDesktopIntent: async () => { throw new Error("desktop must not run"); },
  });

  const result = await executor.execute(run);

  assert.equal(result.type, "completed");
  assert.equal(openCalls, 3);
  assert.equal(submitCalls, 1);
  assert.deepEqual(delays, [30_000, 60_000]);
  assert.equal(
    (await getActiveWebWorkerSession(root, "run-web", "IMPLEMENT"))?.generation,
    1,
  );
});

test("temporary rate limit after submit never automatically resubmits the turn", async () => {
  const { root, run } = await fixture();
  const browserModule = await import("../src/chatgpt-web/browser-adapter.js") as any;
  const LimitedError = browserModule.ChatGptWebTemporarilyLimitedError;

  let submitCalls = 0;
  const delays: number[] = [];

  const adapter = {
    openOrResumeSession: async () => ({}),
    submitTurn: async () => {
      submitCalls += 1;
      return undefined;
    },
    awaitStructuredResult: async () => {
      throw new LimitedError("ChatGPT Web is temporarily rate limited");
    },
    probeSession: async () => "ready",
    closeSession: async () => undefined,
  } as any;

  const executor = createWebReasoningExecutor({
    workerRoot: root,
    adapter,
    rateLimitBackoffMs: [30_000, 60_000, 120_000],
    sleep: async (ms) => { delays.push(ms); },
    now: () => "2026-09-08T01:10:45.000Z",
    runDesktopIntent: async () => { throw new Error("desktop must not run"); },
  });

  assert.deepEqual(await executor.execute(run), {
    type: "waiting-external",
    reason: "ChatGPT Web failure: temporary rate limit",
  });

  assert.equal(submitCalls, 1);
  assert.deepEqual(delays, []);
});

test("configured temporary rate-limit retries exhaust the bounded backoff budget", async () => {
  const { root, run } = await fixture();
  const browserModule = await import("../src/chatgpt-web/browser-adapter.js") as any;
  const LimitedError = browserModule.ChatGptWebTemporarilyLimitedError;

  let openCalls = 0;
  let submitCalls = 0;
  const delays: number[] = [];

  const adapter = {
    openOrResumeSession: async () => {
      openCalls += 1;
      throw new LimitedError("ChatGPT Web is temporarily rate limited");
    },
    submitTurn: async () => {
      submitCalls += 1;
    },
    awaitStructuredResult: async () => {
      throw new Error("must not read");
    },
    probeSession: async () => "ready",
    closeSession: async () => undefined,
  } as any;

  const executor = createWebReasoningExecutor({
    workerRoot: root,
    adapter,
    rateLimitBackoffMs: [30_000, 60_000, 120_000],
    sleep: async (ms) => { delays.push(ms); },
    now: () => "2026-09-08T01:10:50.000Z",
    runDesktopIntent: async () => { throw new Error("desktop must not run"); },
  });

  assert.deepEqual(await executor.execute(run), {
    type: "waiting-external",
    reason: "ChatGPT Web failure: temporary rate limit",
  });

  assert.equal(openCalls, 4);
  assert.equal(submitCalls, 0);
  assert.deepEqual(delays, [30_000, 60_000, 120_000]);
});

test("temporary ChatGPT rate limits stop reasoning without session recovery or extra submits", async () => {
  const { root, run } = await fixture();
  const browserModule = await import("../src/chatgpt-web/browser-adapter.js") as any;
  const LimitedError = browserModule.ChatGptWebTemporarilyLimitedError;
  assert.equal(typeof LimitedError, "function", "temporary-limit error type must exist");
  let submitCalls = 0;
  const adapter = {
    openOrResumeSession: async () => { throw new LimitedError("ChatGPT Web is temporarily rate limited"); },
    submitTurn: async () => { submitCalls += 1; },
    awaitStructuredResult: async () => { throw new Error("must not read"); },
    probeSession: async () => "ready",
    closeSession: async () => undefined,
  } as any;
  const executor = createWebReasoningExecutor({
    workerRoot: root,
    adapter,
    now: () => "2026-09-08T01:11:00.000Z",
    runDesktopIntent: async () => { throw new Error("desktop must not run"); },
  });
  assert.deepEqual(await executor.execute(run), {
    type: "waiting-external",
    reason: "ChatGPT Web failure: temporary rate limit",
  });
  assert.equal(submitCalls, 0);
  assert.equal((await getActiveWebWorkerSession(root, "run-web", "IMPLEMENT"))?.generation, 1);
});

test("conversation length exhaustion replaces only the Web session and continues the same Run", async () => {
  const { root, run } = await fixture();
  const browserModule = await import("../src/chatgpt-web/browser-adapter.js") as any;
  const ConversationLimitError = browserModule.ChatGptWebConversationLimitError;
  assert.equal(typeof ConversationLimitError, "function", "conversation-limit error type must exist");
  const openedGenerations: number[] = [];
  const submittedGenerations: number[] = [];
  const observedContracts: unknown[] = [];
  const adapter = {
    openOrResumeSession: async (session: any) => {
      openedGenerations.push(session.generation);
      return session.generation === 1 ? { conversationRef: "conv-old" } : {};
    },
    submitTurn: async (session: any) => {
      submittedGenerations.push(session.generation);
      return { conversationRef: session.generation === 1 ? "conv-old" : "conv-new" };
    },
    awaitStructuredResult: async (session: any, _timeoutMs: number, contract: unknown) => {
      observedContracts.push(contract);
      if (session.generation === 1) throw new ConversationLimitError("conversation exhausted");
      return {
        version: 1, runId: "run-web", stage: "IMPLEMENT", generation: session.generation,
        summary: "continued in replacement conversation", decisions: [], intents: [], outcome: "stage-complete",
      };
    },
    probeSession: async () => "ready",
    closeSession: async () => undefined,
  } as any;
  const executor = createWebReasoningExecutor({ workerRoot: root, adapter,
    now: () => "2026-09-08T01:12:00.000Z", runDesktopIntent: async () => { throw new Error("unused"); } });
  assert.equal((await executor.execute(run)).type, "completed");
  assert.deepEqual(openedGenerations, [1, 2]);
  assert.deepEqual(submittedGenerations, [1, 2]);
  assert.deepEqual(observedContracts, ["patch-frame-v1", "patch-frame-v1"]);
  const active = await getActiveWebWorkerSession(root, "run-web", "IMPLEMENT");
  assert.equal(active?.generation, 2);
  assert.equal(active?.conversationRef, "conv-new");
});

test("account or model usage limits wait without creating a replacement conversation", async () => {
  const { root, run } = await fixture();
  const browserModule = await import("../src/chatgpt-web/browser-adapter.js") as any;
  const UsageLimitError = browserModule.ChatGptWebUsageLimitError;
  assert.equal(typeof UsageLimitError, "function", "usage-limit error type must exist");
  let opens = 0;
  const adapter = {
    openOrResumeSession: async () => { opens += 1; throw new UsageLimitError("usage limit reached"); },
    submitTurn: async () => { throw new Error("must not submit"); },
    awaitStructuredResult: async () => { throw new Error("must not read"); },
    probeSession: async () => "usage-limited",
    closeSession: async () => undefined,
  } as any;
  const executor = createWebReasoningExecutor({ workerRoot: root, adapter,
    now: () => "2026-09-08T01:13:00.000Z", runDesktopIntent: async () => { throw new Error("unused"); } });
  assert.deepEqual(await executor.execute(run), {
    type: "waiting-external",
    reason: "ChatGPT Web failure: usage limit",
  });
  assert.equal(opens, 1);
  assert.equal((await getActiveWebWorkerSession(root, "run-web", "IMPLEMENT"))?.generation, 1);
});

test("bounded browser failures persist safe semantic classifications", async () => {
  const browser = await import("../src/chatgpt-web/browser-adapter.js");
  const cases: Array<[string, new (message: string) => Error, string, string, number]> = [
    ["session lost", browser.ChatGptWebSessionLostError, "browser session disappeared", "ChatGPT Web recovery budget exhausted: unknown-session-loss", 1],
    ["identity changed", browser.ChatGptWebSessionLostError, "ChatGPT conversation identity changed while reading result", "ChatGPT Web recovery budget exhausted: conversation-identity-changed", 1],
    ["stale session", browser.ChatGptWebSessionLostError, "No pending ChatGPT submission is available for structured result reading", "ChatGPT Web recovery budget exhausted: persisted-session-stale", 1],
    ["conversation identity", browser.ChatGptWebSessionLostError, "ChatGPT Web conversation reference is unavailable", "ChatGPT Web recovery budget exhausted: conversation identity unavailable", 1],
    ["structured result timeout", browser.ChatGptWebSessionLostError, "ChatGPT structured result timed out", "ChatGPT Web recovery budget exhausted: structured result timeout", 1],
    ["conversation limit", browser.ChatGptWebConversationLimitError, "conversation limit reached", "ChatGPT Web recovery budget exhausted: conversation limit", 1],
    ["invalid structured result", browser.ChatGptWebStructuredResultError, "ChatGPT structured result is not exactly one JSON value", "ChatGPT Web failure: rejected structured-result budget exhausted; structured result invalid", 2],
  ];

  for (const [label, ErrorType, message, expectedReason, budget] of cases) {
    const { root, run } = await fixture();
    const fake = createFakeChatGptWebBrowserAdapter([
      ...Array.from({ length: 4 }, () => new ErrorType(message)),
    ]);
    const executor = createWebReasoningExecutor({
      workerRoot: root, adapter: fake.adapter,
      ...(label === "invalid structured result" ? { maxRejectedIntents: budget } : { maxTurnsPerStage: budget }),
      runDesktopIntent: async () => { throw new Error("unused"); },
    });
    const result = await executor.execute(run);
    assert.deepEqual(result, { type: "retryable-failure", reason: expectedReason }, label);
    if (label === "session lost" || label === "conversation identity") {
      assert.ok(fake.openedSessions.length <= 2, `${label} recovery must remain bounded`);
    }
    assert.doesNotMatch(JSON.stringify(result), /browser session disappeared|reference is unavailable|limit reached|exactly one JSON/);
  }
});

test("bounded browser failure metadata reaches the recovery reason", async () => {
  const { root, run } = await fixture();
  const browser = await import("../src/chatgpt-web/browser-adapter.js");
  const adapter = {
    openOrResumeSession: async () => ({ conversationRef: "conv-bounded" }),
    submitTurn: async () => ({ conversationRef: "conv-bounded" }),
    awaitStructuredResult: async () => { throw new browser.ChatGptWebSessionLostError("ChatGPT browser operation failed", "page-closed"); },
    probeSession: async () => "lost",
    closeSession: async () => undefined,
  } as any;
  const executor = createWebReasoningExecutor({
    workerRoot: root, adapter, maxTurnsPerStage: 1,
    runDesktopIntent: async () => { throw new Error("unused"); },
  });
  assert.deepEqual(await executor.execute(run), {
    type: "retryable-failure",
    reason: "ChatGPT Web recovery budget exhausted: browser-page-closed",
  });
});

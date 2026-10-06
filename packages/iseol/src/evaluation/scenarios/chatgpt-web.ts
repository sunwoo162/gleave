import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessRuntimeRunEnvelope } from "../../harness/contracts.js";
import { resolveHarnessPolicy } from "../../harness/policy-resolver.js";
import { createWebReasoningExecutor } from "../../chatgpt-web/web-reasoning-executor.js";
import type { ChatGptWebBrowserAdapter } from "../../chatgpt-web/browser-adapter.js";
import { ChatGptWebSessionLostError } from "../../chatgpt-web/browser-adapter.js";
import { createFakeChatGptWebBrowserAdapter } from "../../chatgpt-web/test-support/fake-browser-adapter.js";
import { createWebWorkerSession, getActiveWebWorkerSession } from "../../chatgpt-web/session-store.js";
import { assertActiveWebWorkerResult, recoverWebWorkerSession } from "../../chatgpt-web/recovery.js";
import { loadDesktopIntent } from "../../chatgpt-web/intent-store.js";
import { createScriptedFaultBoundary } from "../test-support/scripted-fault-boundary.js";
import type { EvaluationScenarioContext, EvaluationScenarioDefinition } from "../scenario-runner.js";
import {
  createEvaluationFixture,
  passingExecution,
  requireScenario,
} from "../test-support/evaluation-fixtures.js";

const AT = "2026-09-08T07:05:00.000Z";

async function webFixture(prefix: string) {
  const f = await createEvaluationFixture(prefix);
  await mkdir(join(f.base, "docs"), { recursive: true });
  await writeFile(join(f.base, "docs", "HARNESS_ENGINEERING.md"), "# Global Evaluation Harness\n", "utf8");
  await writeFile(join(f.targetRoot, "feature.txt"), "old\n", "utf8");
  const policy = await resolveHarnessPolicy({ iseolRoot: f.base, targetRoot: f.targetRoot, loadedAt: AT });
  const run: HarnessRuntimeRunEnvelope = {
    version: 1,
    request: { version: 1, runId: "run-web-eval", mode: "project-workspace", objective: "Evaluate Web recovery", targetRoot: f.targetRoot },
    preflight: { version: 1, runId: "run-web-eval", status: "ready", policy },
    state: { version: 1, stage: "IMPLEMENT", status: "RUNNING", completedStages: ["PREFLIGHT"], skippedStages: [], updatedAt: AT },
    evidence: [],
    updatedAt: AT,
  };
  return { ...f, policy, run };
}

function webScenario(input: {
  scenarioId: string;
  name: string;
  faultPlan?: EvaluationScenarioDefinition["scenario"]["faultPlan"];
  execute: EvaluationScenarioDefinition["execute"];
}): EvaluationScenarioDefinition {
  return {
    scenario: {
      version: 1,
      scenarioId: input.scenarioId,
      category: "chatgpt-web",
      name: input.name,
      targetMode: "project-workspace",
      maxDurationMs: 30_000,
      faultPlan: input.faultPlan ?? [],
      expectedInvariants: ["canonical-run-stable", "no-desktop-mutation-on-rejection"],
      requiredCapabilities: ["chatgpt-web"],
    },
    execute: input.execute,
  };
}
function sessionLossAdapter(
  base: ChatGptWebBrowserAdapter,
  context: EvaluationScenarioContext,
): ChatGptWebBrowserAdapter {
  const boundary = createScriptedFaultBoundary({ boundary: "chatgpt-web", injector: context.faultInjector });
  let loseNextResult = false;
  return {
    openOrResumeSession: (session, prompt) => base.openOrResumeSession(session, prompt),
    async submitTurn(session, prompt) {
      await base.submitTurn(session, prompt);
      const decision = await boundary.hit("after-prompt-submit");
      if (decision.action === "lose-session") loseNextResult = true;
    },
    async awaitStructuredResult(session, timeoutMs, contract) {
      if (loseNextResult) {
        loseNextResult = false;
        throw new ChatGptWebSessionLostError("evaluation browser session lost after prompt submit");
      }
      return base.awaitStructuredResult(session, timeoutMs, contract);
    },
    probeSession: (session) => base.probeSession(session),
    closeSession: (session) => base.closeSession(session),
  };
}

const sessionLoss = webScenario({
  scenarioId: "chatgpt-session-loss",
  name: "Browser session loss after prompt submission",
  faultPlan: [{ boundary: "chatgpt-web", point: "after-prompt-submit", occurrence: 1, action: "lose-session" }],
  execute: async (context) => {
    const f = await webFixture("iseol-eval-web-session-loss");
    const fake = createFakeChatGptWebBrowserAdapter([
      { version: 1, runId: "run-web-eval", stage: "IMPLEMENT", generation: 2, summary: "Recovered same Run", decisions: ["resume"], intents: [], outcome: "stage-complete" },
    ]);
    const executor = createWebReasoningExecutor({
      workerRoot: f.workerRoot,
      adapter: sessionLossAdapter(fake.adapter, context),
      now: () => AT,
      runDesktopIntent: async () => { throw new Error("Desktop should not run in session-loss scenario"); },
    });
    const result = await executor.execute(f.run);
    requireScenario(result.type === "completed", `session loss recovery returned ${result.type}`);
    requireScenario((await getActiveWebWorkerSession(f.workerRoot, "run-web-eval", "IMPLEMENT"))?.generation === 2, "Web recovery did not advance generation");
    requireScenario(fake.submittedPrompts.length === 2, `expected initial + recovery prompts, got ${fake.submittedPrompts.length}`);
    requireScenario(fake.submittedPrompts[1]?.kind === "recovery", "second prompt was not a recovery prompt");
    return passingExecution("Web session loss resumed the same Run with a new generation", {
      targetRunId: "run-web-eval",
      recoveries: [{ runId: "run-web-eval", startedAt: AT, recoveredAt: "2026-09-08T07:05:01.000Z", succeeded: true }],
      runs: [{ runId: "run-web-eval", startedAt: AT, completedAt: "2026-09-08T07:05:01.000Z", completed: true, verificationPassed: true, stageRetryCount: 0, staleSessionResultCount: 0, toolInvocationCount: 0, humanInterventionCount: 0 }],
      observations: [{ type: "recovery-observed", summary: "Recovered browser generation 2 for the same Run" }],
    });
  },
});
const oldGenerationLateResult = webScenario({
  scenarioId: "chatgpt-old-generation-late-result",
  name: "Old Web generation result arrives after recovery",
  faultPlan: [{ boundary: "chatgpt-web", point: "old-generation-result", occurrence: 1, action: "stale-late-result" }],
  execute: async (context) => {
    const f = await webFixture("iseol-eval-web-stale-result");
    const session = {
      version: 1 as const,
      sessionId: "session-old",
      runId: "run-web-eval",
      stage: "IMPLEMENT" as const,
      generation: 1,
      policySha256: f.policy.effectiveSha256,
      status: "ready" as const,
      resultContract: "legacy-structured-json" as const,
      createdAt: AT,
    };
    await createWebWorkerSession(f.workerRoot, session);
    await recoverWebWorkerSession({
      workerRoot: f.workerRoot,
      run: f.run,
      session,
      priorTurns: [],
      desktopEvidence: [],
      at: "2026-09-08T07:05:01.000Z",
    });
    const boundary = createScriptedFaultBoundary({ boundary: "chatgpt-web", injector: context.faultInjector });
    const decision = await boundary.hit("old-generation-result");
    requireScenario(decision.action === "stale-late-result", `unexpected old-generation action: ${decision.action}`);
    let rejected = false;
    try {
      await assertActiveWebWorkerResult(f.workerRoot, f.run, session, {
        version: 1,
        runId: "run-web-eval",
        stage: "IMPLEMENT",
        generation: 1,
        summary: "late stale result",
        decisions: [],
        intents: [],
        outcome: "stage-complete",
      });
    } catch (error) {
      rejected = /stale|generation|active/i.test(error instanceof Error ? error.message : String(error));
    }
    requireScenario(rejected, "old Web generation result was accepted");
    return passingExecution("Late old-generation Web result was discarded", {
      targetRunId: "run-web-eval",
      runs: [{ runId: "run-web-eval", startedAt: AT, completedAt: "2026-09-08T07:05:01.000Z", completed: true, verificationPassed: true, stageRetryCount: 0, staleSessionResultCount: 1, toolInvocationCount: 0, humanInterventionCount: 0 }],
    });
  },
});

const malformedOutputBudget = webScenario({
  scenarioId: "chatgpt-malformed-output-budget",
  name: "Malformed Web structured output exhausts bounded rejection budget",
  execute: async () => {
    const f = await webFixture("iseol-eval-web-malformed");
    const fake = createFakeChatGptWebBrowserAdapter([
      { version: 1, runId: "run-web-eval", stage: "IMPLEMENT", generation: 1, summary: "missing outcome", decisions: [], intents: [] },
      { version: 1, runId: "run-web-eval", stage: "IMPLEMENT", generation: 1, summary: "still malformed", decisions: [], intents: [] },
    ]);
    const executor = createWebReasoningExecutor({
      workerRoot: f.workerRoot,
      adapter: fake.adapter,
      maxRejectedIntents: 2,
      now: () => AT,
      runDesktopIntent: async () => { throw new Error("Desktop must not run for malformed Web output"); },
    });
    const result = await executor.execute(f.run);
    requireScenario(result.type === "retryable-failure", `malformed output returned ${result.type}`);
    requireScenario(result.type === "retryable-failure" && /rejected structured-result budget exhausted; outcome-invalid/i.test(result.reason), "malformed output did not exhaust bounded rejection budget with a safe diagnostic");
    requireScenario(fake.submittedPrompts.length === 2, `malformed output attempts were not bounded: ${fake.submittedPrompts.length}`);
    return passingExecution("Malformed structured output exhausted the bounded retry budget without mutation", {
      targetRunId: "run-web-eval",
      runs: [{ runId: "run-web-eval", startedAt: AT, completedAt: "2026-09-08T07:05:01.000Z", completed: true, verificationPassed: true, stageRetryCount: 2, staleSessionResultCount: 0, toolInvocationCount: 0, humanInterventionCount: 0 }],
    });
  },
});
const invalidIntentBudget = webScenario({
  scenarioId: "chatgpt-invalid-intent-budget",
  name: "Repeated invalid Web intent exhausts bounded rejection budget",
  execute: async () => {
    const f = await webFixture("iseol-eval-web-invalid-intent");
    const unsafeIntent = {
      version: 1 as const,
      intentId: "unsafe-read",
      runId: "run-web-eval",
      stage: "IMPLEMENT" as const,
      workspaceRoot: f.targetRoot,
      policySha256: f.policy.effectiveSha256,
      kind: "READ_CONTEXT" as const,
      path: "../secret.txt",
    };
    const fake = createFakeChatGptWebBrowserAdapter([
      { version: 1, runId: "run-web-eval", stage: "IMPLEMENT", generation: 1, summary: "unsafe read", decisions: [], intents: [unsafeIntent], outcome: "continue" },
    ]);
    let desktopCalls = 0;
    const executor = createWebReasoningExecutor({
      workerRoot: f.workerRoot,
      adapter: fake.adapter,
      maxRejectedIntents: 1,
      now: () => AT,
      runDesktopIntent: async () => { desktopCalls += 1; return { type: "completed", evidence: [] }; },
    });
    const result = await executor.execute(f.run);
    requireScenario(result.type === "retryable-failure", `invalid intent returned ${result.type}`);
    requireScenario(result.type === "retryable-failure" && /rejected intent/i.test(result.reason), "invalid intent did not exhaust bounded rejection budget");
    requireScenario(desktopCalls === 0, "rejected invalid intent reached Desktop mutation boundary");
    requireScenario((await loadDesktopIntent(f.workerRoot, "run-web-eval", "unsafe-read"))?.status === "rejected", "invalid intent was not durably rejected");
    return passingExecution("Invalid Web intent was durably rejected before Desktop dispatch", {
      targetRunId: "run-web-eval",
      runs: [{ runId: "run-web-eval", startedAt: AT, completedAt: "2026-09-08T07:05:01.000Z", completed: true, verificationPassed: true, stageRetryCount: 1, staleSessionResultCount: 0, toolInvocationCount: 0, humanInterventionCount: 0 }],
    });
  },
});

const policyDriftBeforeMutation = webScenario({
  scenarioId: "chatgpt-policy-drift-before-mutation",
  name: "Harness policy drifts after prompt compilation",
  execute: async () => {
    const f = await webFixture("iseol-eval-web-policy-drift");
    const policySha256 = f.policy.effectiveSha256;
    let desktopCalls = 0;
    const adapter: ChatGptWebBrowserAdapter = {
      async openOrResumeSession() { return {}; },
      async submitTurn() {},
      async awaitStructuredResult() {
        await writeFile(f.harnessPath, "# Drifted Evaluation Harness\n", "utf8");
        return {
          version: 1,
          runId: "run-web-eval",
          stage: "IMPLEMENT",
          generation: 1,
          summary: "attempt stale patch",
          decisions: [],
          intents: [{
            version: 1,
            intentId: "intent-stale",
            runId: "run-web-eval",
            stage: "IMPLEMENT",
            workspaceRoot: f.targetRoot,
            policySha256,
            kind: "PROPOSE_PATCH",
            path: "feature.txt",
            patch: ["--- a/feature.txt", "+++ b/feature.txt", "@@ -1 +1 @@", "-old", "+new", ""].join("\n"),
          }],
          outcome: "continue",
        };
      },
      async probeSession() { return "ready"; },
      async closeSession() {},
    };
    const executor = createWebReasoningExecutor({
      workerRoot: f.workerRoot,
      adapter,
      now: () => AT,
      runDesktopIntent: async () => { desktopCalls += 1; return { type: "completed", evidence: [] }; },
    });
    const result = await executor.execute(f.run);
    requireScenario(result.type === "retryable-failure", `policy drift returned ${result.type}`);
    requireScenario(result.type === "retryable-failure" && /policy source hash mismatch/i.test(result.reason), "policy drift was not detected");
    requireScenario(desktopCalls === 0, "policy-drifted Web output reached Desktop dispatch");
    return passingExecution("Policy drift rejected stale Web output before Desktop mutation", {
      targetRunId: "run-web-eval",
      runs: [{ runId: "run-web-eval", startedAt: AT, completedAt: "2026-09-08T07:05:01.000Z", completed: true, verificationPassed: true, stageRetryCount: 1, staleSessionResultCount: 0, toolInvocationCount: 0, humanInterventionCount: 0 }],
    });
  },
});

export const CHATGPT_WEB_RECOVERY_SCENARIOS: EvaluationScenarioDefinition[] = [
  sessionLoss,
  oldGenerationLateResult,
  malformedOutputBudget,
  invalidIntentBudget,
  policyDriftBeforeMutation,
];

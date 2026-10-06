import type { HarnessRealityInspector, HarnessRealitySnapshot } from "../../harness/recovery.js";
import { recoverHarnessRun } from "../../harness/recovery.js";
import { saveHarnessRun } from "../../harness/run-store.js";
import { superviseHarnessRun, type HarnessStageExecutor } from "../../harness/run-supervisor.js";
import {
  completeHarnessSideEffect,
  loadHarnessSideEffect,
  reserveHarnessSideEffect,
} from "../../harness/side-effect-ledger.js";
import { loadProjectHistory } from "../../project-model/history-store.js";
import { recordDiscordProjectHistory } from "../../discord-project/history-recorder.js";
import type { EvaluationScenarioDefinition } from "../scenario-runner.js";
import { createScriptedFaultBoundary } from "../test-support/scripted-fault-boundary.js";
import {
  createEvaluationFixture,
  evaluationRun,
  passingExecution,
  requireScenario,
} from "../test-support/evaluation-fixtures.js";

const AT = "2026-09-08T11:00:00.000Z";
const RECOVERED_AT = "2026-09-08T11:00:02.000Z";

function inspector(snapshot: HarnessRealitySnapshot): HarnessRealityInspector {
  return { inspect: async () => snapshot };
}

function providerScenario(input: {
  scenarioId: string;
  name: string;
  faultPlan?: EvaluationScenarioDefinition["scenario"]["faultPlan"];
  execute: EvaluationScenarioDefinition["execute"];
}): EvaluationScenarioDefinition {
  return {
    scenario: {
      version: 1,
      scenarioId: input.scenarioId,
      category: "provider",
      name: input.name,
      targetMode: "project-workspace",
      maxDurationMs: 30_000,
      faultPlan: input.faultPlan ?? [],
      expectedInvariants: ["no-duplicate-side-effects", "canonical-run-stable"],
      requiredCapabilities: ["provider-fake"],
    },
    execute: input.execute,
  };
}

const prResponseLoss = providerScenario({
  scenarioId: "provider-pr-response-loss",
  name: "Pull request creation succeeds before response loss",
  faultPlan: [{ boundary: "github", point: "after-pr-create", occurrence: 1, action: "drop-response" }],
  execute: async (context) => {
    const f = await createEvaluationFixture("iseol-eval-provider-pr-loss");
    await saveHarnessRun(f.runRoot, evaluationRun(f.targetRoot, "PR"));
    const key = "pull-request:example/repo:feat/evaluation";
    const reference = "https://github.com/example/repo/pull/42";
    const reservation = await reserveHarnessSideEffect(f.runRoot, {
      runId: "run-eval", key, kind: "pull-request", at: AT,
    });
    requireScenario(reservation.outcome === "reserved", `unexpected PR reservation: ${reservation.outcome}`);
    let providerCalls = 1;
    const boundary = createScriptedFaultBoundary({ boundary: "github", injector: context.faultInjector });
    const decision = await boundary.hit("after-pr-create");
    requireScenario(decision.action === "drop-response", `unexpected PR loss action: ${decision.action}`);

    const recovered = await recoverHarnessRun({
      storeRoot: f.runRoot,
      runId: "run-eval",
      at: RECOVERED_AT,
      inspector: inspector({
        agentAvailable: true,
        currentCommit: "abc123",
        pullRequest: { key, reference },
      }),
    });
    const receipt = await loadHarnessSideEffect(f.runRoot, "run-eval", key);
    requireScenario(recovered.state.stage === "CI", `PR recovery stopped at ${recovered.state.stage}`);
    requireScenario(receipt?.status === "completed", "lost PR response was not reconciled");
    return passingExecution("Lost PR response reconciled the existing pull request", {
      targetRunId: "run-eval",
      recoveries: [{ runId: "run-eval", startedAt: AT, recoveredAt: RECOVERED_AT, succeeded: true }],
      sideEffects: [{ kind: "pull-request", semanticKey: key }],
      providerCallCount: providerCalls,
      observations: [{ type: "recovery-observed", summary: "Recovered existing pull request after response loss", reference }],
    });
  },
});

const prRepeatDedupe = providerScenario({
  scenarioId: "provider-pr-repeat-dedupe",
  name: "Repeated pull request request is deduplicated",
  execute: async () => {
    const f = await createEvaluationFixture("iseol-eval-provider-pr-dedupe");
    const key = "pull-request:example/repo:feat/evaluation";
    const reference = "https://github.com/example/repo/pull/42";
    let providerCalls = 0;
    const first = await reserveHarnessSideEffect(f.runRoot, {
      runId: "run-eval", key, kind: "pull-request", at: AT,
    });
    requireScenario(first.outcome === "reserved", `first PR reservation was ${first.outcome}`);
    providerCalls += 1;
    await completeHarnessSideEffect(f.runRoot, {
      runId: "run-eval", key, at: AT, externalReference: reference, summary: "PR created",
    });
    const second = await reserveHarnessSideEffect(f.runRoot, {
      runId: "run-eval", key, kind: "pull-request", at: RECOVERED_AT,
    });
    requireScenario(second.outcome === "completed", `duplicate PR request was ${second.outcome}`);
    requireScenario(providerCalls === 1, `duplicate PR request called provider ${providerCalls} times`);
    requireScenario(second.receipt.externalReference === reference, "duplicate PR lost canonical reference");
    return passingExecution("Repeated PR request reused the completed side-effect receipt", {
      sideEffects: [{ kind: "pull-request", semanticKey: key }],
      providerCallCount: providerCalls,
    });
  },
});

async function superviseProviderStage(input: {
  prefix: string;
  stage: "PR" | "CI" | "DEPLOY" | "PRODUCTION_VERIFY";
  executor: HarnessStageExecutor;
  maxSteps?: number;
}) {
  const f = await createEvaluationFixture(input.prefix);
  const baseRun = evaluationRun(f.targetRoot, input.stage);
  await saveHarnessRun(f.runRoot, {
    ...baseRun,
    preflight: {
      version: 1, runId: "run-eval", status: "ready",
      policy: {
        version: 1, loadedAt: AT, effectiveSha256: f.policyDigest,
        sources: [{ kind: "project-harness", path: f.harnessPath, sha256: f.sourceSha, content: f.harnessContent }],
      },
    },
  });
  const run = await superviseHarnessRun({
    storeRoot: f.runRoot,
    runId: "run-eval",
    executor: input.executor,
    maxSteps: input.maxSteps ?? 1,
    now: () => AT,
  });
  return { f, run };
}

const ciFailure = providerScenario({
  scenarioId: "provider-ci-failure",
  name: "Failing CI is classified as final failure",
  execute: async () => {
    let providerCalls = 0;
    const { run } = await superviseProviderStage({
      prefix: "iseol-eval-provider-ci-failure",
      stage: "CI",
      executor: {
        execute: async () => {
          providerCalls += 1;
          return { type: "final-failure", reason: "GitHub Actions concluded failure" };
        },
      },
    });
    requireScenario(run.state.stage === "CI", `failed CI moved to ${run.state.stage}`);
    requireScenario(run.state.status === "FAILED_FINAL", `failed CI became ${run.state.status}`);
    requireScenario(/failure/i.test(run.state.reason ?? ""), "failed CI reason was not preserved");
    return passingExecution("Failing CI stopped the Run as a final provider failure", {
      providerCallCount: providerCalls,
    });
  },
});

const ciPending = providerScenario({
  scenarioId: "provider-ci-pending",
  name: "Pending CI waits for external provider state",
  execute: async () => {
    let providerCalls = 0;
    const { run } = await superviseProviderStage({
      prefix: "iseol-eval-provider-ci-pending",
      stage: "CI",
      executor: {
        execute: async () => {
          providerCalls += 1;
          return { type: "waiting-external", reason: "GitHub Actions is still pending" };
        },
      },
    });
    requireScenario(run.state.stage === "CI", `pending CI moved to ${run.state.stage}`);
    requireScenario(run.state.status === "WAITING_EXTERNAL", `pending CI became ${run.state.status}`);
    requireScenario(/pending/i.test(run.state.reason ?? ""), "pending CI reason was not preserved");
    return passingExecution("Pending CI remained in WAITING_EXTERNAL without replaying work", {
      providerCallCount: providerCalls,
    });
  },
});

const permissionDenied = providerScenario({
  scenarioId: "provider-permission-denied",
  name: "Provider permission denial requires user intervention",
  faultPlan: [{ boundary: "github", point: "provider-call", occurrence: 1, action: "return-permission-denied" }],
  execute: async (context) => {
    const boundary = createScriptedFaultBoundary({ boundary: "github", injector: context.faultInjector });
    let providerCalls = 0;
    const { run } = await superviseProviderStage({
      prefix: "iseol-eval-provider-permission",
      stage: "PR",
      executor: {
        execute: async () => {
          providerCalls += 1;
          const decision = await boundary.hit("provider-call");
          requireScenario(decision.action === "return-permission-denied", `unexpected permission action: ${decision.action}`);
          return { type: "blocked-user", reason: "GitHub permission denied for pull request creation" };
        },
      },
    });
    requireScenario(run.state.status === "BLOCKED_USER", `permission denial became ${run.state.status}`);
    requireScenario(/permission denied/i.test(run.state.reason ?? ""), "permission denial reason was lost");
    return passingExecution("Permission denial was classified as user-actionable without mutation", {
      providerCallCount: providerCalls,
    });
  },
});

const rateLimit = providerScenario({
  scenarioId: "provider-rate-limit",
  name: "Provider rate limit remains retryable",
  faultPlan: [{ boundary: "github", point: "provider-call", occurrence: 1, action: "return-rate-limit" }],
  execute: async (context) => {
    const boundary = createScriptedFaultBoundary({ boundary: "github", injector: context.faultInjector });
    let providerCalls = 0;
    const { run } = await superviseProviderStage({
      prefix: "iseol-eval-provider-rate-limit",
      stage: "PR",
      executor: {
        execute: async () => {
          providerCalls += 1;
          const decision = await boundary.hit("provider-call");
          requireScenario(decision.action === "return-rate-limit", `unexpected rate-limit action: ${decision.action}`);
          return { type: "retryable-failure", reason: "GitHub rate limit reached" };
        },
      },
    });
    requireScenario(run.state.status === "FAILED_RETRYABLE", `rate limit became ${run.state.status}`);
    requireScenario(/rate limit/i.test(run.state.reason ?? ""), "rate-limit reason was lost");
    return passingExecution("Rate limit stayed retryable and bounded", {
      providerCallCount: providerCalls,
      runs: [{
        runId: "run-eval", startedAt: AT, completedAt: AT, completed: true,
        verificationPassed: true, stageRetryCount: 1, staleSessionResultCount: 0,
        toolInvocationCount: 0, humanInterventionCount: 0,
      }],
    });
  },
});

const deployResponseLoss = providerScenario({
  scenarioId: "provider-deploy-response-loss",
  name: "Deployment succeeds before provider response loss",
  faultPlan: [{ boundary: "deploy", point: "after-deploy", occurrence: 1, action: "drop-response" }],
  execute: async (context) => {
    const f = await createEvaluationFixture("iseol-eval-provider-deploy-loss");
    await saveHarnessRun(f.runRoot, evaluationRun(f.targetRoot, "DEPLOY"));
    const key = "deployment:production:abc123";
    const reference = "deploy-42";
    const reservation = await reserveHarnessSideEffect(f.runRoot, {
      runId: "run-eval", key, kind: "deployment", at: AT,
    });
    requireScenario(reservation.outcome === "reserved", `unexpected deploy reservation: ${reservation.outcome}`);
    let providerCalls = 1;
    const boundary = createScriptedFaultBoundary({ boundary: "deploy", injector: context.faultInjector });
    const decision = await boundary.hit("after-deploy");
    requireScenario(decision.action === "drop-response", `unexpected deploy loss action: ${decision.action}`);

    const recovered = await recoverHarnessRun({
      storeRoot: f.runRoot,
      runId: "run-eval",
      at: RECOVERED_AT,
      inspector: inspector({
        agentAvailable: true,
        currentCommit: "abc123",
        deployment: { key, reference, commit: "abc123" },
      }),
    });
    const receipt = await loadHarnessSideEffect(f.runRoot, "run-eval", key);
    requireScenario(recovered.state.stage === "PRODUCTION_VERIFY", `deploy recovery stopped at ${recovered.state.stage}`);
    requireScenario(receipt?.status === "completed", "lost deployment response was not reconciled");
    requireScenario(receipt?.externalReference === reference, "deployment reference changed during recovery");
    return passingExecution("Lost deployment response reconciled the deployed current commit", {
      targetRunId: "run-eval",
      recoveries: [{ runId: "run-eval", startedAt: AT, recoveredAt: RECOVERED_AT, succeeded: true }],
      sideEffects: [{ kind: "deployment", semanticKey: key }],
      providerCallCount: providerCalls,
      observations: [{ type: "recovery-observed", summary: "Recovered deployment for current commit", reference }],
    });
  },
});

const deployWrongCommit = providerScenario({
  scenarioId: "provider-deploy-wrong-commit",
  name: "Deployment for the wrong commit is not reconciled",
  execute: async () => {
    const f = await createEvaluationFixture("iseol-eval-provider-wrong-commit");
    await saveHarnessRun(f.runRoot, evaluationRun(f.targetRoot, "DEPLOY"));
    const recovered = await recoverHarnessRun({
      storeRoot: f.runRoot,
      runId: "run-eval",
      at: RECOVERED_AT,
      inspector: inspector({
        agentAvailable: true,
        currentCommit: "abc123",
        deployment: { key: "deployment:production:old999", reference: "deploy-old", commit: "old999" },
      }),
    });
    requireScenario(recovered.state.stage === "DEPLOY", `wrong-commit deployment advanced to ${recovered.state.stage}`);
    requireScenario(recovered.state.status === "RUNNING", `wrong-commit recovery became ${recovered.state.status}`);
    requireScenario(recovered.evidence.every((item) => item.kind !== "deployment"), "wrong-commit deployment created completion evidence");
    const receipt = await loadHarnessSideEffect(f.runRoot, "run-eval", "deployment:production:old999");
    requireScenario(receipt === null, "wrong-commit deployment created a side-effect receipt");
    return passingExecution("Wrong-commit deployment remained unreconciled at DEPLOY", {
      targetRunId: "run-eval",
      recoveries: [{ runId: "run-eval", startedAt: AT, recoveredAt: RECOVERED_AT, succeeded: true }],
      providerCallCount: 1,
    });
  },
});

const productionVerifyTimeout = providerScenario({
  scenarioId: "provider-production-verify-timeout",
  name: "Production verification timeout remains retryable",
  faultPlan: [{ boundary: "deploy", point: "production-verify", occurrence: 1, action: "return-timeout" }],
  execute: async (context) => {
    const boundary = createScriptedFaultBoundary({ boundary: "deploy", injector: context.faultInjector });
    let providerCalls = 0;
    const { run } = await superviseProviderStage({
      prefix: "iseol-eval-provider-verify-timeout",
      stage: "PRODUCTION_VERIFY",
      executor: {
        execute: async () => {
          providerCalls += 1;
          const decision = await boundary.hit("production-verify");
          requireScenario(decision.action === "return-timeout", `unexpected verify action: ${decision.action}`);
          return { type: "retryable-failure", reason: "Production verification timed out" };
        },
      },
    });
    requireScenario(run.state.stage === "PRODUCTION_VERIFY", `verify timeout moved to ${run.state.stage}`);
    requireScenario(run.state.status === "FAILED_RETRYABLE", `verify timeout became ${run.state.status}`);
    requireScenario(/timed out/i.test(run.state.reason ?? ""), "verify timeout reason was lost");
    return passingExecution("Production verification timeout stayed bounded and retryable", {
      providerCallCount: providerCalls,
      runs: [{
        runId: "run-eval", startedAt: AT, completedAt: AT, completed: true,
        verificationPassed: true, stageRetryCount: 1, staleSessionResultCount: 0,
        toolInvocationCount: 0, humanInterventionCount: 0,
      }],
    });
  },
});

const duplicateCallback = providerScenario({
  scenarioId: "provider-duplicate-callback",
  name: "Duplicate provider callback is append-once",
  execute: async () => {
    const f = await createEvaluationFixture("iseol-eval-provider-callback");
    const input = {
      modelRoot: f.runRoot,
      context: { projectId: "project-provider", nodeId: "root" },
      eventType: "integration-action-recorded" as const,
      source: "github" as const,
      action: "deployment-created",
      reference: "deploy-42",
      summary: "Production deployment created",
      at: "2026-09-08T11:05:00.000Z",
      occurredAt: "2026-09-08T11:04:12.000Z",
      lifecycle: "deployment-created" as const,
    };
    const first = await recordDiscordProjectHistory(input);
    const second = await recordDiscordProjectHistory({ ...input, at: "2026-09-08T11:06:00.000Z" });
    const history = await loadProjectHistory(f.runRoot, "project-provider");
    requireScenario(first, "first provider callback was not recorded");
    requireScenario(!second, "duplicate provider callback was recorded twice");
    requireScenario(history.length === 1, `duplicate callback created ${history.length} history events`);
    requireScenario(history[0]?.occurredAt === input.occurredAt, "provider occurrence time changed during callback dedupe");
    return passingExecution("Duplicate provider callback reused the same history identity", {
      providerCallCount: 2,
    });
  },
});

export const PROVIDER_RECOVERY_SCENARIOS: EvaluationScenarioDefinition[] = [
  prResponseLoss,
  prRepeatDedupe,
  ciFailure,
  ciPending,
  permissionDenied,
  rateLimit,
  deployResponseLoss,
  deployWrongCommit,
  productionVerifyTimeout,
  duplicateCallback,
];

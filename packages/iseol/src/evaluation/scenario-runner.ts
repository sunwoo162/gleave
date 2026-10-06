import type {
  EvaluationObservation,
  EvaluationRun,
  EvaluationScenario,
  InjectedFault,
  InvariantResult,
} from "./contracts.js";
import { assertEvaluationScenario } from "./contracts.js";
import { createDeterministicFaultInjector, type EvaluationFaultInjector } from "./fault-injector.js";
import {
  reduceEvaluationMetrics,
  type EvaluationMetricRunEvidence,
  type EvaluationRecoveryEvidence,
  type EvaluationSideEffectEvidence,
} from "./metrics-reducer.js";
import {
  evaluateEvaluationInvariants,
  type EvaluationInvariantEvidence,
} from "./invariant-evaluator.js";
import { buildEvaluationReport } from "./report.js";
import { saveEvaluationRun } from "./evaluation-store.js";
import { appendEvaluationObservationOnce, listEvaluationObservations } from "./observation-store.js";
import { saveEvaluationReport } from "./report-store.js";

export type EvaluationScenarioExecution = {
  targetRunId?: string;
  targetCampaignId?: string;
  runs: EvaluationMetricRunEvidence[];
  recoveries?: EvaluationRecoveryEvidence[];
  sideEffects?: EvaluationSideEffectEvidence[];
  providerCallCount?: number;
  unexpectedMutationCount?: number;
  invariantEvidence: Omit<EvaluationInvariantEvidence, "metrics">;
  summary: string;
  observations?: Array<Pick<EvaluationObservation, "type" | "summary" | "reference">>;
};

export type EvaluationScenarioContext = {
  root: string;
  evaluationId: string;
  suiteId: string;
  seed: string;
  now: () => string;
  faultInjector: EvaluationFaultInjector;
};

export type EvaluationScenarioDefinition = {
  scenario: EvaluationScenario;
  execute(context: EvaluationScenarioContext): Promise<EvaluationScenarioExecution>;
};
const ZERO_METRICS = {
  completionRate: 0,
  recoverySuccessRate: 0,
  humanInterventionCount: 0,
  duplicateSideEffectCount: 0,
  unexpectedMutationCount: 0,
  verificationPassRate: 0,
  recoveryLatencyMs: 0,
  runDurationMs: 0,
  stageRetryCount: 0,
  staleSessionResultCount: 0,
  providerCallCount: 0,
  toolInvocationCount: 0,
} as const;

function failedInvariant(summary: string): InvariantResult {
  return {
    id: "scenario-execution",
    name: "Scenario execution",
    status: "failed",
    expected: "scenario completes through the expected Iseol boundary",
    actual: "scenario threw",
    summary,
  };
}

async function appendObservation(input: {
  root: string;
  evaluationId: string;
  scenarioId: string;
  id: string;
  at: string;
  type: EvaluationObservation["type"];
  summary: string;
  reference?: string;
}): Promise<void> {
  await appendEvaluationObservationOnce(input.root, {
    version: 1,
    id: input.id,
    evaluationId: input.evaluationId,
    scenarioId: input.scenarioId,
    type: input.type,
    at: input.at,
    summary: input.summary,
    ...(input.reference === undefined ? {} : { reference: input.reference }),
  });
}
export async function runEvaluationScenario(input: {
  root: string;
  suiteId: string;
  evaluationId: string;
  definition: EvaluationScenarioDefinition;
  seed: string;
  now?: () => string;
}) {
  assertEvaluationScenario(input.definition.scenario);
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const injectedFaults: InjectedFault[] = [];
  let faultObservationIndex = 0;
  const faultInjector = createDeterministicFaultInjector({
    scenarioId: input.definition.scenario.scenarioId,
    seed: input.seed,
    plan: input.definition.scenario.faultPlan,
    now,
    recordFault: async (fault) => {
      injectedFaults.push(fault);
      faultObservationIndex += 1;
      await appendObservation({
        root: input.root,
        evaluationId: input.evaluationId,
        scenarioId: input.definition.scenario.scenarioId,
        id: `obs-fault-${faultObservationIndex}`,
        at: fault.injectedAt,
        type: "fault-injected",
        summary: `${fault.boundary}/${fault.point}/${fault.occurrence}: ${fault.action}`,
        reference: fault.faultId,
      });
    },
  });

  let run: EvaluationRun = {
    version: 1,
    evaluationId: input.evaluationId,
    suiteId: input.suiteId,
    scenarioId: input.definition.scenario.scenarioId,
    seed: input.seed,
    status: "running",
    startedAt,
    injectedFaults: [],
    metrics: { ...ZERO_METRICS },
    invariants: [],
    summary: `Running ${input.definition.scenario.name}`,
  };
  await saveEvaluationRun(input.root, run);
  await appendObservation({
    root: input.root,
    evaluationId: input.evaluationId,
    scenarioId: input.definition.scenario.scenarioId,
    id: "obs-start",
    at: startedAt,
    type: "evaluation-started",
    summary: `Started ${input.definition.scenario.name}`,
  });
  try {
    const execution = await input.definition.execute({
      root: input.root,
      evaluationId: input.evaluationId,
      suiteId: input.suiteId,
      seed: input.seed,
      now,
      faultInjector,
    });
    const metrics = reduceEvaluationMetrics({
      runs: execution.runs,
      recoveries: execution.recoveries ?? [],
      sideEffects: execution.sideEffects ?? [],
      providerCallCount: execution.providerCallCount ?? 0,
      unexpectedMutationCount: execution.unexpectedMutationCount ?? 0,
    });
    const invariants = evaluateEvaluationInvariants({ metrics, ...execution.invariantEvidence });
    const completedAt = now();
    let observationIndex = 0;
    for (const observation of execution.observations ?? []) {
      observationIndex += 1;
      await appendObservation({
        root: input.root,
        evaluationId: input.evaluationId,
        scenarioId: input.definition.scenario.scenarioId,
        id: `obs-scenario-${observationIndex}`,
        at: completedAt,
        type: observation.type,
        summary: observation.summary,
        ...(observation.reference === undefined ? {} : { reference: observation.reference }),
      });
    }
    const invariantFailed = invariants.some((item) => item.status === "failed");
    run = {
      ...run,
      ...(execution.targetRunId === undefined ? {} : { targetRunId: execution.targetRunId }),
      ...(execution.targetCampaignId === undefined ? {} : { targetCampaignId: execution.targetCampaignId }),
      status: invariantFailed ? "failed" : "passed",
      completedAt,
      injectedFaults: [...injectedFaults],
      metrics,
      invariants,
      summary: execution.summary,
    };
    await saveEvaluationRun(input.root, run);
    await appendObservation({
      root: input.root,
      evaluationId: input.evaluationId,
      scenarioId: input.definition.scenario.scenarioId,
      id: "obs-complete",
      at: completedAt,
      type: "evaluation-completed",
      summary: execution.summary,
    });
    const report = buildEvaluationReport({
      evaluationId: input.evaluationId,
      suiteId: input.suiteId,
      startedAt,
      completedAt,
      metrics,
      invariants,
      scenarios: [{
        scenarioId: input.definition.scenario.scenarioId,
        evaluationId: input.evaluationId,
        seed: input.seed,
        status: run.status,
      }],
      liveBlockers: [],
      summary: execution.summary,
    });
    await saveEvaluationReport(input.root, report);
    return { run, report, observations: await listEvaluationObservations(input.root, input.evaluationId) };
  } catch (error) {
    const completedAt = now();
    const message = error instanceof Error ? error.message : String(error);
    const invariants = [failedInvariant(message)];
    run = {
      ...run,
      status: "failed",
      completedAt,
      injectedFaults: [...injectedFaults],
      invariants,
      summary: `Scenario failed: ${message}`,
    };
    await saveEvaluationRun(input.root, run);
    await appendObservation({
      root: input.root,
      evaluationId: input.evaluationId,
      scenarioId: input.definition.scenario.scenarioId,
      id: "obs-failed",
      at: completedAt,
      type: "invariant-violated",
      summary: run.summary,
    });
    await appendObservation({
      root: input.root,
      evaluationId: input.evaluationId,
      scenarioId: input.definition.scenario.scenarioId,
      id: "obs-complete",
      at: completedAt,
      type: "evaluation-completed",
      summary: run.summary,
    });
    const report = buildEvaluationReport({
      evaluationId: input.evaluationId,
      suiteId: input.suiteId,
      startedAt,
      completedAt,
      metrics: run.metrics,
      invariants,
      scenarios: [{
        scenarioId: input.definition.scenario.scenarioId,
        evaluationId: input.evaluationId,
        seed: input.seed,
        status: "failed",
        diagnostic: message,
      }],
      liveBlockers: [],
      summary: run.summary,
    });
    await saveEvaluationReport(input.root, report);
    return { run, report, observations: await listEvaluationObservations(input.root, input.evaluationId) };
  }
}

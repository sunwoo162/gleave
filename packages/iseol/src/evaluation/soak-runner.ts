import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { EvaluationMetrics, EvaluationReport, InvariantResult } from "./contracts.js";
import { buildEvaluationReport } from "./report.js";
import { saveEvaluationReport } from "./report-store.js";
import { observeEvaluationResources } from "./resource-observer.js";
import { runEvaluationScenario } from "./scenario-runner.js";
import { QUICK_EVALUATION_DEFINITIONS, QUICK_EVALUATION_SUITE } from "./scenario-catalog.js";

export type RunSoakEvaluationInput = {
  root: string;
  iterations: number;
  seeds: string[];
  maxDurationMs: number;
  now?: () => string;
  clockMs?: () => number;
};

const ZERO_METRICS: EvaluationMetrics = {
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
};

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function aggregateMetrics(items: EvaluationMetrics[]): EvaluationMetrics {
  if (items.length === 0) return { ...ZERO_METRICS };
  return {
    completionRate: average(items.map((item) => item.completionRate)),
    recoverySuccessRate: average(items.map((item) => item.recoverySuccessRate)),
    humanInterventionCount: items.reduce((sum, item) => sum + item.humanInterventionCount, 0),
    duplicateSideEffectCount: items.reduce((sum, item) => sum + item.duplicateSideEffectCount, 0),
    unexpectedMutationCount: items.reduce((sum, item) => sum + item.unexpectedMutationCount, 0),
    verificationPassRate: average(items.map((item) => item.verificationPassRate)),
    recoveryLatencyMs: Math.max(0, ...items.map((item) => item.recoveryLatencyMs)),
    runDurationMs: average(items.map((item) => item.runDurationMs)),
    stageRetryCount: items.reduce((sum, item) => sum + item.stageRetryCount, 0),
    staleSessionResultCount: items.reduce((sum, item) => sum + item.staleSessionResultCount, 0),
    providerCallCount: items.reduce((sum, item) => sum + item.providerCallCount, 0),
    toolInvocationCount: items.reduce((sum, item) => sum + item.toolInvocationCount, 0),
  };
}

function evaluationId(prefix: string, at: string): string {
  const stamp = at.replace(/[^A-Za-z0-9]/g, "").slice(0, 48);
  if (!stamp) throw new Error("Soak evaluation timestamp cannot form an id");
  return `${prefix}-${stamp}`;
}

function validateInput(input: RunSoakEvaluationInput): void {
  if (!Number.isInteger(input.iterations) || input.iterations <= 0) {
    throw new Error("Soak iterations must be a positive integer");
  }
  if (input.seeds.length === 0 || input.seeds.some((seed) => !seed.trim())) {
    throw new Error("Soak seeds must contain non-empty values");
  }
  if (!Number.isFinite(input.maxDurationMs) || input.maxDurationMs <= 0) {
    throw new Error("Soak maxDurationMs must be positive");
  }
}

function budgetInvariant(elapsedMs: number, budgetMs: number): InvariantResult {
  return {
    id: "soak-time-budget",
    name: "Soak time budget",
    status: "failed",
    expected: `elapsed <= ${budgetMs}ms`,
    actual: `elapsed ${elapsedMs}ms`,
    summary: "Soak evaluation time budget was exhausted before starting the next scenario",
  };
}

function resourceInvariant(snapshot: Awaited<ReturnType<typeof observeEvaluationResources>>): InvariantResult {
  const leaked = snapshot.orphanProcessCount
    + snapshot.expiredLiveLeaseCount
    + snapshot.unreconciledMutatingIndeterminateCount
    + snapshot.staleHealthySessionCount
    + snapshot.temporaryFileCount;
  return {
    id: "soak-resource-end-state",
    name: "Soak resource end state",
    status: leaked === 0 ? "passed" : "failed",
    expected: "no owned orphan process, expired lease, indeterminate mutation, stale healthy session, or temp file",
    actual: `orphan=${snapshot.orphanProcessCount}, expiredLease=${snapshot.expiredLiveLeaseCount}, indeterminate=${snapshot.unreconciledMutatingIndeterminateCount}, staleSession=${snapshot.staleHealthySessionCount}, temp=${snapshot.temporaryFileCount}`,
    summary: leaked === 0 ? "Evaluator-owned resources reached a clean terminal state" : "Evaluator-owned resources leaked after soak completion",
  };
}

async function saveBudgetFailure(input: {
  root: string;
  evaluationId: string;
  startedAt: string;
  completedAt: string;
  elapsedMs: number;
  budgetMs: number;
  metrics: EvaluationMetrics[];
  invariants: InvariantResult[];
  scenarios: EvaluationReport["scenarios"];
}): Promise<EvaluationReport> {
  const invariant = budgetInvariant(input.elapsedMs, input.budgetMs);
  const resources = await observeEvaluationResources({
    evaluationRoot: input.root,
    now: input.completedAt,
  });
  const resource = resourceInvariant(resources);
  const report = buildEvaluationReport({
    evaluationId: input.evaluationId,
    suiteId: "soak-evaluation",
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    metrics: aggregateMetrics(input.metrics),
    invariants: [...input.invariants, invariant, resource],
    scenarios: input.scenarios,
    liveBlockers: [],
    summary: `Soak evaluation failed: time budget ${input.budgetMs}ms exhausted`,
  });
  await saveEvaluationReport(input.root, report);
  return report;
}

export async function runSoakEvaluation(input: RunSoakEvaluationInput): Promise<EvaluationReport> {
  validateInput(input);
  const now = input.now ?? (() => new Date().toISOString());
  const clockMs = input.clockMs ?? (() => Date.now());
  const startedAt = now();
  const aggregateId = evaluationId("soak", startedAt);
  const startedMs = clockMs();
  const metrics: EvaluationMetrics[] = [];
  const invariants: InvariantResult[] = [];
  const scenarios: EvaluationReport["scenarios"] = [];

  for (let iteration = 0; iteration < input.iterations; iteration += 1) {
    const baseSeed = input.seeds[iteration % input.seeds.length]!;
    for (const [scenarioIndex, definition] of QUICK_EVALUATION_DEFINITIONS.entries()) {
      const elapsedMs = clockMs() - startedMs;
      if (elapsedMs > input.maxDurationMs) {
        return saveBudgetFailure({
          root: input.root,
          evaluationId: aggregateId,
          startedAt,
          completedAt: now(),
          elapsedMs,
          budgetMs: input.maxDurationMs,
          metrics,
          invariants,
          scenarios,
        });
      }
      const iterationLabel = String(iteration + 1).padStart(2, "0");
      const scenarioLabel = String(scenarioIndex + 1).padStart(2, "0");
      const scenarioId = definition.scenario.scenarioId;
      const seed = `${baseSeed}-i${iterationLabel}-${scenarioId}`;
      const childEvaluationId = `${aggregateId}-i${iterationLabel}-s${scenarioLabel}`;
      const result = await runEvaluationScenario({
        root: input.root,
        suiteId: "soak-evaluation",
        evaluationId: childEvaluationId,
        definition,
        seed,
        now,
      });
      metrics.push(result.run.metrics);
      invariants.push(...result.run.invariants);
      scenarios.push({
        scenarioId,
        evaluationId: childEvaluationId,
        seed,
        status: result.run.status,
        ...(result.report.scenarios[0]?.diagnostic === undefined
          ? {}
          : { diagnostic: result.report.scenarios[0]?.diagnostic }),
      });
    }
  }

  const completedAt = now();
  const resources = await observeEvaluationResources({
    evaluationRoot: input.root,
    now: completedAt,
  });
  invariants.push(resourceInvariant(resources));
  const passed = scenarios.filter((item) => item.status === "passed").length;
  const report = buildEvaluationReport({
    evaluationId: aggregateId,
    suiteId: "soak-evaluation",
    startedAt,
    completedAt,
    metrics: aggregateMetrics(metrics),
    invariants,
    scenarios,
    liveBlockers: [],
    summary: `Soak evaluation passed ${passed}/${scenarios.length} scenario executions across ${input.iterations} iteration(s) of ${QUICK_EVALUATION_SUITE.scenarioIds.length} committed scenarios`,
  });
  await saveEvaluationReport(input.root, report);
  return report;
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

function positiveNumber(value: string | undefined, fallback: number, label: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be positive`);
  return parsed;
}

async function runSoakCli(): Promise<void> {
  const root = process.env.ISEOL_EVALUATION_ROOT
    ? resolve(process.env.ISEOL_EVALUATION_ROOT)
    : resolve(process.cwd(), "data", "iseol-evaluation-soak");
  const iterations = positiveNumber(process.env.ISEOL_SOAK_ITERATIONS, 2, "ISEOL_SOAK_ITERATIONS");
  if (!Number.isInteger(iterations)) throw new Error("ISEOL_SOAK_ITERATIONS must be an integer");
  const seeds = (process.env.ISEOL_SOAK_SEEDS ?? "soak-v1")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const maxDurationMs = positiveNumber(process.env.ISEOL_SOAK_MAX_DURATION_MS, 120_000, "ISEOL_SOAK_MAX_DURATION_MS");
  const report = await runSoakEvaluation({ root, iterations, seeds, maxDurationMs });
  console.log(`eval:soak ${report.status} suiteId=${report.suiteId} evaluationId=${report.evaluationId} scenarios=${report.scenarios.length}`);
  process.exitCode = report.status === "passed" ? 0 : 1;
}

if (isDirectExecution()) {
  void runSoakCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

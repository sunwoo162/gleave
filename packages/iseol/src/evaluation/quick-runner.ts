import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { EvaluationMetrics, EvaluationReport, InvariantResult } from "./contracts.js";
import { buildEvaluationReport } from "./report.js";
import { saveEvaluationReport } from "./report-store.js";
import { runEvaluationScenario } from "./scenario-runner.js";
import {
  QUICK_EVALUATION_DEFINITIONS,
  QUICK_EVALUATION_SEEDS,
  QUICK_EVALUATION_SUITE,
} from "./scenario-catalog.js";

function quickEvaluationId(at: string): string {
  const stamp = at.replace(/[^A-Za-z0-9]/g, "").slice(0, 48);
  if (!stamp) throw new Error("Quick evaluation timestamp cannot form an id");
  return `quick-${stamp}`;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function aggregateMetrics(items: EvaluationMetrics[]): EvaluationMetrics {
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

function scenarioEvaluationId(aggregateId: string, index: number): string {
  return `${aggregateId}-s${String(index + 1).padStart(2, "0")}`;
}

export async function runQuickEvaluation(input: {
  root: string;
  now?: () => string;
}): Promise<EvaluationReport> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const evaluationId = quickEvaluationId(startedAt);
  const metrics: EvaluationMetrics[] = [];
  const invariants: InvariantResult[] = [];
  const scenarios: EvaluationReport["scenarios"] = [];
  for (const [index, definition] of QUICK_EVALUATION_DEFINITIONS.entries()) {
    const scenarioId = definition.scenario.scenarioId;
    const seed = QUICK_EVALUATION_SEEDS[scenarioId];
    if (!seed) throw new Error(`Quick evaluation seed missing: ${scenarioId}`);
    const childEvaluationId = scenarioEvaluationId(evaluationId, index);
    const result = await runEvaluationScenario({
      root: input.root,
      suiteId: QUICK_EVALUATION_SUITE.suiteId,
      evaluationId: childEvaluationId,
      definition,
      seed,
      now,
    });
    metrics.push(result.run.metrics);
    invariants.push(...result.run.invariants);
    const child = result.report.scenarios[0];
    scenarios.push({
      scenarioId,
      evaluationId: childEvaluationId,
      seed,
      status: result.run.status,
      ...(child?.diagnostic === undefined ? {} : { diagnostic: child.diagnostic }),
    });
  }

  const completedAt = now();
  const passed = scenarios.filter((item) => item.status === "passed").length;
  const report = buildEvaluationReport({
    evaluationId,
    suiteId: QUICK_EVALUATION_SUITE.suiteId,
    startedAt,
    completedAt,
    metrics: aggregateMetrics(metrics),
    invariants,
    scenarios,
    liveBlockers: [],
    summary: `Quick evaluation passed ${passed}/${scenarios.length} deterministic scenarios`,
  });
  await saveEvaluationReport(input.root, report);
  return report;
}

export function quickEvaluationExitCode(report: EvaluationReport): 0 | 1 {
  return report.status === "passed" ? 0 : 1;
}

export function formatQuickEvaluationOutput(report: EvaluationReport): string {
  const lines = [
    `eval:quick ${report.status} suiteId=${report.suiteId} evaluationId=${report.evaluationId} scenarios=${report.scenarios.length}`,
  ];
  for (const scenario of report.scenarios) {
    if (scenario.status === "passed") continue;
    lines.push(
      `replay suiteId=${report.suiteId} scenarioId=${scenario.scenarioId} evaluationId=${scenario.evaluationId} seed=${scenario.seed} status=${scenario.status}`,
    );
  }
  for (const blocker of report.liveBlockers) {
    lines.push(`live-smoke blocker: ${blocker}`);
  }
  return lines.join("\n");
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

async function runQuickCli(): Promise<void> {
  const root = process.env.ISEOL_EVALUATION_ROOT
    ? resolve(process.env.ISEOL_EVALUATION_ROOT)
    : resolve(process.cwd(), "data", "iseol-evaluation");
  const report = await runQuickEvaluation({ root });
  console.log(formatQuickEvaluationOutput(report));
  process.exitCode = quickEvaluationExitCode(report);
}

if (isDirectExecution()) {
  void runQuickCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

import { assertEvaluationId, type EvaluationMetrics } from "./contracts.js";

export type EvaluationMetricRunEvidence = {
  runId: string;
  startedAt: string;
  completedAt?: string;
  completed: boolean;
  verificationPassed?: boolean;
  stageRetryCount: number;
  staleSessionResultCount: number;
  toolInvocationCount: number;
  humanInterventionCount: number;
};

export type EvaluationRecoveryEvidence = {
  runId: string;
  startedAt: string;
  recoveredAt?: string;
  succeeded: boolean;
};

export type EvaluationSideEffectEvidence = {
  kind: "commit" | "pull-request" | "merge" | "deployment" | "provider";
  semanticKey: string;
};

export type ReduceEvaluationMetricsInput = {
  runs: EvaluationMetricRunEvidence[];
  recoveries: EvaluationRecoveryEvidence[];
  sideEffects: EvaluationSideEffectEvidence[];
  providerCallCount: number;
  unexpectedMutationCount: number;
};
function timestamp(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`${label} must be an ISO timestamp`);
  return parsed;
}

function nonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile95(values: number[]): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(ordered.length * 0.95) - 1);
  return ordered[index] ?? 0;
}

export function reduceEvaluationMetrics(input: ReduceEvaluationMetricsInput): EvaluationMetrics {
  nonNegativeInteger(input.providerCallCount, "providerCallCount");
  nonNegativeInteger(input.unexpectedMutationCount, "unexpectedMutationCount");

  const runDurations: number[] = [];
  let completedCount = 0;
  let verificationCount = 0;
  let verificationPassCount = 0;
  let humanInterventionCount = 0;
  let stageRetryCount = 0;
  let staleSessionResultCount = 0;
  let toolInvocationCount = 0;

  for (const run of input.runs) {
    assertEvaluationId(run.runId);
    const startedAt = timestamp(run.startedAt, "run startedAt");
    if (run.completedAt !== undefined) {
      const completedAt = timestamp(run.completedAt, "run completedAt");
      if (completedAt < startedAt) throw new Error("run completedAt cannot precede startedAt");
      runDurations.push(completedAt - startedAt);
    }
    if (typeof run.completed !== "boolean") throw new Error("run completed must be boolean");
    if (run.completed) completedCount += 1;
    if (run.verificationPassed !== undefined) {
      if (typeof run.verificationPassed !== "boolean") throw new Error("verificationPassed must be boolean");
      verificationCount += 1;
      if (run.verificationPassed) verificationPassCount += 1;
    }
    for (const [value, label] of [
      [run.stageRetryCount, "stageRetryCount"],
      [run.staleSessionResultCount, "staleSessionResultCount"],
      [run.toolInvocationCount, "toolInvocationCount"],
      [run.humanInterventionCount, "humanInterventionCount"],
    ] as const) nonNegativeInteger(value, label);
    stageRetryCount += run.stageRetryCount;
    staleSessionResultCount += run.staleSessionResultCount;
    toolInvocationCount += run.toolInvocationCount;
    humanInterventionCount += run.humanInterventionCount;
  }

  const recoveryLatencies: number[] = [];
  let recoverySuccessCount = 0;
  for (const recovery of input.recoveries) {
    assertEvaluationId(recovery.runId);
    const startedAt = timestamp(recovery.startedAt, "recovery startedAt");
    let recoveredAt: number | undefined;
    if (recovery.recoveredAt !== undefined) {
      recoveredAt = timestamp(recovery.recoveredAt, "recovery recoveredAt");
      if (recoveredAt < startedAt) throw new Error("recovery recoveredAt cannot precede startedAt");
    }
    if (typeof recovery.succeeded !== "boolean") throw new Error("recovery succeeded must be boolean");
    if (recovery.succeeded) {
      if (recoveredAt === undefined) throw new Error("successful recovery requires recoveredAt");
      recoverySuccessCount += 1;
      recoveryLatencies.push(recoveredAt - startedAt);
    }
  }

  const seenEffects = new Set<string>();
  let duplicateSideEffectCount = 0;
  for (const effect of input.sideEffects) {
    if (!effect.semanticKey.trim()) throw new Error("side effect semanticKey is required");
    const key = `${effect.kind}\u0000${effect.semanticKey}`;
    if (seenEffects.has(key)) duplicateSideEffectCount += 1;
    else seenEffects.add(key);
  }

  return {
    completionRate: input.runs.length === 0 ? 0 : completedCount / input.runs.length,
    recoverySuccessRate: input.recoveries.length === 0 ? 0 : recoverySuccessCount / input.recoveries.length,
    humanInterventionCount,
    duplicateSideEffectCount,
    unexpectedMutationCount: input.unexpectedMutationCount,
    verificationPassRate: verificationCount === 0 ? 0 : verificationPassCount / verificationCount,
    recoveryLatencyMs: percentile95(recoveryLatencies),
    runDurationMs: average(runDurations),
    stageRetryCount,
    staleSessionResultCount,
    providerCallCount: input.providerCallCount,
    toolInvocationCount,
  };
}

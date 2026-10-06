import {
  assertEvaluationReport,
  type EvaluationMetrics,
  type EvaluationReport,
  type EvaluationScenarioSummary,
  type InvariantResult,
} from "./contracts.js";
import { sanitizeCredentialText } from "../security/text-safety.js";

export type BuildEvaluationReportInput = {
  evaluationId: string;
  suiteId: string;
  startedAt: string;
  completedAt: string;
  metrics: EvaluationMetrics;
  invariants: InvariantResult[];
  scenarios: EvaluationScenarioSummary[];
  liveBlockers: string[];
  summary: string;
};

function sanitizeText(value: string, maxLength: number): string {
  const redacted = sanitizeCredentialText(value, maxLength)
    .replace(/\[redacted-url\]/gi, "[REDACTED]")
    .replace(/\[redacted\]/gi, "[REDACTED]");
  if (redacted.length <= maxLength) return redacted;
  return redacted.slice(0, maxLength);
}
function sanitizeInvariant(item: InvariantResult): InvariantResult {
  return {
    ...item,
    name: sanitizeText(item.name, 160),
    expected: sanitizeText(item.expected, 256),
    actual: sanitizeText(item.actual, 256),
    summary: sanitizeText(item.summary, 512),
  };
}

function sanitizeScenario(item: EvaluationScenarioSummary): EvaluationScenarioSummary {
  return {
    ...item,
    ...(item.diagnostic === undefined
      ? {}
      : { diagnostic: sanitizeText(item.diagnostic, 256) }),
  };
}

function reportStatus(input: BuildEvaluationReportInput): EvaluationReport["status"] {
  const invariantFailure = input.invariants.some((item) => item.status === "failed");
  const scenarioFailure = input.scenarios.some((item) =>
    item.status === "failed" || item.status === "cancelled" || item.status === "queued" || item.status === "running",
  );
  const hardMetricFailure = input.metrics.duplicateSideEffectCount > 0 || input.metrics.unexpectedMutationCount > 0;
  if (invariantFailure || scenarioFailure || hardMetricFailure) return "failed";
  const externalBlocker = input.liveBlockers.length > 0
    || input.scenarios.some((item) => item.status === "blocked-external");
  return externalBlocker ? "blocked-external" : "passed";
}
export function buildEvaluationReport(input: BuildEvaluationReportInput): EvaluationReport {
  const report: EvaluationReport = {
    version: 1,
    evaluationId: input.evaluationId,
    suiteId: input.suiteId,
    status: reportStatus(input),
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    metrics: { ...input.metrics },
    invariants: input.invariants.map(sanitizeInvariant),
    scenarios: input.scenarios.map(sanitizeScenario),
    liveBlockers: input.liveBlockers.map((item) => sanitizeText(item, 256)),
    summary: sanitizeText(input.summary, 512),
  };
  assertEvaluationReport(report);
  return report;
}

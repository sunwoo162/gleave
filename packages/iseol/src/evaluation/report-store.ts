import { resolve } from "node:path";
import type { EvaluationReport } from "./contracts.js";
import { assertEvaluationId, assertEvaluationReport } from "./contracts.js";
import { withDurableEvaluationReportLock } from "./report-lock.js";
import { evaluationDirectory, readEvaluationJson, writeEvaluationJsonAtomic } from "./store-utils.js";

function reportFile(root: string, evaluationId: string): string {
  assertEvaluationId(evaluationId);
  return resolve(evaluationDirectory(root, "reports"), `${evaluationId}.json`);
}

export async function loadEvaluationReportUnlocked(root: string, evaluationId: string): Promise<EvaluationReport | null> {
  const value = await readEvaluationJson<EvaluationReport>(reportFile(root, evaluationId));
  if (value) assertEvaluationReport(value);
  return value;
}
export async function loadEvaluationReport(root: string, evaluationId: string): Promise<EvaluationReport | null> {
  return withDurableEvaluationReportLock(root, evaluationId, () => loadEvaluationReportUnlocked(root, evaluationId), { waitForMs: 2_000 });
}

export async function saveEvaluationReportUnlocked(root: string, report: EvaluationReport): Promise<boolean> {
  assertEvaluationReport(report);
  const existing = await loadEvaluationReportUnlocked(root, report.evaluationId);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(report)) throw new Error(`Evaluation report immutable identity mismatch: ${report.evaluationId}`);
    return false;
  }
  await writeEvaluationJsonAtomic(reportFile(root, report.evaluationId), report);
  return true;
}
export async function saveEvaluationReport(root: string, report: EvaluationReport): Promise<boolean> {
  assertEvaluationReport(report);
  return withDurableEvaluationReportLock(root, report.evaluationId, () => saveEvaluationReportUnlocked(root, report), { waitForMs: 2_000 });
}

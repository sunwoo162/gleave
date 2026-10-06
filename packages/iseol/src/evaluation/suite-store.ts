import { resolve } from "node:path";
import type { EvaluationSuite } from "./contracts.js";
import { assertEvaluationId, assertEvaluationSuite } from "./contracts.js";
import { withDurableEvaluationSuiteLock } from "./suite-lock.js";
import { evaluationDirectory, listEvaluationJsonFiles, readEvaluationJson, writeEvaluationJsonAtomic } from "./store-utils.js";

function suiteFile(root: string, id: string): string {
  assertEvaluationId(id);
  return resolve(evaluationDirectory(root, "suites"), `${id}.json`);
}

export async function saveEvaluationSuiteUnlocked(root: string, suite: EvaluationSuite): Promise<void> {
  assertEvaluationSuite(suite);
  await writeEvaluationJsonAtomic(suiteFile(root, suite.suiteId), suite);
}
export async function saveEvaluationSuite(root: string, suite: EvaluationSuite): Promise<void> {
  return withDurableEvaluationSuiteLock(root, suite.suiteId, () => saveEvaluationSuiteUnlocked(root, suite), { waitForMs: 2_000 });
}
export async function loadEvaluationSuiteUnlocked(root: string, id: string): Promise<EvaluationSuite | null> {
  const value = await readEvaluationJson<EvaluationSuite>(suiteFile(root, id));
  if (value) assertEvaluationSuite(value);
  return value;
}
export async function loadEvaluationSuite(root: string, id: string): Promise<EvaluationSuite | null> {
  return withDurableEvaluationSuiteLock(root, id, () => loadEvaluationSuiteUnlocked(root, id), { waitForMs: 2_000 });
}
export async function listEvaluationSuites(root: string): Promise<EvaluationSuite[]> {
  const result: EvaluationSuite[] = [];
  for (const name of await listEvaluationJsonFiles(evaluationDirectory(root, "suites"))) {
    const id = name.slice(0, -5);
    const value = await withDurableEvaluationSuiteLock(root, id, () => loadEvaluationSuiteUnlocked(root, id), { waitForMs: 2_000 });
    if (value) result.push(value);
  }
  return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.suiteId.localeCompare(b.suiteId));
}

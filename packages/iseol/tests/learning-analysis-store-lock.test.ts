import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { CodeAnalysisResult } from "../src/learning/contracts.js";
import { withDurableLearningAnalysisLock } from "../src/learning/analysis-lock.js";
import { loadAnalysis, saveAnalysis } from "../src/learning/store.js";

const analysis: CodeAnalysisResult = {
  version: 1,
  id: "learning-analysis-store-lock-test",
  userId: "learning-analysis-store-lock-owner",
  sourceType: "editor",
  sourceId: "learning-analysis-store-lock-source",
  language: "typescript",
  provider: "local-static",
  summary: "초기 분석",
  findings: [],
  createdAt: "2026-09-30T00:00:00.000Z",
};

test("analysis public reads and writes wait for the durable analysis lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-analysis-store-lock-"));
  await saveAnalysis(root, analysis);

  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableLearningAnalysisLock(root, analysis.userId, analysis.id, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let saveSettled = false;
  let loadSettled = false;
  const updated = { ...analysis, summary: "잠금 해제 후 분석" };
  const save = saveAnalysis(root, updated).then(() => { saveSettled = true; });
  const load = loadAnalysis(root, analysis.userId, analysis.id).then(() => { loadSettled = true; });

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(loadSettled, false);

  releaseHolder();
  await lockHeld;
  await Promise.all([save, load]);
  assert.equal((await loadAnalysis(root, analysis.userId, analysis.id))?.summary, updated.summary);
});

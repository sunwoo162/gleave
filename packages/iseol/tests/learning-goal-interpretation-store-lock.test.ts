import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { GoalInterpretation } from "../src/learning/contracts.js";
import { withDurableLearningGoalLock } from "../src/learning/goal-lock.js";
import { listGoalInterpretations, loadGoalInterpretation, saveGoalInterpretation } from "../src/learning/store.js";

test("public goal interpretation stores wait for the owning goal lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-goal-interpretation-store-lock-"));
  const interpretation: GoalInterpretation = {
    version: 1, id: "goal-interpretation-store-lock", userId: "goal-interpretation-owner", goalId: "goal-interpretation-goal", inputRevision: 1,
    source: { kind: "local-template", version: "learning-goal-template-v1" }, normalizedSubject: "초기 해석", assumptions: ["초기 가정"], feasibleOutcomes: ["outcome-1"], exclusions: ["exclusion-1"], prerequisites: [],
    level: { value: "beginner", evidenceRefs: [] }, feasibleMinutes: 30, createdAt: "2026-09-30T12:00:00.000Z",
  };
  await saveGoalInterpretation(root, interpretation);
  const updated = { ...interpretation, normalizedSubject: "최신 해석" };

  let release!: () => void;
  let acquired!: () => void;
  const acquiredPromise = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableLearningGoalLock(root, interpretation.userId, interpretation.goalId, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await acquiredPromise;

  let saveSettled = false;
  let loadSettled = false;
  let listSettled = false;
  const pendingSave = saveGoalInterpretation(root, updated).then(() => { saveSettled = true; });
  const pendingLoad = loadGoalInterpretation(root, interpretation.userId, interpretation.id).then((value) => { loadSettled = true; return value; });
  const pendingList = listGoalInterpretations(root, interpretation.userId).then((value) => { listSettled = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(loadSettled, false);
  assert.equal(listSettled, false);

  release();
  await holder;
  await Promise.all([pendingSave, pendingLoad, pendingList]);
  assert.equal((await loadGoalInterpretation(root, interpretation.userId, interpretation.id))?.normalizedSubject, "최신 해석");
  assert.equal((await listGoalInterpretations(root, interpretation.userId))[0]?.normalizedSubject, "최신 해석");
});

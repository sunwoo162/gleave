import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { LearningPlanVersion } from "../src/learning/contracts.js";
import { withDurableLearningGoalLock } from "../src/learning/goal-lock.js";
import { listLearningPlanVersions, loadLearningPlanVersion, saveLearningPlanVersion } from "../src/learning/store.js";

test("public learning plan version stores wait for the owning goal lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-plan-version-store-lock-"));
  const plan: LearningPlanVersion = {
    version: 1, id: "learning-plan-version-store-lock", userId: "learning-plan-version-owner", goalId: "learning-plan-version-goal", inputRevision: 1,
    templateVersion: "learning-plan-template-v1", interpretationId: "goal-interpretation-store-lock", segments: [{ id: "segment-1", dayFrom: 1, dayTo: 1, outcomeIds: ["outcome-1"] }], outcomes: ["outcome-1"], budget: { durationDays: 1, dailyMinutes: 30, totalMinutes: 30 },
    days: [{ id: "day-1", dayIndex: 1, localDate: "2026-09-30", conceptIds: ["concept-1"], minutes: 30, activities: [{ kind: "concept", minutes: 30 }], checkpoint: "final" }], status: "validated-draft", createdAt: "2026-09-30T12:00:00.000Z", updatedAt: "2026-09-30T12:00:00.000Z",
  };
  await saveLearningPlanVersion(root, plan);
  const updated = { ...plan, status: "active" as const, updatedAt: "2026-09-30T12:00:01.000Z" };

  let release!: () => void;
  let acquired!: () => void;
  const acquiredPromise = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableLearningGoalLock(root, plan.userId, plan.goalId, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await acquiredPromise;

  let saveSettled = false;
  let loadSettled = false;
  let listSettled = false;
  const pendingSave = saveLearningPlanVersion(root, updated).then(() => { saveSettled = true; });
  const pendingLoad = loadLearningPlanVersion(root, plan.userId, plan.id).then((value) => { loadSettled = true; return value; });
  const pendingList = listLearningPlanVersions(root, plan.userId).then((value) => { listSettled = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(loadSettled, false);
  assert.equal(listSettled, false);

  release();
  await holder;
  await Promise.all([pendingSave, pendingLoad, pendingList]);
  assert.equal((await loadLearningPlanVersion(root, plan.userId, plan.id))?.status, "active");
  assert.equal((await listLearningPlanVersions(root, plan.userId))[0]?.status, "active");
});

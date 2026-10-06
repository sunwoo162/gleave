import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { LearningGoal } from "../src/learning/contracts.js";
import { withDurableLearningGoalLock } from "../src/learning/goal-lock.js";
import { listLearningGoals, loadLearningGoal, saveLearningGoal } from "../src/learning/store.js";

test("public learning goal stores wait for the durable goal lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-goal-store-lock-"));
  const goal: LearningGoal = { version: 1, id: "learning-goal-store-lock", userId: "learning-goal-store-owner", input: { subjectText: "TypeScript", duration: { days: 7 }, dailyMinutes: 30 }, status: "draft", revision: 1, createdAt: "2026-09-30T12:00:00.000Z", updatedAt: "2026-09-30T12:00:00.000Z" };
  await saveLearningGoal(root, goal);
  const updated = { ...goal, status: "paused" as const, revision: 2, updatedAt: "2026-09-30T12:00:01.000Z" };

  let release!: () => void;
  let acquired!: () => void;
  const acquiredPromise = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableLearningGoalLock(root, goal.userId, goal.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await acquiredPromise;

  let saveSettled = false;
  let loadSettled = false;
  let listSettled = false;
  const pendingSave = saveLearningGoal(root, updated).then(() => { saveSettled = true; });
  const pendingLoad = loadLearningGoal(root, goal.userId, goal.id).then((value) => { loadSettled = true; return value; });
  const pendingList = listLearningGoals(root, goal.userId).then((value) => { listSettled = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(loadSettled, false);
  assert.equal(listSettled, false);

  release();
  await holder;
  await Promise.all([pendingSave, pendingLoad, pendingList]);
  assert.equal((await loadLearningGoal(root, goal.userId, goal.id))?.status, "paused");
  assert.equal((await listLearningGoals(root, goal.userId))[0]?.revision, 2);
});

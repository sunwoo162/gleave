import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { LearningPlanAdjustment } from "../src/learning/contracts.js";
import { withDurableLearningPlanAdjustmentLock } from "../src/learning/plan-adjustment-lock.js";
import { loadLearningPlanAdjustment, listLearningPlanAdjustments, saveLearningPlanAdjustment } from "../src/learning/store.js";

const adjustment: LearningPlanAdjustment = {
  version: 1,
  id: "learning-plan-adjustment-store-lock-test",
  userId: "plan-adjustment-store-lock-owner",
  goalId: "plan-adjustment-store-lock-goal",
  basePlanVersionId: "plan-adjustment-store-lock-plan",
  baseGoalRevision: 1,
  inputHash: "plan-adjustment-store-lock-hash",
  reason: "blocked",
  note: "초기 조정",
  status: "proposed",
  preservedCompletedDayIds: [],
  changes: [{ dayIndex: 1, after: { minutes: 20, localDate: "2026-09-30" }, reasonRefs: ["blocked"] }],
  tradeoffs: ["초기 tradeoff"],
  proposedPlan: { durationDays: 2, dailyMinutes: 20, totalMinutes: 40 },
  requiresAcceptance: true,
  createdAt: "2026-09-30T00:00:00.000Z",
  updatedAt: "2026-09-30T00:00:00.000Z",
};

test("learning plan adjustment public reads and writes wait for the durable adjustment lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-plan-adjustment-store-lock-"));
  await saveLearningPlanAdjustment(root, adjustment);

  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableLearningPlanAdjustmentLock(root, adjustment.userId, adjustment.goalId, adjustment.inputHash, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let saveSettled = false;
  let loadSettled = false;
  let listSettled = false;
  const save = saveLearningPlanAdjustment(root, { ...adjustment, note: "잠금 해제 후 조정" }).then(() => { saveSettled = true; });
  const load = loadLearningPlanAdjustment(root, adjustment.userId, adjustment.id).then(() => { loadSettled = true; });
  const list = listLearningPlanAdjustments(root, adjustment.userId).then(() => { listSettled = true; });

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(loadSettled, false);
  assert.equal(listSettled, false);

  releaseHolder();
  await lockHeld;
  await Promise.all([save, load, list]);
  assert.equal((await loadLearningPlanAdjustment(root, adjustment.userId, adjustment.id))?.note, "잠금 해제 후 조정");
  assert.equal((await listLearningPlanAdjustments(root, adjustment.userId))[0]?.note, "잠금 해제 후 조정");
});

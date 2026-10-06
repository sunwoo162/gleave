import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { LearningPlan } from "../src/learning/contracts.js";
import { withDurableLearningPlanLock } from "../src/learning/plan-lock.js";
import { listPlans, loadPlan, savePlan } from "../src/learning/store.js";

const plan: LearningPlan = {
  version: 1,
  id: "learning-plan-store-lock-test",
  userId: "learning-plan-store-lock-owner",
  title: "초기 계획",
  description: "잠금 경계 검증",
  goals: ["계획 저장"],
  status: "active",
  createdAt: "2026-09-30T00:00:00.000Z",
  updatedAt: "2026-09-30T00:00:00.000Z",
};

test("learning plan public reads and writes wait for the durable plan lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-plan-store-lock-"));
  await savePlan(root, plan);

  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableLearningPlanLock(root, plan.userId, plan.id, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let saveSettled = false;
  let loadSettled = false;
  let listSettled = false;
  const updated = { ...plan, title: "잠금 해제 후 계획", updatedAt: "2026-09-30T00:00:01.000Z" };
  const save = savePlan(root, updated).then(() => { saveSettled = true; });
  const load = loadPlan(root, plan.userId, plan.id).then(() => { loadSettled = true; });
  const list = listPlans(root, plan.userId).then(() => { listSettled = true; });

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(loadSettled, false);
  assert.equal(listSettled, false);

  releaseHolder();
  await lockHeld;
  await Promise.all([save, load, list]);
  assert.equal((await loadPlan(root, plan.userId, plan.id))?.title, updated.title);
  assert.equal((await listPlans(root, plan.userId))[0]?.title, updated.title);
});

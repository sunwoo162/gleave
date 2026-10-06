import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createLearningService } from "../src/learning/service.js";
import { saveLearningGoalUnlocked } from "../src/learning/store.js";
import { withDurableLearningGoalLock } from "../src/learning/goal-lock.js";

const at = "2026-09-26T12:00:00.000Z";
function principal(userId: string): Principal { return { userId, sessionId: `${userId}-session`, roles: ["user"] }; }

test("learning goals persist the three required inputs and remain owner-scoped", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-goals-"));
  const service = createLearningService(root, { now: () => at });
  const goal = await service.createLearningGoal(principal("user-a"), {
    subjectText: "TypeScript generics",
    duration: { days: 30 },
    dailyMinutes: 60,
  });

  assert.equal(goal.status, "draft");
  assert.equal(goal.revision, 1);
  assert.deepEqual(goal.input, { subjectText: "TypeScript generics", duration: { days: 30 }, dailyMinutes: 60 });
  const restarted = createLearningService(root, { now: () => at });
  assert.deepEqual(await restarted.getLearningGoal(principal("user-a"), goal.id), goal);
  assert.deepEqual(await restarted.listLearningGoals(principal("user-b")), []);
  assert.equal(await restarted.getLearningGoal(principal("user-b"), goal.id), null);
});

test("learning goals reject out-of-range duration and daily study time", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-goal-validation-"));
  const service = createLearningService(root, { now: () => at });
  await assert.rejects(() => service.createLearningGoal(principal("user-a"), { subjectText: "", duration: { days: 30 }, dailyMinutes: 60 }), /subject/i);
  await assert.rejects(() => service.createLearningGoal(principal("user-a"), { subjectText: "TypeScript", duration: { days: 0 }, dailyMinutes: 60 }), /duration/i);
  await assert.rejects(() => service.createLearningGoal(principal("user-a"), { subjectText: "TypeScript", duration: { days: 30 }, dailyMinutes: 0 }), /daily|minute/i);
});

test("learning goals reject impossible or past target dates", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-goal-target-date-"));
  const service = createLearningService(root, { now: () => at });
  await assert.rejects(() => service.createLearningGoal(principal("user-a"), { subjectText: "TypeScript", duration: { targetDate: "2027-02-30" }, dailyMinutes: 60 }), /duration/i);
  await assert.rejects(() => service.createLearningGoal(principal("user-a"), { subjectText: "TypeScript", duration: { targetDate: "2026-09-25" }, dailyMinutes: 60 }), /duration/i);
  const goal = await service.createLearningGoal(principal("user-a"), { subjectText: "TypeScript", duration: { targetDate: "2026-09-27" }, dailyMinutes: 60 });
  assert.deepEqual(goal.input.duration, { targetDate: "2026-09-27" });
});

test("learning goal reads wait for the durable goal lock and reload current state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-goal-read-lock-"));
  const owner = principal("learning-goal-read-lock-owner");
  const service = createLearningService(root, { now: () => at });
  const goal = await service.createLearningGoal(owner, {
    subjectText: "TypeScript generics",
    duration: { days: 30 },
    dailyMinutes: 60,
  });

  let releaseHolder!: () => void;
  let lockAcquired!: () => void;
  const acquired = new Promise<void>((resolve) => { lockAcquired = resolve; });
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableLearningGoalLock(root, owner.userId, goal.id, async () => {
    lockAcquired();
    await holderReleased;
  }, { waitForMs: 0 });
  await acquired;

  let getSettled = false;
  let listSettled = false;
  const fetched = service.getLearningGoal(owner, goal.id).then((result) => {
    getSettled = true;
    return result;
  });
  const listed = service.listLearningGoals(owner).then((result) => {
    listSettled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(getSettled, false);
  assert.equal(listSettled, false);

  const updated = { ...goal, status: "paused" as const, revision: 2, updatedAt: at };
  await saveLearningGoalUnlocked(root, updated);
  releaseHolder();
  await lockHeld;
  assert.equal((await fetched)?.status, "paused");
  assert.equal((await listed)[0]?.status, "paused");
});

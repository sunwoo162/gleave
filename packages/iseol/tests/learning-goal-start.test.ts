import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createLearningService } from "../src/learning/service.js";
import { withDurableLearningSessionLock } from "../src/learning/session-lock.js";
import { loadSessionUnlocked, saveSessionUnlocked } from "../src/learning/store.js";

const at = "2026-09-26T12:00:00.000Z";
function principal(userId: string): Principal { return { userId, sessionId: `${userId}-session`, roles: ["user"] }; }

test("a local-template plan can be activated into an owner-bound day session without claiming content generation", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-goal-start-"));
  const service = createLearningService(root, { now: () => at });
  const owner = principal("user-a");
  const other = principal("user-b");
  const goal = await service.createLearningGoal(owner, { subjectText: "TypeScript", duration: { days: 3 }, dailyMinutes: 20 });
  const preview = await service.createLearningPlanPreview(owner, goal.id, goal.revision);

  const session = await service.startLearningGoalSession(owner, goal.id, { planVersionId: preview.plan.id, dayId: preview.plan.days[0]!.id, expectedRevision: preview.goal.revision });
  assert.equal(session.status, "active");
  assert.equal(session.goalId, goal.id);
  assert.equal(session.planVersionId, preview.plan.id);
  assert.equal(session.dayId, preview.plan.days[0]!.id);
  assert.equal(session.contentStatus, "not-requested");
  assert.equal((await service.getLearningGoal(owner, goal.id))?.status, "active");
  assert.equal((await service.getLearningGoal(owner, goal.id))?.revision, preview.goal.revision + 1);
  assert.equal((await service.getLearningPlanVersion(owner, goal.id, preview.plan.id))?.status, "active");
  assert.equal(await service.startLearningGoalSession(other, goal.id, { planVersionId: preview.plan.id, dayId: preview.plan.days[0]!.id }).then(() => false, () => true), true);

  const repeated = await service.startLearningGoalSession(owner, goal.id, { planVersionId: preview.plan.id, dayId: preview.plan.days[0]!.id, expectedRevision: preview.goal.revision + 1 });
  assert.equal(repeated.id, session.id);
  const restarted = createLearningService(root, { now: () => at });
  assert.deepEqual((await restarted.listLearningSessions(owner)).find((item) => item.id === session.id), session);
  const resumed = await restarted.resumeLearningSession(owner, session.id, session.revision);
  assert.equal(resumed?.status, "active");
  assert.equal(resumed?.revision, session.revision + 1);
});

test("learning session lists wait for each durable session lock before projecting state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-session-read-lock-"));
  const owner = principal("learning-session-read-lock-owner");
  const service = createLearningService(root, { now: () => at });
  const goal = await service.createLearningGoal(owner, { subjectText: "TypeScript", duration: { days: 2 }, dailyMinutes: 20 });
  const preview = await service.createLearningPlanPreview(owner, goal.id, goal.revision);
  const session = await service.startLearningGoalSession(owner, goal.id, { planVersionId: preview.plan.id, dayId: preview.plan.days[0]!.id, expectedRevision: preview.goal.revision });
  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableLearningSessionLock(root, owner.userId, session.id, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let settled = false;
  const read = service.listLearningSessions(owner).then((result) => { settled = true; return result; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  const current = await loadSessionUnlocked(root, owner.userId, session.id);
  assert.ok(current);
  await saveSessionUnlocked(root, { ...current, resumedAt: "2026-09-26T12:00:01.000Z", revision: current.revision + 1 });
  releaseHolder();
  await lockHeld;
  assert.equal((await read).find((item) => item.id === session.id)?.revision, session.revision + 1);
});

test("goal session start rejects stale revisions, foreign plan versions, and unknown days", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-goal-start-conflict-"));
  const service = createLearningService(root, { now: () => at });
  const owner = principal("owner");
  const other = principal("other");
  const goal = await service.createLearningGoal(owner, { subjectText: "복습", duration: { days: 2 }, dailyMinutes: 15 });
  const preview = await service.createLearningPlanPreview(owner, goal.id, goal.revision);
  await assert.rejects(() => service.startLearningGoalSession(owner, goal.id, { planVersionId: preview.plan.id, dayId: preview.plan.days[0]!.id, expectedRevision: goal.revision }), /conflict/i);
  await assert.rejects(() => service.startLearningGoalSession(other, goal.id, { planVersionId: preview.plan.id, dayId: preview.plan.days[0]!.id }), /not found|forbidden/i);
  await assert.rejects(() => service.startLearningGoalSession(owner, goal.id, { planVersionId: preview.plan.id, dayId: "missing-day", expectedRevision: preview.goal.revision }), /day|not found/i);
});

test("concurrent goal day session starts across service instances remain one session", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-goal-start-concurrent-"));
  const owner = principal("goal-start-concurrent-owner");
  const firstService = createLearningService(root, { now: () => at });
  const secondService = createLearningService(root, { now: () => at });
  const goal = await firstService.createLearningGoal(owner, { subjectText: "동시 세션 시작", duration: { days: 3 }, dailyMinutes: 20 });
  const preview = await firstService.createLearningPlanPreview(owner, goal.id, goal.revision);
  const input = { planVersionId: preview.plan.id, dayId: preview.plan.days[0]!.id, expectedRevision: preview.goal.revision };

  const results = await Promise.all([
    firstService.startLearningGoalSession(owner, goal.id, input),
    secondService.startLearningGoalSession(owner, goal.id, input),
  ]);

  assert.equal(new Set(results.map((session) => session.id)).size, 1);
  assert.equal((await firstService.listLearningSessions(owner)).filter((session) => session.goalId === goal.id && session.dayId === input.dayId && session.status === "active").length, 1);
});

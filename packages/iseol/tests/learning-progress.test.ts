import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createLearningService } from "../src/learning/service.js";

const at = "2026-09-26T12:00:00.000Z";
function principal(userId: string): Principal { return { userId, sessionId: `${userId}-session`, roles: ["user"] }; }

test("learning progress separates schedule, observed evidence, pending evaluation, and due review", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-progress-"));
  const owner = principal("progress-owner");
  const other = principal("progress-other");
  const service = createLearningService(root, { now: () => at });
  const goal = await service.createLearningGoal(owner, { subjectText: "TypeScript", duration: { days: 3 }, dailyMinutes: 30 });
  const preview = await service.createLearningPlanPreview(owner, goal.id, goal.revision);
  const session = await service.startLearningGoalSession(owner, goal.id, { planVersionId: preview.plan.id, dayId: preview.plan.days[0]!.id, expectedRevision: preview.goal.revision });
  const verified = await service.recordStudyAttempt(owner, { sessionId: session.id, questionId: "q-verified", answer: "A", correct: true });
  await service.recordStudyAttempt(owner, { sessionId: session.id, questionId: "q-unverified", answer: "B" });
  const selfReport = await service.recordLearningSessionAction(owner, session.id, { actionId: "self-report-1", type: "self-report", contentRef: preview.plan.days[0]!.id });
  const waitingAction = await service.recordLearningSessionAction(owner, session.id, { actionId: "hint-1", type: "hint", contentRef: preview.plan.days[0]!.id });
  const exercise = await service.createCodingExercise(owner, { sessionId: session.id, title: "Types", prompt: "Write a type", language: "typescript", estimatedMinutes: 10 });
  const codingAttempt = await service.submitCodingAttempt(owner, { exerciseId: exercise.id, clientRequestId: "progress-coding-1", response: "type Id = string;" });
  const answer = await service.submitLearningAnswer(owner, session.id, { exerciseId: exercise.id, attemptId: codingAttempt.attempt.id, response: codingAttempt.attempt.response });
  const review = await service.createReviewItem(owner, { sourceType: "learning-session", sourceId: session.id, prompt: "Review", answer: "Answer", dueAt: at });
  await service.completeLearningSession(owner, session.id);

  const progress = await service.getLearningGoalProgress(owner, goal.id);
  assert.ok(progress);
  assert.equal(progress.plan?.id, preview.plan.id);
  assert.equal(progress.schedule.plannedDays, 3);
  assert.equal(progress.schedule.completedDays, 1);
  assert.equal(progress.schedule.activeDayIds.length, 0);
  assert.equal(progress.actual.sessions.total, 1);
  assert.equal(progress.actual.sessions.completed, 1);
  assert.equal(progress.actual.sessions.active, 0);
  assert.equal(progress.actual.verifiedCorrectAttempts, 1);
  assert.equal(progress.actual.reportedIncorrectAttempts, 0);
  assert.equal(progress.actual.unverifiedAttempts, 1);
  assert.equal(progress.actual.codingAttempts, 1);
  assert.equal(progress.actual.selfReports, 1);
  assert.equal(progress.actual.runtimeWaitingActions, 1);
  assert.equal(progress.evaluation.pendingAnswers, 1);
  assert.deepEqual(progress.evaluation.pendingAnswerIds, [answer.id]);
  assert.equal(progress.reviews.dueCount, 1);
  assert.deepEqual(progress.reviews.dueItemIds, [review.id]);
  assert.deepEqual(progress.evidence.verifiedAttemptIds, [verified.id]);
  assert.deepEqual(progress.evidence.selfReportActionIds, [selfReport.id]);
  assert.ok(progress.warnings.some((warning) => /숙달 근거로 집계하지 않습니다/.test(warning)));
  assert.ok(progress.warnings.every((warning) => !/숙달률|percentage|percent/i.test(warning)));
  assert.equal(await service.getLearningGoalProgress(other, goal.id), null);

  const restarted = createLearningService(root, { now: () => at });
  assert.deepEqual(await restarted.getLearningGoalProgress(owner, goal.id), progress);
  assert.equal(waitingAction.status, "waiting-runtime");
});

test("learning progress without an activated plan reports an explicit boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-progress-draft-"));
  const owner = principal("progress-draft-owner");
  const service = createLearningService(root, { now: () => at });
  const goal = await service.createLearningGoal(owner, { subjectText: "Algorithms", duration: { days: 2 }, dailyMinutes: 20 });
  const progress = await service.getLearningGoalProgress(owner, goal.id);
  assert.ok(progress);
  assert.equal(progress.plan, undefined);
  assert.equal(progress.schedule.plannedDays, 0);
  assert.ok(progress.warnings.some((warning) => /활성화된 학습 계획/.test(warning)));
  assert.ok(progress.warnings.some((warning) => /서버 기준/.test(warning)));
});

test("authenticated learning principals use their supplied timezone for plan and progress dates", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-progress-timezone-"));
  const owner = { ...principal("progress-timezone-owner"), timezone: "Pacific/Kiritimati" };
  const service = createLearningService(root, { now: () => at });
  const goal = await service.createLearningGoal(owner, { subjectText: "Timezone", duration: { days: 1 }, dailyMinutes: 15 });
  const preview = await service.createLearningPlanPreview(owner, goal.id, goal.revision);
  assert.equal(preview.plan.days[0]?.localDate, "2026-09-27");
  const progress = await service.getLearningGoalProgress(owner, goal.id);
  assert.ok(progress);
  assert.ok(!progress.warnings.some((warning) => /서버 기준/.test(warning)));
  assert.equal(progress.schedule.upcomingDays[0]?.localDate, "2026-09-27");
});

import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createLearningService } from "../src/learning/service.js";
import { withDurableLearningReportLock } from "../src/learning/report-lock.js";
import { saveLearningReportUnlocked } from "../src/learning/store.js";

const at = "2026-09-27T12:00:00.000Z";
function principal(userId: string): Principal { return { userId, sessionId: `${userId}-session`, roles: ["user"] }; }

test("learning report separates evidence-backed outcomes, self-reports, and remaining work", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-report-"));
  const owner = principal("report-owner");
  const other = principal("report-other");
  const service = createLearningService(root, { now: () => at });
  const goal = await service.createLearningGoal(owner, { subjectText: "TypeScript reports", duration: { days: 3 }, dailyMinutes: 30 });
  const preview = await service.createLearningPlanPreview(owner, goal.id, goal.revision);
  const session = await service.startLearningGoalSession(owner, goal.id, { planVersionId: preview.plan.id, dayId: preview.plan.days[0]!.id, expectedRevision: preview.goal.revision });
  const verified = await service.recordStudyAttempt(owner, { sessionId: session.id, questionId: "generics", answer: "type-safe", correct: true });
  const selfReport = await service.recordLearningSessionAction(owner, session.id, { actionId: "report-self-1", type: "self-report", question: "이해했어요" });
  const reportService = service as typeof service & { createLearningReport: (principal: Principal, goalId: string, input: unknown) => Promise<{ report: any; created: boolean }>; listLearningReports: (principal: Principal, goalId: string) => Promise<any[]> };

  const first = await reportService.createLearningReport(owner, goal.id, { period: { from: "2026-09-27", to: "2026-09-27", kind: "weekly" } });
  assert.equal(first.created, true);
  assert.equal(first.report.provenance.kind, "local-evidence");
  assert.ok(first.report.verifiedOutcomes.some((outcome: any) => outcome.evidenceRefs.includes(verified.id)));
  assert.ok(first.report.unverifiedOutcomes.some((outcome: any) => outcome.evidenceRefs.includes(selfReport.id)));
  assert.ok(first.report.verifiedOutcomes.every((outcome: any) => outcome.evidenceRefs.length > 0));
  assert.ok(first.report.remaining.length > 0);

  const repeated = await reportService.createLearningReport(owner, goal.id, { period: { from: "2026-09-27", to: "2026-09-27", kind: "weekly" } });
  assert.equal(repeated.created, false);
  assert.equal(repeated.report.id, first.report.id);
  assert.equal((await reportService.listLearningReports(owner, goal.id)).length, 1);
  assert.equal((await reportService.listLearningReports(other, goal.id)).length, 0);
  const restarted = createLearningService(root, { now: () => at }) as typeof service & { listLearningReports: (principal: Principal, goalId: string) => Promise<any[]> };
  assert.equal((await restarted.listLearningReports(owner, goal.id)).length, 1);
  await assert.rejects(() => reportService.createLearningReport(owner, goal.id, { period: { from: "2026-09-28", to: "2026-09-27", kind: "custom" } }), /period/i);
});

test("learning report lists wait for each durable report lock before projecting state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-report-read-lock-"));
  const owner = principal("report-read-lock-owner");
  const service = createLearningService(root, { now: () => at });
  const goal = await service.createLearningGoal(owner, { subjectText: "Report reads", duration: { days: 2 }, dailyMinutes: 20 });
  const report = await service.createLearningReport(owner, goal.id, { period: { from: "2026-09-27", to: "2026-09-27", kind: "weekly" } });
  const periodKey = JSON.stringify(report.report.period);
  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableLearningReportLock(root, owner.userId, goal.id, periodKey, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let settled = false;
  const read = service.listLearningReports(owner, goal.id).then((result) => { settled = true; return result; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  await saveLearningReportUnlocked(root, { ...report.report, summary: "잠금 해제 후 리포트", updatedAt: "2026-09-27T12:00:01.000Z" });
  releaseHolder();
  await lockHeld;
  assert.equal((await read)[0]?.summary, "잠금 해제 후 리포트");
});

test("learning report preserves coding practice as unverified evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-report-coding-"));
  const owner = principal("report-coding-owner");
  const service = createLearningService(root, { now: () => at });
  const goal = await service.createLearningGoal(owner, { subjectText: "Coding reports", duration: { days: 2 }, dailyMinutes: 25 });
  const preview = await service.createLearningPlanPreview(owner, goal.id, goal.revision);
  const session = await service.startLearningGoalSession(owner, goal.id, { planVersionId: preview.plan.id, dayId: preview.plan.days[0]!.id, expectedRevision: preview.goal.revision });
  const exercise = await service.createCodingExercise(owner, { sessionId: session.id, title: "Report practice", prompt: "Write a function", language: "typescript", estimatedMinutes: 10 });
  const attempt = await service.submitCodingAttempt(owner, { exerciseId: exercise.id, clientRequestId: "report-coding-attempt-1", response: "function answer(): string { return 'ok'; }" });

  const result = await service.createLearningReport(owner, goal.id, { period: { from: "2026-09-27", to: "2026-09-27", kind: "weekly" } });
  assert.equal(result.report.verifiedOutcomes.some((outcome) => outcome.evidenceRefs.includes(attempt.attempt.id)), false);
  assert.ok(result.report.unverifiedOutcomes.some((outcome) => outcome.outcomeId === `coding-attempt:${attempt.attempt.id}` && outcome.evidenceRefs.includes(attempt.attempt.id)));
  assert.match(result.report.unverifiedOutcomes.find((outcome) => outcome.outcomeId === `coding-attempt:${attempt.attempt.id}`)?.label ?? "", /Report practice|검증/);
});

test("concurrent learning report creation across service instances remains one report", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-report-concurrent-"));
  const owner = principal("report-concurrent-owner");
  const firstService = createLearningService(root, { now: () => at });
  const secondService = createLearningService(root, { now: () => at });
  const goal = await firstService.createLearningGoal(owner, { subjectText: "동시 리포트", duration: { days: 3 }, dailyMinutes: 20 });
  const input = { period: { from: "2026-09-27", to: "2026-09-27", kind: "weekly" as const } };

  const results = await Promise.all([
    firstService.createLearningReport(owner, goal.id, input),
    secondService.createLearningReport(owner, goal.id, input),
  ]);

  assert.deepEqual(results.map((result) => result.created).sort(), [false, true]);
  assert.equal(new Set(results.map((result) => result.report.id)).size, 1);
  assert.equal((await firstService.listLearningReports(owner, goal.id)).length, 1);
});

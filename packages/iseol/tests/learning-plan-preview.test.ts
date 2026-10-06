import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import type { LearningPlanProposal } from "../src/learning/contracts.js";
import { withDurableLearningPlanAdjustmentAcceptanceLock } from "../src/learning/plan-adjustment-acceptance-lock.js";
import { withDurableLearningGoalLock } from "../src/learning/goal-lock.js";
import { createLearningService } from "../src/learning/service.js";
import { saveLearningPlanAdjustment, saveLearningPlanVersionUnlocked } from "../src/learning/store.js";

const at = "2026-09-26T12:00:00.000Z";
function principal(userId: string): Principal { return { userId, sessionId: `${userId}-session`, roles: ["user"] }; }

function runtimeProposal(dayCount: number): LearningPlanProposal {
  return {
    normalizedSubject: "TypeScript 제네릭",
    assumptions: ["학습자는 기본 문법을 알고 있다고 가정합니다."],
    feasibleOutcomes: ["generic-types"],
    exclusions: ["실행 환경 검증"],
    prerequisites: ["함수와 타입 주석"],
    level: { value: "beginner", evidenceRefs: [] },
    feasibleMinutes: dayCount * 30,
    segments: [{ id: "segment-a", dayFrom: 1, dayTo: dayCount, outcomeIds: ["generic-types"] }],
    days: Array.from({ length: dayCount }, (_, index) => ({
      dayIndex: index + 1,
      conceptIds: ["generic-types"],
      minutes: 30,
      activities: [{ kind: "concept" as const, minutes: 30 }],
      checkpoint: index + 1 === dayCount ? "final" as const : "none" as const,
    })),
  };
}

test("learning goal preview creates an owner-bound local template PlanVersion and preserves it after restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-plan-preview-"));
  const service = createLearningService(root, { now: () => at });
  const owner = principal("user-a");
  const other = principal("user-b");
  const goal = await service.createLearningGoal(owner, {
    subjectText: "TypeScript 제네릭",
    duration: { days: 7 },
    dailyMinutes: 30,
  });

  const preview = await service.createLearningPlanPreview(owner, goal.id, goal.revision);
  assert.equal(preview.interpretation.source.kind, "local-template");
  assert.equal(preview.plan.status, "validated-draft");
  assert.equal(preview.plan.inputRevision, goal.revision);
  assert.equal(preview.plan.days.length, 7);
  assert.equal(preview.plan.days[0]?.localDate, "2026-09-26");
  assert.equal(preview.plan.days.every((day) => day.minutes === 30), true);
  assert.equal(preview.goal.status, "preview-ready");
  assert.equal(preview.goal.revision, goal.revision + 1);
  assert.equal(await service.listLearningPlanVersions(other, goal.id).then((items) => items.length), 0);

  const repeated = await service.createLearningPlanPreview(owner, goal.id, preview.goal.revision);
  assert.equal(repeated.plan.id, preview.plan.id);
  await assert.rejects(() => service.createLearningPlanPreview(owner, goal.id, goal.revision), /conflict/i);

  const restarted = createLearningService(root, { now: () => at });
  assert.deepEqual(await restarted.getLearningPlanVersion(owner, goal.id, preview.plan.id), preview.plan);
  assert.deepEqual(await restarted.getLearningGoal(owner, goal.id), preview.goal);
});

test("target-date goals produce one local calendar day when the date is today and reject cross-user reads", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-plan-preview-date-"));
  const service = createLearningService(root, { now: () => at });
  const owner = principal("date-owner");
  const other = principal("date-other");
  const goal = await service.createLearningGoal(owner, { subjectText: "복습", duration: { targetDate: "2026-09-26" }, dailyMinutes: 15 });
  const preview = await service.createLearningPlanPreview(owner, goal.id);
  assert.equal(preview.plan.days.length, 1);
  assert.equal(await service.getLearningPlanVersion(other, goal.id, preview.plan.id), null);
  assert.deepEqual(await service.listLearningPlanVersions(owner, goal.id), [preview.plan]);
});

test("learning plan version reads wait for the goal lock and reload current plan state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-plan-read-lock-"));
  const owner = principal("learning-plan-read-lock-owner");
  const service = createLearningService(root, { now: () => at });
  const goal = await service.createLearningGoal(owner, { subjectText: "TypeScript", duration: { days: 3 }, dailyMinutes: 30 });
  const preview = await service.createLearningPlanPreview(owner, goal.id);

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
  const fetched = service.getLearningPlanVersion(owner, goal.id, preview.plan.id).then((result) => {
    getSettled = true;
    return result;
  });
  const listed = service.listLearningPlanVersions(owner, goal.id).then((result) => {
    listSettled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(getSettled, false);
  assert.equal(listSettled, false);

  await saveLearningPlanVersionUnlocked(root, { ...preview.plan, status: "active", updatedAt: at });
  releaseHolder();
  await lockHeld;
  assert.equal((await fetched)?.status, "active");
  assert.equal((await listed)[0]?.status, "active");
});

test("an explicitly configured local plan Runtime proposal is validated, persisted, and idempotent", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-plan-runtime-"));
  const owner = principal("runtime-plan-owner");
  let dispatchCount = 0;
  const service = createLearningService(root, {
    now: () => at,
    planDispatcher: async (request) => {
      dispatchCount += 1;
      assert.equal(request.principal.userId, owner.userId);
      assert.equal(request.inputHash.length, 64);
      return { status: "completed", proposal: runtimeProposal(2) };
    },
  });
  const goal = await service.createLearningGoal(owner, { subjectText: "TypeScript 제네릭", duration: { days: 2 }, dailyMinutes: 30 });

  const preview = await service.createLearningPlanPreview(owner, goal.id, goal.revision);
  assert.equal(preview.interpretation.source.kind, "local-runtime");
  assert.equal(preview.interpretation.source.version, "learning-goal-runtime-v1");
  assert.equal(preview.plan.templateVersion, "learning-plan-runtime-v1");
  assert.deepEqual(preview.plan.segments[0]?.outcomeIds, ["generic-types"]);
  assert.equal(preview.plan.days.length, 2);
  assert.equal(dispatchCount, 1);

  const repeated = await service.createLearningPlanPreview(owner, goal.id, preview.goal.revision);
  assert.equal(repeated.created, false);
  assert.equal(repeated.plan.id, preview.plan.id);
  assert.equal(dispatchCount, 1);

  const restarted = createLearningService(root, { now: () => at });
  assert.deepEqual(await restarted.getLearningPlanVersion(owner, goal.id, preview.plan.id), preview.plan);
});

test("a waiting or invalid local plan Runtime proposal leaves the goal as a draft", async () => {
  const waitingRoot = await mkdtemp(join(tmpdir(), "iseol-learning-plan-runtime-waiting-"));
  const waitingOwner = principal("runtime-plan-waiting");
  const waitingSecret = "local learning Runtime unavailable token=plan-secret https://preview.example/?access_token=plan-url-secret";
  const waitingService = createLearningService(waitingRoot, {
    now: () => at,
    planDispatcher: async () => ({ status: "waiting", blocker: waitingSecret }),
  });
  const waitingGoal = await waitingService.createLearningGoal(waitingOwner, { subjectText: "복습", duration: { days: 2 }, dailyMinutes: 20 });
  let waitingError: unknown;
  await assert.rejects(() => waitingService.createLearningPlanPreview(waitingOwner, waitingGoal.id, waitingGoal.revision), (error) => {
    waitingError = error;
    return /waiting|unavailable/i.test(error instanceof Error ? error.message : String(error));
  });
  assert.ok(waitingError instanceof Error);
  assert.equal(waitingError.message.includes("plan-secret"), false);
  assert.equal(waitingError.message.includes("plan-url-secret"), false);
  assert.match(waitingError.message, /\[redacted\]|\[redacted-url\]/i);
  assert.deepEqual(await waitingService.getLearningGoal(waitingOwner, waitingGoal.id), waitingGoal);
  assert.deepEqual(await waitingService.listLearningPlanVersions(waitingOwner, waitingGoal.id), []);

  const invalidRoot = await mkdtemp(join(tmpdir(), "iseol-learning-plan-runtime-invalid-"));
  const invalidOwner = principal("runtime-plan-invalid");
  const invalidService = createLearningService(invalidRoot, {
    now: () => at,
    planDispatcher: async () => ({ status: "completed", proposal: { ...runtimeProposal(1), feasibleMinutes: 999 } }),
  });
  const invalidGoal = await invalidService.createLearningGoal(invalidOwner, { subjectText: "복습", duration: { days: 1 }, dailyMinutes: 20 });
  await assert.rejects(() => invalidService.createLearningPlanPreview(invalidOwner, invalidGoal.id, invalidGoal.revision), /invalid|budget|minutes/i);
  assert.deepEqual(await invalidService.getLearningGoal(invalidOwner, invalidGoal.id), invalidGoal);
  assert.deepEqual(await invalidService.listLearningPlanVersions(invalidOwner, invalidGoal.id), []);
});

test("a plan Runtime exception is redacted before reaching the caller", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-plan-runtime-error-safety-"));
  const owner = principal("runtime-plan-error");
  const secret = "plan Runtime failed token=plan-exception-secret api_key=plan-api-secret";
  const service = createLearningService(root, {
    now: () => at,
    planDispatcher: async () => { throw new Error(secret); },
  });
  const goal = await service.createLearningGoal(owner, { subjectText: "예외 경계", duration: { days: 1 }, dailyMinutes: 20 });
  let error: unknown;
  await assert.rejects(() => service.createLearningPlanPreview(owner, goal.id, goal.revision), (candidate) => {
    error = candidate;
    return true;
  });
  assert.ok(error instanceof Error);
  assert.equal(error.message.includes("plan-exception-secret"), false);
  assert.equal(error.message.includes("plan-api-secret"), false);
  assert.match(error.message, /\[redacted\]/i);
});

test("concurrent learning plan previews across service instances remain one version", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-plan-preview-concurrent-"));
  const firstService = createLearningService(root, { now: () => at });
  const secondService = createLearningService(root, { now: () => at });
  const owner = principal("preview-concurrent-owner");
  const goal = await firstService.createLearningGoal(owner, { subjectText: "동시 미리보기", duration: { days: 3 }, dailyMinutes: 30 });

  const results = await Promise.all([
    firstService.createLearningPlanPreview(owner, goal.id, goal.revision),
    secondService.createLearningPlanPreview(owner, goal.id, goal.revision),
  ]);

  assert.deepEqual(results.map((result) => result.created).sort(), [false, true]);
  assert.equal(new Set(results.map((result) => result.plan.id)).size, 1);
  assert.equal((await firstService.listLearningPlanVersions(owner, goal.id)).length, 1);
  assert.equal((await firstService.getLearningGoal(owner, goal.id))?.revision, 2);
});

test("plan adjustment preserves completed days, requires acceptance, and creates a new version only after CAS approval", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-plan-adjustment-"));
  const owner = principal("adjustment-owner");
  const other = principal("adjustment-other");
  const service = createLearningService(root, { now: () => at });
  const goal = await service.createLearningGoal(owner, { subjectText: "TypeScript", duration: { days: 3 }, dailyMinutes: 30 });
  const preview = await service.createLearningPlanPreview(owner, goal.id, goal.revision);
  const session = await service.startLearningGoalSession(owner, goal.id, { planVersionId: preview.plan.id, dayId: preview.plan.days[0]!.id, expectedRevision: preview.goal.revision });
  await service.completeLearningSession(owner, session.id);
  const activeGoal = await service.getLearningGoal(owner, goal.id);
  assert.ok(activeGoal);

  const adjustment = await service.createLearningPlanAdjustment(owner, goal.id, {
    basePlanVersionId: preview.plan.id, expectedGoalRevision: activeGoal!.revision, reason: "changed-time", dailyMinutes: 20, note: "하루 시간을 줄였습니다.",
  });
  assert.equal(adjustment.status, "proposed");
  assert.equal(adjustment.requiresAcceptance, true);
  assert.deepEqual(adjustment.preservedCompletedDayIds, [preview.plan.days[0]!.id]);
  assert.equal(adjustment.proposedPlan.dailyMinutes, 20);
  assert.equal((await service.listLearningPlanVersions(owner, goal.id))[0]!.status, "active");
  assert.equal(await service.listLearningPlanAdjustments(other, goal.id).then((items) => items.length), 0);

  const accepted = await service.acceptLearningPlanAdjustment(owner, goal.id, adjustment.id);
  assert.equal(accepted.adjustment.status, "accepted");
  assert.ok(accepted.plan);
  assert.notEqual(accepted.plan!.id, preview.plan.id);
  assert.equal(accepted.plan!.days.length, 3);
  assert.equal(accepted.plan!.days[0]!.minutes, 30);
  assert.equal(accepted.plan!.days[1]!.minutes, 20);
  assert.equal(accepted.goal.input.dailyMinutes, 20);
  assert.equal(accepted.goal.revision, activeGoal!.revision + 1);
  assert.equal((await service.getLearningPlanVersion(owner, goal.id, preview.plan.id))!.status, "superseded");
  assert.equal((await service.listLearningPlanAdjustments(owner, goal.id))[0]!.acceptedPlanVersionId, accepted.plan!.id);

  const repeated = await service.acceptLearningPlanAdjustment(owner, goal.id, adjustment.id);
  assert.equal(repeated.plan!.id, accepted.plan!.id);
  await assert.rejects(() => service.createLearningPlanAdjustment(owner, goal.id, { basePlanVersionId: preview.plan.id, expectedGoalRevision: activeGoal!.revision, reason: "blocked", dailyMinutes: 15 }), /conflict|superseded/i);
  const restarted = createLearningService(root, { now: () => at });
  assert.equal((await restarted.listLearningPlanAdjustments(owner, goal.id))[0]!.status, "accepted");
});

test("plan adjustment rejects another user's plan, stale revisions, and no-op changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-plan-adjustment-boundary-"));
  const owner = principal("adjustment-boundary-owner");
  const other = principal("adjustment-boundary-other");
  const service = createLearningService(root, { now: () => at });
  const goal = await service.createLearningGoal(owner, { subjectText: "복습", duration: { days: 2 }, dailyMinutes: 20 });
  const preview = await service.createLearningPlanPreview(owner, goal.id);
  await assert.rejects(() => service.createLearningPlanAdjustment(other, goal.id, { basePlanVersionId: preview.plan.id, reason: "blocked", dailyMinutes: 15 }), /not found/i);
  await assert.rejects(() => service.createLearningPlanAdjustment(owner, goal.id, { basePlanVersionId: preview.plan.id, expectedGoalRevision: 1, reason: "blocked", dailyMinutes: 15 }), /conflict/i);
  await assert.rejects(() => service.createLearningPlanAdjustment(owner, goal.id, { basePlanVersionId: preview.plan.id, reason: "blocked", dailyMinutes: 20 }), /change|same|adjust/i);
});

test("learning plan adjustment lists wait for each durable acceptance lock before projecting state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-plan-adjustment-read-lock-"));
  const owner = principal("adjustment-read-lock-owner");
  const service = createLearningService(root, { now: () => at });
  const goal = await service.createLearningGoal(owner, { subjectText: "Adjustment reads", duration: { days: 2 }, dailyMinutes: 20 });
  const preview = await service.createLearningPlanPreview(owner, goal.id, goal.revision);
  const adjustment = await service.createLearningPlanAdjustment(owner, goal.id, {
    basePlanVersionId: preview.plan.id, expectedGoalRevision: preview.goal.revision, reason: "changed-time", dailyMinutes: 15,
  });
  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableLearningPlanAdjustmentAcceptanceLock(root, owner.userId, goal.id, adjustment.id, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let settled = false;
  const read = service.listLearningPlanAdjustments(owner, goal.id).then((result) => { settled = true; return result; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  await saveLearningPlanAdjustment(root, { ...adjustment, note: "잠금 해제 후 조정" });
  releaseHolder();
  await lockHeld;
  assert.equal((await read)[0]?.note, "잠금 해제 후 조정");
});

test("concurrent learning plan adjustments across service instances remain one draft", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-plan-adjustment-concurrent-"));
  const firstService = createLearningService(root, { now: () => at });
  const secondService = createLearningService(root, { now: () => at });
  const owner = principal("adjustment-concurrent-owner");
  const goal = await firstService.createLearningGoal(owner, { subjectText: "동시 조정", duration: { days: 3 }, dailyMinutes: 30 });
  const preview = await firstService.createLearningPlanPreview(owner, goal.id, goal.revision);
  const input = { basePlanVersionId: preview.plan.id, expectedGoalRevision: preview.goal.revision, reason: "changed-time" as const, dailyMinutes: 20, note: "같은 조정" };

  const results = await Promise.all([
    firstService.createLearningPlanAdjustment(owner, goal.id, input),
    secondService.createLearningPlanAdjustment(owner, goal.id, input),
  ]);

  assert.equal(new Set(results.map((result) => result.id)).size, 1);
  assert.equal((await firstService.listLearningPlanAdjustments(owner, goal.id)).length, 1);
});

test("concurrent learning plan adjustment acceptance across service instances remains one plan", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-plan-adjustment-accept-concurrent-"));
  const firstService = createLearningService(root, { now: () => at });
  const secondService = createLearningService(root, { now: () => at });
  const owner = principal("adjustment-accept-concurrent-owner");
  const goal = await firstService.createLearningGoal(owner, { subjectText: "동시 승인", duration: { days: 3 }, dailyMinutes: 30 });
  const preview = await firstService.createLearningPlanPreview(owner, goal.id, goal.revision);
  const adjustment = await firstService.createLearningPlanAdjustment(owner, goal.id, { basePlanVersionId: preview.plan.id, expectedGoalRevision: preview.goal.revision, reason: "changed-time", dailyMinutes: 20 });

  const results = await Promise.all([
    firstService.acceptLearningPlanAdjustment(owner, goal.id, adjustment.id),
    secondService.acceptLearningPlanAdjustment(owner, goal.id, adjustment.id),
  ]);

  assert.equal(new Set(results.map((result) => result.plan?.id)).size, 1);
  assert.equal((await firstService.listLearningPlanAdjustments(owner, goal.id))[0]?.status, "accepted");
  assert.equal((await firstService.listLearningPlanVersions(owner, goal.id)).filter((plan) => plan.id !== preview.plan.id).length, 1);
});

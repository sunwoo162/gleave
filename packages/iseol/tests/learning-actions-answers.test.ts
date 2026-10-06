import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createLocalCodingSyntaxVerifier } from "../src/learning/local-coding-verifier.js";
import { createLearningService } from "../src/learning/service.js";
import { withDurableLearningActionLock } from "../src/learning/action-lock.js";
import { withDurableLearningAnswerLock } from "../src/learning/answer-lock.js";
import { withDurableLearningFeedbackCompletionLock } from "../src/learning/feedback-completion-lock.js";
import { saveLearningAnswerReceiptUnlocked, saveLearningFeedback, saveLearningSessionActionUnlocked } from "../src/learning/store.js";

const at = "2026-09-26T12:00:00.000Z";
function principal(userId: string): Principal { return { userId, sessionId: `${userId}-session`, roles: ["user"] }; }

test("learning session actions are owner-bound, idempotent, and distinguish self-report from Runtime actions", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-actions-"));
  const service = createLearningService(root, { now: () => at });
  const owner = principal("action-owner");
  const other = principal("action-other");
  const plan = await service.createLearningPlan(owner, { title: "Actions", description: "Actions", goals: ["Practice"] });
  const session = await service.startLearningSession(owner, plan.id);
  const selfReport = await service.recordLearningSessionAction(owner, session.id, { actionId: "understood-1", type: "self-report", contentRef: "concept-1", question: "이해했어요" });
  assert.equal(selfReport.status, "recorded");
  const hint = await service.recordLearningSessionAction(owner, session.id, { actionId: "hint-1", type: "hint", contentRef: "concept-1", question: "힌트를 주세요" });
  assert.equal(hint.status, "waiting-runtime");
  assert.match(hint.blocker ?? "", /Runtime/i);
  assert.equal((await service.recordLearningSessionAction(owner, session.id, { actionId: "understood-1", type: "self-report", contentRef: "concept-1", question: "이해했어요" })).id, selfReport.id);
  await assert.rejects(() => service.recordLearningSessionAction(owner, session.id, { actionId: "understood-1", type: "self-report", contentRef: "other", question: "다른 기록" }), /conflict/i);
  assert.equal((await service.listLearningSessionActions(owner, session.id)).length, 2);
  await assert.rejects(() => service.recordLearningSessionAction(other, session.id, { actionId: "other", type: "self-report" }), /not found|forbidden/i);
});

test("learning action Runtime blockers redact credential-shaped text", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-action-blocker-safety-"));
  const secret = "action token=action-secret api_key=action-api-secret https://preview.example/?access_token=action-url-secret";
  const service = createLearningService(root, { now: () => at, actionDispatcher: async () => ({ status: "waiting" as const, blocker: secret }) });
  const owner = principal("action-blocker-owner");
  const plan = await service.createLearningPlan(owner, { title: "Action blocker", description: "Action blocker", goals: ["Practice"] });
  const session = await service.startLearningSession(owner, plan.id);
  const action = await service.recordLearningSessionAction(owner, session.id, { actionId: "blocker-safe", type: "hint", contentRef: "concept-1" });
  assert.equal(action.status, "waiting-runtime");
  for (const value of ["action-secret", "action-api-secret", "action-url-secret"]) assert.equal(action.blocker?.includes(value), false);
  assert.match(action.blocker ?? "", /\[redacted\]|\[redacted-url\]/i);
});

test("learning session action lists wait for each durable action lock before projecting state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-action-read-lock-"));
  const owner = principal("action-read-lock-owner");
  const service = createLearningService(root, { now: () => at });
  const plan = await service.createLearningPlan(owner, { title: "Action reads", description: "Action reads", goals: ["Practice"] });
  const session = await service.startLearningSession(owner, plan.id);
  const action = await service.recordLearningSessionAction(owner, session.id, { actionId: "read-lock-action", type: "self-report", question: "기존 질문" });
  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableLearningActionLock(root, owner.userId, session.id, action.actionId, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let settled = false;
  const read = service.listLearningSessionActions(owner, session.id).then((result) => { settled = true; return result; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  await saveLearningSessionActionUnlocked(root, { ...action, question: "잠금 해제 후 질문" });
  releaseHolder();
  await lockHeld;
  assert.equal((await read)[0]?.question, "잠금 해제 후 질문");
});

test("concurrent learning session actions across service instances remain one action", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-actions-concurrent-"));
  const owner = principal("action-concurrent-owner");
  const firstService = createLearningService(root, { now: () => at });
  const secondService = createLearningService(root, { now: () => at });
  const plan = await firstService.createLearningPlan(owner, { title: "Concurrent actions", description: "One action", goals: ["Practice"] });
  const session = await firstService.startLearningSession(owner, plan.id);
  const input = { actionId: "concurrent-action", type: "self-report" as const, contentRef: "concept-1", question: "이해했어요" };

  const results = await Promise.all([
    firstService.recordLearningSessionAction(owner, session.id, input),
    secondService.recordLearningSessionAction(owner, session.id, input),
  ]);

  assert.equal(new Set(results.map((action) => action.id)).size, 1);
  assert.equal((await firstService.listLearningSessionActions(owner, session.id)).length, 1);
});

test("learning answer receipts persist exactly once and keep feedback pending without an evaluator", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-answers-"));
  const service = createLearningService(root, { now: () => at });
  const owner = principal("answer-owner");
  const other = principal("answer-other");
  const plan = await service.createLearningPlan(owner, { title: "Answers", description: "Answers", goals: ["Practice"] });
  const session = await service.startLearningSession(owner, plan.id);
  const exercise = await service.createCodingExercise(owner, { sessionId: session.id, title: "Identity", prompt: "Write identity", language: "typescript", estimatedMinutes: 10 });
  const attempt = await service.submitCodingAttempt(owner, { exerciseId: exercise.id, clientRequestId: "answer-attempt-1", response: "function identity<T>(value: T): T { return value; }" });
  const receipt = await service.submitLearningAnswer(owner, session.id, { exerciseId: exercise.id, attemptId: attempt.attempt.id, response: attempt.attempt.response, artifactRefs: [] });
  assert.equal(receipt.status, "evaluation-pending");
  assert.equal(receipt.revealedBeforeEvaluation, false);
  assert.ok(receipt.evaluationRequestId);
  const feedback = await service.getLearningAnswerFeedback(owner, receipt.id);
  assert.equal(feedback?.status, "pending");
  assert.equal((await service.submitLearningAnswer(owner, session.id, { exerciseId: exercise.id, attemptId: attempt.attempt.id, response: attempt.attempt.response, artifactRefs: [] })).id, receipt.id);
  await assert.rejects(() => service.submitLearningAnswer(owner, session.id, { exerciseId: exercise.id, attemptId: attempt.attempt.id, response: "changed", artifactRefs: [] }), /conflict/i);
  assert.equal(await service.getLearningAnswerFeedback(other, receipt.id), null);
});

test("learning answer feedback reads wait for the durable feedback completion lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-feedback-read-lock-"));
  const owner = principal("feedback-read-lock-owner");
  const service = createLearningService(root, { now: () => at });
  const plan = await service.createLearningPlan(owner, { title: "Feedback reads", description: "Feedback reads", goals: ["Practice"] });
  const session = await service.startLearningSession(owner, plan.id);
  const exercise = await service.createCodingExercise(owner, { sessionId: session.id, title: "Identity", prompt: "Write identity", language: "typescript", estimatedMinutes: 10 });
  const attempt = await service.submitCodingAttempt(owner, { exerciseId: exercise.id, clientRequestId: "feedback-read-attempt", response: "function identity<T>(value: T): T { return value; }" });
  const receipt = await service.submitLearningAnswer(owner, session.id, { exerciseId: exercise.id, attemptId: attempt.attempt.id, response: attempt.attempt.response, artifactRefs: [] });
  const feedback = await service.getLearningAnswerFeedback(owner, receipt.id);
  assert.ok(feedback);
  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableLearningFeedbackCompletionLock(root, owner.userId, feedback.id, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let settled = false;
  const read = service.getLearningAnswerFeedback(owner, receipt.id).then((result) => { settled = true; return result; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  await saveLearningFeedback(root, { ...feedback, blocker: "잠금 해제 후 피드백", updatedAt: "2026-09-26T12:00:01.000Z" });
  releaseHolder();
  await lockHeld;
  assert.equal((await read)?.blocker, "잠금 해제 후 피드백");
});

test("learning answer lists wait for each durable answer lock before projecting state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-answer-read-lock-"));
  const owner = principal("answer-read-lock-owner");
  const service = createLearningService(root, { now: () => at });
  const plan = await service.createLearningPlan(owner, { title: "Answer reads", description: "Answer reads", goals: ["Practice"] });
  const session = await service.startLearningSession(owner, plan.id);
  const exercise = await service.createCodingExercise(owner, { sessionId: session.id, title: "Identity", prompt: "Write identity", language: "typescript", estimatedMinutes: 10 });
  const attempt = await service.submitCodingAttempt(owner, { exerciseId: exercise.id, clientRequestId: "answer-read-attempt", response: "const answer = 1;" });
  const answer = await service.submitLearningAnswer(owner, session.id, { exerciseId: exercise.id, attemptId: attempt.attempt.id, response: attempt.attempt.response, artifactRefs: [] });
  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableLearningAnswerLock(root, owner.userId, session.id, answer.attemptId, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let settled = false;
  const read = service.listLearningAnswers(owner, session.id).then((result) => { settled = true; return result; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  await saveLearningAnswerReceiptUnlocked(root, { ...answer, response: "잠금 해제 후 답변" });
  releaseHolder();
  await lockHeld;
  assert.equal((await read)[0]?.response, "잠금 해제 후 답변");
});

test("learning answer receipts retain verifier artifact references even when the client sends no extra files", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-answer-artifacts-"));
  const service = createLearningService(root, {
    now: () => at,
    codingAttemptVerifier: createLocalCodingSyntaxVerifier({ timeoutMs: 5_000 }),
  });
  const owner = principal("answer-artifact-owner");
  const plan = await service.createLearningPlan(owner, { title: "Artifacts", description: "Artifacts", goals: ["Syntax"] });
  const session = await service.startLearningSession(owner, plan.id);
  const exercise = await service.createCodingExercise(owner, { sessionId: session.id, title: "Syntax", prompt: "Write JavaScript", language: "javascript", estimatedMinutes: 5 });
  const attempt = await service.submitCodingAttempt(owner, { exerciseId: exercise.id, clientRequestId: "answer-artifact-1", response: "const answer = 1;" });
  const receipt = await service.submitLearningAnswer(owner, session.id, { exerciseId: exercise.id, attemptId: attempt.attempt.id, response: attempt.attempt.response, artifactRefs: [] });

  assert.deepEqual(attempt.attempt.practiceResult.artifactRefs, [`coding-syntax:${attempt.attempt.id}`]);
  assert.deepEqual(receipt.artifactRefs, [`coding-syntax:${attempt.attempt.id}`]);
});

test("concurrent learning answer submissions across service instances remain one receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-answer-concurrent-"));
  const owner = principal("answer-concurrent-owner");
  const firstService = createLearningService(root, { now: () => at });
  const secondService = createLearningService(root, { now: () => at });
  const plan = await firstService.createLearningPlan(owner, { title: "Concurrent answers", description: "One receipt", goals: ["one"] });
  const session = await firstService.startLearningSession(owner, plan.id);
  const exercise = await firstService.createCodingExercise(owner, { sessionId: session.id, title: "Answer once", prompt: "Write answer", language: "typescript", estimatedMinutes: 5 });
  const attempt = await firstService.submitCodingAttempt(owner, { exerciseId: exercise.id, clientRequestId: "answer-concurrent-attempt", response: "const answer = 1;" });
  const input = { exerciseId: exercise.id, attemptId: attempt.attempt.id, response: attempt.attempt.response, artifactRefs: [] };

  const results = await Promise.all([
    firstService.submitLearningAnswer(owner, session.id, input),
    secondService.submitLearningAnswer(owner, session.id, input),
  ]);

  assert.equal(new Set(results.map((result) => result.id)).size, 1);
  assert.equal((await firstService.listLearningAnswers(owner, session.id)).length, 1);
});

test("an injected learning action Runtime completes through the owner-bound durable callback", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-action-runtime-"));
  const service = createLearningService(root, {
    now: () => at,
    actionDispatcher: async (request) => ({
      status: "completed" as const,
      action: await request.complete("다음으로 타입 매개변수가 어떤 값을 보존하는지 설명해 보세요."),
    }),
  });
  const owner = principal("action-runtime-owner");
  const plan = await service.createLearningPlan(owner, { title: "Action Runtime", description: "Action Runtime", goals: ["Practice"] });
  const session = await service.startLearningSession(owner, plan.id);
  const action = await service.recordLearningSessionAction(owner, session.id, { actionId: "hint-runtime-1", type: "hint", contentRef: "concept-1", question: "힌트를 주세요" });
  assert.equal(action.status, "recorded");
  assert.match(action.response ?? "", /타입 매개변수/);
  assert.deepEqual(action.source, { kind: "local-runtime" });
  const reloaded = createLearningService(root, { now: () => at });
  assert.equal((await reloaded.listLearningSessionActions(owner, session.id))[0]?.response, action.response);
});

test("concurrent learning action completions converge or reject by the first durable response", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-action-completion-concurrent-"));
  const owner = principal("action-completion-concurrent-owner");
  const firstService = createLearningService(root, { now: () => at });
  const secondService = createLearningService(root, { now: () => at });
  const plan = await firstService.createLearningPlan(owner, { title: "Concurrent completion", description: "One completion", goals: ["Practice"] });
  const session = await firstService.startLearningSession(owner, plan.id);
  const action = await firstService.recordLearningSessionAction(owner, session.id, { actionId: "completion-race", type: "hint" });

  const results = await Promise.allSettled([
    firstService.completeLearningSessionAction(owner, action.id, "첫 번째 응답"),
    secondService.completeLearningSessionAction(owner, action.id, "두 번째 응답"),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && /conflict/i.test(String(result.reason))).length, 1);
  const stored = (await firstService.listLearningSessionActions(owner, session.id))[0];
  assert.equal(stored?.status, "recorded");
  assert.ok(stored?.response === "첫 번째 응답" || stored?.response === "두 번째 응답");
});

test("learning Runtime dispatches do not overlap for the same user", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-dispatch-concurrency-"));
  let active = 0;
  let maximumActive = 0;
  let dispatchCount = 0;
  let firstEntered: (() => void) | undefined;
  let releaseFirst: (() => void) | undefined;
  const entered = new Promise<void>((resolve) => { firstEntered = resolve; });
  const firstRelease = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const service = createLearningService(root, {
    now: () => at,
    actionDispatcher: async (request) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      dispatchCount += 1;
      if (dispatchCount === 1) {
        firstEntered?.();
        await firstRelease;
      }
      const action = await request.complete(`응답-${request.action.actionId}`);
      active -= 1;
      return { status: "completed" as const, action };
    },
  });
  const owner = principal("dispatch-concurrency-owner");
  const firstPlan = await service.createLearningPlan(owner, { title: "첫 과정", description: "첫 과정", goals: ["첫 목표"] });
  const secondPlan = await service.createLearningPlan(owner, { title: "둘째 과정", description: "둘째 과정", goals: ["둘째 목표"] });
  const firstSession = await service.startLearningSession(owner, firstPlan.id);
  const secondSession = await service.startLearningSession(owner, secondPlan.id);

  const first = service.recordLearningSessionAction(owner, firstSession.id, { actionId: "dispatch-one", type: "hint", contentRef: "concept-1" });
  await entered;
  const second = service.recordLearningSessionAction(owner, secondSession.id, { actionId: "dispatch-two", type: "hint", contentRef: "concept-2" });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(dispatchCount, 1);
  assert.equal(maximumActive, 1);

  releaseFirst?.();
  const [firstAction, secondAction] = await Promise.all([first, second]);
  assert.equal(firstAction.response, "응답-dispatch-one");
  assert.equal(secondAction.response, "응답-dispatch-two");
  assert.equal(dispatchCount, 2);
  assert.equal(maximumActive, 1);
  assert.equal(active, 0);
});

test("learning Runtime dispatches can run concurrently for different users", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-dispatch-users-"));
  let active = 0;
  let maximumActive = 0;
  let enteredCount = 0;
  let release: (() => void) | undefined;
  let resolveBothEntered: (() => void) | undefined;
  const bothEntered = new Promise<void>((resolve) => { resolveBothEntered = resolve; });
  const releaseAll = new Promise<void>((resolve) => { release = resolve; });
  const service = createLearningService(root, {
    now: () => at,
    actionDispatcher: async (request) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      enteredCount += 1;
      if (enteredCount === 2) resolveBothEntered?.();
      await releaseAll;
      const action = await request.complete(`응답-${request.action.actionId}`);
      active -= 1;
      return { status: "completed" as const, action };
    },
  });
  const ownerA = principal("dispatch-concurrency-a");
  const ownerB = principal("dispatch-concurrency-b");
  const planA = await service.createLearningPlan(ownerA, { title: "A", description: "A", goals: ["A"] });
  const planB = await service.createLearningPlan(ownerB, { title: "B", description: "B", goals: ["B"] });
  const sessionA = await service.startLearningSession(ownerA, planA.id);
  const sessionB = await service.startLearningSession(ownerB, planB.id);
  const first = service.recordLearningSessionAction(ownerA, sessionA.id, { actionId: "user-a-action", type: "hint" });
  const second = service.recordLearningSessionAction(ownerB, sessionB.id, { actionId: "user-b-action", type: "hint" });

  await bothEntered;
  assert.equal(maximumActive, 2);
  release?.();
  await Promise.all([first, second]);
  assert.equal(active, 0);
});

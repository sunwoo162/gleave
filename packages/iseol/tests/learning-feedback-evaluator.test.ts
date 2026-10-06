import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createLocalCodingSyntaxVerifier } from "../src/learning/local-coding-verifier.js";
import { createLearningService } from "../src/learning/service.js";

const at = "2026-09-26T12:00:00.000Z";
function principal(userId: string): Principal { return { userId, sessionId: `${userId}-session`, roles: ["user"] }; }

test("an injected learning evaluator completes feedback only with validated tentative evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-evaluator-"));
  let received: any;
  const service = createLearningService(root, {
    now: () => at,
    feedbackDispatcher: async (request: any) => {
      received = request;
      const result = await request.complete({
        attemptId: request.answer.attemptId,
        rubricVersion: "rubric-v1",
        evaluatorVersion: "local-evaluator-v1",
        criteriaResults: [{ criterionId: "explanation", result: "partial", evidenceRefs: [], explanation: "실행 근거가 없어 일부만 판단할 수 있습니다." }],
        feedback: "핵심 방향은 확인되지만 실행 결과는 아직 검증되지 않았습니다.",
        misconceptions: [],
        verification: "verified",
        nextAction: "로컬 실행 환경에서 테스트 결과를 확인하세요.",
      });
      return { status: "completed", feedback: result };
    },
  } as any);
  const owner = principal("evaluator-owner");
  const plan = await service.createLearningPlan(owner, { title: "Evaluator", description: "Evaluator", goals: ["Practice"] });
  const session = await service.startLearningSession(owner, plan.id);
  const exercise = await service.createCodingExercise(owner, { sessionId: session.id, title: "Explain", prompt: "Explain", language: "typescript", estimatedMinutes: 10 });
  const attempt = await service.submitCodingAttempt(owner, { exerciseId: exercise.id, clientRequestId: "evaluator-attempt", response: "answer" });
  const answer = await service.submitLearningAnswer(owner, session.id, { exerciseId: exercise.id, attemptId: attempt.attempt.id, response: attempt.attempt.response });
  assert.equal(answer.status, "feedback-ready");
  const answers = await service.listLearningAnswers(owner, session.id);
  assert.deepEqual(answers.map((item) => item.id), [answer.id]);
  assert.equal(received.principal.userId, owner.userId);
  assert.equal(received.answer.id, answer.id);
  assert.equal(received.attempt.id, attempt.attempt.id);
  const feedback = await service.getLearningAnswerFeedback(owner, answer.id);
  assert.equal(feedback?.status, "tentative");
  assert.equal(feedback?.evaluation?.verification, "tentative");
  assert.match(feedback?.blocker ?? "", /verifier|검증/i);
  assert.equal(feedback?.evaluation?.criteriaResults[0]?.criterionId, "explanation");

  const restarted = createLearningService(root, { now: () => at });
  assert.deepEqual((await restarted.listLearningAnswers(owner, session.id)).map((item) => item.id), [answer.id]);
  const persisted = await restarted.getLearningAnswerFeedback(owner, answer.id);
  assert.equal(persisted?.status, "tentative");
  assert.equal(persisted?.evaluation?.evaluatorVersion, "local-evaluator-v1");
});

test("concurrent learning feedback completions preserve one durable evaluation", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-feedback-completion-concurrent-"));
  const owner = principal("feedback-completion-concurrent-owner");
  const firstService = createLearningService(root, { now: () => at });
  const secondService = createLearningService(root, { now: () => at });
  const plan = await firstService.createLearningPlan(owner, { title: "Concurrent feedback", description: "One evaluation", goals: ["Practice"] });
  const session = await firstService.startLearningSession(owner, plan.id);
  const exercise = await firstService.createCodingExercise(owner, { sessionId: session.id, title: "Explain", prompt: "Explain", language: "typescript", estimatedMinutes: 10 });
  const attempt = await firstService.submitCodingAttempt(owner, { exerciseId: exercise.id, clientRequestId: "feedback-completion-concurrent-attempt", response: "answer" });
  const answer = await firstService.submitLearningAnswer(owner, session.id, { exerciseId: exercise.id, attemptId: attempt.attempt.id, response: attempt.attempt.response });
  const feedback = await firstService.getLearningAnswerFeedback(owner, answer.id);
  assert.ok(feedback);
  const evaluation = (version: string) => ({
    attemptId: attempt.attempt.id,
    rubricVersion: "rubric-v1",
    evaluatorVersion: version,
    criteriaResults: [{ criterionId: "explanation", result: "partial" as const, evidenceRefs: [], explanation: version }],
    feedback: version,
    misconceptions: [],
    verification: "tentative" as const,
    nextAction: "다음 문제를 풀어 보세요.",
  });

  const results = await Promise.all([
    firstService.completeLearningFeedback(owner, feedback.id, evaluation("evaluator-v1")),
    secondService.completeLearningFeedback(owner, feedback.id, evaluation("evaluator-v2")),
  ]);

  assert.equal(new Set(results.map((result) => result.evaluation?.evaluatorVersion)).size, 1);
  assert.equal((await firstService.getLearningAnswerFeedback(owner, answer.id))?.evaluation?.evaluatorVersion, results[0].evaluation?.evaluatorVersion);
});

test("syntax-only verifier evidence cannot be promoted to verified correctness feedback", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-evaluator-syntax-only-"));
  const service = createLearningService(root, {
    now: () => at,
    codingAttemptVerifier: createLocalCodingSyntaxVerifier({ timeoutMs: 5_000 }),
    feedbackDispatcher: async (request: any) => {
      assert.equal(request.attempt.practiceResult.receipt.checkKind, "syntax-only");
      const result = await request.complete({
        attemptId: request.answer.attemptId,
        rubricVersion: "rubric-v1",
        evaluatorVersion: "local-evaluator-v1",
        criteriaResults: [{ criterionId: "correctness", result: "correct", evidenceRefs: [], explanation: "구문은 유효하지만 정답 실행 결과는 확인하지 않았습니다." }],
        feedback: "구문은 확인되었지만 정답 여부는 아직 검증되지 않았습니다.",
        misconceptions: [],
        verification: "verified",
        nextAction: "로컬 테스트 실행 결과를 확인하세요.",
      });
      return { status: "completed", feedback: result };
    },
  } as any);
  const owner = principal("evaluator-syntax-only");
  const plan = await service.createLearningPlan(owner, { title: "Syntax boundary", description: "Syntax boundary", goals: ["Practice"] });
  const session = await service.startLearningSession(owner, plan.id);
  const exercise = await service.createCodingExercise(owner, { sessionId: session.id, title: "Syntax", prompt: "Write JavaScript", language: "javascript", estimatedMinutes: 5 });
  const attempt = await service.submitCodingAttempt(owner, { exerciseId: exercise.id, clientRequestId: "evaluator-syntax-only-attempt", response: "const answer = 1;" });
  const answer = await service.submitLearningAnswer(owner, session.id, { exerciseId: exercise.id, attemptId: attempt.attempt.id, response: attempt.attempt.response });

  const feedback = await service.getLearningAnswerFeedback(owner, answer.id);
  assert.equal(feedback?.status, "tentative");
  assert.equal(feedback?.evaluation?.verification, "tentative");
  assert.match(feedback?.blocker ?? "", /correctness|정답|검증/i);
});

test("an evaluator failure keeps the answer pending and does not invent feedback", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-evaluator-waiting-"));
  const secret = "local evaluator timed out token=evaluator-secret https://preview.example/?access_token=evaluator-url-secret";
  const service = createLearningService(root, {
    now: () => at,
    feedbackDispatcher: async () => ({ status: "waiting", blocker: secret }),
  } as any);
  const owner = principal("evaluator-waiting");
  const plan = await service.createLearningPlan(owner, { title: "Evaluator", description: "Evaluator", goals: ["Practice"] });
  const session = await service.startLearningSession(owner, plan.id);
  const exercise = await service.createCodingExercise(owner, { sessionId: session.id, title: "Explain", prompt: "Explain", language: "typescript", estimatedMinutes: 10 });
  const attempt = await service.submitCodingAttempt(owner, { exerciseId: exercise.id, clientRequestId: "evaluator-waiting-attempt", response: "answer" });
  const answer = await service.submitLearningAnswer(owner, session.id, { exerciseId: exercise.id, attemptId: attempt.attempt.id, response: attempt.attempt.response });
  assert.equal(answer.status, "evaluation-pending");
  const feedback = await service.getLearningAnswerFeedback(owner, answer.id);
  assert.equal(feedback?.status, "pending");
  assert.equal(feedback?.blocker?.includes("evaluator-secret"), false);
  assert.equal(feedback?.blocker?.includes("evaluator-url-secret"), false);
  assert.match(feedback?.blocker ?? "", /timed out/i);
  assert.match(feedback?.blocker ?? "", /\[redacted\]|\[redacted-url\]/i);
  assert.equal(feedback?.evaluation, undefined);
});

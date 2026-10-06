import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createLearningService } from "../src/learning/service.js";

const at = "2026-09-26T12:00:00.000Z";
function principal(userId: string): Principal { return { userId, sessionId: `${userId}-session`, roles: ["user"] }; }

test("feedback disputes preserve the reason, mark the answer disputed, and wait for re-evaluation Runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-dispute-"));
  const secret = "re-evaluation token=dispute-secret https://preview.example/?access_token=dispute-url-secret";
  const service = createLearningService(root, { now: () => at, feedbackDispatcher: async () => ({ status: "waiting" as const, blocker: secret }) });
  const owner = principal("dispute-owner");
  const other = principal("dispute-other");
  const plan = await service.createLearningPlan(owner, { title: "Dispute", description: "Dispute", goals: ["Practice"] });
  const session = await service.startLearningSession(owner, plan.id);
  const exercise = await service.createCodingExercise(owner, { sessionId: session.id, title: "Explain", prompt: "Explain", language: "typescript", estimatedMinutes: 10 });
  const attempt = await service.submitCodingAttempt(owner, { exerciseId: exercise.id, clientRequestId: "dispute-attempt", response: "answer" });
  const answer = await service.submitLearningAnswer(owner, session.id, { exerciseId: exercise.id, attemptId: attempt.attempt.id, response: attempt.attempt.response });
  const feedback = await service.getLearningAnswerFeedback(owner, answer.id);
  assert.ok(feedback);

  const result = await (service as any).disputeLearningFeedback(owner, feedback.id, { reason: "실행 근거가 없어 판단을 다시 확인하고 싶습니다." });
  assert.equal(result.dispute.status, "waiting-runtime");
  assert.equal(result.dispute.feedbackId, feedback.id);
  assert.equal(result.dispute.answerId, answer.id);
  assert.equal(result.dispute.blocker.includes("dispute-secret"), false);
  assert.equal(result.dispute.blocker.includes("dispute-url-secret"), false);
  assert.match(result.dispute.blocker, /re-evaluation|재평가/i);
  assert.match(result.dispute.blocker, /\[redacted\]|\[redacted-url\]/i);
  assert.equal(result.feedback.status, "disputed");
  assert.equal(result.answer.status, "disputed");
  assert.match(result.feedback.blocker, /dispute|이의/i);

  const repeated = await (service as any).disputeLearningFeedback(owner, feedback.id, { reason: "실행 근거가 없어 판단을 다시 확인하고 싶습니다." });
  assert.equal(repeated.dispute.id, result.dispute.id);
  await assert.rejects(() => (service as any).disputeLearningFeedback(owner, feedback.id, { reason: "다른 사유" }), /conflict/i);
  await assert.rejects(() => (service as any).disputeLearningFeedback(other, feedback.id, { reason: "타 사용자 접근" }), /not found|forbidden/i);

  const restarted = createLearningService(root, { now: () => at });
  const persistedFeedback = await restarted.getLearningAnswerFeedback(owner, answer.id);
  assert.equal(persistedFeedback?.status, "disputed");
});

test("concurrent feedback disputes across service instances remain one dispute", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-dispute-concurrent-"));
  const owner = principal("dispute-concurrent-owner");
  const firstService = createLearningService(root, { now: () => at });
  const secondService = createLearningService(root, { now: () => at });
  const plan = await firstService.createLearningPlan(owner, { title: "Concurrent dispute", description: "One dispute", goals: ["Practice"] });
  const session = await firstService.startLearningSession(owner, plan.id);
  const exercise = await firstService.createCodingExercise(owner, { sessionId: session.id, title: "Explain", prompt: "Explain", language: "typescript", estimatedMinutes: 10 });
  const attempt = await firstService.submitCodingAttempt(owner, { exerciseId: exercise.id, clientRequestId: "dispute-concurrent-attempt", response: "answer" });
  const answer = await firstService.submitLearningAnswer(owner, session.id, { exerciseId: exercise.id, attemptId: attempt.attempt.id, response: attempt.attempt.response });
  const feedback = await firstService.getLearningAnswerFeedback(owner, answer.id);
  assert.ok(feedback);
  const reason = "동시 이의 제기 사유";

  const results = await Promise.all([
    (firstService as any).disputeLearningFeedback(owner, feedback.id, { reason }),
    (secondService as any).disputeLearningFeedback(owner, feedback.id, { reason }),
  ]);

  assert.equal(new Set(results.map((result: any) => result.dispute.id)).size, 1);
  assert.equal((await firstService.getLearningAnswerFeedback(owner, answer.id))?.status, "disputed");
});

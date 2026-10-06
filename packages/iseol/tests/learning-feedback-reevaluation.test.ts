import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createLearningService } from "../src/learning/service.js";

const at = "2026-09-26T12:00:00.000Z";
function principal(userId: string): Principal { return { userId, sessionId: `${userId}-session`, roles: ["user"] }; }

test("a local evaluator re-evaluates a disputed answer without deleting the prior evaluation version", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-reevaluation-"));
  const service = createLearningService(root, {
    now: () => at,
    feedbackDispatcher: async (request: any) => {
      const version = request.feedback.status === "disputed" ? "local-evaluator-v2" : "local-evaluator-v1";
      const feedback = await request.complete({
        attemptId: request.answer.attemptId,
        rubricVersion: "rubric-v1",
        evaluatorVersion: version,
        criteriaResults: [{ criterionId: "explanation", result: "partial", evidenceRefs: [], explanation: version }],
        feedback: version === "local-evaluator-v2" ? "이의 제기 후 다시 확인한 결과입니다." : "초기 평가입니다.",
        misconceptions: [], verification: "tentative", nextAction: "다음 문제를 풀어 보세요.",
      });
      return { status: "completed", feedback };
    },
  } as any);
  const owner = principal("reevaluation-owner");
  const plan = await service.createLearningPlan(owner, { title: "Re-evaluation", description: "Re-evaluation", goals: ["Practice"] });
  const session = await service.startLearningSession(owner, plan.id);
  const exercise = await service.createCodingExercise(owner, { sessionId: session.id, title: "Explain", prompt: "Explain", language: "typescript", estimatedMinutes: 10 });
  const attempt = await service.submitCodingAttempt(owner, { exerciseId: exercise.id, clientRequestId: "reevaluation-attempt", response: "answer" });
  const answer = await service.submitLearningAnswer(owner, session.id, { exerciseId: exercise.id, attemptId: attempt.attempt.id, response: attempt.attempt.response });
  const initial = await service.getLearningAnswerFeedback(owner, answer.id);
  assert.equal(initial?.evaluation?.evaluatorVersion, "local-evaluator-v1");

  const result = await (service as any).disputeLearningFeedback(owner, initial!.id, { reason: "평가 버전을 다시 확인합니다." });
  assert.equal(result.dispute.status, "recorded");
  assert.equal(result.answer.status, "feedback-ready");
  assert.equal(result.feedback.status, "tentative");
  assert.equal(result.feedback.evaluation.evaluatorVersion, "local-evaluator-v2");
  assert.equal(result.feedback.evaluationHistory.length, 1);
  assert.equal(result.feedback.evaluationHistory[0].evaluatorVersion, "local-evaluator-v1");
});

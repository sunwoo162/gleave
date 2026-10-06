import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { LearningAnswerReceipt } from "../src/learning/contracts.js";
import { withDurableLearningAnswerLock } from "../src/learning/answer-lock.js";
import { loadLearningAnswerReceipt, listLearningAnswerReceipts, saveLearningAnswerReceipt } from "../src/learning/store.js";

const answer: LearningAnswerReceipt = {
  version: 1,
  id: "learning-answer-receipt-lock-test",
  userId: "answer-receipt-lock-owner",
  sessionId: "answer-receipt-lock-session",
  exerciseId: "answer-receipt-lock-exercise",
  attemptId: "answer-receipt-lock-attempt",
  response: "초기 답변",
  artifactRefs: [],
  status: "evaluation-pending",
  evaluationRequestId: "learning-evaluation-lock-test",
  revealedBeforeEvaluation: false,
  submittedAt: "2026-09-30T00:00:00.000Z",
};

test("learning answer receipt public reads and writes wait for the durable answer lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-answer-receipt-store-lock-"));
  await saveLearningAnswerReceipt(root, answer);

  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableLearningAnswerLock(root, answer.userId, answer.sessionId, answer.attemptId, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let saveSettled = false;
  let loadSettled = false;
  let listSettled = false;
  const save = saveLearningAnswerReceipt(root, { ...answer, response: "잠금 해제 후 답변" }).then(() => { saveSettled = true; });
  const load = loadLearningAnswerReceipt(root, answer.userId, answer.id).then(() => { loadSettled = true; });
  const list = listLearningAnswerReceipts(root, answer.userId).then(() => { listSettled = true; });

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(loadSettled, false);
  assert.equal(listSettled, false);

  releaseHolder();
  await lockHeld;
  await Promise.all([save, load, list]);
  assert.equal((await loadLearningAnswerReceipt(root, answer.userId, answer.id))?.response, "잠금 해제 후 답변");
  assert.equal((await listLearningAnswerReceipts(root, answer.userId))[0]?.response, "잠금 해제 후 답변");
});

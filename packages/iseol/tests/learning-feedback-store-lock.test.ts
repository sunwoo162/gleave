import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { LearningFeedback } from "../src/learning/contracts.js";
import { withDurableLearningFeedbackLock } from "../src/learning/feedback-lock.js";
import { loadLearningFeedback, listLearningFeedback, saveLearningFeedback } from "../src/learning/store.js";

const feedback: LearningFeedback = {
  version: 1,
  id: "learning-feedback-store-lock-test",
  userId: "feedback-store-lock-owner",
  answerId: "feedback-store-lock-answer",
  status: "pending",
  blocker: "초기 상태",
  createdAt: "2026-09-30T00:00:00.000Z",
  updatedAt: "2026-09-30T00:00:00.000Z",
};

test("learning feedback public reads and writes wait for the durable feedback lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-feedback-store-lock-"));
  await saveLearningFeedback(root, feedback);

  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableLearningFeedbackLock(root, feedback.userId, feedback.id, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let saveSettled = false;
  let loadSettled = false;
  let listSettled = false;
  const save = saveLearningFeedback(root, { ...feedback, blocker: "잠금 해제 후 피드백" }).then(() => { saveSettled = true; });
  const load = loadLearningFeedback(root, feedback.userId, feedback.id).then(() => { loadSettled = true; });
  const list = listLearningFeedback(root, feedback.userId).then(() => { listSettled = true; });

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(loadSettled, false);
  assert.equal(listSettled, false);

  releaseHolder();
  await lockHeld;
  await Promise.all([save, load, list]);
  assert.equal((await loadLearningFeedback(root, feedback.userId, feedback.id))?.blocker, "잠금 해제 후 피드백");
  assert.equal((await listLearningFeedback(root, feedback.userId))[0]?.blocker, "잠금 해제 후 피드백");
});

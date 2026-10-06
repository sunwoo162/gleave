import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { LearningFeedbackDispute } from "../src/learning/contracts.js";
import { withDurableLearningFeedbackDisputeLock } from "../src/learning/feedback-dispute-lock.js";
import { loadLearningFeedbackDispute, listLearningFeedbackDisputes, saveLearningFeedbackDispute } from "../src/learning/store.js";

const dispute: LearningFeedbackDispute = {
  version: 1,
  id: "learning-feedback-dispute-store-lock-test",
  userId: "feedback-dispute-store-lock-owner",
  feedbackId: "feedback-dispute-store-lock-feedback",
  answerId: "feedback-dispute-store-lock-answer",
  reason: "초기 이의 사유",
  status: "waiting-runtime",
  blocker: "초기 대기",
  createdAt: "2026-09-30T00:00:00.000Z",
  updatedAt: "2026-09-30T00:00:00.000Z",
};

test("learning feedback dispute public reads and writes wait for the durable dispute lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-feedback-dispute-store-lock-"));
  await saveLearningFeedbackDispute(root, dispute);

  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableLearningFeedbackDisputeLock(root, dispute.userId, dispute.feedbackId, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let saveSettled = false;
  let loadSettled = false;
  let listSettled = false;
  const save = saveLearningFeedbackDispute(root, { ...dispute, blocker: "잠금 해제 후 대기" }).then(() => { saveSettled = true; });
  const load = loadLearningFeedbackDispute(root, dispute.userId, dispute.id).then(() => { loadSettled = true; });
  const list = listLearningFeedbackDisputes(root, dispute.userId).then(() => { listSettled = true; });

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(loadSettled, false);
  assert.equal(listSettled, false);

  releaseHolder();
  await lockHeld;
  await Promise.all([save, load, list]);
  assert.equal((await loadLearningFeedbackDispute(root, dispute.userId, dispute.id))?.blocker, "잠금 해제 후 대기");
  assert.equal((await listLearningFeedbackDisputes(root, dispute.userId))[0]?.blocker, "잠금 해제 후 대기");
});

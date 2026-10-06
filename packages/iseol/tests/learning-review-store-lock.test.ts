import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ReviewItem } from "../src/learning/contracts.js";
import { withDurableLearningReviewLock } from "../src/learning/review-lock.js";
import { loadReview, listReviews, saveReview } from "../src/learning/store.js";

const item: ReviewItem = {
  version: 1,
  id: "learning-review-store-lock-test",
  userId: "review-store-lock-owner",
  sourceType: "learning-session",
  sourceId: "review-store-lock-session",
  prompt: "초기 복습 질문",
  answer: "초기 복습 답변",
  dueAt: "2026-09-30T00:00:00.000Z",
  intervalDays: 1,
  reviewCount: 0,
  createdAt: "2026-09-30T00:00:00.000Z",
  updatedAt: "2026-09-30T00:00:00.000Z",
};

test("learning review public reads and writes wait for the durable review lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-review-store-lock-"));
  await saveReview(root, item);

  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableLearningReviewLock(root, item.userId, item.id, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let saveSettled = false;
  let loadSettled = false;
  let listSettled = false;
  const save = saveReview(root, { ...item, answer: "잠금 해제 후 복습 답변" }).then(() => { saveSettled = true; });
  const load = loadReview(root, item.userId, item.id).then(() => { loadSettled = true; });
  const list = listReviews(root, item.userId).then(() => { listSettled = true; });

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(loadSettled, false);
  assert.equal(listSettled, false);

  releaseHolder();
  await lockHeld;
  await Promise.all([save, load, list]);
  assert.equal((await loadReview(root, item.userId, item.id))?.answer, "잠금 해제 후 복습 답변");
  assert.equal((await listReviews(root, item.userId))[0]?.answer, "잠금 해제 후 복습 답변");
});

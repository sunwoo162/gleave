import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { StudyAttempt } from "../src/learning/contracts.js";
import { withDurableLearningSessionLock } from "../src/learning/session-lock.js";
import { listAttempts, loadAttempt, saveAttempt } from "../src/learning/store.js";

const attempt: StudyAttempt = {
  version: 1,
  id: "learning-study-attempt-store-lock-test",
  userId: "learning-study-attempt-store-lock-owner",
  sessionId: "learning-study-attempt-store-lock-session",
  questionId: "learning-study-attempt-store-lock-question",
  answer: "초기 답변",
  submittedAt: "2026-09-30T00:00:00.000Z",
};

test("study attempt public reads and writes wait for the owning session lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-study-attempt-store-lock-"));
  await saveAttempt(root, attempt);

  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableLearningSessionLock(root, attempt.userId, attempt.sessionId, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let saveSettled = false;
  let loadSettled = false;
  let listSettled = false;
  const updated = { ...attempt, answer: "잠금 해제 후 답변" };
  const save = saveAttempt(root, updated).then(() => { saveSettled = true; });
  const load = loadAttempt(root, attempt.userId, attempt.id).then(() => { loadSettled = true; });
  const list = listAttempts(root, attempt.userId).then(() => { listSettled = true; });

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(loadSettled, false);
  assert.equal(listSettled, false);

  releaseHolder();
  await lockHeld;
  await Promise.all([save, load, list]);
  assert.equal((await loadAttempt(root, attempt.userId, attempt.id))?.answer, updated.answer);
  assert.equal((await listAttempts(root, attempt.userId))[0]?.answer, updated.answer);
});

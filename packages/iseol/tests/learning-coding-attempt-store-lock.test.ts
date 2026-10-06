import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { CodingAttempt } from "../src/learning/contracts.js";
import { withDurableLearningCodingAttemptLock } from "../src/learning/coding-attempt-lock.js";
import { listCodingAttempts, loadCodingAttempt, saveCodingAttempt } from "../src/learning/store.js";

const attempt: CodingAttempt = {
  version: 1,
  id: "learning-coding-attempt-store-lock-test",
  userId: "learning-coding-attempt-store-lock-owner",
  exerciseId: "learning-coding-attempt-store-lock-exercise",
  clientRequestId: "learning-coding-attempt-store-lock-request",
  response: "초기 응답",
  submittedAt: "2026-09-30T00:00:00.000Z",
  revealedBeforeSubmit: false,
  practiceResult: { status: "environment-required", artifactRefs: [], executorId: "none", policyRef: "local-runtime-executor" },
};

test("coding attempt public reads and writes wait for the durable attempt lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-coding-attempt-store-lock-"));
  await saveCodingAttempt(root, attempt);

  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableLearningCodingAttemptLock(root, attempt.userId, attempt.exerciseId, attempt.clientRequestId, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let saveSettled = false;
  let loadSettled = false;
  let listSettled = false;
  const updated = { ...attempt, response: "잠금 해제 후 응답" };
  const save = saveCodingAttempt(root, updated).then(() => { saveSettled = true; });
  const load = loadCodingAttempt(root, attempt.userId, attempt.id).then(() => { loadSettled = true; });
  const list = listCodingAttempts(root, attempt.userId).then(() => { listSettled = true; });

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(loadSettled, false);
  assert.equal(listSettled, false);

  releaseHolder();
  await lockHeld;
  await Promise.all([save, load, list]);
  assert.equal((await loadCodingAttempt(root, attempt.userId, attempt.id))?.response, updated.response);
  assert.equal((await listCodingAttempts(root, attempt.userId))[0]?.response, updated.response);
});

import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { CodingExercise } from "../src/learning/contracts.js";
import { withDurableLearningCodingExerciseLock } from "../src/learning/coding-exercise-lock.js";
import { listCodingExercises, loadCodingExercise, saveCodingExercise } from "../src/learning/store.js";

const exercise: CodingExercise = {
  version: 1,
  id: "learning-coding-exercise-store-lock-test",
  userId: "learning-coding-exercise-store-lock-owner",
  sessionId: "learning-coding-exercise-store-lock-session",
  title: "초기 연습",
  prompt: "잠금 경계를 검증하세요.",
  language: "typescript",
  estimatedMinutes: 10,
  verifier: { kind: "runtime-required", spec: "local-runtime-executor" },
  createdAt: "2026-09-30T00:00:00.000Z",
};

test("coding exercise public reads and writes wait for the durable exercise lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-coding-exercise-store-lock-"));
  await saveCodingExercise(root, exercise);

  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableLearningCodingExerciseLock(root, exercise.userId, exercise.id, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let saveSettled = false;
  let loadSettled = false;
  let listSettled = false;
  const updated = { ...exercise, title: "잠금 해제 후 연습" };
  const save = saveCodingExercise(root, updated).then(() => { saveSettled = true; });
  const load = loadCodingExercise(root, exercise.userId, exercise.id).then(() => { loadSettled = true; });
  const list = listCodingExercises(root, exercise.userId).then(() => { listSettled = true; });

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(loadSettled, false);
  assert.equal(listSettled, false);

  releaseHolder();
  await lockHeld;
  await Promise.all([save, load, list]);
  assert.equal((await loadCodingExercise(root, exercise.userId, exercise.id))?.title, updated.title);
  assert.equal((await listCodingExercises(root, exercise.userId))[0]?.title, updated.title);
});

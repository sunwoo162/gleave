import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { StudyTaskSubmission } from "../src/study/contracts.js";
import { withDurableStudySubmissionLock } from "../src/study/submission-lock.js";
import { loadTaskSubmission, saveTaskSubmission } from "../src/study/store.js";

test("public study submission stores wait for the submission lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-study-submission-store-lock-"));
  const submission: StudyTaskSubmission = {
    version: 1,
    id: "study-store-lock-submission",
    studySpaceId: "study-store-lock-space",
    taskId: "study-store-lock-task",
    userId: "study-store-lock-user",
    answer: "기존 답변입니다.",
    status: "draft",
    createdAt: "2026-09-30T12:00:00.000Z",
    updatedAt: "2026-09-30T12:00:00.000Z",
  };
  await saveTaskSubmission(root, submission);
  const updated = { ...submission, answer: "잠금 해제 후 답변입니다.", status: "submitted" as const, updatedAt: "2026-09-30T12:00:01.000Z" };

  let release!: () => void;
  let acquired!: () => void;
  const lockAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableStudySubmissionLock(root, submission.studySpaceId, submission.taskId, submission.userId, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await lockAcquired;

  let saveSettled = false;
  const pendingSave = saveTaskSubmission(root, updated).then(() => { saveSettled = true; });
  let loadSettled = false;
  const pendingLoad = loadTaskSubmission(root, submission.studySpaceId, submission.taskId, submission.userId).then((value) => { loadSettled = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(loadSettled, false);

  release();
  await holder;
  await Promise.all([pendingSave, pendingLoad]);
  assert.equal((await loadTaskSubmission(root, submission.studySpaceId, submission.taskId, submission.userId))?.status, "submitted");
  assert.equal((await loadTaskSubmission(root, submission.studySpaceId, submission.taskId, submission.userId))?.answer, "잠금 해제 후 답변입니다.");
});

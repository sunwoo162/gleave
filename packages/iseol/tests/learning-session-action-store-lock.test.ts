import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { LearningSessionAction } from "../src/learning/contracts.js";
import { withDurableLearningActionLock } from "../src/learning/action-lock.js";
import { listLearningSessionActions, saveLearningSessionAction } from "../src/learning/store.js";

test("public learning session action stores wait for the owning action lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-session-action-store-lock-"));
  const action: LearningSessionAction = {
    version: 1, id: "learning-action-store-lock", userId: "learning-action-store-owner", sessionId: "learning-action-store-session", actionId: "learning-action-store-key",
    type: "self-report", question: "초기 질문", status: "recorded", createdAt: "2026-09-30T12:00:00.000Z",
  };
  await saveLearningSessionAction(root, action);
  const updated = { ...action, question: "최신 질문" };

  let release!: () => void;
  let acquired!: () => void;
  const acquiredPromise = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableLearningActionLock(root, action.userId, action.sessionId, action.actionId, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await acquiredPromise;

  let saveSettled = false;
  let listSettled = false;
  const pendingSave = saveLearningSessionAction(root, updated).then(() => { saveSettled = true; });
  const pendingList = listLearningSessionActions(root, action.userId).then((value) => { listSettled = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(listSettled, false);

  release();
  await holder;
  await Promise.all([pendingSave, pendingList]);
  assert.equal((await listLearningSessionActions(root, action.userId))[0]?.question, "최신 질문");
});

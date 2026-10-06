import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { LearningContentRequest } from "../src/learning/contracts.js";
import { withDurableLearningSessionLock } from "../src/learning/session-lock.js";
import { listLearningContentRequests, loadLearningContentRequest, saveLearningContentRequest } from "../src/learning/store.js";

test("public learning content request stores wait for the owning session lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-content-request-store-lock-"));
  const request: LearningContentRequest = {
    version: 1, id: "learning-content-request-store-lock", userId: "learning-content-request-owner", sessionId: "learning-content-request-session",
    goalId: "learning-content-request-goal", planVersionId: "learning-content-request-plan", dayId: "learning-content-request-day",
    templateId: "learning-day-content", templateVersion: "learning-day-content-v1", scope: "private", inputHash: "hash-1", state: "waiting-runtime",
    budget: { maxMinutes: 30 }, blocker: "waiting", createdAt: "2026-09-30T12:00:00.000Z", updatedAt: "2026-09-30T12:00:00.000Z",
  };
  await saveLearningContentRequest(root, request);
  const updated = { ...request, state: "running" as const, updatedAt: "2026-09-30T12:00:01.000Z" };

  let release!: () => void;
  let acquired!: () => void;
  const acquiredPromise = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableLearningSessionLock(root, request.userId, request.sessionId, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await acquiredPromise;

  let saveSettled = false;
  let loadSettled = false;
  let listSettled = false;
  const pendingSave = saveLearningContentRequest(root, updated).then(() => { saveSettled = true; });
  const pendingLoad = loadLearningContentRequest(root, request.userId, request.id).then((value) => { loadSettled = true; return value; });
  const pendingList = listLearningContentRequests(root, request.userId).then((value) => { listSettled = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(loadSettled, false);
  assert.equal(listSettled, false);

  release();
  await holder;
  await Promise.all([pendingSave, pendingLoad, pendingList]);
  assert.equal((await loadLearningContentRequest(root, request.userId, request.id))?.state, "running");
  assert.equal((await listLearningContentRequests(root, request.userId))[0]?.state, "running");
});

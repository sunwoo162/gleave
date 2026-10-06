import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { LearningSession } from "../src/learning/contracts.js";
import { withDurableLearningSessionLock } from "../src/learning/session-lock.js";
import { listSessions, loadSession, saveSession } from "../src/learning/store.js";

test("public learning session stores wait for the owning session lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-session-store-lock-"));
  const session: LearningSession = {
    version: 1, id: "learning-session-store-lock", userId: "learning-session-store-owner", planId: "learning-plan-store-lock", revision: 1,
    status: "active", startedAt: "2026-09-30T12:00:00.000Z", resumedAt: "2026-09-30T12:00:00.000Z",
  };
  await saveSession(root, session);
  const updated = { ...session, resumedAt: "2026-09-30T12:00:01.000Z", revision: 2 };

  let release!: () => void;
  let acquired!: () => void;
  const acquiredPromise = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableLearningSessionLock(root, session.userId, session.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await acquiredPromise;

  let saveSettled = false;
  let loadSettled = false;
  let listSettled = false;
  const pendingSave = saveSession(root, updated).then(() => { saveSettled = true; });
  const pendingLoad = loadSession(root, session.userId, session.id).then((value) => { loadSettled = true; return value; });
  const pendingList = listSessions(root, session.userId).then((value) => { listSettled = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(loadSettled, false);
  assert.equal(listSettled, false);

  release();
  await holder;
  await Promise.all([pendingSave, pendingLoad, pendingList]);
  assert.equal((await loadSession(root, session.userId, session.id))?.revision, 2);
  assert.equal((await listSessions(root, session.userId))[0]?.revision, 2);
});

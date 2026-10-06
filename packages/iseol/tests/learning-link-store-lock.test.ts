import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { LearningLink } from "../src/learning/contracts.js";
import { withDurableLearningLinkLock } from "../src/learning/link-lock.js";
import { listLearningLinks, loadLearningLink, saveLearningLink } from "../src/learning/store.js";

const link: LearningLink = {
  version: 1,
  id: "learning-link-store-lock-test",
  userId: "learning-link-store-lock-owner",
  goalId: "learning-link-store-lock-goal",
  projectId: "learning-link-store-lock-project",
  proposalId: "learning-link-store-lock-proposal",
  workRequestId: "learning-link-store-lock-request",
  sharingGrant: "owner-approved",
  createdAt: "2026-09-30T00:00:00.000Z",
};

test("learning link public reads and writes wait for the durable link lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-link-store-lock-"));
  await saveLearningLink(root, link);

  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableLearningLinkLock(root, link.userId, link.goalId, link.projectId, link.proposalId, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let saveSettled = false;
  let loadSettled = false;
  let listSettled = false;
  const updated = { ...link, workRequestId: "learning-link-store-lock-request-after" };
  const save = saveLearningLink(root, updated).then(() => { saveSettled = true; });
  const load = loadLearningLink(root, link.userId, link.id).then(() => { loadSettled = true; });
  const list = listLearningLinks(root, link.userId).then(() => { listSettled = true; });

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(loadSettled, false);
  assert.equal(listSettled, false);

  releaseHolder();
  await lockHeld;
  await Promise.all([save, load, list]);
  assert.equal((await loadLearningLink(root, link.userId, link.id))?.workRequestId, updated.workRequestId);
  assert.equal((await listLearningLinks(root, link.userId))[0]?.workRequestId, updated.workRequestId);
});

import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { LearningProjectApplication } from "../src/learning/contracts.js";
import { withDurableLearningProjectApplicationLock } from "../src/learning/project-application-lock.js";
import { loadLearningProjectApplication, listLearningProjectApplications, saveLearningProjectApplication } from "../src/learning/store.js";

const application: LearningProjectApplication = {
  version: 1,
  id: "learning-project-application-store-lock-test",
  userId: "project-application-store-lock-owner",
  goalId: "project-application-store-lock-goal",
  projectId: "project-application-store-lock-project",
  proposal: { title: "초기 제안", objective: "초기 목표", acceptanceCriteria: ["확인"], tests: ["검증"], estimatedEffort: 10 },
  learningEvidenceRefs: ["goal:project-application-store-lock-goal"],
  requiredPermissions: ["project.read"],
  actorAssignments: { human: "owner" },
  status: "proposed",
  inputHash: "project-application-store-lock-hash",
  createdAt: "2026-09-30T00:00:00.000Z",
  updatedAt: "2026-09-30T00:00:00.000Z",
};

test("learning project application public reads and writes wait for the durable application lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-project-application-store-lock-"));
  await saveLearningProjectApplication(root, application);

  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableLearningProjectApplicationLock(root, application.userId, application.goalId, application.projectId, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let saveSettled = false;
  let loadSettled = false;
  let listSettled = false;
  const save = saveLearningProjectApplication(root, { ...application, actorAssignments: { human: "updated-owner" } }).then(() => { saveSettled = true; });
  const load = loadLearningProjectApplication(root, application.userId, application.id).then(() => { loadSettled = true; });
  const list = listLearningProjectApplications(root, application.userId).then(() => { listSettled = true; });

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(loadSettled, false);
  assert.equal(listSettled, false);

  releaseHolder();
  await lockHeld;
  await Promise.all([save, load, list]);
  assert.equal((await loadLearningProjectApplication(root, application.userId, application.id))?.actorAssignments.human, "updated-owner");
  assert.equal((await listLearningProjectApplications(root, application.userId))[0]?.actorAssignments.human, "updated-owner");
});

import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { CurriculumLink, StudySpace, StudyTask } from "../src/study/contracts.js";
import { withDurableStudySpaceLock } from "../src/study/space-lock.js";
import { listCurriculumLinks, listStudySpaces, listStudyTasks, loadStudySpace, loadStudyTask, saveCurriculumLink, saveStudySpace, saveStudyTask } from "../src/study/store.js";

test("public study space and shared document stores wait for the space lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-study-space-store-lock-"));
  const space: StudySpace = { version: 1, id: "study-store-lock-space", teamId: "study-store-lock-team", ownerUserId: "study-store-lock-owner", title: "기존 스터디", description: "스터디 저장소 lock 경계를 검증합니다.", status: "active", createdAt: "2026-09-30T12:00:00.000Z", updatedAt: "2026-09-30T12:00:00.000Z" };
  const link: CurriculumLink = { version: 1, id: "study-store-lock-link", studySpaceId: space.id, kind: "resource", referenceId: "typescript-handbook", label: "기존 자료", createdByUserId: space.ownerUserId, createdAt: space.createdAt };
  const task: StudyTask = { version: 1, id: "study-store-lock-task", studySpaceId: space.id, createdByUserId: space.ownerUserId, title: "기존 과제", instructions: "기존 과제 설명입니다.", status: "open", createdAt: space.createdAt, updatedAt: space.updatedAt };
  await saveStudySpace(root, space);
  await saveCurriculumLink(root, link);
  await saveStudyTask(root, task);
  const updatedSpace = { ...space, title: "잠금 해제 후 스터디", updatedAt: "2026-09-30T12:00:01.000Z" };
  const updatedLink = { ...link, label: "잠금 해제 후 자료" };
  const updatedTask = { ...task, title: "잠금 해제 후 과제", updatedAt: "2026-09-30T12:00:01.000Z" };

  let release!: () => void;
  let acquired!: () => void;
  const lockAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableStudySpaceLock(root, space.teamId, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await lockAcquired;

  let spaceSaveSettled = false;
  const pendingSpaceSave = saveStudySpace(root, updatedSpace).then(() => { spaceSaveSettled = true; });
  let spaceLoadSettled = false;
  const pendingSpaceLoad = loadStudySpace(root, space.id).then((value) => { spaceLoadSettled = true; return value; });
  let spaceListSettled = false;
  const pendingSpaceList = listStudySpaces(root).then((value) => { spaceListSettled = true; return value; });
  let linkSaveSettled = false;
  const pendingLinkSave = saveCurriculumLink(root, updatedLink).then(() => { linkSaveSettled = true; });
  let linkListSettled = false;
  const pendingLinkList = listCurriculumLinks(root, space.id).then((value) => { linkListSettled = true; return value; });
  let taskSaveSettled = false;
  const pendingTaskSave = saveStudyTask(root, updatedTask).then(() => { taskSaveSettled = true; });
  let taskLoadSettled = false;
  const pendingTaskLoad = loadStudyTask(root, space.id, task.id).then((value) => { taskLoadSettled = true; return value; });
  let taskListSettled = false;
  const pendingTaskList = listStudyTasks(root, space.id).then((value) => { taskListSettled = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(spaceSaveSettled, false);
  assert.equal(spaceLoadSettled, false);
  assert.equal(spaceListSettled, false);
  assert.equal(linkSaveSettled, false);
  assert.equal(linkListSettled, false);
  assert.equal(taskSaveSettled, false);
  assert.equal(taskLoadSettled, false);
  assert.equal(taskListSettled, false);

  release();
  await holder;
  await Promise.all([pendingSpaceSave, pendingSpaceLoad, pendingSpaceList, pendingLinkSave, pendingLinkList, pendingTaskSave, pendingTaskLoad, pendingTaskList]);
  assert.equal((await loadStudySpace(root, space.id))?.title, "잠금 해제 후 스터디");
  assert.equal((await listStudySpaces(root))[0]?.title, "잠금 해제 후 스터디");
  assert.equal((await listCurriculumLinks(root, space.id))[0]?.label, "잠금 해제 후 자료");
  assert.equal((await loadStudyTask(root, space.id, task.id))?.title, "잠금 해제 후 과제");
  assert.equal((await listStudyTasks(root, space.id))[0]?.title, "잠금 해제 후 과제");
});

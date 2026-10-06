import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { withDurableRecruitmentReviewLock } from "../src/recruitment/review-lock.js";
import { withDurableTeamMembershipLock } from "../src/teams/membership-lock.js";
import type { RecruitmentApplication, RecruitmentPost } from "../src/recruitment/contracts.js";
import { listApplications, listPosts, loadApplication, loadPost, saveApplication, savePost } from "../src/recruitment/store.js";

test("public recruitment post stores wait for the Team membership lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-recruitment-post-store-lock-"));
  const post: RecruitmentPost = {
    version: 1,
    id: "recruit-store-lock-post",
    teamId: "recruit-store-lock-team",
    authorUserId: "recruit-store-lock-owner",
    kind: "project",
    title: "기존 모집",
    description: "모집 저장소 lock 경계를 검증합니다.",
    roles: ["developer"],
    tags: ["typescript"],
    status: "open",
    createdAt: "2026-09-29T12:00:00.000Z",
    updatedAt: "2026-09-29T12:00:00.000Z",
  };
  await savePost(root, post);
  const updated = { ...post, title: "잠금 해제 후 모집", updatedAt: "2026-09-29T12:00:01.000Z" };

  let release!: () => void;
  let acquired!: () => void;
  const lockAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableTeamMembershipLock(root, post.teamId, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await lockAcquired;

  let saveSettled = false;
  const pendingSave = savePost(root, updated).then(() => { saveSettled = true; });
  let loadSettled = false;
  const pendingLoad = loadPost(root, post.id).then((value) => { loadSettled = true; return value; });
  let listSettled = false;
  const pendingList = listPosts(root).then((value) => { listSettled = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(loadSettled, false);
  assert.equal(listSettled, false);

  release();
  await holder;
  await Promise.all([pendingSave, pendingLoad, pendingList]);
  assert.equal((await loadPost(root, post.id))?.title, "잠금 해제 후 모집");
  assert.equal((await listPosts(root))[0]?.title, "잠금 해제 후 모집");
});

test("public recruitment application stores wait for the review lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-recruitment-application-store-lock-"));
  const application: RecruitmentApplication = {
    version: 1,
    id: "recruit-store-lock-application",
    postId: "recruit-store-lock-post",
    teamId: "recruit-store-lock-team",
    applicantUserId: "recruit-store-lock-applicant",
    message: "지원 메시지입니다.",
    status: "pending",
    createdAt: "2026-09-29T12:00:00.000Z",
    updatedAt: "2026-09-29T12:00:00.000Z",
  };
  await saveApplication(root, application);
  const updated = { ...application, status: "accepted" as const, updatedAt: "2026-09-29T12:00:01.000Z" };

  let release!: () => void;
  let acquired!: () => void;
  const lockAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableRecruitmentReviewLock(root, application.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await lockAcquired;

  let saveSettled = false;
  const pendingSave = saveApplication(root, updated).then(() => { saveSettled = true; });
  let loadSettled = false;
  const pendingLoad = loadApplication(root, application.id).then((value) => { loadSettled = true; return value; });
  let listSettled = false;
  const pendingList = listApplications(root).then((value) => { listSettled = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(loadSettled, false);
  assert.equal(listSettled, false);

  release();
  await holder;
  await Promise.all([pendingSave, pendingLoad, pendingList]);
  assert.equal((await loadApplication(root, application.id))?.status, "accepted");
  assert.equal((await listApplications(root))[0]?.status, "accepted");
});

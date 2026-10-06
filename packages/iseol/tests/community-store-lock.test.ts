import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { CommunityComment, CommunityPost, CommunityReport } from "../src/community/contracts.js";
import { withDurableCommunityContentLock } from "../src/community/content-lock.js";
import { withDurableCommunityLikeLock } from "../src/community/like-lock.js";
import { withDurableCommunityReportLock } from "../src/community/report-lock.js";
import { countLikes, hasLike, listComments, listPosts, listReports, loadComment, loadPost, removeLike, saveComment, saveLike, savePost, saveReport } from "../src/community/store.js";

const post: CommunityPost = {
  version: 1,
  id: "community-store-lock-post",
  authorUserId: "community-store-lock-author",
  category: "개발 이야기",
  title: "기존 게시글",
  content: "커뮤니티 저장소 lock 경계를 검증합니다.",
  tags: ["typescript"],
  status: "published",
  createdAt: "2026-09-29T12:00:00.000Z",
  updatedAt: "2026-09-29T12:00:00.000Z",
};

test("public community post and comment stores wait for the content lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-community-content-store-lock-"));
  const comment: CommunityComment = { version: 1, id: "community-store-lock-comment", postId: post.id, authorUserId: "community-store-lock-commenter", content: "기존 댓글입니다.", status: "published", createdAt: post.createdAt, updatedAt: post.updatedAt };
  await savePost(root, post);
  await saveComment(root, comment);
  const updatedPost = { ...post, title: "잠금 해제 후 게시글", updatedAt: "2026-09-29T12:00:01.000Z" };
  const updatedComment = { ...comment, content: "잠금 해제 후 댓글입니다.", updatedAt: "2026-09-29T12:00:01.000Z" };

  let release!: () => void;
  let acquired!: () => void;
  const lockAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableCommunityContentLock(root, post.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await lockAcquired;

  let postSaveSettled = false;
  const pendingPostSave = savePost(root, updatedPost).then(() => { postSaveSettled = true; });
  let postLoadSettled = false;
  const pendingPostLoad = loadPost(root, post.id).then((value) => { postLoadSettled = true; return value; });
  let postListSettled = false;
  const pendingPostList = listPosts(root).then((value) => { postListSettled = true; return value; });
  let commentSaveSettled = false;
  const pendingCommentSave = saveComment(root, updatedComment).then(() => { commentSaveSettled = true; });
  let commentLoadSettled = false;
  const pendingCommentLoad = loadComment(root, post.id, comment.id).then((value) => { commentLoadSettled = true; return value; });
  let commentListSettled = false;
  const pendingCommentList = listComments(root, post.id).then((value) => { commentListSettled = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(postSaveSettled, false);
  assert.equal(postLoadSettled, false);
  assert.equal(postListSettled, false);
  assert.equal(commentSaveSettled, false);
  assert.equal(commentLoadSettled, false);
  assert.equal(commentListSettled, false);

  release();
  await holder;
  await Promise.all([pendingPostSave, pendingPostLoad, pendingPostList, pendingCommentSave, pendingCommentLoad, pendingCommentList]);
  assert.equal((await loadPost(root, post.id))?.title, "잠금 해제 후 게시글");
  assert.equal((await listPosts(root))[0]?.title, "잠금 해제 후 게시글");
  assert.equal((await loadComment(root, post.id, comment.id))?.content, "잠금 해제 후 댓글입니다.");
  assert.equal((await listComments(root, post.id))[0]?.content, "잠금 해제 후 댓글입니다.");
});

test("public community report stores wait for the report lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-community-report-store-lock-"));
  const report: CommunityReport = { version: 1, id: "community-store-lock-report", reporterUserId: "community-store-lock-reporter", targetType: "post", targetId: post.id, postId: post.id, targetAuthorUserId: post.authorUserId, reason: "검토가 필요한 게시글입니다.", status: "open", createdAt: post.createdAt, updatedAt: post.updatedAt };
  await saveReport(root, report);
  const updated = { ...report, status: "closed" as const, updatedAt: "2026-09-29T12:00:01.000Z" };

  let release!: () => void;
  let acquired!: () => void;
  const lockAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableCommunityReportLock(root, report.reporterUserId, report.targetType, report.postId, report.targetId, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await lockAcquired;

  let saveSettled = false;
  const pendingSave = saveReport(root, updated).then(() => { saveSettled = true; });
  let listSettled = false;
  const pendingList = listReports(root).then((value) => { listSettled = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(listSettled, false);

  release();
  await holder;
  await Promise.all([pendingSave, pendingList]);
  assert.equal((await listReports(root))[0]?.status, "closed");
});

test("public community like stores wait for the per-user like lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-community-like-store-lock-"));
  const userId = "community-store-lock-liker";
  await saveLike(root, post.id, userId);

  let release!: () => void;
  let acquired!: () => void;
  const lockAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableCommunityLikeLock(root, post.id, userId, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await lockAcquired;

  let saveSettled = false;
  const pendingSave = saveLike(root, post.id, userId).then(() => { saveSettled = true; });
  let hasSettled = false;
  const pendingHas = hasLike(root, post.id, userId).then((value) => { hasSettled = true; return value; });
  let countSettled = false;
  const pendingCount = countLikes(root, post.id).then((value) => { countSettled = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  assert.equal(hasSettled, false);
  assert.equal(countSettled, false);

  release();
  await holder;
  await Promise.all([pendingSave, pendingHas, pendingCount]);
  assert.equal(await hasLike(root, post.id, userId), true);
  assert.equal(await countLikes(root, post.id), 1);
  await removeLike(root, post.id, userId);
  assert.equal(await hasLike(root, post.id, userId), false);
});

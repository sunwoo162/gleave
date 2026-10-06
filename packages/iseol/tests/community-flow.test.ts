import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { createCommunityService } from "../src/community/service.js";
import type { CommunityService } from "../src/community/contracts.js";
import { routeCommunityRequest } from "../src/community/router.js";
import { withDurableCommunityLikeLock } from "../src/community/like-lock.js";
import { saveLikeUnlocked } from "../src/community/store.js";
import { createNotificationService } from "../src/notifications/service.js";
import { createSettingsService } from "../src/settings/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

const at = "2026-09-26T00:00:00.000Z";
const principal = (userId: string): Principal => ({ userId, sessionId: `${userId}-session`, roles: ["user"] });

test("community API redacts credential-shaped service errors without changing status classification", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-community-error-redaction-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  const user = await users.createUser({ id: "community-error-user", email: "community-error@example.com", displayName: "Community Error", timezone: "Asia/Seoul" });
  const session = await users.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-27T00:00:00.000Z" });
  const headers = { authorization: `Bearer ${session.token}` };
  const failingCommunity = {
    listPosts: async () => { throw new Error("community not found token%ZZ=community-secret"); },
  } as unknown as CommunityService;

  const result = await routeCommunityRequest({ method: "GET", path: "/api/user/community", headers }, { platformUserService: users, communityService: failingCommunity });

  assert.equal(result.status, 400);
  const message = (result.body as { error: string }).error;
  assert.equal(message.includes("community-secret"), false);
  assert.match(message, /\[redacted\]/i);
});

test("community posts and likes are durable, public, and user-attributed", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-community-")); const platform = join(root, "platform"); const users = createPlatformUserService(platform, { now: () => at });
  await users.createUser({ id: "community-a", email: "community-a@example.com", displayName: "Community A", timezone: "Asia/Seoul" }); await users.createUser({ id: "community-b", email: "community-b@example.com", displayName: "Community B", timezone: "Asia/Seoul" });
  const community = createCommunityService(platform, { platformUserService: users, now: () => at }); const post = await community.createPost(principal("community-a"), { category: "개발 이야기", title: "실제 저장 글", content: "서버에 저장된 커뮤니티 글입니다.", tags: ["TypeScript"] });
  assert.equal((await community.listPosts(principal("community-b")))[0]?.author.displayName, "Community A"); assert.equal(post.likeCount, 0);
  assert.deepEqual(await community.toggleLike(principal("community-b"), post.id), { liked: true, likeCount: 1 }); assert.equal((await community.listPosts(principal("community-b")))[0]?.viewerLiked, true);
  assert.deepEqual(await community.toggleLike(principal("community-b"), post.id), { liked: false, likeCount: 0 });
  const reloaded = createCommunityService(platform, { platformUserService: users, now: () => at }); assert.equal((await reloaded.listPosts(principal("community-b"))).length, 1);
});

test("community post reads wait for the viewer like lock before projecting like state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-community-like-read-lock-")); const platform = join(root, "platform"); const users = createPlatformUserService(platform, { now: () => at });
  await users.createUser({ id: "like-read-author", email: "like-read-author@example.com", displayName: "Like Read Author", timezone: "Asia/Seoul" }); await users.createUser({ id: "like-read-viewer", email: "like-read-viewer@example.com", displayName: "Like Read Viewer", timezone: "Asia/Seoul" });
  const community = createCommunityService(platform, { platformUserService: users, now: () => at }); const post = await community.createPost(principal("like-read-author"), { category: "개발 이야기", title: "좋아요 읽기 잠금", content: "좋아요 projection 경쟁조건을 확인하는 게시글입니다.", tags: [] });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableCommunityLikeLock(platform, post.id, "like-read-viewer", async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const reading = community.listPosts(principal("like-read-viewer")).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  await saveLikeUnlocked(platform, post.id, "like-read-viewer");
  release();
  const result = (await reading)[0];
  assert.equal(result?.viewerLiked, true);
  assert.equal(result?.likeCount, 1);
  await holder;
});

test("community comments are durable, public, and user-attributed", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-community-comments-")); const platform = join(root, "platform"); const users = createPlatformUserService(platform, { now: () => at });
  await users.createUser({ id: "comment-a", email: "comment-a@example.com", displayName: "Comment A", timezone: "Asia/Seoul" }); await users.createUser({ id: "comment-b", email: "comment-b@example.com", displayName: "Comment B", timezone: "Asia/Seoul" });
  const community = createCommunityService(platform, { platformUserService: users, now: () => at }); const post = await community.createPost(principal("comment-a"), { category: "질문 · 답변", title: "댓글을 확인합니다", content: "실제 댓글 저장 여부를 확인하는 게시글입니다.", tags: [] });
  const comment = await community.createComment(principal("comment-b"), post.id, "실제 사용자 댓글입니다.");
  assert.equal(comment.comment.author.displayName, "Comment B"); assert.equal(comment.comment.postId, post.id); assert.equal((await community.listComments(principal("comment-a"), post.id))[0]?.content, "실제 사용자 댓글입니다.");
  const reloaded = createCommunityService(platform, { platformUserService: users, now: () => at }); const reloadedPost = (await reloaded.listPosts(principal("comment-a")))[0];
  assert.equal(reloadedPost?.comments[0]?.author.userId, "comment-b");
});

test("community comments notify only the persisted post owner when public-message alerts are enabled", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-community-comment-alerts-")); const platform = join(root, "platform"); const users = createPlatformUserService(platform, { now: () => at });
  await users.createUser({ id: "comment-owner", email: "comment-owner@example.com", displayName: "Comment Owner", timezone: "Asia/Seoul" }); await users.createUser({ id: "commenter", email: "commenter@example.com", displayName: "Commenter", timezone: "Asia/Seoul" }); await users.createUser({ id: "comment-muted", email: "comment-muted@example.com", displayName: "Muted Owner", timezone: "Asia/Seoul" });
  const settings = createSettingsService(platform, { now: () => at }); const notifications = createNotificationService(platform, { now: () => at });
  const community = createCommunityService(platform, { platformUserService: users, settingsService: settings, notificationService: notifications, now: () => at });
  const post = await community.createPost(principal("comment-owner"), { category: "질문 · 답변", title: "알림을 확인합니다", content: "게시글 소유자에게 공개 댓글 알림이 도착해야 합니다.", tags: [] });
  const first = await community.createComment(principal("commenter"), post.id, "소유자에게 도착하는 댓글입니다.");
  const ownerInbox = await notifications.listNotifications(principal("comment-owner"));
  assert.equal(ownerInbox.notifications.length, 1);
  assert.equal(ownerInbox.notifications[0]?.source.type, "community-comment");
  assert.equal(ownerInbox.notifications[0]?.source.id, first.comment.id);
  assert.equal((await notifications.listNotifications(principal("commenter"))).notifications.length, 0);

  await settings.updateSettings(principal("comment-muted"), { notifications: { newMessage: false } });
  const mutedPost = await community.createPost(principal("comment-muted"), { category: "학습 이야기", title: "알림을 끕니다", content: "꺼진 공개 댓글 알림은 생성되지 않아야 합니다.", tags: [] });
  await community.createComment(principal("commenter"), mutedPost.id, "꺼진 알림 대상 댓글입니다.");
  assert.equal((await notifications.listNotifications(principal("comment-muted"))).notifications.length, 0);
});

test("community reports are durable, target-bound, idempotent, and absent from public post views", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-community-reports-")); const platform = join(root, "platform"); const users = createPlatformUserService(platform, { now: () => at });
  await users.createUser({ id: "report-author", email: "report-author@example.com", displayName: "Report Author", timezone: "Asia/Seoul" }); await users.createUser({ id: "report-commenter", email: "report-commenter@example.com", displayName: "Report Commenter", timezone: "Asia/Seoul" }); await users.createUser({ id: "reporter", email: "reporter@example.com", displayName: "Reporter", timezone: "Asia/Seoul" });
  const community = createCommunityService(platform, { platformUserService: users, now: () => at }); const post = await community.createPost(principal("report-author"), { category: "개발 이야기", title: "신고 대상 글", content: "신고 대상 게시글의 공개 내용입니다.", tags: [] }); const comment = await community.createComment(principal("report-commenter"), post.id, "신고 대상 댓글입니다.");

  const postReport = await community.reportContent(principal("reporter"), { targetType: "post", postId: post.id, targetId: post.id, reason: "게시글 신고 사유" });
  const repeatedPostReport = await community.reportContent(principal("reporter"), { targetType: "post", postId: post.id, targetId: post.id, reason: "다른 사유를 보내도 기존 접수가 유지됩니다." });
  assert.equal(repeatedPostReport.id, postReport.id);
  assert.equal(postReport.targetAuthorUserId, "report-author");

  const commentReport = await community.reportContent(principal("reporter"), { targetType: "comment", postId: post.id, targetId: comment.comment.id, reason: "댓글 신고 사유" });
  assert.equal(commentReport.targetAuthorUserId, "report-commenter");
  assert.equal((await community.listPosts(principal("reporter")))[0]?.comments[0]?.content, "신고 대상 댓글입니다.");
  await assert.rejects(() => community.reportContent(principal("reporter"), { targetType: "comment", postId: "community-missing", targetId: comment.comment.id, reason: "불일치 대상" }), /not found/i);
});

test("concurrent identical community reports across service instances remain idempotent", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-community-report-concurrent-"));
  const platform = join(root, "platform");
  const users = createPlatformUserService(platform, { now: () => at });
  for (const id of ["concurrent-author", "concurrent-reporter"]) await users.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" });
  const firstService = createCommunityService(platform, { platformUserService: users, now: () => at });
  const secondService = createCommunityService(platform, { platformUserService: users, now: () => at });
  const post = await firstService.createPost(principal("concurrent-author"), { category: "질문 · 답변", title: "동시 신고 대상", content: "동시에 제출된 신고의 중복 생성을 확인합니다.", tags: [] });

  const results = await Promise.all([
    firstService.reportContent(principal("concurrent-reporter"), { targetType: "post", postId: post.id, targetId: post.id, reason: "동일 신고 사유" }),
    secondService.reportContent(principal("concurrent-reporter"), { targetType: "post", postId: post.id, targetId: post.id, reason: "동일 신고 사유" }),
  ]);

  assert.equal(results[0].id, results[1].id);
  assert.equal((await firstService.listPosts(principal("concurrent-reporter"))).length, 1);
});

test("concurrent community like toggles across service instances serialize per viewer", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-community-like-concurrent-"));
  const platform = join(root, "platform");
  const users = createPlatformUserService(platform, { now: () => at });
  for (const id of ["like-author", "like-viewer"]) await users.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" });
  const firstService = createCommunityService(platform, { platformUserService: users, now: () => at });
  const secondService = createCommunityService(platform, { platformUserService: users, now: () => at });
  const post = await firstService.createPost(principal("like-author"), { category: "개발 이야기", title: "동시 좋아요 대상", content: "동시에 눌린 좋아요의 토글 순서를 확인합니다.", tags: [] });

  const results = await Promise.all([
    firstService.toggleLike(principal("like-viewer"), post.id),
    secondService.toggleLike(principal("like-viewer"), post.id),
  ]);

  assert.deepEqual(results.map((result) => result.liked).sort(), [false, true]);
  const finalPost = (await firstService.listPosts(principal("like-viewer")))[0];
  assert.equal(finalPost?.viewerLiked, false);
  assert.equal(finalPost?.likeCount, 0);
});

test("community routes reject malformed ids and raw backslash normalization before mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-community-router-paths-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  const user = await users.createUser({ id: "community-router-user", email: "community-router@example.com", displayName: "Community Router", timezone: "Asia/Seoul" });
  const session = await users.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-27T00:00:00.000Z" });
  const community = createCommunityService(platformRoot, { platformUserService: users, now: () => at });
  const post = await community.createPost(principal(user.id), { category: "질문 · 답변", title: "경로 경계 테스트", content: "경로 디코딩 경계를 확인합니다.", tags: [] });
  const headers = { authorization: `Bearer ${session.token}`, "content-type": "application/json" };
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"), userService: users, communityService: community });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    for (const suffix of ["comments", "report", "like"]) {
      const response = await fetch(`${baseUrl}/api/user/community/%E0%A4%A/${suffix}`, { method: suffix === "comments" ? "GET" : "POST", headers, body: suffix === "report" ? JSON.stringify({ targetType: "post", targetId: "missing", reason: "malformed" }) : undefined });
      assert.equal(response.status, 404);
    }
    const directRawBackslash = await routeCommunityRequest({ method: "POST", path: `/api/user/community/${post.id}/comments`, rawPath: `/api/user\\community/${post.id}/comments`, headers, body: { content: "우회 댓글" } }, { platformUserService: users, communityService: community });
    assert.equal(directRawBackslash.status, 404);
    const rawBody = JSON.stringify({ content: "서버 우회 댓글" });
    const rawServerStatus = await new Promise<number>((resolve, reject) => {
      const rawRequest = httpRequest({ hostname: "127.0.0.1", port: address.port, method: "POST", path: `/api/user\\community/${post.id}/comments`, headers: { ...headers, "content-length": String(Buffer.byteLength(rawBody)) } }, (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      });
      rawRequest.on("error", reject);
      rawRequest.end(rawBody);
    });
    assert.equal(rawServerStatus, 404);
    assert.equal((await community.listComments(principal(user.id), post.id)).length, 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

import { randomUUID } from "node:crypto";
import { assertIdentityId, assertTimestamp, type Principal } from "../identity/contracts.js";
import type { CommunityComment, CommunityCommentView, CommunityPost, CommunityPostInput, CommunityPostView, CommunityReport, CommunityReportInput, CommunityService, CommunityServiceOptions } from "./contracts.js";
import { withDurableCommunityLikeLock } from "./like-lock.js";
import { withDurableCommunityReportLock } from "./report-lock.js";
import { countLikesUnlocked, hasLikeUnlocked, listComments, listPosts, listReportsUnlocked, loadComment, loadPost, removeLikeUnlocked, saveComment, saveLikeUnlocked, savePost, saveReportUnlocked } from "./store.js";

function ensurePrincipal(principal: Principal): void { assertIdentityId(principal.userId); }
function required(value: string, label: string, max: number): string { const trimmed = value.trim(); if (!trimmed || trimmed.length > max) throw new Error(`${label} is required`); return trimmed; }
function validCategory(value: string): asserts value is CommunityPost["category"] { if (!["개발 이야기", "학습 이야기", "프로젝트 공유", "질문 · 답변", "팀 모집"].includes(value)) throw new Error("Invalid community category"); }

export function createCommunityService(root: string, options: CommunityServiceOptions): CommunityService {
  const now = options.now ?? (() => new Date().toISOString());
  const commentView = async (comment: CommunityComment): Promise<CommunityCommentView> => { const user = await options.platformUserService.getUser(comment.authorUserId); if (!user) throw new Error("Community comment author not found"); return { ...comment, author: { userId: user.id, displayName: user.displayName, handle: user.id } }; };
  const commentsFor = async (postId: string): Promise<CommunityCommentView[]> => Promise.all((await listComments(root, postId)).filter((comment) => comment.status === "published").sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).map(commentView));
  const view = async (principal: Principal, post: CommunityPost): Promise<CommunityPostView> => { const user = await options.platformUserService.getUser(post.authorUserId); if (!user) throw new Error("Community author not found"); const likes = await withDurableCommunityLikeLock(root, post.id, principal.userId, async () => ({ likeCount: await countLikesUnlocked(root, post.id), viewerLiked: await hasLikeUnlocked(root, post.id, principal.userId) }), { waitForMs: 2_000 }); return { ...post, author: { userId: user.id, displayName: user.displayName, handle: user.id }, ...likes, comments: await commentsFor(post.id) }; };
  return {
    async listPosts(principal, category) { ensurePrincipal(principal); const posts = (await listPosts(root)).filter((post) => post.status === "published" && (!category || post.category === category)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); return Promise.all(posts.map((post) => view(principal, post))); },
    async createPost(principal, input) { ensurePrincipal(principal); validCategory(input.category); const at = now(); assertTimestamp(at, "community timestamp"); const post: CommunityPost = { version: 1, id: `community-${randomUUID()}`, authorUserId: principal.userId, category: input.category, title: required(input.title, "Community title", 200), content: required(input.content, "Community content", 20_000), tags: input.tags.map((tag) => required(tag, "Community tag", 80)).slice(0, 16), status: "published", createdAt: at, updatedAt: at }; await savePost(root, post); return view(principal, post); },
    async listComments(principal, postId) { ensurePrincipal(principal); assertIdentityId(postId); const post = await loadPost(root, postId); if (!post || post.status !== "published") throw new Error("Community post not found"); return commentsFor(post.id); },
    async createComment(principal, postId, content) {
      ensurePrincipal(principal);
      assertIdentityId(postId);
      const post = await loadPost(root, postId);
      if (!post || post.status !== "published") throw new Error("Community post not found");
      const at = now();
      assertTimestamp(at, "community comment timestamp");
      const comment: CommunityComment = {
        version: 1,
        id: `community-comment-${randomUUID()}`,
        postId: post.id,
        authorUserId: principal.userId,
        content: required(content, "Community comment", 4_000),
        status: "published",
        createdAt: at,
        updatedAt: at,
      };
      await saveComment(root, comment);
      if (options.notificationService && post.authorUserId !== principal.userId) {
        let enabled = true;
        if (options.settingsService) {
          try {
            enabled = (await options.settingsService.getSettings({ userId: post.authorUserId, sessionId: "community-comment-notification", roles: ["system"] })).notifications.newMessage;
          } catch {
            enabled = false;
          }
        }
        if (enabled) {
          try {
            await options.notificationService.createCommunityCommentNotification({ userId: post.authorUserId, postId: post.id, commentId: comment.id, actorUserId: principal.userId, createdAt: at });
          } catch {
            // Public comment durability is independent from optional inbox delivery.
          }
        }
      }
      return { comment: await commentView(comment) };
    },
    async reportContent(principal, input: CommunityReportInput): Promise<CommunityReport> {
      ensurePrincipal(principal);
      assertIdentityId(input.postId);
      assertIdentityId(input.targetId);
      const post = await loadPost(root, input.postId);
      if (!post || post.status !== "published") throw new Error("Community post not found");
      let targetAuthorUserId = post.authorUserId;
      if (input.targetType === "comment") {
        const comment = await loadComment(root, input.postId, input.targetId);
        if (!comment || comment.status !== "published") throw new Error("Community comment not found");
        targetAuthorUserId = comment.authorUserId;
      } else if (input.targetType !== "post" || input.targetId !== input.postId) {
        throw new Error("Community report target mismatch");
      }
      if (targetAuthorUserId === principal.userId) throw new Error("Cannot report your own community content");
      return withDurableCommunityReportLock(root, principal.userId, input.targetType, input.postId, input.targetId, async () => {
        const existing = (await listReportsUnlocked(root)).find((item) => item.status === "open" && item.reporterUserId === principal.userId && item.targetType === input.targetType && item.targetId === input.targetId && item.postId === input.postId);
        if (existing) return existing;
        const at = now();
        assertTimestamp(at, "community report timestamp");
        const report: CommunityReport = { version: 1, id: `community-report-${randomUUID()}`, reporterUserId: principal.userId, targetType: input.targetType, targetId: input.targetId, postId: input.postId, targetAuthorUserId, reason: required(input.reason, "Community report reason", 5_000), status: "open", createdAt: at, updatedAt: at };
        await saveReportUnlocked(root, report);
        return report;
      }, { waitForMs: 2_000 });
    },
    async toggleLike(principal, postId) {
      ensurePrincipal(principal);
      assertIdentityId(postId);
      const post = await loadPost(root, postId);
      if (!post || post.status !== "published") throw new Error("Community post not found");
      return withDurableCommunityLikeLock(root, postId, principal.userId, async () => {
        const liked = await hasLikeUnlocked(root, postId, principal.userId);
        if (liked) await removeLikeUnlocked(root, postId, principal.userId); else await saveLikeUnlocked(root, postId, principal.userId);
        return { liked: !liked, likeCount: await countLikesUnlocked(root, postId) };
      }, { waitForMs: 2_000 });
    },
  };
}

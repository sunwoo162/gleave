import type { Principal } from "../identity/contracts.js";
import type { PlatformUserService } from "../platform-user/contracts.js";
import type { NotificationService } from "../notifications/contracts.js";
import type { SettingsService } from "../settings/contracts.js";

export type CommunityCategory = "개발 이야기" | "학습 이야기" | "프로젝트 공유" | "질문 · 답변" | "팀 모집";
export type CommunityPost = { version: 1; id: string; authorUserId: string; category: CommunityCategory; title: string; content: string; tags: string[]; status: "published" | "hidden"; createdAt: string; updatedAt: string };
export type CommunityPostInput = { category: CommunityCategory; title: string; content: string; tags: string[] };
export type CommunityComment = { version: 1; id: string; postId: string; authorUserId: string; content: string; status: "published" | "hidden"; createdAt: string; updatedAt: string };
export type CommunityCommentView = CommunityComment & { author: { userId: string; displayName: string; handle: string } };
export type CommunityPostView = CommunityPost & { author: { userId: string; displayName: string; handle: string }; likeCount: number; viewerLiked: boolean; comments: CommunityCommentView[] };
export type CommunityReport = { version: 1; id: string; reporterUserId: string; targetType: "post" | "comment"; targetId: string; postId: string; targetAuthorUserId: string; reason: string; status: "open" | "closed"; createdAt: string; updatedAt: string };
export type CommunityReportInput = { targetType: CommunityReport["targetType"]; targetId: string; postId: string; reason: string };
export type CommunityService = { listPosts(principal: Principal, category?: CommunityCategory): Promise<CommunityPostView[]>; createPost(principal: Principal, input: CommunityPostInput): Promise<CommunityPostView>; listComments(principal: Principal, postId: string): Promise<CommunityCommentView[]>; createComment(principal: Principal, postId: string, content: string): Promise<{ comment: CommunityCommentView }>; toggleLike(principal: Principal, postId: string): Promise<{ liked: boolean; likeCount: number }>; reportContent(principal: Principal, input: CommunityReportInput): Promise<CommunityReport> };
export type CommunityServiceOptions = { platformUserService: PlatformUserService; notificationService?: NotificationService; settingsService?: SettingsService; now?: () => string };

import type { Principal } from "../identity/contracts.js";

export type UserNotification = {
  version: 1;
  id: string;
  userId: string;
  kind: "new-message" | "team-invite" | "achievement";
  title: string;
  body: string;
  source:
    | { type: "team-message"; id: string; teamId: string; actorUserId: string }
    | { type: "community-comment"; id: string; postId: string; actorUserId: string }
    | { type: "direct-message"; id: string; actorUserId: string; conversationUserId: string }
    | { type: "ai-completion"; id: string; actorUserId: string; conversationId: string; messageId: string }
    | { type: "team-invite"; id: string; actorUserId: string; teamId: string; applicationId: string }
    | { type: "achievement"; id: string; actorUserId: string; achievementId: string; evidenceEventId: string };
  createdAt: string;
  updatedAt: string;
  readAt?: string;
};

export type TeamMessageNotificationInput = {
  userId: string;
  teamId: string;
  messageId: string;
  actorUserId: string;
  createdAt?: string;
};

export type CommunityCommentNotificationInput = {
  userId: string;
  postId: string;
  commentId: string;
  actorUserId: string;
  createdAt?: string;
};

export type DirectMessageNotificationInput = {
  userId: string;
  messageId: string;
  actorUserId: string;
  conversationUserId: string;
  createdAt?: string;
};

export type AiCompletionNotificationInput = {
  userId: string;
  conversationId: string;
  messageId: string;
  createdAt?: string;
};

export type TeamInviteNotificationInput = {
  userId: string;
  teamId: string;
  applicationId: string;
  actorUserId: string;
  createdAt?: string;
};

export type AchievementNotificationInput = {
  userId: string;
  achievementId: string;
  evidenceEventId: string;
  title: string;
  body: string;
  createdAt?: string;
};

export type NotificationStreamEvent = {
  id: string;
  type: "user.notification.changed";
  occurredAt: string;
  change: "created" | "read";
  notificationId: string;
};

export type NotificationStreamListener = (event: NotificationStreamEvent) => void;

export type NotificationList = {
  notifications: UserNotification[];
  unreadCount: number;
};

export type NotificationService = {
  listNotifications(principal: Principal, options?: { unreadOnly?: boolean }): Promise<NotificationList>;
  markRead(principal: Principal, notificationId: string): Promise<UserNotification>;
  listStreamEvents(userId: string, afterEventId?: string): Promise<NotificationStreamEvent[]>;
  subscribe(userId: string, listener: NotificationStreamListener): () => void;
  createCommunityCommentNotification(input: CommunityCommentNotificationInput): Promise<UserNotification>;
  createTeamMessageNotification(input: TeamMessageNotificationInput): Promise<UserNotification>;
  createDirectMessageNotification(input: DirectMessageNotificationInput): Promise<UserNotification>;
  createAiCompletionNotification(input: AiCompletionNotificationInput): Promise<UserNotification>;
  createTeamInviteNotification(input: TeamInviteNotificationInput): Promise<UserNotification>;
  createAchievementNotification(input: AchievementNotificationInput): Promise<UserNotification>;
};

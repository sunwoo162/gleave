import { randomUUID } from "node:crypto";
import { assertIdentityId, assertTimestamp, type Principal } from "../identity/contracts.js";
import type { AchievementNotificationInput, AiCompletionNotificationInput, CommunityCommentNotificationInput, DirectMessageNotificationInput, NotificationService, NotificationStreamEvent, NotificationStreamListener, TeamInviteNotificationInput, TeamMessageNotificationInput, UserNotification } from "./contracts.js";
import { withDurableNotificationLock } from "./notification-lock.js";
import { listNotificationsUnlocked, listStreamEvents as listStoredStreamEvents, loadNotificationUnlocked, saveNotification, saveNotificationUnlocked, saveStreamEvent } from "./store.js";

function ensurePrincipal(principal: Principal): void {
  assertIdentityId(principal.userId);
}

export function createNotificationService(root: string, options: { now?: () => string } = {}): NotificationService {
  const now = options.now ?? (() => new Date().toISOString());
  const listeners = new Map<string, Set<NotificationStreamListener>>();
  const notificationTails = new Map<string, Promise<void>>();
  async function withNotificationLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prior = notificationTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = prior.then(() => current);
    notificationTails.set(key, queued);
    await prior;
    try { return await withDurableNotificationLock(root, key, task, { waitForMs: 2_000 }); }
    finally {
      release();
      if (notificationTails.get(key) === queued) notificationTails.delete(key);
    }
  }
  const publish = async (userId: string, change: NotificationStreamEvent["change"], notificationId: string, occurredAt: string): Promise<void> => {
    const event: NotificationStreamEvent = { id: `notification-event-${change}-${notificationId}`, type: "user.notification.changed", occurredAt, change, notificationId };
    await saveStreamEvent(root, userId, event);
    for (const listener of [...(listeners.get(userId) ?? [])]) {
      try { listener(event); } catch { /* observers must not break durable notification writes */ }
    }
  };

  return {
    async listNotifications(principal, listOptions = {}) {
      ensurePrincipal(principal);
      const candidates = await listNotificationsUnlocked(root, principal.userId);
      const all: UserNotification[] = [];
      for (const candidate of candidates) {
        await withNotificationLock(`${principal.userId}:notification:${candidate.id}`, async () => {
          const current = await loadNotificationUnlocked(root, principal.userId, candidate.id);
          if (current?.userId === principal.userId) all.push(current);
        });
      }
      all.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      return {
        notifications: listOptions.unreadOnly ? all.filter((item) => !item.readAt) : all,
        unreadCount: all.filter((item) => !item.readAt).length,
      };
    },

    async listStreamEvents(userId, afterEventId) {
      assertIdentityId(userId);
      return listStoredStreamEvents(root, userId, afterEventId);
    },

    async markRead(principal, notificationId) {
      ensurePrincipal(principal);
      assertIdentityId(notificationId);
      return withNotificationLock(`${principal.userId}:notification:${notificationId}`, async () => {
        const current = await loadNotificationUnlocked(root, principal.userId, notificationId);
        if (!current || current.userId !== principal.userId) throw new Error("Notification not found");
        if (current.readAt) return current;
        const at = now();
        assertTimestamp(at, "notification timestamp");
        const next: UserNotification = { ...current, readAt: at, updatedAt: at };
        await saveNotificationUnlocked(root, next);
        await publish(principal.userId, "read", next.id, at);
        return next;
      });
    },

    subscribe(userId, listener) {
      assertIdentityId(userId);
      const current = listeners.get(userId) ?? new Set<NotificationStreamListener>();
      current.add(listener);
      listeners.set(userId, current);
      return () => {
        current.delete(listener);
        if (current.size === 0) listeners.delete(userId);
      };
    },

    async createCommunityCommentNotification(input: CommunityCommentNotificationInput) {
      assertIdentityId(input.userId);
      assertIdentityId(input.postId);
      assertIdentityId(input.commentId);
      assertIdentityId(input.actorUserId);
      return withNotificationLock(`${input.userId}:community-comment:${input.commentId}`, async () => {
        const existing = (await listNotificationsUnlocked(root, input.userId)).find((item) => item.source.type === "community-comment" && item.source.id === input.commentId);
        if (existing) return existing;
        const at = input.createdAt ?? now();
        assertTimestamp(at, "notification timestamp");
        const notification: UserNotification = {
          version: 1,
          id: `notification-${randomUUID()}`,
          userId: input.userId,
          kind: "new-message",
          title: "새 커뮤니티 댓글",
          body: "게시글에 새 댓글이 도착했습니다.",
          source: { type: "community-comment", id: input.commentId, postId: input.postId, actorUserId: input.actorUserId },
          createdAt: at,
          updatedAt: at,
        };
        await saveNotification(root, notification);
        await publish(input.userId, "created", notification.id, at);
        return notification;
      });
    },

    async createTeamMessageNotification(input: TeamMessageNotificationInput) {
      assertIdentityId(input.userId);
      assertIdentityId(input.teamId);
      assertIdentityId(input.messageId);
      assertIdentityId(input.actorUserId);
      return withNotificationLock(`${input.userId}:team-message:${input.messageId}`, async () => {
        const existing = (await listNotificationsUnlocked(root, input.userId)).find((item) => item.source.type === "team-message" && item.source.id === input.messageId);
        if (existing) return existing;
        const at = input.createdAt ?? now();
        assertTimestamp(at, "notification timestamp");
        const notification: UserNotification = {
          version: 1,
          id: `notification-${randomUUID()}`,
          userId: input.userId,
          kind: "new-message",
          title: "새 팀 메시지",
          body: "팀 공간에 새로운 메시지가 도착했습니다.",
          source: { type: "team-message", id: input.messageId, teamId: input.teamId, actorUserId: input.actorUserId },
          createdAt: at,
          updatedAt: at,
        };
        await saveNotification(root, notification);
        await publish(input.userId, "created", notification.id, at);
        return notification;
      });
    },

    async createDirectMessageNotification(input: DirectMessageNotificationInput) {
      assertIdentityId(input.userId);
      assertIdentityId(input.messageId);
      assertIdentityId(input.actorUserId);
      assertIdentityId(input.conversationUserId);
      return withNotificationLock(`${input.userId}:direct-message:${input.messageId}`, async () => {
        const existing = (await listNotificationsUnlocked(root, input.userId)).find((item) => item.source.type === "direct-message" && item.source.id === input.messageId);
        if (existing) return existing;
        const at = input.createdAt ?? now();
        assertTimestamp(at, "notification timestamp");
        const notification: UserNotification = {
          version: 1,
          id: `notification-${randomUUID()}`,
          userId: input.userId,
          kind: "new-message",
          title: "새 친구 메시지",
          body: "친구 메시지가 도착했습니다.",
          source: { type: "direct-message", id: input.messageId, actorUserId: input.actorUserId, conversationUserId: input.conversationUserId },
          createdAt: at,
          updatedAt: at,
        };
        await saveNotification(root, notification);
        await publish(input.userId, "created", notification.id, at);
        return notification;
      });
    },

    async createAiCompletionNotification(input: AiCompletionNotificationInput) {
      assertIdentityId(input.userId);
      assertIdentityId(input.conversationId);
      assertIdentityId(input.messageId);
      return withNotificationLock(`${input.userId}:ai-completion:${input.messageId}`, async () => {
        const existing = (await listNotificationsUnlocked(root, input.userId)).find((item) => item.source.type === "ai-completion" && item.source.id === input.messageId);
        if (existing) return existing;
        const at = input.createdAt ?? now();
        assertTimestamp(at, "notification timestamp");
        const notification: UserNotification = {
          version: 1,
          id: `notification-${randomUUID()}`,
          userId: input.userId,
          kind: "new-message",
          title: "개인 AI 답변 완료",
          body: "개인 AI가 답변을 저장했습니다.",
          source: { type: "ai-completion", id: input.messageId, actorUserId: input.userId, conversationId: input.conversationId, messageId: input.messageId },
          createdAt: at,
          updatedAt: at,
        };
        await saveNotification(root, notification);
        await publish(input.userId, "created", notification.id, at);
        return notification;
      });
    },

    async createTeamInviteNotification(input: TeamInviteNotificationInput) {
      assertIdentityId(input.userId);
      assertIdentityId(input.teamId);
      assertIdentityId(input.applicationId);
      assertIdentityId(input.actorUserId);
      return withNotificationLock(`${input.userId}:team-invite:${input.applicationId}`, async () => {
        const existing = (await listNotificationsUnlocked(root, input.userId)).find((item) => item.source.type === "team-invite" && item.source.id === input.applicationId);
        if (existing) return existing;
        const at = input.createdAt ?? now();
        assertTimestamp(at, "notification timestamp");
        const notification: UserNotification = {
          version: 1,
          id: `notification-${randomUUID()}`,
          userId: input.userId,
          kind: "team-invite",
          title: "팀 합류 승인",
          body: "팀 합류 요청이 승인되었습니다.",
          source: { type: "team-invite", id: input.applicationId, actorUserId: input.actorUserId, teamId: input.teamId, applicationId: input.applicationId },
          createdAt: at,
          updatedAt: at,
        };
        await saveNotification(root, notification);
        await publish(input.userId, "created", notification.id, at);
        return notification;
      });
    },

    async createAchievementNotification(input: AchievementNotificationInput) {
      assertIdentityId(input.userId);
      assertIdentityId(input.achievementId);
      assertIdentityId(input.evidenceEventId);
      return withNotificationLock(`${input.userId}:achievement:${input.achievementId}`, async () => {
        const existing = (await listNotificationsUnlocked(root, input.userId)).find((item) => item.source.type === "achievement" && item.source.id === input.achievementId);
        if (existing) return existing;
        const at = input.createdAt ?? now();
        assertTimestamp(at, "notification timestamp");
        const notification: UserNotification = {
          version: 1,
          id: `notification-${randomUUID()}`,
          userId: input.userId,
          kind: "achievement",
          title: `업적 달성: ${input.title}`,
          body: input.body,
          source: { type: "achievement", id: input.achievementId, actorUserId: input.userId, achievementId: input.achievementId, evidenceEventId: input.evidenceEventId },
          createdAt: at,
          updatedAt: at,
        };
        await saveNotification(root, notification);
        await publish(input.userId, "created", notification.id, at);
        return notification;
      });
    },
  };
}

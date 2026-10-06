import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, open, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createAiChatService } from "../src/ai-chat/service.js";
import { createNotificationService } from "../src/notifications/service.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { createRecruitmentService } from "../src/recruitment/service.js";
import { createSettingsService } from "../src/settings/service.js";
import { createSocialService } from "../src/social/service.js";
import { createTeamChatService } from "../src/team-chat/service.js";
import { createTeamService } from "../src/teams/service.js";
import { loadNotification, saveNotification, saveNotificationUnlocked, saveStreamEvent } from "../src/notifications/store.js";

const at = "2026-09-27T13:00:00.000Z";
const principal = (userId: string): Principal => ({ userId, sessionId: `${userId}-session`, roles: ["user"] });

test("user notifications are durable, owner-scoped, ordered, and read idempotently", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-notifications-"));
  const notifications = createNotificationService(root, { now: () => at });
  const first = await notifications.createTeamMessageNotification({ userId: "notification-owner", teamId: "team-alpha", messageId: "team-message-1", actorUserId: "sender" });
  assert.ok(first);
  assert.equal(first.readAt, undefined);
  assert.equal((await notifications.createTeamMessageNotification({ userId: "notification-owner", teamId: "team-alpha", messageId: "team-message-1", actorUserId: "sender" }))?.id, first.id);
  const second = await notifications.createTeamMessageNotification({ userId: "notification-owner", teamId: "team-alpha", messageId: "team-message-2", actorUserId: "sender", createdAt: "2026-09-27T13:01:00.000Z" });

  const ownerInbox = await notifications.listNotifications(principal("notification-owner"));
  assert.equal(ownerInbox.notifications.length, 2);
  assert.equal(ownerInbox.unreadCount, 2);
  assert.deepEqual(ownerInbox.notifications.map((item) => item.source.id), ["team-message-2", "team-message-1"]);
  assert.equal((await notifications.listNotifications(principal("notification-other"))).notifications.length, 0);

  const read = await notifications.markRead(principal("notification-owner"), first.id);
  assert.equal(read.readAt, at);
  assert.equal((await notifications.markRead(principal("notification-owner"), first.id)).readAt, at);
  assert.equal((await notifications.listNotifications(principal("notification-owner"))).unreadCount, 1);
  await assert.rejects(() => notifications.markRead(principal("notification-other"), first.id), /notification not found/i);

  const restarted = createNotificationService(root, { now: () => at });
  const persisted = await restarted.listNotifications(principal("notification-owner"));
  assert.equal(persisted.notifications.length, 2);
  assert.equal(persisted.notifications.find((item) => item.id === first.id)?.readAt, at);

  const streamEvents = await restarted.listStreamEvents("notification-owner");
  assert.equal(streamEvents.length, 3);
  assert.deepEqual(streamEvents.map((event) => [event.change, event.notificationId]), [
    ["created", first.id],
    ["read", first.id],
    ["created", second.id],
  ]);
  assert.deepEqual((await restarted.listStreamEvents("notification-owner", streamEvents[0]!.id)).map((event) => event.id), streamEvents.slice(1).map((event) => event.id));
  assert.equal((await restarted.listStreamEvents("notification-other", streamEvents[0]!.id)).length, 0);
});

test("concurrent same-source notification creation converges on one durable record and stream event", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-notification-concurrency-"));
  const notifications = createNotificationService(root, { now: () => at });
  const input = { userId: "notification-concurrency-owner", messageId: "direct-message-concurrent", actorUserId: "notification-concurrency-sender", conversationUserId: "notification-concurrency-sender" };

  const [first, second] = await Promise.all([
    notifications.createDirectMessageNotification(input),
    notifications.createDirectMessageNotification(input),
  ]);

  assert.equal(second.id, first.id);
  assert.equal((await notifications.listNotifications(principal(input.userId))).notifications.length, 1);
  const events = await notifications.listStreamEvents(input.userId);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.change, "created");
  assert.equal(events[0]?.notificationId, first.id);
});

test("notification creation waits for a durable cross-service lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-notification-durable-lock-"));
  const userId = "notification-durable-lock-owner";
  const messageId = "durable-lock-message";
  const lockKey = `${userId}:direct-message:${messageId}`;
  const lockPath = join(root, ".locks", "notifications", `${createHash("sha256").update(lockKey).digest("hex")}.lock`);
  await mkdir(dirname(lockPath), { recursive: true });
  const handle = await open(lockPath, "wx");
  await handle.writeFile(JSON.stringify({ version: 1, pid: process.pid, token: "test-lock", createdAt: at }), "utf8");
  const notifications = createNotificationService(root, { now: () => at });
  let settled = false;
  const pending = notifications.createDirectMessageNotification({ userId, messageId, actorUserId: "notification-durable-lock-sender", conversationUserId: "notification-durable-lock-sender" }).then((value) => {
    settled = true;
    return value;
  });

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  await handle.close();
  await unlink(lockPath);
  const created = await pending;
  assert.equal(created.source.id, messageId);
  assert.equal((await notifications.listNotifications(principal(userId))).notifications.length, 1);
  assert.equal((await notifications.listStreamEvents(userId)).length, 1);
});

test("notification read waits for the same durable identity lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-notification-read-lock-"));
  const userId = "notification-read-lock-owner";
  const notifications = createNotificationService(root, { now: () => at });
  const created = await notifications.createDirectMessageNotification({ userId, messageId: "read-lock-message", actorUserId: "read-lock-sender", conversationUserId: "read-lock-sender" });
  const lockKey = `${userId}:notification:${created.id}`;
  const lockPath = join(root, ".locks", "notifications", `${createHash("sha256").update(lockKey).digest("hex")}.lock`);
  await mkdir(dirname(lockPath), { recursive: true });
  const handle = await open(lockPath, "wx");
  await handle.writeFile(JSON.stringify({ version: 1, pid: process.pid, token: "test-read-lock", createdAt: at }), "utf8");
  let settled = false;
  const pending = notifications.markRead(principal(userId), created.id).then((value) => {
    settled = true;
    return value;
  });

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  await handle.close();
  await unlink(lockPath);
  const read = await pending;
  assert.equal(read.readAt, at);
  assert.equal((await notifications.listStreamEvents(userId)).filter((event) => event.change === "read").length, 1);
});

test("notification list waits for each durable identity lock and reloads current read state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-notification-list-read-lock-"));
  const userId = "notification-list-read-lock-owner";
  const notifications = createNotificationService(root, { now: () => at });
  const created = await notifications.createDirectMessageNotification({ userId, messageId: "list-read-lock-message", actorUserId: "list-read-lock-sender", conversationUserId: "list-read-lock-sender" });
  const lockKey = `${userId}:notification:${created.id}`;
  const lockPath = join(root, ".locks", "notifications", `${createHash("sha256").update(lockKey).digest("hex")}.lock`);
  await mkdir(dirname(lockPath), { recursive: true });
  const handle = await open(lockPath, "wx");
  await handle.writeFile(JSON.stringify({ version: 1, pid: process.pid, token: "test-list-read-lock", createdAt: at }), "utf8");
  let settled = false;
  const pending = notifications.listNotifications(principal(userId)).then((value) => {
    settled = true;
    return value;
  });

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  await saveNotificationUnlocked(root, { ...created, readAt: at, updatedAt: at });
  await handle.close();
  await unlink(lockPath);
  const listed = await pending;
  assert.equal(listed.unreadCount, 0);
  assert.equal(listed.notifications[0]?.readAt, at);
});

test("public notification store reads and writes wait for the identity lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-notification-store-lock-"));
  const userId = "notification-store-lock-owner";
  const notifications = createNotificationService(root, { now: () => at });
  const created = await notifications.createDirectMessageNotification({ userId, messageId: "store-lock-message", actorUserId: "store-lock-sender", conversationUserId: "store-lock-sender" });
  const lockKey = `${userId}:notification:${created.id}`;
  const lockPath = join(root, ".locks", "notifications", `${createHash("sha256").update(lockKey).digest("hex")}.lock`);
  await mkdir(dirname(lockPath), { recursive: true });
  const handle = await open(lockPath, "wx");
  await handle.writeFile(JSON.stringify({ version: 1, pid: process.pid, token: "test-store-lock", createdAt: at }), "utf8");
  let saveSettled = false;
  const pendingSave = saveNotification(root, { ...created, readAt: at, updatedAt: at }).then(() => { saveSettled = true; });

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  await handle.close();
  await unlink(lockPath);
  await pendingSave;

  const readHandle = await open(lockPath, "wx");
  await readHandle.writeFile(JSON.stringify({ version: 1, pid: process.pid, token: "test-store-read-lock", createdAt: at }), "utf8");
  let loadSettled = false;
  const pendingLoad = loadNotification(root, userId, created.id).then((value) => {
    loadSettled = true;
    return value;
  });

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(loadSettled, false);
  await readHandle.close();
  await unlink(lockPath);
  assert.equal((await pendingLoad)?.readAt, at);
});

test("public stream event store reads and writes wait for the event lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-notification-stream-store-lock-"));
  const userId = "notification-stream-store-lock-owner";
  const notifications = createNotificationService(root, { now: () => at });
  await notifications.createDirectMessageNotification({ userId, messageId: "stream-store-lock-message", actorUserId: "stream-store-lock-sender", conversationUserId: "stream-store-lock-sender" });
  const event = (await notifications.listStreamEvents(userId))[0]!;
  const lockKey = `${userId}:stream-event:${event.id}`;
  const lockPath = join(root, ".locks", "notifications", `${createHash("sha256").update(lockKey).digest("hex")}.lock`);
  await mkdir(dirname(lockPath), { recursive: true });
  const handle = await open(lockPath, "wx");
  await handle.writeFile(JSON.stringify({ version: 1, pid: process.pid, token: "test-stream-store-lock", createdAt: at }), "utf8");
  const updatedEvent = { ...event, occurredAt: "2026-09-27T13:01:00.000Z" };
  let saveSettled = false;
  const pendingSave = saveStreamEvent(root, userId, updatedEvent).then(() => { saveSettled = true; });

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  await handle.close();
  await unlink(lockPath);
  await pendingSave;

  const listHandle = await open(lockPath, "wx");
  await listHandle.writeFile(JSON.stringify({ version: 1, pid: process.pid, token: "test-stream-list-lock", createdAt: at }), "utf8");
  let listSettled = false;
  const pendingList = notifications.listStreamEvents(userId).then((value) => {
    listSettled = true;
    return value;
  });

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(listSettled, false);
  await listHandle.close();
  await unlink(lockPath);
  assert.equal((await pendingList)[0]?.occurredAt, updatedEvent.occurredAt);
});

test("community comment notifications are bounded and idempotent by comment identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-community-comment-notifications-"));
  const notifications = createNotificationService(root, { now: () => at });
  const input = { userId: "community-comment-owner", postId: "community-post-1", commentId: "community-comment-1", actorUserId: "community-commenter" };
  const first = await notifications.createCommunityCommentNotification(input);
  const repeated = await notifications.createCommunityCommentNotification(input);
  assert.equal(repeated.id, first.id);
  assert.equal(first.kind, "new-message");
  assert.equal(first.title, "새 커뮤니티 댓글");
  assert.equal(first.body, "게시글에 새 댓글이 도착했습니다.");
  assert.deepEqual(first.source, { type: "community-comment", id: input.commentId, postId: input.postId, actorUserId: input.actorUserId });
  assert.equal(first.body.includes(input.commentId), false);
  assert.equal((await notifications.listNotifications(principal(input.userId))).notifications.length, 1);
});

test("team messages notify only active human recipients whose setting is enabled", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-team-message-notifications-"));
  const teams = createTeamService(root, { now: () => at });
  const settings = createSettingsService(root, { now: () => at });
  const notifications = createNotificationService(root, { now: () => at });
  const owner = principal("message-owner");
  const member = principal("message-member");
  const team = await teams.createTeam(owner, { name: "Message notifications", description: "notification membership boundary", kind: "project", visibility: "private", capacity: 5 });
  await teams.addMember(team.id, member.userId, "member", at);
  await teams.addAiMember(owner, team.id, { agentId: "reviewer", assignmentRole: "reviewer", capabilities: ["context.read"], approvalScope: "suggestion-only" }, at);
  const chat = createTeamChatService(root, { teamService: teams, notificationService: notifications, settingsService: settings, now: () => at });

  const first = await chat.sendMessage(owner, team.id, "소유자의 메시지");
  let memberInbox = await notifications.listNotifications(member);
  assert.deepEqual(memberInbox.notifications.map((item) => item.source.id), [first.id]);
  assert.equal((await notifications.listNotifications(owner)).notifications.length, 0);
  assert.equal((await notifications.listNotifications(principal("ai-reviewer"))).notifications.length, 0);

  await settings.updateSettings(member, { notifications: { newMessage: false } });
  await chat.sendMessage(owner, team.id, "알림이 꺼진 메시지");
  memberInbox = await notifications.listNotifications(member);
  assert.equal(memberInbox.notifications.length, 1);

  const reply = await chat.sendMessage(member, team.id, "멤버의 메시지");
  const ownerInbox = await notifications.listNotifications(owner);
  assert.deepEqual(ownerInbox.notifications.map((item) => item.source.id), [reply.id]);
});

test("direct messages notify only the accepted recipient when new-message alerts are enabled", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-direct-message-notifications-"));
  const users = createPlatformUserService(root, { now: () => at });
  await users.createUser({ id: "direct-sender", email: "direct-sender@example.com", displayName: "Sender", timezone: "Asia/Seoul" });
  await users.createUser({ id: "direct-recipient", email: "direct-recipient@example.com", displayName: "Recipient", timezone: "Asia/Seoul" });
  const settings = createSettingsService(root, { now: () => at });
  const notifications = createNotificationService(root, { now: () => at });
  const social = createSocialService(root, { platformUserService: users, settingsService: settings, notificationService: notifications, now: () => at });
  const sender = principal("direct-sender");
  const recipient = principal("direct-recipient");
  const request = await social.createFriendRequest(sender, recipient.userId);
  await social.respondToFriendRequest(recipient, request.request.id, "accept");
  const first = await social.sendDirectMessage(sender, recipient.userId, "친구 메시지 알림");
  assert.deepEqual((await notifications.listNotifications(recipient)).notifications.map((item) => item.source.id), [first.id]);
  assert.equal((await notifications.listNotifications(sender)).notifications.length, 0);
  await settings.updateSettings(recipient, { notifications: { newMessage: false } });
  await social.sendDirectMessage(sender, recipient.userId, "꺼진 친구 메시지 알림");
  assert.equal((await notifications.listNotifications(recipient)).notifications.length, 1);
});

test("completed private AI responses notify only the owner when ai-done alerts are enabled", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-done-notifications-"));
  const settings = createSettingsService(root, { now: () => at });
  const notifications = createNotificationService(root, { now: () => at });
  const owner = principal("ai-owner");
  const other = principal("ai-other");
  const chat = createAiChatService(root, {
    settingsService: settings,
    notificationService: notifications,
    runtimeDispatcher: async ({ content }) => ({ status: "completed" as const, assistantContent: `답변: ${content}` }),
    now: () => at,
  });

  const conversation = await chat.createConversation(owner, "개인 AI 알림");
  const completed = await chat.sendMessage(owner, conversation.id, "완료 알림을 확인합니다.");
  assert.equal(completed.runtimeStatus, "completed");
  const ownerInbox = await notifications.listNotifications(owner);
  assert.equal(ownerInbox.notifications.length, 1);
  assert.equal(ownerInbox.notifications[0]?.source.type, "ai-completion");
  assert.equal(ownerInbox.notifications[0]?.source.conversationId, conversation.id);
  assert.equal(ownerInbox.notifications[0]?.source.messageId, completed.conversation.messages[0]?.id);
  assert.equal((await notifications.listNotifications(other)).notifications.length, 0);

  const userMessageId = completed.conversation.messages[0]?.id;
  if (!userMessageId) throw new Error("completed AI conversation did not retain the user message");
  await chat.completeMessage(owner, conversation.id, userMessageId, "같은 답변을 다시 저장하지 않습니다.");
  assert.equal((await notifications.listNotifications(owner)).notifications.length, 1);

  await settings.updateSettings(owner, { notifications: { aiDone: false } });
  const mutedConversation = await chat.createConversation(owner, "알림 끄기");
  await chat.sendMessage(owner, mutedConversation.id, "이 답변은 알림을 만들지 않습니다.");
  assert.equal((await notifications.listNotifications(owner)).notifications.length, 1);
});

test("accepted recruitment applications notify only the joining user when team-invite alerts are enabled", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-team-invite-notifications-"));
  const teams = createTeamService(root, { now: () => at });
  const settings = createSettingsService(root, { now: () => at });
  const notifications = createNotificationService(root, { now: () => at });
  const recruitment = createRecruitmentService(root, { teamService: teams, settingsService: settings, notificationService: notifications, now: () => at });
  const owner = principal("invite-owner");
  const joining = principal("invite-joining");
  const muted = principal("invite-muted");
  const team = await teams.createTeam(owner, { name: "Invite notifications", description: "recruitment acceptance boundary", kind: "project", visibility: "public", capacity: 5 });
  const post = await recruitment.createPost(owner, { teamId: team.id, kind: "project", title: "Join the project", description: "A durable invitation boundary", roles: ["builder"], tags: ["local"] });
  const first = await recruitment.apply(joining, post.id, "합류 신청");
  await recruitment.reviewApplication(owner, first.application.id, "accept");
  const joiningInbox = await notifications.listNotifications(joining);
  assert.equal(joiningInbox.notifications.length, 1);
  assert.equal(joiningInbox.notifications[0]?.kind, "team-invite");
  assert.equal(joiningInbox.notifications[0]?.source.type, "team-invite");
  assert.equal(joiningInbox.notifications[0]?.source.teamId, team.id);
  assert.equal((await notifications.listNotifications(owner)).notifications.length, 0);

  await settings.updateSettings(muted, { notifications: { teamInvite: false } });
  const second = await recruitment.apply(muted, post.id, "알림을 끈 합류 신청");
  await recruitment.reviewApplication(owner, second.application.id, "accept");
  assert.equal((await notifications.listNotifications(muted)).notifications.length, 0);
});

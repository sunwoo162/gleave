import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createNotificationService } from "../src/notifications/service.js";
import { routeNotificationsRequest } from "../src/notifications/router.js";
import type { NotificationService } from "../src/notifications/contracts.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { createSettingsService } from "../src/settings/service.js";
import { createTeamChatService } from "../src/team-chat/service.js";
import { createTeamService } from "../src/teams/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("notification API is authenticated, owner-scoped, readable, and reload-safe", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-notifications-api-"));
  const at = "2026-09-27T13:30:00.000Z";
  const users = createPlatformUserService(join(root, "platform"), { now: () => at });
  const owner = await users.createUser({ id: "notification-api-owner", email: "notification-owner@example.com", displayName: "Owner", timezone: "Asia/Seoul" });
  const member = await users.createUser({ id: "notification-api-member", email: "notification-member@example.com", displayName: "Member", timezone: "Asia/Seoul" });
  const outsider = await users.createUser({ id: "notification-api-outsider", email: "notification-outsider@example.com", displayName: "Outsider", timezone: "Asia/Seoul" });
  const sessions = await Promise.all([owner, member, outsider].map((user) => users.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-28T13:30:00.000Z" })));
  const [ownerSession, memberSession, outsiderSession] = sessions;
  const platformRoot = join(root, "platform");
  const teamService = createTeamService(platformRoot, { now: () => at });
  const settingsService = createSettingsService(platformRoot, { now: () => at });
  const notificationService = createNotificationService(platformRoot, { now: () => at });
  const teamChatService = createTeamChatService(platformRoot, { teamService, settingsService, notificationService, now: () => at });
  const team = await teamService.createTeam({ userId: owner.id, sessionId: ownerSession.id, roles: ["user"] }, { name: "Notification API team", description: "notification api boundary", kind: "project", visibility: "private", capacity: 3 });
  await teamService.addMember(team.id, member.id, "member", at);
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "harness"), webRoot: resolve(process.cwd(), "web"), userService: users, teamService, teamChatService, settingsService, notificationService });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
  try {
    const sent = await fetch(`${url}/api/user/teams/${encodeURIComponent(team.id)}/messages`, { method: "POST", headers: headers(ownerSession.token), body: JSON.stringify({ body: "알림 API 메시지" }) });
    assert.equal(sent.status, 201);
    const memberInbox = await fetch(`${url}/api/user/notifications`, { headers: headers(memberSession.token) });
    assert.equal(memberInbox.status, 200);
    const memberPayload = await memberInbox.json() as any;
    assert.equal(memberPayload.notifications.length, 1);
    assert.equal(memberPayload.unreadCount, 1);
    assert.equal(memberPayload.notifications[0].source.teamId, team.id);

    const outsiderInbox = await fetch(`${url}/api/user/notifications`, { headers: headers(outsiderSession.token) });
    assert.equal((await outsiderInbox.json() as any).notifications.length, 0);
    const notificationId = memberPayload.notifications[0].id as string;
    const rawBackslashStatus = await new Promise<number>((resolve, reject) => {
      const request = httpRequest({ hostname: "127.0.0.1", port: (server.address() as AddressInfo).port, method: "POST", path: `/api/user/notifications\\${notificationId}/read`, headers: headers(memberSession.token) }, (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode ?? 0));
      });
      request.once("error", reject);
      request.end("{}");
    });
    assert.equal(rawBackslashStatus, 404);
    const malformedRead = await fetch(`${url}/api/user/notifications/%E0%A4%A/read`, { method: "POST", headers: headers(memberSession.token), body: "{}" });
    assert.equal(malformedRead.status, 404);
    const encodedSeparatorRead = await fetch(`${url}/api/user/notifications/${encodeURIComponent(notificationId)}%2Fextra/read`, { method: "POST", headers: headers(memberSession.token), body: "{}" });
    assert.equal(encodedSeparatorRead.status, 404);
    const read = await fetch(`${url}/api/user/notifications/${encodeURIComponent(memberPayload.notifications[0].id)}/read`, { method: "POST", headers: headers(memberSession.token), body: "{}" });
    assert.equal(read.status, 200);
    const unread = await fetch(`${url}/api/user/notifications?unreadOnly=1`, { headers: headers(memberSession.token) });
    assert.deepEqual(await unread.json(), { notifications: [], unreadCount: 0 });

    await settingsService.updateSettings({ userId: member.id, sessionId: memberSession.id, roles: ["user"] }, { notifications: { newMessage: false } });
    await fetch(`${url}/api/user/teams/${encodeURIComponent(team.id)}/messages`, { method: "POST", headers: headers(ownerSession.token), body: JSON.stringify({ body: "꺼진 알림" }) });
    const afterDisabled = await fetch(`${url}/api/user/notifications`, { headers: headers(memberSession.token) });
    assert.equal((await afterDisabled.json() as any).notifications.length, 1);
    const restartedRead = await fetch(`${url}/api/user/notifications`, { headers: headers(memberSession.token) });
    assert.equal((await restartedRead.json() as any).notifications[0].readAt !== undefined, true);
  } finally {
    await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  }
});

test("notification API errors redact credential-shaped service messages", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-notification-error-safety-"));
  const users = createPlatformUserService(join(root, "platform"), { now: () => "2026-09-28T00:00:00.000Z" });
  const user = await users.createUser({ id: "notification-error-user", email: "notification-error@example.com", displayName: "Error", timezone: "Asia/Seoul" });
  const session = await users.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-29T00:00:00.000Z" });
  const secret = "notification service failed token=notification-secret api_key=notification-api-secret https://notify.example/?access_token=notification-url-secret";
  const notificationService = {
    listNotifications: async () => ({ notifications: [], unreadCount: 0 }),
    markRead: async () => { throw new Error(secret); },
  } as unknown as NotificationService;
  const response = await routeNotificationsRequest({
    method: "POST",
    path: "/api/user/notifications/notification-1/read",
    headers: { authorization: `Bearer ${session.token}` },
    body: {},
  }, { platformUserService: users, notificationService });
  const message = (response.body as { error?: string }).error ?? "";
  assert.equal(response.status, 409);
  for (const value of ["notification-secret", "notification-api-secret", "notification-url-secret"]) assert.equal(message.includes(value), false);
  assert.match(message, /\[redacted\]|\[redacted-url\]/i);
});

test("notification API error classification survives fail-closed credential sanitization", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-notification-error-classification-"));
  const users = createPlatformUserService(join(root, "platform"), { now: () => "2026-09-28T00:00:00.000Z" });
  const user = await users.createUser({ id: "notification-classification-user", email: "notification-classification@example.com", displayName: "Classification", timezone: "Asia/Seoul" });
  const session = await users.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-29T00:00:00.000Z" });
  const routeWithError = (error: string) => routeNotificationsRequest({
    method: "POST",
    path: "/api/user/notifications/notification-1/read",
    headers: { authorization: `Bearer ${session.token}` },
    body: {},
  }, {
    platformUserService: users,
    notificationService: {
      listNotifications: async () => ({ notifications: [], unreadCount: 0 }),
      markRead: async () => { throw new Error(error); },
    } as unknown as NotificationService,
  });
  const notFound = await routeWithError("notification not found access_token%ZZ=secret");
  const invalid = await routeWithError("invalid notification token%ZZ=secret");
  assert.equal(notFound.status, 404);
  assert.equal(invalid.status, 400);
  assert.equal((notFound.body as { error: string }).error.includes("secret"), false);
  assert.equal((invalid.body as { error: string }).error.includes("secret"), false);
});

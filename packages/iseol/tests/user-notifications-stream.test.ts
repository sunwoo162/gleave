import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createNotificationService } from "../src/notifications/service.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";
import { openUserNotificationStream } from "../user-ui/src/api/userApi.ts";

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>, decoder = new TextDecoder()): Promise<string> {
  const next = await reader.read();
  assert.equal(next.done, false);
  return decoder.decode(next.value, { stream: true });
}

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, expected: string, decoder = new TextDecoder()): Promise<string> {
  let result = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const chunk = await Promise.race([
      readChunk(reader, decoder),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error(`stream did not emit ${expected}`)), 1_000)),
    ]);
    result += chunk;
    if (result.includes(expected)) return result;
  }
  throw new Error(`stream did not emit ${expected}`);
}

async function readOptional(reader: ReadableStreamDefaultReader<Uint8Array>, decoder = new TextDecoder()): Promise<string | null> {
  return Promise.race([
    readChunk(reader, decoder),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 150)),
  ]);
}

test("user notification stream is session-scoped and emits only bounded refresh signals", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-notification-stream-"));
  const users = createPlatformUserService(join(root, "platform"), { now: () => "2026-09-27T14:00:00.000Z" });
  const owner = await users.createUser({ id: "stream-owner", email: "stream-owner@example.com", displayName: "Stream Owner", timezone: "Asia/Seoul" });
  const outsider = await users.createUser({ id: "stream-outsider", email: "stream-outsider@example.com", displayName: "Stream Outsider", timezone: "Asia/Seoul" });
  const ownerSession = await users.createSession({ userId: owner.id, roles: ["user"], expiresAt: "2026-09-28T14:00:00.000Z" });
  const outsiderSession = await users.createSession({ userId: outsider.id, roles: ["user"], expiresAt: "2026-09-28T14:00:00.000Z" });
  const notifications = createNotificationService(join(root, "platform"), { now: () => "2026-09-27T14:00:01.000Z" });
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1",
    port: 0,
    token: "operator",
    modelRoot: join(root, "model"),
    harnessRoot: join(root, "harness"),
    webRoot: resolve(process.cwd(), "web"),
    userService: users,
    notificationService: notifications,
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = (token: string) => ({ authorization: `Bearer ${token}` });
  try {
    const stream = await fetch(`${url}/api/user/notifications/stream`, { headers: headers(ownerSession.token) });
    assert.equal(stream.status, 200);
    assert.match(stream.headers.get("content-type") ?? "", /text\/event-stream/);
    const reader = stream.body!.getReader();
    const decoder = new TextDecoder();
    const connected = await readChunk(reader, decoder);
    assert.match(connected, /event: connected/);

    const notification = await notifications.createTeamMessageNotification({ userId: owner.id, teamId: "stream-team", messageId: "stream-message", actorUserId: outsider.id });
    const created = await readChunk(reader, decoder);
    assert.match(created, /event: user\.notification\.changed/);
    assert.match(created, new RegExp(notification.id));
    assert.equal(created.includes("새 팀 메시지"), false);

    await notifications.markRead({ userId: owner.id, sessionId: ownerSession.id, roles: ["user"] }, notification.id);
    const read = await readChunk(reader, decoder);
    assert.match(read, /event: user\.notification\.changed/);
    assert.match(read, new RegExp(`\\"change\\":\\"read\\"`));

    const outsiderResponse = await fetch(`${url}/api/user/notifications/stream`, { headers: headers(outsiderSession.token) });
    assert.equal(outsiderResponse.status, 200);
    const outsiderReader = outsiderResponse.body!.getReader();
    const outsiderConnected = await readChunk(outsiderReader);
    assert.match(outsiderConnected, /event: connected/);
    await notifications.createTeamMessageNotification({ userId: owner.id, teamId: "stream-team", messageId: "owner-only-message", actorUserId: outsider.id });
    const outsiderLeak = await Promise.race([
      outsiderReader.read().then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
    ]);
    assert.equal(outsiderLeak, false);
    await outsiderReader.cancel();
  } finally {
    await server.closeForShutdown();
  }
});

test("user notification stream reconnects and receives later durable refresh signals", async () => {
  const previousWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  const previousFetch = globalThis.fetch;
  const storage = new Map<string, string>([["iseol.platform.session", JSON.stringify({ token: "stream-token", expiresAt: "2099-01-01T00:00:00.000Z" })]]);
  const responses = [
    [
      "event: connected\ndata: {\"type\":\"connected\"}\n\n",
      "id: event-2\nevent: user.notification.changed\ndata: {\"id\":\"event-2\",\"type\":\"user.notification.changed\",\"occurredAt\":\"2026-09-27T14:00:00.000Z\",\"change\":\"created\",\"notificationId\":\"notification-2\"}\n\n",
    ],
    ["event: connected\ndata: {\"type\":\"connected\"}\n\n"],
  ];
  let fetchCount = 0;
  const events: string[] = [];
  let reconnects = 0;
  (globalThis as typeof globalThis & { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => { storage.delete(key); },
    },
  };
  globalThis.fetch = async (_input, init) => {
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers.authorization, "Bearer stream-token");
    const requestNumber = fetchCount++;
    assert.equal(headers["last-event-id"], requestNumber === 0 ? undefined : "event-2");
    const frames = responses[Math.min(requestNumber, responses.length - 1)];
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        for (const frame of frames) controller.enqueue(new TextEncoder().encode(frame));
        controller.close();
      },
    }), { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  const close = openUserNotificationStream((event) => events.push(event.notificationId), () => { reconnects += 1; });
  try {
    const deadline = Date.now() + 1_000;
    while ((events.length === 0 || fetchCount < 2) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(events, ["notification-2"]);
    assert.equal(fetchCount, 2);
    assert.equal(reconnects, 1);
  } finally {
    close();
    if (previousWindow === undefined) delete (globalThis as typeof globalThis & { window?: unknown }).window;
    else (globalThis as typeof globalThis & { window?: unknown }).window = previousWindow;
    globalThis.fetch = previousFetch;
  }
});

test("user notification stream replays only the authenticated user's events after Last-Event-ID", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-notification-stream-replay-"));
  const users = createPlatformUserService(join(root, "platform"), { now: () => "2026-09-27T15:00:00.000Z" });
  const owner = await users.createUser({ id: "replay-owner", email: "replay-owner@example.com", displayName: "Replay Owner", timezone: "Asia/Seoul" });
  const outsider = await users.createUser({ id: "replay-outsider", email: "replay-outsider@example.com", displayName: "Replay Outsider", timezone: "Asia/Seoul" });
  const ownerSession = await users.createSession({ userId: owner.id, roles: ["user"], expiresAt: "2026-09-28T15:00:00.000Z" });
  const outsiderSession = await users.createSession({ userId: outsider.id, roles: ["user"], expiresAt: "2026-09-28T15:00:00.000Z" });
  const notifications = createNotificationService(join(root, "platform"), { now: () => "2026-09-27T15:00:01.000Z" });
  const first = await notifications.createTeamMessageNotification({ userId: owner.id, teamId: "replay-team", messageId: "replay-message-1", actorUserId: outsider.id });
  const second = await notifications.createTeamMessageNotification({ userId: owner.id, teamId: "replay-team", messageId: "replay-message-2", actorUserId: outsider.id, createdAt: "2026-09-27T15:00:02.000Z" });
  const ownerEvents = await notifications.listStreamEvents(owner.id);
  assert.equal(ownerEvents.length, 2);
  assert.equal(ownerEvents[0]?.notificationId, first.id);
  assert.equal(ownerEvents[1]?.notificationId, second.id);
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1",
    port: 0,
    token: "operator",
    modelRoot: join(root, "model"),
    harnessRoot: join(root, "harness"),
    webRoot: resolve(process.cwd(), "web"),
    userService: users,
    notificationService: notifications,
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const stream = await fetch(`${url}/api/user/notifications/stream`, { headers: { authorization: `Bearer ${ownerSession.token}`, "last-event-id": ownerEvents[0]!.id } });
    assert.equal(stream.status, 200);
    const reader = stream.body!.getReader();
    const decoder = new TextDecoder();
    const connectedAndReplay = await readUntil(reader, second.id, decoder);
    assert.match(connectedAndReplay, /event: connected/);
    assert.match(connectedAndReplay, new RegExp(second.id));
    assert.equal(connectedAndReplay.includes(first.id), false);
    await reader.cancel();

    const outsiderStream = await fetch(`${url}/api/user/notifications/stream`, { headers: { authorization: `Bearer ${outsiderSession.token}`, "last-event-id": ownerEvents[0]!.id } });
    assert.equal(outsiderStream.status, 200);
    const outsiderReader = outsiderStream.body!.getReader();
    const outsiderConnected = await readChunk(outsiderReader);
    assert.match(outsiderConnected, /event: connected/);
    assert.equal(outsiderConnected.includes(first.id), false);
    assert.equal(outsiderConnected.includes(second.id), false);
    await outsiderReader.cancel();
  } finally {
    await server.closeForShutdown();
  }
});

test("user notification stream de-duplicates a live event that arrives during replay", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-notification-stream-race-"));
  const users = createPlatformUserService(join(root, "platform"), { now: () => "2026-09-27T16:00:00.000Z" });
  const owner = await users.createUser({ id: "race-owner", email: "race-owner@example.com", displayName: "Race Owner", timezone: "Asia/Seoul" });
  const actor = await users.createUser({ id: "race-actor", email: "race-actor@example.com", displayName: "Race Actor", timezone: "Asia/Seoul" });
  const ownerSession = await users.createSession({ userId: owner.id, roles: ["user"], expiresAt: "2026-09-28T16:00:00.000Z" });
  const notifications = createNotificationService(join(root, "platform"), { now: () => "2026-09-27T16:00:01.000Z" });
  await notifications.createTeamMessageNotification({ userId: owner.id, teamId: "race-team", messageId: "race-message-1", actorUserId: actor.id });
  const cursor = (await notifications.listStreamEvents(owner.id))[0]!;
  let releaseReplay!: () => void;
  let markReplayStarted!: () => void;
  const replayGate = new Promise<void>((resolve) => { releaseReplay = resolve; });
  const replayStarted = new Promise<void>((resolve) => { markReplayStarted = resolve; });
  const gatedNotifications = {
    ...notifications,
    listStreamEvents: async (userId: string, afterEventId?: string) => {
      markReplayStarted();
      await replayGate;
      return notifications.listStreamEvents(userId, afterEventId);
    },
  };
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1",
    port: 0,
    token: "operator",
    modelRoot: join(root, "model"),
    harnessRoot: join(root, "harness"),
    webRoot: resolve(process.cwd(), "web"),
    userService: users,
    notificationService: gatedNotifications,
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const stream = await fetch(`${url}/api/user/notifications/stream`, { headers: { authorization: `Bearer ${ownerSession.token}`, "last-event-id": cursor.id } });
    assert.equal(stream.status, 200);
    const reader = stream.body!.getReader();
    const decoder = new TextDecoder();
    const connected = await readChunk(reader, decoder);
    assert.match(connected, /event: connected/);
    await replayStarted;
    const second = await notifications.createTeamMessageNotification({ userId: owner.id, teamId: "race-team", messageId: "race-message-2", actorUserId: actor.id, createdAt: "2026-09-27T16:00:02.000Z" });
    releaseReplay();
    const replayed = await readUntil(reader, second.id, decoder);
    const trailing = await readOptional(reader, decoder);
    const output = replayed + (trailing ?? "");
    assert.equal(output.split("event: user.notification.changed").length - 1, 1);
    await reader.cancel();
  } finally {
    releaseReplay();
    await server.closeForShutdown();
  }
});

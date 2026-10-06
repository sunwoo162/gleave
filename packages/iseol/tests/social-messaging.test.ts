import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createActivityService } from "../src/activity/service.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { createSocialService } from "../src/social/service.js";
import { withDurableSocialBlockLock } from "../src/social/block-lock.js";
import { saveBlockUnlocked } from "../src/social/store.js";

const at = "2026-09-25T12:00:00.000Z";
const principal = (userId: string): Principal => ({ userId, sessionId: `${userId}-session`, roles: ["user"] });

test("direct messages require accepted friendship and remain private", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-"));
  const users = createPlatformUserService(join(root, "platform"), { now: () => at });
  for (const id of ["social-a", "social-b", "social-c"]) await users.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" });
  const activity = createActivityService(join(root, "platform"), { now: () => at });
  const social = createSocialService(join(root, "platform"), { platformUserService: users, activityService: activity, now: () => at });
  await social.updateProfile(principal("social-a"), { handle: "alice", skills: ["TypeScript"] });
  const friendRequest = await social.createFriendRequest(principal("social-a"), "social-b");
  assert.equal((await activity.listActivityEvents(principal("social-a"))).some((event) => event.eventType === "friend.request.created" && event.sourceId === friendRequest.request.id), true);
  await assert.rejects(() => social.sendDirectMessage(principal("social-a"), "social-b", "too early"), /accepted friendship|shared team/i);
  const request = (await social.listIncomingFriendRequests(principal("social-b")))[0];
  assert.equal(request?.requester?.handle, "alice");
  await social.respondToFriendRequest(principal("social-b"), request!.id, "accept");
  assert.equal((await activity.listActivityEvents(principal("social-b"))).some((event) => event.eventType === "friend.request.accepted" && event.sourceId === request!.id), true);
  const message = await social.sendDirectMessage(principal("social-a"), "social-b", "hello");
  assert.equal((await activity.listActivityEvents(principal("social-a"))).some((event) => event.eventType === "message.sent" && event.sourceId === message.id), true);
  assert.equal((await social.listDirectMessages(principal("social-b"), "social-a")).length, 1);
  await assert.rejects(() => social.listDirectMessages(principal("social-c"), "social-a"), /accepted friendship|shared team/i);
  assert.equal((await social.listProfiles(principal("social-c"), "alice"))[0]?.displayName, "social-a");
});

test("friend request creation across service instances is idempotent", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-friend-request-concurrent-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  await users.createUser({ id: "friend-a", email: "friend-a@example.com", displayName: "Friend A", timezone: "Asia/Seoul" });
  await users.createUser({ id: "friend-b", email: "friend-b@example.com", displayName: "Friend B", timezone: "Asia/Seoul" });
  const activity = createActivityService(platformRoot, { now: () => at });
  const firstService = createSocialService(platformRoot, { platformUserService: users, activityService: activity, now: () => at });
  const secondService = createSocialService(platformRoot, { platformUserService: users, activityService: activity, now: () => "2026-09-25T12:00:01.000Z" });

  const [first, second] = await Promise.all([
    firstService.createFriendRequest(principal("friend-a"), "friend-b"),
    secondService.createFriendRequest(principal("friend-a"), "friend-b"),
  ]);

  assert.equal(first.request.id, second.request.id);
  assert.equal([first.created, second.created].filter(Boolean).length, 1);
  assert.equal((await firstService.listIncomingFriendRequests(principal("friend-b"))).length, 1);
  assert.equal((await activity.listActivityEvents(principal("friend-a"))).filter((event) => event.eventType === "friend.request.created").length, 1);
});

test("direct messages wait for the shared social interaction lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-message-lock-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  for (const id of ["message-lock-a", "message-lock-b"]) await users.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" });
  const social = createSocialService(platformRoot, { platformUserService: users, now: () => at });
  await social.createFriendRequest(principal("message-lock-a"), "message-lock-b");
  await social.respondToFriendRequest(principal("message-lock-b"), "friend-message-lock-a-message-lock-b", "accept");

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableSocialBlockLock(platformRoot, "message-lock-a", "message-lock-b", async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  const send = social.sendDirectMessage(principal("message-lock-a"), "message-lock-b", "잠긴 DM");
  assert.equal(await Promise.race([
    send.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 40)),
  ]), false);
  release();
  await Promise.all([holder, send]);
  assert.equal((await social.listDirectMessages(principal("message-lock-b"), "message-lock-a")).length, 1);
});

test("friend request creation waits for the shared social interaction lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-friend-lock-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  for (const id of ["friend-lock-a", "friend-lock-b"]) await users.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" });
  const social = createSocialService(platformRoot, { platformUserService: users, now: () => at });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableSocialBlockLock(platformRoot, "friend-lock-a", "friend-lock-b", async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  const request = social.createFriendRequest(principal("friend-lock-a"), "friend-lock-b");
  assert.equal(await Promise.race([
    request.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 40)),
  ]), false);
  release();
  await Promise.all([holder, request]);
  assert.equal((await social.listIncomingFriendRequests(principal("friend-lock-b"))).length, 1);
});

test("direct message reads re-check social block state after waiting for the pair lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-message-read-lock-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  for (const id of ["message-read-a", "message-read-b"]) await users.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" });
  const social = createSocialService(platformRoot, { platformUserService: users, now: () => at });
  await social.createFriendRequest(principal("message-read-a"), "message-read-b");
  await social.respondToFriendRequest(principal("message-read-b"), "friend-message-read-a-message-read-b", "accept");
  await social.sendDirectMessage(principal("message-read-a"), "message-read-b", "보여주면 안 되는 DM");

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableSocialBlockLock(platformRoot, "message-read-a", "message-read-b", async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const reading = social.listDirectMessages(principal("message-read-a"), "message-read-b").then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  await saveBlockUnlocked(platformRoot, { version: 1, id: "block-message-read-b-message-read-a", blockerUserId: "message-read-b", blockedUserId: "message-read-a", status: "active", createdAt: at, updatedAt: at });
  release();
  await assert.rejects(() => reading, /blocked/i);
  await holder;
});

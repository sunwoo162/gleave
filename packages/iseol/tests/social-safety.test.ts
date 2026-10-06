import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { withDurableSocialBlockLock } from "../src/social/block-lock.js";
import { withDurableSocialProfileLock } from "../src/social/profile-lock.js";
import { createSocialService } from "../src/social/service.js";
import { saveBlockUnlocked, saveFriendRequestUnlocked, saveProfileUnlocked } from "../src/social/store.js";

const at = "2026-09-27T15:00:00.000Z";
const principal = (userId: string): Principal => ({ userId, sessionId: `${userId}-session`, roles: ["user"] });

test("blocking prevents social discovery, friendship, and messages while preserving a durable private report", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-safety-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  for (const id of ["safety-a", "safety-b", "safety-c"]) await users.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" });
  const social = createSocialService(platformRoot, { platformUserService: users, now: () => at });
  await social.createFriendRequest(principal("safety-a"), "safety-b");
  await social.respondToFriendRequest(principal("safety-b"), "friend-safety-a-safety-b", "accept");
  const block = await social.blockUser(principal("safety-a"), "safety-b");
  assert.equal(block.status, "active");
  assert.equal((await social.listFriends(principal("safety-a"))).length, 0);
  assert.equal((await social.listFriends(principal("safety-b"))).length, 0);
  assert.equal((await social.listProfiles(principal("safety-b"), "safety-a")).length, 0);
  await assert.rejects(() => social.sendDirectMessage(principal("safety-b"), "safety-a", "blocked"), /blocked/i);
  await assert.rejects(() => social.createFriendRequest(principal("safety-b"), "safety-a"), /blocked/i);
  const report = await social.reportUser(principal("safety-a"), "safety-b", "harassment in direct messages");
  assert.equal(report.reporterUserId, "safety-a");
  assert.equal((await social.listReports(principal("safety-b"))).length, 0);
  assert.equal((await social.listReports(principal("safety-a"))).length, 1);

  await social.unblockUser(principal("safety-a"), "safety-b");
  assert.equal((await social.listProfiles(principal("safety-b"), "safety-a"))[0]?.userId, "safety-a");
  assert.equal((await social.listFriends(principal("safety-a"))).length, 1);
});

test("social safety operations reject self-targets and unknown users", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-safety-invalid-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  await users.createUser({ id: "safety-only", email: "safety-only@example.com", displayName: "Safety only", timezone: "Asia/Seoul" });
  const social = createSocialService(platformRoot, { platformUserService: users, now: () => at });
  await assert.rejects(() => social.blockUser(principal("safety-only"), "safety-only"), /yourself/i);
  await assert.rejects(() => social.reportUser(principal("safety-only"), "missing-user", "spam"), /not found/i);
});

test("blocking prevents a pending friend request from being accepted", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-safety-pending-friend-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  for (const id of ["pending-friend-a", "pending-friend-b"]) await users.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" });
  const social = createSocialService(platformRoot, { platformUserService: users, now: () => at });

  const request = await social.createFriendRequest(principal("pending-friend-a"), "pending-friend-b");
  await social.blockUser(principal("pending-friend-b"), "pending-friend-a");
  await assert.rejects(() => social.respondToFriendRequest(principal("pending-friend-b"), request.request.id, "accept"), /blocked/i);

  await social.unblockUser(principal("pending-friend-b"), "pending-friend-a");
  assert.equal((await social.listIncomingFriendRequests(principal("pending-friend-b"))).length, 1);
  assert.equal((await social.respondToFriendRequest(principal("pending-friend-b"), request.request.id, "accept")).status, "accepted");
});

test("concurrent block mutations across service instances preserve one active block", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-block-concurrent-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  await users.createUser({ id: "block-owner", email: "block-owner@example.com", displayName: "Block owner", timezone: "Asia/Seoul" });
  const targets = Array.from({ length: 24 }, (_, index) => `block-target-${index}`);
  for (const target of targets) await users.createUser({ id: target, email: `${target}@example.com`, displayName: target, timezone: "Asia/Seoul" });
  const firstService = createSocialService(platformRoot, { platformUserService: users, now: () => at });
  const secondService = createSocialService(platformRoot, { platformUserService: users, now: () => at });

  const results = await Promise.allSettled(targets.flatMap((target) => [
    firstService.blockUser(principal("block-owner"), target),
    secondService.blockUser(principal("block-owner"), target),
  ]));

  assert.equal(results.filter((result) => result.status === "fulfilled").length, targets.length * 2);
  assert.equal((await firstService.listBlocks(principal("block-owner"))).length, targets.length);
  assert.ok((await firstService.listBlocks(principal("block-owner"))).every((block) => block.status === "active"));
});

test("public profile reads re-check social block state after waiting for the pair lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-profile-read-lock-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  for (const id of ["profile-read-viewer", "profile-read-target"]) await users.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" });
  const social = createSocialService(platformRoot, { platformUserService: users, now: () => at });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableSocialBlockLock(platformRoot, "profile-read-viewer", "profile-read-target", async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const reading = social.getProfile(principal("profile-read-viewer"), "profile-read-target").then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  await saveBlockUnlocked(platformRoot, { version: 1, id: "block-profile-read-viewer-profile-read-target", blockerUserId: "profile-read-viewer", blockedUserId: "profile-read-target", status: "active", createdAt: at, updatedAt: at });
  release();
  assert.equal(await reading, null);
  await holder;
});

test("public profile reads re-check visibility after waiting for the profile lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-profile-visibility-read-lock-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  for (const id of ["profile-visibility-viewer", "profile-visibility-target"]) await users.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" });
  const social = createSocialService(platformRoot, { platformUserService: users, now: () => at });
  const target = await social.updateProfile(principal("profile-visibility-target"), { bio: "공개 프로필", visibility: "public" });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableSocialProfileLock(platformRoot, target.userId, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const reading = social.getProfile(principal("profile-visibility-viewer"), target.userId).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  await saveProfileUnlocked(platformRoot, { ...target, visibility: "private", updatedAt: "2026-09-27T15:00:01.000Z" });
  release();
  assert.equal(await reading, null);
  await holder;
});

test("friend list reads re-check social block state after waiting for the pair lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-friends-read-lock-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  for (const id of ["friends-read-a", "friends-read-b"]) await users.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" });
  const social = createSocialService(platformRoot, { platformUserService: users, now: () => at });
  await social.createFriendRequest(principal("friends-read-a"), "friends-read-b");
  await social.respondToFriendRequest(principal("friends-read-b"), "friend-friends-read-a-friends-read-b", "accept");

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableSocialBlockLock(platformRoot, "friends-read-a", "friends-read-b", async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const reading = social.listFriends(principal("friends-read-a")).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  await saveBlockUnlocked(platformRoot, { version: 1, id: "block-friends-read-a-friends-read-b", blockerUserId: "friends-read-a", blockedUserId: "friends-read-b", status: "active", createdAt: at, updatedAt: at });
  release();
  assert.deepEqual(await reading, []);
  await holder;
});

test("friend list reads re-check friendship state after waiting for the pair lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-friends-request-read-lock-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  for (const id of ["friends-request-read-a", "friends-request-read-b"]) await users.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" });
  const social = createSocialService(platformRoot, { platformUserService: users, now: () => at });
  await social.createFriendRequest(principal("friends-request-read-a"), "friends-request-read-b");
  await social.respondToFriendRequest(principal("friends-request-read-b"), "friend-friends-request-read-a-friends-request-read-b", "accept");

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableSocialBlockLock(platformRoot, "friends-request-read-a", "friends-request-read-b", async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const reading = social.listFriends(principal("friends-request-read-a")).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  await saveFriendRequestUnlocked(platformRoot, { version: 1, id: "friend-friends-request-read-a-friends-request-read-b", requesterUserId: "friends-request-read-a", targetUserId: "friends-request-read-b", status: "rejected", createdAt: at, updatedAt: "2026-09-27T15:00:01.000Z" });
  release();
  assert.deepEqual(await reading, []);
  await holder;
});

test("friend list reads wait for the friend's profile lock before projecting state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-friends-profile-read-lock-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  for (const id of ["friends-profile-read-a", "friends-profile-read-b"]) await users.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" });
  const social = createSocialService(platformRoot, { platformUserService: users, now: () => at });
  const target = await social.updateProfile(principal("friends-profile-read-b"), { handle: "before" });
  await social.createFriendRequest(principal("friends-profile-read-a"), "friends-profile-read-b");
  await social.respondToFriendRequest(principal("friends-profile-read-b"), "friend-friends-profile-read-a-friends-profile-read-b", "accept");

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableSocialProfileLock(platformRoot, target.userId, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const reading = social.listFriends(principal("friends-profile-read-a")).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  await saveProfileUnlocked(platformRoot, { ...target, handle: "after", updatedAt: "2026-09-27T15:00:01.000Z" });
  release();
  assert.equal((await reading)[0]?.handle, "after");
  await holder;
});

test("incoming friend request reads re-check social block state after waiting for the pair lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-incoming-read-lock-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  for (const id of ["incoming-read-requester", "incoming-read-target"]) await users.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" });
  const social = createSocialService(platformRoot, { platformUserService: users, now: () => at });
  await social.createFriendRequest(principal("incoming-read-requester"), "incoming-read-target");

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableSocialBlockLock(platformRoot, "incoming-read-requester", "incoming-read-target", async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const reading = social.listIncomingFriendRequests(principal("incoming-read-target")).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  await saveBlockUnlocked(platformRoot, { version: 1, id: "block-incoming-read-target-incoming-read-requester", blockerUserId: "incoming-read-target", blockedUserId: "incoming-read-requester", status: "active", createdAt: at, updatedAt: at });
  release();
  assert.deepEqual(await reading, []);
  await holder;
});

test("incoming friend request reads re-check request state after waiting for the pair lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-incoming-request-read-lock-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  for (const id of ["incoming-request-state-requester", "incoming-request-state-target"]) await users.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" });
  const social = createSocialService(platformRoot, { platformUserService: users, now: () => at });
  const request = await social.createFriendRequest(principal("incoming-request-state-requester"), "incoming-request-state-target");

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableSocialBlockLock(platformRoot, "incoming-request-state-target", "incoming-request-state-requester", async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const reading = social.listIncomingFriendRequests(principal("incoming-request-state-target")).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  await saveFriendRequestUnlocked(platformRoot, { ...request.request, status: "accepted", updatedAt: "2026-09-27T15:00:01.000Z" });
  release();
  assert.deepEqual(await reading, []);
  await holder;
});

test("incoming friend request reads wait for the requester's profile lock before projecting state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-incoming-profile-read-lock-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  for (const id of ["incoming-profile-read-requester", "incoming-profile-read-target"]) await users.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" });
  const social = createSocialService(platformRoot, { platformUserService: users, now: () => at });
  const requester = await social.updateProfile(principal("incoming-profile-read-requester"), { handle: "before" });
  await social.createFriendRequest(principal("incoming-profile-read-requester"), "incoming-profile-read-target");

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableSocialProfileLock(platformRoot, requester.userId, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const reading = social.listIncomingFriendRequests(principal("incoming-profile-read-target")).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  await saveProfileUnlocked(platformRoot, { ...requester, handle: "after", updatedAt: "2026-09-27T15:00:01.000Z" });
  release();
  assert.equal((await reading)[0]?.requester?.handle, "after");
  await holder;
});

test("profile list reads re-check social block state after waiting for the pair lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-profile-list-read-lock-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  for (const id of ["profile-list-viewer", "profile-list-target"]) await users.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" });
  const social = createSocialService(platformRoot, { platformUserService: users, now: () => at });
  await social.updateProfile(principal("profile-list-target"), { handle: "profile-list-target" });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableSocialBlockLock(platformRoot, "profile-list-viewer", "profile-list-target", async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const reading = social.listProfiles(principal("profile-list-viewer"), "profile-list-target").then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  await saveBlockUnlocked(platformRoot, { version: 1, id: "block-profile-list-viewer-profile-list-target", blockerUserId: "profile-list-viewer", blockedUserId: "profile-list-target", status: "active", createdAt: at, updatedAt: at });
  release();
  assert.deepEqual(await reading, []);
  await holder;
});

test("profile list reads re-check visibility after waiting for the profile lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-profile-list-visibility-read-lock-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  for (const id of ["profile-list-visibility-viewer", "profile-list-visibility-target"]) await users.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" });
  const social = createSocialService(platformRoot, { platformUserService: users, now: () => at });
  const target = await social.updateProfile(principal("profile-list-visibility-target"), { handle: "profile-list-visibility-target", visibility: "public" });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableSocialProfileLock(platformRoot, target.userId, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const reading = social.listProfiles(principal("profile-list-visibility-viewer"), "profile-list-visibility-target").then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  await saveProfileUnlocked(platformRoot, { ...target, visibility: "private", updatedAt: "2026-09-27T15:00:01.000Z" });
  release();
  assert.deepEqual(await reading, []);
  await holder;
});

test("block list reads re-check block state after waiting for the pair lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-block-list-read-lock-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  for (const id of ["block-list-owner", "block-list-target"]) await users.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" });
  const social = createSocialService(platformRoot, { platformUserService: users, now: () => at });
  await social.blockUser(principal("block-list-owner"), "block-list-target");

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableSocialBlockLock(platformRoot, "block-list-owner", "block-list-target", async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const reading = social.listBlocks(principal("block-list-owner")).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  await saveBlockUnlocked(platformRoot, { version: 1, id: "block-block-list-owner-block-list-target", blockerUserId: "block-list-owner", blockedUserId: "block-list-target", status: "removed", createdAt: at, updatedAt: at });
  release();
  assert.deepEqual(await reading, []);
  await holder;
});

test("own profile reads wait for the durable profile lock before projecting state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-own-profile-read-lock-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  await users.createUser({ id: "own-profile-read", email: "own-profile-read@example.com", displayName: "Own profile read", timezone: "Asia/Seoul" });
  const social = createSocialService(platformRoot, { platformUserService: users, now: () => at });
  await social.updateProfile(principal("own-profile-read"), { handle: "before" });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableSocialProfileLock(platformRoot, "own-profile-read", async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const reading = social.getProfile(principal("own-profile-read")).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  await saveProfileUnlocked(platformRoot, { version: 1, userId: "own-profile-read", handle: "after", bio: "", skills: [], visibility: "public", createdAt: at, updatedAt: at });
  release();
  assert.equal((await reading)?.handle, "after");
  await holder;
});

test("own profile list reads wait for the durable profile lock before projecting state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-own-profile-list-read-lock-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  await users.createUser({ id: "own-profile-list-read", email: "own-profile-list-read@example.com", displayName: "Own profile list read", timezone: "Asia/Seoul" });
  const social = createSocialService(platformRoot, { platformUserService: users, now: () => at });
  await social.updateProfile(principal("own-profile-list-read"), { handle: "before" });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableSocialProfileLock(platformRoot, "own-profile-list-read", async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const reading = social.listProfiles(principal("own-profile-list-read"), "own profile list read").then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  await saveProfileUnlocked(platformRoot, { version: 1, userId: "own-profile-list-read", handle: "after", bio: "", skills: [], visibility: "private", createdAt: at, updatedAt: "2026-09-27T15:00:01.000Z" });
  release();
  assert.equal((await reading)[0]?.handle, "after");
  await holder;
});

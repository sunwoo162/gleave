import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { DirectMessage, FriendRequest, SocialBlock, SocialProfile, SocialReport } from "../src/social/contracts.js";
import { withDurableSocialBlockLock } from "../src/social/block-lock.js";
import { withDurableFriendRequestLock } from "../src/social/friend-request-lock.js";
import { withDurableSocialProfileLock } from "../src/social/profile-lock.js";
import { withDurableSocialReportLock } from "../src/social/report-lock.js";
import {
  listBlocks,
  listDirectMessages,
  listFriendRequests,
  listReports,
  loadBlock,
  loadDirectMessage,
  loadFriendRequest,
  loadProfile,
  loadReport,
  saveBlock,
  saveDirectMessage,
  saveFriendRequest,
  saveProfile,
  saveReport,
} from "../src/social/store.js";

async function assertWaitsForRelease<T>(
  hold: (task: () => Promise<void>) => Promise<void>,
  operation: () => Promise<T>,
): Promise<T> {
  let release!: () => void;
  let acquired!: () => void;
  const acquiredPromise = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = hold(async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  });
  await acquiredPromise;

  let settled = false;
  const pending = operation().then((value) => {
    settled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  release();
  await holder;
  return pending;
}

test("public social stores wait for their canonical durable locks", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-store-lock-"));
  const profile: SocialProfile = { version: 1, userId: "social-store-profile", handle: "before", bio: "before", skills: [], visibility: "public", createdAt: "2026-09-30T12:00:00.000Z", updatedAt: "2026-09-30T12:00:00.000Z" };
  const friendRequest: FriendRequest = { version: 1, id: "friend-social-store-a-social-store-b", requesterUserId: "social-store-a", targetUserId: "social-store-b", status: "pending", createdAt: profile.createdAt, updatedAt: profile.updatedAt };
  const block: SocialBlock = { version: 1, id: "block-social-store-a-social-store-b", blockerUserId: "social-store-a", blockedUserId: "social-store-b", status: "active", createdAt: profile.createdAt, updatedAt: profile.updatedAt };
  const message: DirectMessage = { version: 1, id: "message-social-store-a", senderUserId: "social-store-a", recipientUserId: "social-store-b", body: "before", createdAt: profile.createdAt };
  const report: SocialReport = { version: 1, id: "report-social-store-a", reporterUserId: "social-store-a", targetUserId: "social-store-b", reason: "before report", status: "open", createdAt: profile.createdAt, updatedAt: profile.updatedAt };
  await saveProfile(root, profile);
  await saveFriendRequest(root, friendRequest);
  await saveBlock(root, block);
  await saveDirectMessage(root, message);
  await saveReport(root, report);

  const updatedProfile = { ...profile, handle: "after", updatedAt: "2026-09-30T12:00:01.000Z" };
  const updatedFriendRequest = { ...friendRequest, status: "accepted" as const, updatedAt: "2026-09-30T12:00:01.000Z" };
  const updatedBlock = { ...block, status: "removed" as const, updatedAt: "2026-09-30T12:00:01.000Z" };
  const updatedMessage = { ...message, body: "after" };
  const updatedReport = { ...report, reason: "after report", updatedAt: "2026-09-30T12:00:01.000Z" };

  await assertWaitsForRelease(
    (task) => withDurableSocialProfileLock(root, profile.userId, task, { waitForMs: 2_000 }),
    async () => { await saveProfile(root, updatedProfile); return loadProfile(root, profile.userId); },
  );
  await assertWaitsForRelease(
    (task) => withDurableFriendRequestLock(root, friendRequest.id, task, { waitForMs: 2_000 }),
    async () => { await saveFriendRequest(root, updatedFriendRequest); return loadFriendRequest(root, friendRequest.id); },
  );
  await assertWaitsForRelease(
    (task) => withDurableSocialBlockLock(root, block.blockerUserId, block.blockedUserId, task, { waitForMs: 2_000 }),
    async () => { await saveBlock(root, updatedBlock); return loadBlock(root, block.blockerUserId, block.blockedUserId); },
  );
  await assertWaitsForRelease(
    (task) => withDurableSocialBlockLock(root, message.senderUserId, message.recipientUserId, task, { waitForMs: 2_000 }),
    async () => { await saveDirectMessage(root, updatedMessage); return loadDirectMessage(root, message.id); },
  );
  await assertWaitsForRelease(
    (task) => withDurableSocialReportLock(root, report.id, task, { waitForMs: 2_000 }),
    async () => { await saveReport(root, updatedReport); return loadReport(root, report.id); },
  );

  assert.equal((await loadProfile(root, profile.userId))?.handle, "after");
  assert.equal((await listFriendRequests(root))[0]?.status, "accepted");
  assert.equal((await listBlocks(root))[0]?.status, "removed");
  assert.equal((await listDirectMessages(root))[0]?.body, "after");
  assert.equal((await listReports(root))[0]?.reason, "after report");
});

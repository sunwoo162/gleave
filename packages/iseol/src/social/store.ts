import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertIdentityId } from "../identity/contracts.js";
import type { DirectMessage, FriendRequest, SocialBlock, SocialProfile, SocialReport } from "./contracts.js";
import { withDurableSocialBlockLock } from "./block-lock.js";
import { withDurableFriendRequestLock } from "./friend-request-lock.js";
import { withDurableSocialProfileLock } from "./profile-lock.js";
import { withDurableSocialReportLock } from "./report-lock.js";

function socialRoot(root: string): string { return resolve(root, "social"); }
function profilePath(root: string, userId: string): string { assertIdentityId(userId); return resolve(root, "users", userId, "social", "profile.json"); }
function friendshipPath(root: string, requestId: string): string { assertIdentityId(requestId); return resolve(socialRoot(root), "friendships", `${requestId}.json`); }
function messagePath(root: string, messageId: string): string { assertIdentityId(messageId); return resolve(socialRoot(root), "messages", `${messageId}.json`); }
function blockPath(root: string, blockerUserId: string, blockedUserId: string): string { assertIdentityId(blockerUserId); assertIdentityId(blockedUserId); return resolve(socialRoot(root), "blocks", `${blockerUserId}-${blockedUserId}.json`); }
function reportPath(root: string, reportId: string): string { assertIdentityId(reportId); return resolve(socialRoot(root), "reports", `${reportId}.json`); }
async function saveJson(path: string, value: unknown): Promise<void> { await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`; await writeFile(temporary, JSON.stringify(value, null, 2), "utf8"); await rename(temporary, path); }
async function loadJson<T>(path: string): Promise<T | null> { try { return JSON.parse(await readFile(path, "utf8")) as T; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } }
async function listJson<T>(directory: string): Promise<T[]> { let names: string[]; try { names = await readdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; } const values: T[] = []; for (const name of names.filter((item) => item.endsWith(".json"))) { const value = await loadJson<T>(resolve(directory, name)); if (value) values.push(value); } return values; }

export const saveProfileUnlocked = (root: string, value: SocialProfile) => saveJson(profilePath(root, value.userId), value);
export const saveProfile = (root: string, value: SocialProfile) => withDurableSocialProfileLock(root, value.userId, () => saveProfileUnlocked(root, value), { waitForMs: 2_000 });
export const loadProfileUnlocked = (root: string, userId: string) => loadJson<SocialProfile>(profilePath(root, userId));
export async function loadProfile(root: string, userId: string): Promise<SocialProfile | null> {
  const candidate = await loadProfileUnlocked(root, userId);
  return candidate ? withDurableSocialProfileLock(root, userId, () => loadProfileUnlocked(root, userId), { waitForMs: 2_000 }) : null;
}

export const saveFriendRequestUnlocked = (root: string, value: FriendRequest) => saveJson(friendshipPath(root, value.id), value);
export const saveFriendRequest = (root: string, value: FriendRequest) => withDurableFriendRequestLock(root, value.id, () => saveFriendRequestUnlocked(root, value), { waitForMs: 2_000 });
export const loadFriendRequestUnlocked = (root: string, requestId: string) => loadJson<FriendRequest>(friendshipPath(root, requestId));
export async function loadFriendRequest(root: string, requestId: string): Promise<FriendRequest | null> {
  const candidate = await loadFriendRequestUnlocked(root, requestId);
  return candidate ? withDurableFriendRequestLock(root, requestId, () => loadFriendRequestUnlocked(root, requestId), { waitForMs: 2_000 }) : null;
}
export async function listFriendRequestsUnlocked(root: string): Promise<FriendRequest[]> { return listJson<FriendRequest>(resolve(socialRoot(root), "friendships")); }
export async function listFriendRequests(root: string): Promise<FriendRequest[]> {
  const candidates = await listFriendRequestsUnlocked(root);
  const result: FriendRequest[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); } catch { continue; }
    await withDurableFriendRequestLock(root, candidate.id, async () => {
      const current = await loadFriendRequestUnlocked(root, candidate.id);
      if (current?.id === candidate.id) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}

export const saveDirectMessageUnlocked = (root: string, value: DirectMessage) => saveJson(messagePath(root, value.id), value);
export const saveDirectMessage = (root: string, value: DirectMessage) => withDurableSocialBlockLock(root, value.senderUserId, value.recipientUserId, () => saveDirectMessageUnlocked(root, value), { waitForMs: 2_000 });
export const loadDirectMessageUnlocked = (root: string, messageId: string) => loadJson<DirectMessage>(messagePath(root, messageId));
export async function loadDirectMessage(root: string, messageId: string): Promise<DirectMessage | null> {
  const candidate = await loadDirectMessageUnlocked(root, messageId);
  if (!candidate) return null;
  return withDurableSocialBlockLock(root, candidate.senderUserId, candidate.recipientUserId, () => loadDirectMessageUnlocked(root, messageId), { waitForMs: 2_000 });
}
export async function listDirectMessagesUnlocked(root: string): Promise<DirectMessage[]> { return listJson<DirectMessage>(resolve(socialRoot(root), "messages")); }
export async function listDirectMessages(root: string): Promise<DirectMessage[]> {
  const candidates = await listDirectMessagesUnlocked(root);
  const result: DirectMessage[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); assertIdentityId(candidate.senderUserId); assertIdentityId(candidate.recipientUserId); } catch { continue; }
    await withDurableSocialBlockLock(root, candidate.senderUserId, candidate.recipientUserId, async () => {
      const current = await loadDirectMessageUnlocked(root, candidate.id);
      if (current?.id === candidate.id) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}

export const saveBlockUnlocked = (root: string, value: SocialBlock) => saveJson(blockPath(root, value.blockerUserId, value.blockedUserId), value);
export const saveBlock = (root: string, value: SocialBlock) => withDurableSocialBlockLock(root, value.blockerUserId, value.blockedUserId, () => saveBlockUnlocked(root, value), { waitForMs: 2_000 });
export const loadBlockUnlocked = (root: string, blockerUserId: string, blockedUserId: string) => loadJson<SocialBlock>(blockPath(root, blockerUserId, blockedUserId));
export const loadBlock = (root: string, blockerUserId: string, blockedUserId: string) => withDurableSocialBlockLock(root, blockerUserId, blockedUserId, () => loadBlockUnlocked(root, blockerUserId, blockedUserId), { waitForMs: 2_000 });
export async function listBlocksUnlocked(root: string): Promise<SocialBlock[]> { return listJson<SocialBlock>(resolve(socialRoot(root), "blocks")); }
export async function listBlocks(root: string): Promise<SocialBlock[]> {
  const candidates = await listBlocksUnlocked(root);
  const result: SocialBlock[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.blockerUserId); assertIdentityId(candidate.blockedUserId); } catch { continue; }
    await withDurableSocialBlockLock(root, candidate.blockerUserId, candidate.blockedUserId, async () => {
      const current = await loadBlockUnlocked(root, candidate.blockerUserId, candidate.blockedUserId);
      if (current?.blockerUserId === candidate.blockerUserId && current.blockedUserId === candidate.blockedUserId) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}

export const saveReportUnlocked = (root: string, value: SocialReport) => saveJson(reportPath(root, value.id), value);
export const saveReport = (root: string, value: SocialReport) => withDurableSocialReportLock(root, value.id, () => saveReportUnlocked(root, value), { waitForMs: 2_000 });
export const loadReportUnlocked = (root: string, reportId: string) => loadJson<SocialReport>(reportPath(root, reportId));
export const loadReport = (root: string, reportId: string) => withDurableSocialReportLock(root, reportId, () => loadReportUnlocked(root, reportId), { waitForMs: 2_000 });
export async function listReportsUnlocked(root: string): Promise<SocialReport[]> { return listJson<SocialReport>(resolve(socialRoot(root), "reports")); }
export async function listReports(root: string): Promise<SocialReport[]> {
  const candidates = await listReportsUnlocked(root);
  const result: SocialReport[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); } catch { continue; }
    await withDurableSocialReportLock(root, candidate.id, async () => {
      const current = await loadReportUnlocked(root, candidate.id);
      if (current?.id === candidate.id) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}

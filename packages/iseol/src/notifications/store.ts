import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertIdentityId } from "../identity/contracts.js";
import type { NotificationStreamEvent, UserNotification } from "./contracts.js";
import { withDurableNotificationLock } from "./notification-lock.js";

function notificationDirectory(root: string, userId: string): string {
  assertIdentityId(userId);
  return resolve(root, "notifications", "users", userId);
}

function notificationPath(root: string, userId: string, notificationId: string): string {
  assertIdentityId(notificationId);
  return resolve(notificationDirectory(root, userId), `${notificationId}.json`);
}

function streamEventDirectory(root: string, userId: string): string {
  assertIdentityId(userId);
  return resolve(notificationDirectory(root, userId), "stream-events");
}

function streamEventPath(root: string, userId: string, eventId: string): string {
  assertIdentityId(eventId);
  return resolve(streamEventDirectory(root, userId), `${eventId}.json`);
}

async function saveJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await rename(temporary, path);
}

async function loadJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function notificationLockKey(userId: string, notificationId: string): string {
  assertIdentityId(userId);
  assertIdentityId(notificationId);
  return `${userId}:notification:${notificationId}`;
}

function streamEventLockKey(userId: string, eventId: string): string {
  assertIdentityId(userId);
  assertIdentityId(eventId);
  return `${userId}:stream-event:${eventId}`;
}

export async function saveNotificationUnlocked(root: string, value: UserNotification): Promise<void> {
  await saveJson(notificationPath(root, value.userId, value.id), value);
}

export async function saveNotification(root: string, value: UserNotification): Promise<void> {
  await withDurableNotificationLock(root, notificationLockKey(value.userId, value.id), () => saveNotificationUnlocked(root, value), { waitForMs: 2_000 });
}

export async function loadNotificationUnlocked(root: string, userId: string, notificationId: string): Promise<UserNotification | null> {
  return loadJson<UserNotification>(notificationPath(root, userId, notificationId));
}

export async function loadNotification(root: string, userId: string, notificationId: string): Promise<UserNotification | null> {
  return withDurableNotificationLock(root, notificationLockKey(userId, notificationId), () => loadNotificationUnlocked(root, userId, notificationId), { waitForMs: 2_000 });
}

export async function listNotificationsUnlocked(root: string, userId: string): Promise<UserNotification[]> {
  assertIdentityId(userId);
  const directory = notificationDirectory(root, userId);
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const result: UserNotification[] = [];
  for (const name of names.filter((item) => item.endsWith(".json")).sort()) {
    const value = await loadJson<UserNotification>(resolve(directory, name));
    if (value) result.push(value);
  }
  return result;
}

export async function listNotifications(root: string, userId: string): Promise<UserNotification[]> {
  const candidates = await listNotificationsUnlocked(root, userId);
  const result: UserNotification[] = [];
  for (const candidate of candidates) {
    await withDurableNotificationLock(root, notificationLockKey(userId, candidate.id), async () => {
      const current = await loadNotificationUnlocked(root, userId, candidate.id);
      if (current?.userId === userId) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}

export async function saveStreamEventUnlocked(root: string, userId: string, value: NotificationStreamEvent): Promise<void> {
  await saveJson(streamEventPath(root, userId, value.id), value);
}

export async function saveStreamEvent(root: string, userId: string, value: NotificationStreamEvent): Promise<void> {
  await withDurableNotificationLock(root, streamEventLockKey(userId, value.id), () => saveStreamEventUnlocked(root, userId, value), { waitForMs: 2_000 });
}

async function readStreamEventsUnlocked(root: string, userId: string): Promise<NotificationStreamEvent[]> {
  assertIdentityId(userId);
  const directory = streamEventDirectory(root, userId);
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const result: NotificationStreamEvent[] = [];
  for (const name of names.filter((item) => item.endsWith(".json")).sort()) {
    const value = await loadJson<NotificationStreamEvent>(resolve(directory, name));
    if (value) result.push(value);
  }
  result.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
  return result;
}

function applyStreamEventCursor(result: NotificationStreamEvent[], afterEventId?: string): NotificationStreamEvent[] {
  if (!afterEventId) return result;
  const cursor = result.findIndex((event) => event.id === afterEventId);
  return cursor < 0 ? [] : result.slice(cursor + 1);
}

export async function listStreamEventsUnlocked(root: string, userId: string, afterEventId?: string): Promise<NotificationStreamEvent[]> {
  if (afterEventId !== undefined) assertIdentityId(afterEventId);
  return applyStreamEventCursor(await readStreamEventsUnlocked(root, userId), afterEventId);
}

export async function listStreamEvents(root: string, userId: string, afterEventId?: string): Promise<NotificationStreamEvent[]> {
  if (afterEventId !== undefined) assertIdentityId(afterEventId);
  const candidates = await readStreamEventsUnlocked(root, userId);
  const result: NotificationStreamEvent[] = [];
  for (const candidate of candidates) {
    await withDurableNotificationLock(root, streamEventLockKey(userId, candidate.id), async () => {
      const current = await loadJson<NotificationStreamEvent>(streamEventPath(root, userId, candidate.id));
      if (current) result.push(current);
    }, { waitForMs: 2_000 });
  }
  result.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
  return applyStreamEventCursor(result, afterEventId);
}

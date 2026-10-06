import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  assertIdentityId,
  assertTimestamp,
  type Principal,
  type SessionRecord,
  type UserRecord,
} from "./contracts.js";
import { withDurableIdentityLock } from "./identity-lock.js";

function userFile(root: string, userId: string): string {
  assertIdentityId(userId);
  return resolve(root, "users", userId, "user.json");
}

function sessionFile(root: string, sessionId: string): string {
  assertIdentityId(sessionId);
  return resolve(root, "sessions", `${sessionId}.json`);
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

async function createUserUnlocked(inputRoot: string, input: { id: string; timezone: string; at: string }): Promise<UserRecord> {
  assertIdentityId(input.id);
  if (!input.timezone.trim()) throw new Error("User timezone is required");
  assertTimestamp(input.at, "user timestamp");
  const existing = await loadJson<UserRecord>(userFile(inputRoot, input.id));
  if (existing) {
    if (existing.timezone !== input.timezone) throw new Error("User identity already exists with different data");
    return existing;
  }
  const user: UserRecord = {
    version: 1,
    id: input.id,
    timezone: input.timezone,
    preferences: {},
    createdAt: input.at,
    updatedAt: input.at,
  };
  await saveJson(userFile(inputRoot, input.id), user);
  return user;
}

export async function createUser(inputRoot: string, input: { id: string; timezone: string; at: string }): Promise<UserRecord> {
  return withDurableIdentityLock(inputRoot, "user", input.id, () => createUserUnlocked(inputRoot, input), { waitForMs: 2_000 });
}

async function createSessionUnlocked(inputRoot: string, input: { id: string; userId: string; roles: string[]; expiresAt: string; at: string }): Promise<SessionRecord> {
  assertIdentityId(input.id);
  assertIdentityId(input.userId);
  assertTimestamp(input.at, "session timestamp");
  assertTimestamp(input.expiresAt, "session expiry");
  if (Date.parse(input.expiresAt) <= Date.parse(input.at)) throw new Error("Session expiry must be in the future");
  if (!Array.isArray(input.roles) || input.roles.some((role) => !role.trim())) throw new Error("Session roles are required");
  if (!await loadJson<UserRecord>(userFile(inputRoot, input.userId))) throw new Error("Session user does not exist");
  const existing = await loadJson<SessionRecord>(sessionFile(inputRoot, input.id));
  if (existing) {
    if (existing.userId !== input.userId || JSON.stringify(existing.roles) !== JSON.stringify(input.roles)) throw new Error("Session identity already exists with different data");
    return existing;
  }
  const session: SessionRecord = {
    version: 1,
    id: input.id,
    userId: input.userId,
    roles: [...input.roles],
    createdAt: input.at,
    expiresAt: input.expiresAt,
  };
  await saveJson(sessionFile(inputRoot, input.id), session);
  return session;
}

export async function createSession(inputRoot: string, input: { id: string; userId: string; roles: string[]; expiresAt: string; at: string }): Promise<SessionRecord> {
  return withDurableIdentityLock(inputRoot, "session", input.id, () => createSessionUnlocked(inputRoot, input), { waitForMs: 2_000 });
}

async function revokeSessionUnlocked(inputRoot: string, sessionId: string, at: string): Promise<SessionRecord | null> {
  assertTimestamp(at, "session revocation timestamp");
  const current = await loadJson<SessionRecord>(sessionFile(inputRoot, sessionId));
  if (!current) return null;
  if (current.revokedAt) return current;
  const next = { ...current, revokedAt: at };
  await saveJson(sessionFile(inputRoot, sessionId), next);
  return next;
}

export async function revokeSession(inputRoot: string, sessionId: string, at: string): Promise<SessionRecord | null> {
  return withDurableIdentityLock(inputRoot, "session", sessionId, () => revokeSessionUnlocked(inputRoot, sessionId, at), { waitForMs: 2_000 });
}

export async function revokeSessionsForUser(inputRoot: string, userId: string, at: string): Promise<number> {
  assertIdentityId(userId);
  assertTimestamp(at, "session revocation timestamp");
  let entries: string[];
  try { entries = await readdir(resolve(inputRoot, "sessions")); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
  let revoked = 0;
  for (const entry of entries.filter((candidate) => candidate.endsWith(".json"))) {
    const sessionId = entry.slice(0, -".json".length);
    try { assertIdentityId(sessionId); } catch { continue; }
    await withDurableIdentityLock(inputRoot, "session", sessionId, async () => {
      const current = await loadJson<SessionRecord>(sessionFile(inputRoot, sessionId));
      if (!current || current.version !== 1 || current.userId !== userId || current.revokedAt) return;
      await saveJson(sessionFile(inputRoot, sessionId), { ...current, revokedAt: at });
      revoked += 1;
    }, { waitForMs: 2_000 });
  }
  return revoked;
}

export async function resolvePrincipalUnlocked(inputRoot: string, sessionId: string, at: string): Promise<Principal | null> {
  try { assertTimestamp(at, "principal timestamp"); } catch { return null; }
  let session: SessionRecord | null;
  try { session = await loadJson<SessionRecord>(sessionFile(inputRoot, sessionId)); } catch { return null; }
  if (!session || session.version !== 1 || session.revokedAt || Date.parse(session.expiresAt) <= Date.parse(at)) return null;
  const user = await loadJson<UserRecord>(userFile(inputRoot, session.userId));
  if (!user || user.version !== 1) return null;
  return { userId: user.id, sessionId: session.id, roles: [...session.roles] };
}

export async function resolvePrincipal(inputRoot: string, sessionId: string, at: string): Promise<Principal | null> {
  try {
    return await withDurableIdentityLock(inputRoot, "session", sessionId, () => resolvePrincipalUnlocked(inputRoot, sessionId, at), { waitForMs: 2_000 });
  } catch {
    return null;
  }
}

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  createSession,
  createUser,
  resolvePrincipal,
  revokeSession,
  revokeSessionsForUser,
} from "../src/identity/store.js";
import { withDurableIdentityLock } from "../src/identity/identity-lock.js";
import type { Principal } from "../src/identity/contracts.js";
import {
  authorizeResource,
  personalScope,
  scopeDirectory,
  teamScope,
} from "../src/access/authorization.js";

const at = "2026-09-25T12:00:00.000Z";

test("active sessions resolve to their stored user and revoke fail closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-identity-"));
  await createUser(root, { id: "user-a", timezone: "Asia/Seoul", at });
  await createSession(root, { id: "session-a", userId: "user-a", roles: ["user"], expiresAt: "2026-09-26T12:00:00.000Z", at });

  assert.deepEqual(await resolvePrincipal(root, "session-a", at), {
    userId: "user-a", sessionId: "session-a", roles: ["user"],
  });
  assert.equal(await resolvePrincipal(root, "session-a", "2026-09-27T12:00:00.000Z"), null);

  await revokeSession(root, "session-a", "2026-09-25T12:01:00.000Z");
  assert.equal(await resolvePrincipal(root, "session-a", "2026-09-25T12:02:00.000Z"), null);
});

test("session revocation waits for the durable identity lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-identity-lock-"));
  await createUser(root, { id: "user-lock", timezone: "Asia/Seoul", at });
  await createSession(root, { id: "session-lock", userId: "user-lock", roles: ["user"], expiresAt: "2026-09-26T12:00:00.000Z", at });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableIdentityLock(root, "session", "session-lock", async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  const revoke = revokeSession(root, "session-lock", "2026-09-25T12:01:00.000Z");
  assert.equal(await Promise.race([
    revoke.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 40)),
  ]), false);

  release();
  await Promise.all([holder, revoke]);
  assert.equal(await resolvePrincipal(root, "session-lock", "2026-09-25T12:02:00.000Z"), null);
});

test("concurrent user identity creation has one winner and no overwrite", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-identity-user-race-"));
  const modules = await Promise.all(Array.from({ length: 8 }, (_, index) => import(`../src/identity/store.js?user-race=${index}`)));
  const results = await Promise.allSettled(modules.map((module, index) => module.createUser(root, {
    id: "user-race",
    timezone: index === 0 ? "Asia/Seoul" : "UTC",
    at,
  })));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && /different data/i.test(String(result.reason))).length, 7);
});

test("concurrent session identity creation has one winner and no overwrite", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-identity-session-race-"));
  await createUser(root, { id: "user-race", timezone: "Asia/Seoul", at });
  const modules = await Promise.all(Array.from({ length: 8 }, (_, index) => import(`../src/identity/store.js?session-race=${index}`)));
  const results = await Promise.allSettled(modules.map((module, index) => module.createSession(root, {
    id: "session-race",
    userId: "user-race",
    roles: [index === 0 ? "user" : "admin"],
    expiresAt: "2026-09-26T12:00:00.000Z",
    at,
  })));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && /different data/i.test(String(result.reason))).length, 7);
});

test("bulk session revocation waits for each durable session lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-identity-bulk-lock-"));
  await createUser(root, { id: "user-bulk", timezone: "Asia/Seoul", at });
  await createSession(root, { id: "session-bulk", userId: "user-bulk", roles: ["user"], expiresAt: "2026-09-26T12:00:00.000Z", at });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableIdentityLock(root, "session", "session-bulk", async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  const revoke = revokeSessionsForUser(root, "user-bulk", "2026-09-25T12:03:00.000Z");
  assert.equal(await Promise.race([
    revoke.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 40)),
  ]), false);
  release();
  await Promise.all([holder, revoke]);
  assert.equal(await resolvePrincipal(root, "session-bulk", "2026-09-25T12:04:00.000Z"), null);
});

test("personal scope paths stay inside the platform root and do not trust path-like ids", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-scope-path-"));
  assert.equal(scopeDirectory(root, personalScope("user-a")), resolve(root, "users", "user-a"));
  assert.equal(scopeDirectory(root, teamScope("team-a")), resolve(root, "teams", "team-a"));
  assert.throws(() => personalScope("../user-b"), /invalid/i);
  assert.throws(() => scopeDirectory(root, { kind: "personal", ownerUserId: "user-a/../../escape" }), /invalid/i);
});

test("resource authorization allows only the principal owner or an explicit team member", () => {
  const userA: Principal = { userId: "user-a", sessionId: "session-a", roles: ["user"] };
  const userB: Principal = { userId: "user-b", sessionId: "session-b", roles: ["user"] };
  assert.equal(authorizeResource(userA, { scope: personalScope("user-a") }), true);
  assert.equal(authorizeResource(userB, { scope: personalScope("user-a") }), false);
  assert.equal(authorizeResource(userA, { scope: personalScope("user-b") }), false);
  assert.equal(authorizeResource(userA, { scope: teamScope("team-a"), memberUserIds: ["user-a", "user-c"] }), true);
  assert.equal(authorizeResource(userB, { scope: teamScope("team-a"), memberUserIds: ["user-a", "user-c"] }), false);
});

test("team resources require explicit membership even when the request supplies another user id", () => {
  const principal: Principal = { userId: "user-a", sessionId: "session-a", roles: ["user"] };
  assert.equal(authorizeResource(principal, {
    scope: teamScope("team-a"),
    memberUserIds: ["user-b"],
    requestedUserId: "user-b",
  }), false);
});

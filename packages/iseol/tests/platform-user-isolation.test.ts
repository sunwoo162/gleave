import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { personalScope } from "../src/access/authorization.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { withDurablePlatformUserLock } from "../src/platform-user/user-lock.js";
import { loadPasswordCredential, loadPlatformUser, listPlatformUsers, savePasswordCredential, savePlatformUser, savePlatformUserUnlocked } from "../src/platform-user/store.js";
import { routeUserRequest } from "../src/web-control-plane/user-router.js";

const at = "2026-09-25T12:00:00.000Z";

async function serviceFixture() {
  const root = await mkdtemp(join(tmpdir(), "iseol-platform-user-"));
  const service = createPlatformUserService(root, { now: () => at });
  return { root, service };
}

test("platform users and sessions survive a new service instance", async () => {
  const { root, service } = await serviceFixture();
  const user = await service.createUser({
    id: "user-a",
    email: "a@example.com",
    displayName: "User A",
    timezone: "Asia/Seoul",
  });
  const session = await service.createSession({
    userId: user.id,
    roles: ["user"],
    expiresAt: "2026-09-26T12:00:00.000Z",
  });

  const restarted = createPlatformUserService(root, { now: () => at });
  assert.deepEqual(await restarted.getUser("user-a"), user);
  assert.deepEqual(await restarted.resolveAuthenticatedPrincipal(session.token), {
    userId: "user-a",
    sessionId: session.id,
    roles: ["user"],
  });
  assert.match(await readFile(join(root, "users", "user-a", "profile.json"), "utf8"), /User A/);
});

test("expired and revoked sessions fail closed", async () => {
  const { service } = await serviceFixture();
  const user = await service.createUser({ id: "user-a", email: "a@example.com", displayName: "A", timezone: "Asia/Seoul" });
  const session = await service.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-26T12:00:00.000Z" });

  assert.equal(await service.resolveAuthenticatedPrincipal(session.token, "2026-09-27T12:00:00.000Z"), null);
  await service.revokeSession(session.id, "2026-09-25T12:01:00.000Z");
  assert.equal(await service.resolveAuthenticatedPrincipal(session.token, "2026-09-25T12:02:00.000Z"), null);
});

test("scope authorization rejects another user's personal resource", async () => {
  const { service } = await serviceFixture();
  const principal: Principal = { userId: "user-a", sessionId: "session-a", roles: ["user"] };

  service.assertScopeAccess(principal, personalScope("user-a"), "read");
  assert.throws(() => service.assertScopeAccess(principal, personalScope("user-b"), "read"), /forbidden/i);
});

test("platform user lookup does not import legacy operator records", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-platform-boundary-"));
  const legacyRoot = join(root, "legacy-operator");
  const service = createPlatformUserService(join(root, "platform"), { now: () => at });
  const legacyService = createPlatformUserService(legacyRoot, { now: () => at });
  await legacyService.createUser({ id: "operator-user", email: "operator@example.com", displayName: "Operator", timezone: "Asia/Seoul" });

  assert.equal(await service.getUser("operator-user"), null);
});

test("platform user reads wait for the user lock and reload current state", async () => {
  const { root, service } = await serviceFixture();
  const user = await service.createUser({ id: "read-lock-user", email: "read-lock@example.com", displayName: "Before", timezone: "Asia/Seoul" });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurablePlatformUserLock(root, user.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let getSettled = false;
  let listSettled = false;
  const fetched = service.getUser(user.id).then((result) => {
    getSettled = true;
    return result;
  });
  const listed = service.listUsers().then((result) => {
    listSettled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(getSettled, false);
  assert.equal(listSettled, false);

  await savePlatformUserUnlocked(root, { ...user, displayName: "After", updatedAt: at });
  release();
  await holder;
  assert.equal((await fetched)?.displayName, "After");
  assert.equal((await listed).find((item) => item.id === user.id)?.displayName, "After");
});

test("platform user email lookup waits for the user lock and reloads current state", async () => {
  const { root, service } = await serviceFixture();
  const user = await service.createUser({ id: "email-lock-user", email: "before@example.com", displayName: "Before", timezone: "Asia/Seoul" });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurablePlatformUserLock(root, user.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const found = service.findUserByEmail("after@example.com").then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  await savePlatformUserUnlocked(root, { ...user, email: "after@example.com", updatedAt: at });
  release();
  await holder;
  assert.equal((await found)?.email, "after@example.com");
});

test("public platform user profile and credential stores wait for the shared user lock", async () => {
  const { root, service } = await serviceFixture();
  const user = await service.createUser({ id: "store-lock-user", email: "store-lock@example.com", displayName: "Before", timezone: "Asia/Seoul" });
  const credential = { version: 1 as const, salt: "c2FsdA==", hash: "aGFzaA==", createdAt: at };

  const holdUserLock = async () => {
    let release!: () => void;
    let acquired!: () => void;
    const acquiredPromise = new Promise<void>((resolve) => { acquired = resolve; });
    const holder = withDurablePlatformUserLock(root, user.id, async () => {
      acquired();
      await new Promise<void>((resolve) => { release = resolve; });
    }, { waitForMs: 0 });
    await acquiredPromise;
    return { holder, release };
  };

  const profile = { ...user, displayName: "After", updatedAt: at };
  const profileLock = await holdUserLock();
  let profileSaveSettled = false;
  const pendingProfileSave = savePlatformUser(root, profile).then(() => { profileSaveSettled = true; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(profileSaveSettled, false);
  profileLock.release();
  await profileLock.holder;
  await pendingProfileSave;

  const credentialLock = await holdUserLock();
  let credentialSaveSettled = false;
  const pendingCredentialSave = savePasswordCredential(root, user.id, credential).then(() => { credentialSaveSettled = true; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(credentialSaveSettled, false);
  credentialLock.release();
  await credentialLock.holder;
  await pendingCredentialSave;

  const loadLock = await holdUserLock();
  let loadSettled = false;
  const pendingLoad = loadPlatformUser(root, user.id).then((value) => {
    loadSettled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(loadSettled, false);
  loadLock.release();
  await loadLock.holder;
  assert.equal((await pendingLoad)?.displayName, "After");

  const credentialLoadLock = await holdUserLock();
  let credentialLoadSettled = false;
  const pendingCredentialLoad = loadPasswordCredential(root, user.id).then((value) => {
    credentialLoadSettled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(credentialLoadSettled, false);
  credentialLoadLock.release();
  await credentialLoadLock.holder;
  assert.deepEqual(await pendingCredentialLoad, credential);

  const listLock = await holdUserLock();
  let listSettled = false;
  const pendingList = listPlatformUsers(root).then((value) => {
    listSettled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(listSettled, false);
  listLock.release();
  await listLock.holder;
  assert.equal((await pendingList).find((item) => item.id === user.id)?.displayName, "After");
});

test("user router requires a platform session and returns the authenticated profile", async () => {
  const { service } = await serviceFixture();
  const unauthenticated = await routeUserRequest({ method: "GET", path: "/api/user/me", headers: {} }, service);
  assert.equal(unauthenticated.status, 401);

  const user = await service.createUser({ id: "user-a", email: "a@example.com", displayName: "A", timezone: "Asia/Seoul" });
  const session = await service.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-26T12:00:00.000Z" });
  const authenticated = await routeUserRequest({
    method: "GET",
    path: "/api/user/me",
    headers: { authorization: `Bearer ${session.token}` },
  }, service);

  assert.equal(authenticated.status, 200);
  assert.deepEqual(authenticated.body, { user });
});

test("concurrent platform user creation across service instances remains idempotent", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-platform-user-concurrent-"));
  const firstService = createPlatformUserService(root, { now: () => at });
  const secondService = createPlatformUserService(root, { now: () => at });
  const ids = Array.from({ length: 48 }, () => "concurrent-user");
  const results = await Promise.allSettled(ids.flatMap((id) => [
    firstService.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" }),
    secondService.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" }),
  ]));

  assert.equal(results.filter((result) => result.status === "fulfilled").length, ids.length * 2);
  assert.equal((await firstService.listUsers()).length, 1);
});

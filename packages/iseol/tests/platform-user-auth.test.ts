import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { routeUserRequest } from "../src/web-control-plane/user-router.js";

test("platform user credentials persist and authenticate without exposing a password", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-platform-auth-"));
  const service = createPlatformUserService(root, { now: () => "2026-09-25T12:00:00.000Z" });
  const user = await service.createUser({
    id: "auth-user",
    email: "auth@example.com",
    displayName: "Auth User",
    timezone: "Asia/Seoul",
    password: "correct-horse-battery-staple",
  });
  assert.equal((user as any).password, undefined);
  assert.equal((await service.authenticateUser("auth@example.com", "wrong-password")), null);
  assert.deepEqual(await service.authenticateUser("auth@example.com", "correct-horse-battery-staple"), user);

  const restarted = createPlatformUserService(root, { now: () => "2026-09-25T12:00:00.000Z" });
  assert.deepEqual(await restarted.authenticateUser("auth@example.com", "correct-horse-battery-staple"), user);
});

test("user auth routes create and resolve a platform session", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-platform-auth-route-"));
  const service = createPlatformUserService(root, { now: () => "2026-09-25T12:00:00.000Z" });
  const signup = await routeUserRequest({
    method: "POST", path: "/api/user/signup", headers: {},
    body: { email: "route@example.com", displayName: "Route User", timezone: "Asia/Seoul", password: "route-password" },
  }, service);
  assert.equal(signup.status, 201);
  const session = (signup.body as any).session;
  assert.equal(typeof session.token, "string");
  assert.equal((signup.body as any).user.email, "route@example.com");

  const wrong = await routeUserRequest({
    method: "POST", path: "/api/user/login", headers: {},
    body: { email: "route@example.com", password: "wrong-password" },
  }, service);
  assert.equal(wrong.status, 401);
  const login = await routeUserRequest({
    method: "POST", path: "/api/user/login", headers: {},
    body: { email: "route@example.com", password: "route-password" },
  }, service);
  assert.equal(login.status, 200);
});

test("signup returns a client error for a password outside the server policy", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-platform-auth-validation-"));
  const service = createPlatformUserService(root, { now: () => "2026-09-25T12:00:00.000Z" });
  const result = await routeUserRequest({
    method: "POST", path: "/api/user/signup", headers: {},
    body: { email: "short-password@example.com", displayName: "Short Password", timezone: "Asia/Seoul", password: "short" },
  }, service);
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: "password must be between 8 and 256 characters" });
});

test("top-level user routes reject raw backslash normalization before session mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-platform-auth-raw-path-"));
  const service = createPlatformUserService(root, { now: () => "2026-09-25T12:00:00.000Z" });
  const user = await service.createUser({ id: "raw-path-user", email: "raw-path@example.com", displayName: "Raw Path", timezone: "Asia/Seoul", password: "raw-path-password" });
  const session = await service.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-26T12:00:00.000Z" });
  const headers = { authorization: `Bearer ${session.token}`, "content-type": "application/json" };

  const rawLogout = await routeUserRequest({ method: "POST", path: "/api/user/logout", rawPath: "/api/user\\logout", headers }, service);
  assert.equal(rawLogout.status, 404);
  assert.equal((await routeUserRequest({ method: "GET", path: "/api/user/me", headers }, service)).status, 200);

  const rawPassword = await routeUserRequest({
    method: "POST",
    path: "/api/user/password",
    rawPath: "/api/user\\password",
    headers,
    body: { currentPassword: "raw-path-password", newPassword: "raw-path-new-password" },
  }, service);
  assert.equal(rawPassword.status, 404);
  assert.ok(await service.authenticateUser("raw-path@example.com", "raw-path-password"));
});

test("logout revokes the authenticated platform session instead of only clearing browser storage", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-platform-logout-route-"));
  const service = createPlatformUserService(root, { now: () => "2026-09-25T12:00:00.000Z" });
  const signup = await routeUserRequest({
    method: "POST", path: "/api/user/signup", headers: {},
    body: { email: "logout@example.com", displayName: "Logout User", timezone: "Asia/Seoul", password: "logout-password" },
  }, service);
  const token = (signup.body as any).session.token as string;
  const before = await routeUserRequest({ method: "GET", path: "/api/user/me", headers: { authorization: `Bearer ${token}` } }, service);
  assert.equal(before.status, 200);

  const logout = await routeUserRequest({ method: "POST", path: "/api/user/logout", headers: { authorization: `Bearer ${token}` } }, service);
  assert.equal(logout.status, 200);
  assert.deepEqual(logout.body, { loggedOut: true });

  const after = await routeUserRequest({ method: "GET", path: "/api/user/me", headers: { authorization: `Bearer ${token}` } }, service);
  assert.equal(after.status, 401);
});

test("password change verifies the current credential, persists the new one, and revokes every old session", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-platform-password-change-"));
  const service = createPlatformUserService(root, { now: () => "2026-09-25T12:00:00.000Z" });
  const user = await service.createUser({
    id: "password-user",
    email: "password@example.com",
    displayName: "Password User",
    timezone: "Asia/Seoul",
    password: "old-password-123",
  });
  const first = await service.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-26T12:00:00.000Z" });
  const second = await service.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-26T12:00:00.000Z" });

  await assert.rejects(() => service.changePassword({ userId: user.id, sessionId: first.id, roles: ["user"] }, "wrong-password", "new-password-123"), /current password/i);
  await service.changePassword({ userId: user.id, sessionId: first.id, roles: ["user"] }, "old-password-123", "new-password-123");

  assert.equal(await service.authenticateUser("password@example.com", "old-password-123"), null);
  assert.deepEqual(await service.authenticateUser("password@example.com", "new-password-123"), user);
  assert.equal(await service.resolveAuthenticatedPrincipal(first.token, "2026-09-25T12:01:00.000Z"), null);
  assert.equal(await service.resolveAuthenticatedPrincipal(second.token, "2026-09-25T12:01:00.000Z"), null);
});

test("password change route requires authentication and returns a bounded success envelope", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-platform-password-route-"));
  const service = createPlatformUserService(root, { now: () => "2026-09-25T12:00:00.000Z" });
  const signup = await routeUserRequest({
    method: "POST", path: "/api/user/signup", headers: {},
    body: { email: "password-route@example.com", displayName: "Password Route", timezone: "Asia/Seoul", password: "route-old-123" },
  }, service);
  const token = (signup.body as any).session.token as string;

  const unauthenticated = await routeUserRequest({ method: "POST", path: "/api/user/password", headers: {}, body: { currentPassword: "route-old-123", newPassword: "route-new-123" } }, service);
  assert.equal(unauthenticated.status, 401);
  const wrong = await routeUserRequest({ method: "POST", path: "/api/user/password", headers: { authorization: `Bearer ${token}` }, body: { currentPassword: "wrong-password", newPassword: "route-new-123" } }, service);
  assert.equal(wrong.status, 401);
  const changed = await routeUserRequest({ method: "POST", path: "/api/user/password", headers: { authorization: `Bearer ${token}` }, body: { currentPassword: "route-old-123", newPassword: "route-new-123" } }, service);
  assert.equal(changed.status, 200);
  assert.deepEqual(changed.body, { passwordChanged: true });
  assert.equal(await service.resolveAuthenticatedPrincipal(token), null);
  assert.deepEqual(await service.authenticateUser("password-route@example.com", "route-new-123"), signup.body.user);
});

test("concurrent password changes across service instances allow one compare-and-set winner", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-platform-password-concurrent-"));
  const firstService = createPlatformUserService(root, { now: () => "2026-09-25T12:00:00.000Z" });
  const secondService = createPlatformUserService(root, { now: () => "2026-09-25T12:00:00.000Z" });
  const user = await firstService.createUser({
    id: "password-concurrent-user",
    email: "password-concurrent@example.com",
    displayName: "Password Concurrent User",
    timezone: "Asia/Seoul",
    password: "old-password-123",
  });
  const principal = { userId: user.id, sessionId: "password-concurrent-session", roles: ["user"] };

  const results = await Promise.allSettled([
    firstService.changePassword(principal, "old-password-123", "first-new-password"),
    secondService.changePassword(principal, "old-password-123", "second-new-password"),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const authenticated = await Promise.all([
    firstService.authenticateUser("password-concurrent@example.com", "first-new-password"),
    firstService.authenticateUser("password-concurrent@example.com", "second-new-password"),
  ]);
  assert.equal(authenticated.filter(Boolean).length, 1);
});

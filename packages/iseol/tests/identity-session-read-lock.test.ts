import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSession, createUser, resolvePrincipal } from "../src/identity/store.js";
import { withDurableIdentityLock } from "../src/identity/identity-lock.js";

test("principal resolution waits for the durable session lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-identity-principal-read-lock-"));
  const at = "2026-09-30T00:00:00.000Z";
  await createUser(root, { id: "principal-read-owner", timezone: "Asia/Seoul", at });
  await createSession(root, {
    id: "principal-read-session",
    userId: "principal-read-owner",
    roles: ["user"],
    expiresAt: "2026-10-01T00:00:00.000Z",
    at,
  });

  let release!: () => void;
  let acquired!: () => void;
  const acquiredPromise = new Promise<void>((resolve) => { acquired = resolve; });
  const holderReleased = new Promise<void>((resolve) => { release = resolve; });
  const holder = withDurableIdentityLock(root, "session", "principal-read-session", async () => {
    acquired();
    await holderReleased;
  }, { waitForMs: 0 });
  await acquiredPromise;

  let settled = false;
  const pending = resolvePrincipal(root, "principal-read-session", at).then((value) => {
    settled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  release();
  await holder;
  assert.deepEqual(await pending, {
    userId: "principal-read-owner",
    sessionId: "principal-read-session",
    roles: ["user"],
  });
});

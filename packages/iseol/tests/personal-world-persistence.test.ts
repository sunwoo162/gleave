import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createPersonalWorldService } from "../src/personal-world/service.js";
import { loadCharacter, loadWorld, saveCharacter, saveWorld, saveWorldUnlocked } from "../src/personal-world/store.js";
import { withDurablePersonalWorldLock } from "../src/personal-world/world-lock.js";

const at = "2026-09-25T12:00:00.000Z";

function principal(userId: string): Principal {
  return { userId, sessionId: `${userId}-session`, roles: ["user"] };
}

test("personal world and character survive service restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-personal-world-"));
  const service = createPersonalWorldService(root, { now: () => at });
  const saved = await service.updateWorld(principal("user-a"), {
    displayName: "Ari",
    handle: "ari_dev",
    character: "c",
    interests: ["AI/ML"],
    activities: ["learn", "project"],
  });
  const character = await service.updateCharacter(principal("user-a"), {
    character: "d",
    appearance: { outfit: "coral-jacket", accessory: "headphones" },
  });

  const restarted = createPersonalWorldService(root, { now: () => at });
  assert.deepEqual(await restarted.getWorld(principal("user-a")), { ...saved, character: "d", updatedAt: at });
  assert.deepEqual(await restarted.getCharacter(principal("user-a")), character);
  assert.match(await readFile(join(root, "users", "user-a", "world.json"), "utf8"), /ari_dev/);
});

test("personal world cannot be read or changed through another user's principal", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-personal-world-isolation-"));
  const service = createPersonalWorldService(root, { now: () => at });
  await service.updateWorld(principal("user-a"), {
    displayName: "Private A",
    handle: "private_a",
    character: "a",
    interests: [],
    activities: [],
  });

  const b = await service.getWorld(principal("user-b"));
  assert.notEqual(b.displayName, "Private A");
  await service.updateWorld(principal("user-b"), {
    displayName: "Private B",
    handle: "private_b",
    character: "b",
    interests: [],
    activities: [],
  });
  assert.equal((await service.getWorld(principal("user-a"))).displayName, "Private A");
});

test("concurrent personal world patches across service instances preserve disjoint fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-personal-world-concurrent-"));
  const firstService = createPersonalWorldService(root, { now: () => at });
  const secondService = createPersonalWorldService(root, { now: () => at });
  await firstService.getWorld(principal("user-concurrent"));

  await Promise.all([
    firstService.updateWorld(principal("user-concurrent"), { displayName: "Concurrent Ari" }),
    secondService.updateWorld(principal("user-concurrent"), { interests: ["AI/ML"] }),
  ]);

  const world = await firstService.getWorld(principal("user-concurrent"));
  assert.equal(world.displayName, "Concurrent Ari");
  assert.deepEqual(world.interests, ["AI/ML"]);
});

test("personal world reads wait for the owner lock and reload the latest durable world", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-personal-world-read-lock-"));
  const service = createPersonalWorldService(root, { now: () => at });
  const user = principal("user-read-lock");
  const initial = await service.updateWorld(user, { displayName: "Before" });

  let releaseLock!: () => void;
  let lockAcquired!: Promise<void>;
  const acquired = new Promise<void>((resolve) => { lockAcquired = resolve; });
  const lockReleased = new Promise<void>((resolve) => { releaseLock = resolve; });
  const heldLock = withDurablePersonalWorldLock(root, user.userId, async () => {
    lockAcquired();
    await lockReleased;
  });
  await acquired;

  let settled = false;
  const read = service.getWorld(user).then((world) => {
    settled = true;
    return world;
  });
  let characterSettled = false;
  const readCharacter = service.getCharacter(user).then((character) => {
    characterSettled = true;
    return character;
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(settled, false);
  assert.equal(characterSettled, false);

  await saveWorldUnlocked(root, { ...initial, displayName: "After external durable update", character: "c" });
  releaseLock();
  await heldLock;
  assert.equal((await read).displayName, "After external durable update");
  assert.equal((await readCharacter).character, "c");
});

test("public personal world store reads and writes wait for the shared owner lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-personal-world-store-lock-"));
  const user = principal("user-store-lock");
  const service = createPersonalWorldService(root, { now: () => at });
  const world = await service.getWorld(user);
  const character = await service.getCharacter(user);
  const updatedWorld = { ...world, displayName: "잠금 해제 후 world", character: "c", updatedAt: at };
  const updatedCharacter = { ...character, character: "c", updatedAt: at };

  let releaseLock!: () => void;
  let lockAcquired!: () => void;
  const acquired = new Promise<void>((resolve) => { lockAcquired = resolve; });
  const heldLock = withDurablePersonalWorldLock(root, user.userId, async () => {
    lockAcquired();
    await new Promise<void>((resolve) => { releaseLock = resolve; });
  }, { waitForMs: 0 });
  await acquired;

  let worldSaveSettled = false;
  const pendingWorldSave = saveWorld(root, updatedWorld).then(() => { worldSaveSettled = true; });
  let characterSaveSettled = false;
  const pendingCharacterSave = saveCharacter(root, updatedCharacter).then(() => { characterSaveSettled = true; });
  let worldLoadSettled = false;
  const pendingWorldLoad = loadWorld(root, user.userId).then((value) => { worldLoadSettled = true; return value; });
  let characterLoadSettled = false;
  const pendingCharacterLoad = loadCharacter(root, user.userId).then((value) => { characterLoadSettled = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(worldSaveSettled, false);
  assert.equal(characterSaveSettled, false);
  assert.equal(worldLoadSettled, false);
  assert.equal(characterLoadSettled, false);

  releaseLock();
  await heldLock;
  await Promise.all([pendingWorldSave, pendingCharacterSave]);
  assert.equal((await pendingWorldLoad)?.displayName, "잠금 해제 후 world");
  assert.equal((await pendingCharacterLoad)?.character, "c");
});

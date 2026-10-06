import assert from "node:assert/strict";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createActivityService } from "../src/activity/service.js";
import { createGrowthService } from "../src/growth/read-model.js";
import { saveGrowthEntryUnlocked } from "../src/growth/ledger.js";
import { withDurableGrowthProjectionLock } from "../src/growth/projection-lock.js";
import { withDurableActivityEventLock } from "../src/activity/event-lock.js";
import { listActivityEvents, loadActivityEvent, saveActivityEvent } from "../src/activity/store.js";
import { removeOwnedLock } from "../src/lock-utils.js";

const at = "2026-09-25T12:00:00.000Z";

function principal(userId: string): Principal {
  return { userId, sessionId: `${userId}-session`, roles: ["user"] };
}

test("shared lock cleanup leaves a replacement owner untouched", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-shared-lock-owner-"));
  const lockPath = join(root, "replacement.lock");
  await writeFile(lockPath, JSON.stringify({ token: "replacement-owner" }), "utf8");

  await removeOwnedLock(lockPath, "old-owner");
  assert.equal(JSON.parse(await readFile(lockPath, "utf8")).token, "replacement-owner");

  await removeOwnedLock(lockPath, "replacement-owner");
  await assert.rejects(() => access(lockPath), /ENOENT/);
});

test("verified activity produces one actor-attributed growth entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-growth-ledger-"));
  const activity = createActivityService(root, { now: () => at });
  const growth = createGrowthService(root, { now: () => at });
  const event = await activity.recordActivityEvent(principal("user-a"), {
    sourceType: "learning-session",
    sourceId: "session-1",
    eventType: "learning.session.completed",
    eventVersion: 1,
    actorType: "user",
    verificationStatus: "verified",
    payload: { topic: "TypeScript" },
  });
  const entry = await growth.applyGrowthProjection(event);
  const duplicate = await growth.applyGrowthProjection(event);
  assert.ok(entry);
  assert.deepEqual(duplicate, entry);
  assert.deepEqual(await growth.getGrowthSnapshot(principal("user-a")), {
    userId: "user-a",
    level: 1,
    xp: 100,
    xpMax: 1000,
    stats: { development: 0, learning: 100, collaboration: 0, consistency: 0 },
    actorBreakdown: { user: 100, ai: 0, system: 0 },
    evidenceEventIds: [event.id],
    achievements: [{
      id: "first-evidence",
      badgeKey: "verified-evidence-1",
      title: "첫 검증 기록",
      description: "검증된 성장 증거를 처음 남겼습니다.",
      unlockedAt: at,
      evidenceEventIds: [event.id],
    }, {
      id: "learning-session",
      badgeKey: "learning-session-1",
      title: "학습 기록",
      description: "검증된 학습 세션을 완료했습니다.",
      unlockedAt: at,
      evidenceEventIds: [event.id],
    }],
  });
});

test("unverified activity never creates growth and users cannot see another user's ledger", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-growth-isolation-"));
  const activity = createActivityService(root, { now: () => at });
  const growth = createGrowthService(root, { now: () => at });
  const event = await activity.recordActivityEvent(principal("user-a"), {
    sourceType: "fixture",
    sourceId: "fixture-1",
    eventType: "project.run.completed",
    eventVersion: 1,
    actorType: "system",
    verificationStatus: "unverified",
  });
  assert.equal(await growth.applyGrowthProjection(event), null);
  assert.equal((await growth.getGrowthSnapshot(principal("user-a"))).xp, 0);
  assert.equal((await activity.listActivityEvents(principal("user-b"))).length, 0);
  assert.equal((await growth.getGrowthSnapshot(principal("user-b"))).xp, 0);
});

test("retracting verified evidence creates one compensating ledger entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-growth-retraction-"));
  const activity = createActivityService(root, { now: () => at });
  const growth = createGrowthService(root, { now: () => at });
  const original = await activity.recordActivityEvent(principal("user-a"), {
    sourceType: "project-run",
    sourceId: "run-1",
    eventType: "project.run.completed",
    eventVersion: 1,
    actorType: "ai",
    verificationStatus: "verified",
  });
  await growth.applyGrowthProjection(original);
  const retracted = await activity.retractActivityEvent(principal("user-a"), original.id, at);
  const correction = await growth.applyGrowthProjection(retracted);
  assert.equal(correction?.xpDelta, -150);
  assert.equal((await growth.applyGrowthProjection(retracted))?.id, correction?.id);
  const snapshot = await growth.getGrowthSnapshot(principal("user-a"));
  assert.equal(snapshot.xp, 0);
  assert.deepEqual(snapshot.actorBreakdown, { user: 0, ai: 0, system: 0 });
  assert.deepEqual(snapshot.evidenceEventIds, [original.id]);
});

test("concurrent identical activity events across service instances remain idempotent", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-activity-concurrent-"));
  const firstService = createActivityService(root, { now: () => at });
  const secondService = createActivityService(root, { now: () => at });
  const sources = Array.from({ length: 24 }, (_, index) => `concurrent-${index}`);
  const results = await Promise.allSettled(sources.flatMap((sourceId) => [
    firstService.recordActivityEvent(principal("activity-owner"), { sourceType: "test", sourceId, eventType: "test.completed", eventVersion: 1, actorType: "user", verificationStatus: "verified" }),
    secondService.recordActivityEvent(principal("activity-owner"), { sourceType: "test", sourceId, eventType: "test.completed", eventVersion: 1, actorType: "user", verificationStatus: "verified" }),
  ]));

  assert.equal(results.filter((result) => result.status === "fulfilled").length, sources.length * 2);
  assert.equal((await firstService.listActivityEvents(principal("activity-owner"))).length, sources.length);
});

test("activity event reads wait for the durable event lock before projecting state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-activity-read-lock-"));
  const owner = principal("activity-read-lock-owner");
  const service = createActivityService(root, { now: () => at });
  const event = await service.recordActivityEvent(owner, {
    sourceType: "test",
    sourceId: "activity-read-lock",
    eventType: "test.completed",
    eventVersion: 1,
    actorType: "user",
    verificationStatus: "verified",
  });
  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableActivityEventLock(root, owner.userId, event.id, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let listSettled = false;
  let getSettled = false;
  const listed = service.listActivityEvents(owner).then((result) => { listSettled = true; return result; });
  const fetched = service.getActivityEvent(owner, event.id).then((result) => { getSettled = true; return result; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(listSettled, false);
  assert.equal(getSettled, false);

  releaseHolder();
  await lockHeld;
  assert.deepEqual((await listed).map((candidate) => candidate.id), [event.id]);
  assert.equal((await fetched)?.id, event.id);
});

test("public activity event store reads and writes wait for the shared event lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-activity-store-lock-"));
  const owner = principal("activity-store-lock-owner");
  const service = createActivityService(root, { now: () => at });
  const event = await service.recordActivityEvent(owner, {
    sourceType: "test",
    sourceId: "activity-store-lock",
    eventType: "test.completed",
    eventVersion: 1,
    actorType: "user",
    verificationStatus: "verified",
  });
  const updated = { ...event, status: "retracted" as const, retractedAt: at, updatedAt: at };

  const holdEventLock = async () => {
    let release!: () => void;
    let acquired!: () => void;
    const acquiredPromise = new Promise<void>((resolve) => { acquired = resolve; });
    const holder = withDurableActivityEventLock(root, owner.userId, event.id, async () => {
      acquired();
      await new Promise<void>((resolve) => { release = resolve; });
    }, { waitForMs: 0 });
    await acquiredPromise;
    return { holder, release };
  };

  const saveLock = await holdEventLock();
  let saveSettled = false;
  const pendingSave = saveActivityEvent(root, updated).then(() => { saveSettled = true; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  saveLock.release();
  await saveLock.holder;
  await pendingSave;

  const loadLock = await holdEventLock();
  let loadSettled = false;
  const pendingLoad = loadActivityEvent(root, owner.userId, event.id).then((value) => {
    loadSettled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(loadSettled, false);
  loadLock.release();
  await loadLock.holder;
  assert.equal((await pendingLoad)?.status, "retracted");

  const listLock = await holdEventLock();
  let listSettled = false;
  const pendingList = listActivityEvents(root, owner.userId).then((value) => {
    listSettled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(listSettled, false);
  listLock.release();
  await listLock.holder;
  assert.equal((await pendingList)[0]?.status, "retracted");
});

test("growth snapshots wait for the event lock and reload the latest durable entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-growth-read-lock-"));
  const owner = principal("growth-read-lock-owner");
  const service = createActivityService(root, { now: () => at });
  const growth = createGrowthService(root, { now: () => at });
  const event = await service.recordActivityEvent(owner, {
    sourceType: "test",
    sourceId: "growth-read-lock",
    eventType: "learning.session.completed",
    eventVersion: 1,
    actorType: "user",
    verificationStatus: "verified",
  });
  const entry = await growth.applyGrowthProjection(event);
  assert.ok(entry);

  let releaseHolder!: () => void;
  let lockAcquired!: () => void;
  const acquired = new Promise<void>((resolve) => { lockAcquired = resolve; });
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableGrowthProjectionLock(root, owner.userId, event.id, async () => {
    lockAcquired();
    await holderReleased;
  }, { waitForMs: 0 });
  await acquired;

  let settled = false;
  const snapshot = growth.getGrowthSnapshot(owner).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  await saveGrowthEntryUnlocked(root, { ...entry, xpDelta: 200, statDelta: 200 });
  releaseHolder();
  await lockHeld;
  assert.equal((await snapshot).xp, 200);
});

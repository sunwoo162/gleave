import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createActivityService } from "../src/activity/service.js";
import { createGrowthService } from "../src/growth/read-model.js";
import { createNotificationService } from "../src/notifications/service.js";
import { createSettingsService } from "../src/settings/service.js";

const at = "2026-09-26T12:00:00.000Z";

function principal(userId: string): Principal {
  return { userId, sessionId: `${userId}-session`, roles: ["user"] };
}

test("growth achievements are earned only from active verified growth evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-growth-achievements-"));
  const activity = createActivityService(root, { now: () => at });
  const growth = createGrowthService(root, { now: () => at });
  const owner = principal("achievement-owner");

  const learning = await activity.recordActivityEvent(owner, {
    sourceType: "learning-session",
    sourceId: "session-1",
    eventType: "learning.session.completed",
    eventVersion: 1,
    actorType: "user",
    verificationStatus: "verified",
  });
  const project = await activity.recordActivityEvent(owner, {
    sourceType: "project-run",
    sourceId: "run-1",
    eventType: "project.run.completed",
    eventVersion: 1,
    actorType: "ai",
    verificationStatus: "verified",
  });
  const unverified = await activity.recordActivityEvent(owner, {
    sourceType: "fixture",
    sourceId: "fixture-1",
    eventType: "learning.session.completed",
    eventVersion: 1,
    actorType: "system",
    verificationStatus: "unverified",
  });
  await growth.applyGrowthProjection(learning);
  await growth.applyGrowthProjection(project);
  await growth.applyGrowthProjection(unverified);
  await growth.applyGrowthProjection(learning);

  const earned = (await growth.getGrowthSnapshot(owner) as any).achievements;
  assert.deepEqual(earned.map((item: any) => item.id), ["first-evidence", "learning-session", "project-run"]);
  assert.equal(earned[0].badgeKey, "verified-evidence-1");
  assert.deepEqual(earned[1].evidenceEventIds, [learning.id]);
  assert.deepEqual(earned[2].evidenceEventIds, [project.id]);
  assert.equal(earned.some((item: any) => item.evidenceEventIds.includes(unverified.id)), false);

  const retracted = await activity.retractActivityEvent(owner, learning.id, at);
  await growth.applyGrowthProjection(retracted);
  const afterRetraction = (await growth.getGrowthSnapshot(owner) as any).achievements;
  assert.deepEqual(afterRetraction.map((item: any) => item.id), ["first-evidence", "project-run"]);
  assert.deepEqual(afterRetraction[0].evidenceEventIds, [project.id]);
});

test("new growth achievements notify only the owner once when achievement alerts are enabled", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-growth-achievement-notifications-"));
  const activity = createActivityService(root, { now: () => at });
  const settings = createSettingsService(root, { now: () => at });
  const notifications = createNotificationService(root, { now: () => at });
  const growth = createGrowthService(root, { now: () => at, settingsService: settings, notificationService: notifications });
  const owner = principal("achievement-notification-owner");
  const other = principal("achievement-notification-other");
  const event = await activity.recordActivityEvent(owner, {
    sourceType: "learning-session",
    sourceId: "achievement-session-1",
    eventType: "learning.session.completed",
    eventVersion: 1,
    actorType: "user",
    verificationStatus: "verified",
  });

  await growth.applyGrowthProjection(event);
  await growth.applyGrowthProjection(event);
  const ownerInbox = await notifications.listNotifications(owner);
  assert.equal(ownerInbox.notifications.length, 2);
  assert.equal(ownerInbox.notifications.every((item) => item.kind === "achievement"), true);
  assert.deepEqual(ownerInbox.notifications.map((item) => item.source.type), ["achievement", "achievement"]);
  assert.deepEqual(new Set(ownerInbox.notifications.map((item) => item.source.type === "achievement" ? item.source.achievementId : "")), new Set(["first-evidence", "learning-session"]));
  assert.equal((await notifications.listNotifications(other)).notifications.length, 0);

  await settings.updateSettings(owner, { notifications: { achieve: false } });
  const secondEvent = await activity.recordActivityEvent(owner, {
    sourceType: "project-run",
    sourceId: "achievement-run-1",
    eventType: "project.run.completed",
    eventVersion: 1,
    actorType: "user",
    verificationStatus: "verified",
  });
  await growth.applyGrowthProjection(secondEvent);
  assert.equal((await notifications.listNotifications(owner)).notifications.length, 2);
});

test("concurrent growth projection across service instances remains idempotent", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-growth-concurrent-"));
  const activity = createActivityService(root, { now: () => at });
  const firstService = createGrowthService(root, { now: () => at });
  const secondService = createGrowthService(root, { now: () => at });
  const event = await activity.recordActivityEvent(principal("growth-concurrent-owner"), {
    sourceType: "learning-session",
    sourceId: "growth-concurrent-session",
    eventType: "learning.session.completed",
    eventVersion: 1,
    actorType: "user",
    verificationStatus: "verified",
  });

  const results = await Promise.allSettled(Array.from({ length: 24 }, () => Promise.all([
    firstService.applyGrowthProjection(event),
    secondService.applyGrowthProjection(event),
  ])));

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 24);
  assert.equal((await firstService.getGrowthSnapshot(principal("growth-concurrent-owner"))).xp, 100);
});

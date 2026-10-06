import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createActivityService } from "../src/activity/service.js";
import { createGrowthService } from "../src/growth/read-model.js";
import { removeOwnedLearningLock } from "../src/learning/lock-utils.js";
import { createLearningService } from "../src/learning/service.js";

const at = "2026-09-26T12:00:00.000Z";
function principal(userId: string): Principal { return { userId, sessionId: `${userId}-session`, roles: ["user"] }; }

test("learning session completion is owner-bound, durable, and idempotently attributed", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-completion-"));
  const activity = createActivityService(join(root, "activity"), { now: () => at });
  const growth = createGrowthService(join(root, "growth"), { now: () => at });
  const service = createLearningService(join(root, "learning"), { now: () => at, activityService: activity, growthService: growth });
  const owner = principal("learning-owner");
  const plan = await service.createLearningPlan(owner, { title: "Completion", description: "Finish a session", goals: ["Explain the result"] });
  const session = await service.startLearningSession(owner, plan.id);

  const completed = await service.completeLearningSession(owner, session.id);
  assert.equal(completed?.status, "completed");
  assert.equal(completed?.completedAt, at);
  assert.deepEqual(await service.completeLearningSession(owner, session.id), completed);

  const restarted = createLearningService(join(root, "learning"), { now: () => at, activityService: activity, growthService: growth });
  assert.deepEqual(await restarted.resumeLearningSession(owner, session.id), completed);
  const events = await activity.listActivityEvents(owner);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.eventType, "learning.session.completed");
  assert.equal(events[0]?.sourceId, session.id);
  assert.equal(events[0]?.actorType, "user");
  assert.equal(events[0]?.verificationStatus, "verified");
  assert.equal((await growth.getGrowthSnapshot(owner)).stats.learning, 100);
  await assert.rejects(
    () => restarted.recordStudyAttempt(owner, { sessionId: session.id, questionId: "after-complete", answer: "must be rejected" }),
    /completed/i,
  );
  assert.equal(await restarted.completeLearningSession(principal("other-user"), session.id), null);
});

test("stale learning session mutations are rejected without overwriting the current revision", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-session-cas-"));
  const service = createLearningService(join(root, "learning"), { now: () => at });
  const owner = principal("learning-cas-owner");
  const plan = await service.createLearningPlan(owner, { title: "CAS", description: "Protect session writes", goals: ["Resume safely"] });
  const session = await service.startLearningSession(owner, plan.id);
  const resume = service.resumeLearningSession as unknown as (principal: Principal, sessionId: string, expectedRevision?: number) => Promise<typeof session | null>;
  const complete = service.completeLearningSession as unknown as (principal: Principal, sessionId: string, expectedRevision?: number) => Promise<typeof session | null>;

  const resumed = await resume(owner, session.id, session.revision);
  assert.equal(resumed?.revision, session.revision + 1);
  await assert.rejects(() => complete(owner, session.id, session.revision), /revision conflict/i);
  assert.deepEqual((await service.listLearningSessions(owner)).find((item) => item.id === session.id), resumed);

  const completed = await complete(owner, session.id, resumed!.revision);
  assert.equal(completed?.status, "completed");
  assert.equal(completed?.revision, resumed!.revision + 1);
});

test("concurrent learning session completions serialize the expected revision", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-session-cas-concurrent-"));
  const activity = createActivityService(join(root, "activity"), { now: () => at });
  const service = createLearningService(join(root, "learning"), { now: () => at, activityService: activity });
  const owner = principal("learning-cas-concurrent-owner");
  const plan = await service.createLearningPlan(owner, { title: "Concurrent CAS", description: "Serialize completion", goals: ["One transition"] });
  const session = await service.startLearningSession(owner, plan.id);
  const complete = service.completeLearningSession as unknown as (principal: Principal, sessionId: string, expectedRevision?: number) => Promise<typeof session | null>;

  const results = await Promise.allSettled([
    complete(owner, session.id, session.revision),
    complete(owner, session.id, session.revision),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && /revision conflict/i.test(String(result.reason))).length, 1);
  assert.equal((await activity.listActivityEvents(owner)).length, 1);
  assert.equal((await service.listLearningSessions(owner)).find((item) => item.id === session.id)?.revision, session.revision + 1);
});

test("learning session completions serialize across service instances sharing one root", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-session-cas-cross-instance-"));
  const activity = createActivityService(join(root, "activity"), { now: () => at });
  const serviceA = createLearningService(join(root, "learning"), { now: () => at, activityService: activity });
  const serviceB = createLearningService(join(root, "learning"), { now: () => at, activityService: activity });
  const owner = principal("learning-cas-cross-instance-owner");
  const plan = await serviceA.createLearningPlan(owner, { title: "Cross-instance CAS", description: "Serialize durable completion", goals: ["One transition"] });
  const session = await serviceA.startLearningSession(owner, plan.id);

  const results = await Promise.allSettled([
    serviceA.completeLearningSession(owner, session.id, session.revision),
    serviceB.completeLearningSession(owner, session.id, session.revision),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && /revision conflict/i.test(String(result.reason))).length, 1);
  assert.equal((await activity.listActivityEvents(owner)).length, 1);
  assert.equal((await serviceA.listLearningSessions(owner)).find((item) => item.id === session.id)?.revision, session.revision + 1);
});

test("learning session mutation reclaims only a lock owned by a dead process", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-session-cas-stale-lock-"));
  const service = createLearningService(join(root, "learning"), { now: () => at });
  const owner = principal("learning-cas-stale-lock-owner");
  const plan = await service.createLearningPlan(owner, { title: "Stale lock", description: "Reclaim one dead lock", goals: ["Complete safely"] });
  const session = await service.startLearningSession(owner, plan.id);
  const lockPath = join(root, "learning", "users", owner.userId, "learning", "session-locks", `${session.id}.lock`);
  await mkdir(join(root, "learning", "users", owner.userId, "learning", "session-locks"), { recursive: true });
  await writeFile(lockPath, JSON.stringify({ version: 1, pid: 99999999, token: "dead-owner", createdAt: at }), "utf8");

  const completed = await service.completeLearningSession(owner, session.id, session.revision);
  assert.equal(completed?.status, "completed");
  await assert.rejects(() => access(lockPath), /ENOENT/);
});

test("learning lock cleanup leaves a replacement owner untouched", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-lock-owner-"));
  const lockPath = join(root, "session.lock");
  await writeFile(lockPath, JSON.stringify({ version: 1, pid: process.pid, token: "replacement-owner", createdAt: at }), "utf8");

  await removeOwnedLearningLock(lockPath, "old-owner");
  assert.equal(JSON.parse(await readFile(lockPath, "utf8")).token, "replacement-owner");

  await removeOwnedLearningLock(lockPath, "replacement-owner");
  await assert.rejects(() => access(lockPath), /ENOENT/);
});

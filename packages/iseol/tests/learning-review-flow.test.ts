import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createActivityService } from "../src/activity/service.js";
import { createLearningService } from "../src/learning/service.js";
import { withDurableLearningReviewLock } from "../src/learning/review-lock.js";

const at = "2026-09-25T12:00:00.000Z";
function principal(userId: string, timezone?: string): Principal & { timezone?: string } { return { userId, sessionId: `${userId}-session`, roles: ["user"], ...(timezone ? { timezone } : {}) }; }

test("review items preserve the learner local clock across a daylight-saving transition", async () => {
  const reviewAt = "2026-03-07T17:00:00.000Z";
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-review-dst-"));
  const service = createLearningService(root, { now: () => reviewAt });
  const item = await service.createReviewItem(principal("user-dst", "America/New_York"), {
    sourceType: "learning-session",
    sourceId: "session-dst",
    prompt: "What changes at the DST boundary?",
    answer: "The UTC offset changes while the local calendar continues.",
    dueAt: reviewAt,
  });

  const reviewed = await service.reviewItem(principal("user-dst", "America/New_York"), item.id, { quality: 5 });

  assert.equal(reviewed.dueAt, "2026-03-09T16:00:00.000Z");
});

test("review items keep local calendar scheduling across a daylight-saving fallback", async () => {
  const reviewAt = "2026-10-31T16:00:00.000Z";
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-review-fallback-"));
  const service = createLearningService(root, { now: () => reviewAt });
  const item = await service.createReviewItem(principal("user-fallback", "America/New_York"), {
    sourceType: "learning-session",
    sourceId: "session-fallback",
    prompt: "What changes at the DST fallback?",
    answer: "The local clock remains the scheduling reference.",
    dueAt: reviewAt,
  });

  const reviewed = await service.reviewItem(principal("user-fallback", "America/New_York"), item.id, { quality: 5 });

  assert.equal(reviewed.dueAt, "2026-11-02T17:00:00.000Z");
});

test("review items schedule the next review durably", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-review-"));
  const activity = createActivityService(join(root, "activity"), { now: () => at });
  const service = createLearningService(root, { now: () => at, activityService: activity });
  const item = await service.createReviewItem(principal("user-a"), {
    sourceType: "learning-session",
    sourceId: "session-1",
    prompt: "What does a generic constraint preserve?",
    answer: "A relationship between types.",
    dueAt: at,
  });
  const reviewed = await service.reviewItem(principal("user-a"), item.id, { quality: 5 });
  assert.equal(reviewed.reviewCount, 1);
  assert.equal(reviewed.intervalDays, 2);
  assert.equal(reviewed.dueAt, "2026-09-27T12:00:00.000Z");
  assert.equal((await service.listDueReviewItems(principal("user-a"), "2026-09-26T00:00:00.000Z")).length, 0);
  assert.equal((await service.listDueReviewItems(principal("user-a"), "2026-09-28T00:00:00.000Z")).length, 1);
  const events = await activity.listActivityEvents(principal("user-a"));
  assert.equal(events.length, 1);
  assert.equal(events[0]?.eventType, "learning.review.completed");
  assert.equal(events[0]?.sourceId, item.id);
  assert.equal(events[0]?.verificationStatus, "verified");
  assert.equal(events[0]?.actorType, "user");
  assert.equal(events[0]?.payload.quality, 5);
});

test("due review lists wait for each durable review lock before projecting state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-review-read-lock-"));
  const owner = principal("review-read-lock-owner");
  const service = createLearningService(root, { now: () => at });
  const item = await service.createReviewItem(owner, {
    sourceType: "learning-session",
    sourceId: "session-read-lock",
    prompt: "Wait for the review lock",
    answer: "Read the durable item after the lock is released.",
    dueAt: at,
  });
  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableLearningReviewLock(root, owner.userId, item.id, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let settled = false;
  const read = service.listDueReviewItems(owner, "2026-09-26T00:00:00.000Z").then((result) => { settled = true; return result; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  releaseHolder();
  await lockHeld;
  assert.deepEqual((await read).map((candidate) => candidate.id), [item.id]);
});

test("local code analysis is persisted with explicit provenance and no external call", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-code-analysis-"));
  const activity = createActivityService(join(root, "activity"), { now: () => at });
  const service = createLearningService(root, { now: () => at, activityService: activity });
  const result = await service.analyzeCodeForLearning(principal("user-a"), {
    sourceType: "editor",
    sourceId: "snippet-1",
    language: "typescript",
    code: "function identity<T>(value: T): T {\n  // TODO: explain constraint\n  return value;\n}",
  });
  assert.equal(result.provider, "local-static");
  assert.ok(result.findings.some((finding) => finding.code === "TODO"));
  const restarted = createLearningService(root, { now: () => at });
  assert.deepEqual(await restarted.getCodeAnalysis(principal("user-a"), result.id), result);
  const events = await activity.listActivityEvents(principal("user-a"));
  assert.equal(events.length, 1);
  assert.equal(events[0]?.eventType, "learning.code.analyzed");
  assert.equal(events[0]?.sourceId, result.id);
  assert.equal(events[0]?.actorType, "system");
  assert.equal(events[0]?.verificationStatus, "verified");
  assert.equal(events[0]?.payload.provider, "local-static");
});

test("concurrent review completions across service instances preserve both transitions", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-review-concurrent-"));
  const activity = createActivityService(join(root, "activity"), { now: () => at });
  const firstService = createLearningService(join(root, "learning"), { now: () => at, activityService: activity });
  const secondService = createLearningService(join(root, "learning"), { now: () => at, activityService: activity });
  const owner = principal("review-concurrent-owner");
  const item = await firstService.createReviewItem(owner, { sourceType: "learning-session", sourceId: "session-concurrent", prompt: "Two transitions", answer: "Preserve both", dueAt: at });

  const results = await Promise.all([
    firstService.reviewItem(owner, item.id, { quality: 5 }),
    secondService.reviewItem(owner, item.id, { quality: 5 }),
  ]);

  assert.deepEqual(results.map((result) => result.reviewCount).sort(), [1, 2]);
  assert.equal((await firstService.listDueReviewItems(owner, "2026-10-01T00:00:00.000Z")).length, 1);
  assert.equal((await activity.listActivityEvents(owner)).filter((event) => event.eventType === "learning.review.completed").length, 2);
});

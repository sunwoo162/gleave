import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createLearningService } from "../src/learning/service.js";

const at = "2026-09-25T12:00:00.000Z";
function principal(userId: string): Principal { return { userId, sessionId: `${userId}-session`, roles: ["user"] }; }

test("learning plans and sessions persist and can be resumed after restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-persistence-"));
  const service = createLearningService(root, { now: () => at });
  const plan = await service.createLearningPlan(principal("user-a"), {
    title: "TypeScript foundations",
    description: "Generics and inference",
    goals: ["Explain generic constraints", "Solve three exercises"],
  });
  const session = await service.startLearningSession(principal("user-a"), plan.id);
  const attempt = await service.recordStudyAttempt(principal("user-a"), {
    sessionId: session.id,
    questionId: "generic-1",
    answer: "A type parameter preserves the relation between input and output.",
    correct: true,
  });

  const restarted = createLearningService(root, { now: () => at });
  assert.deepEqual(await restarted.getLearningPlan(principal("user-a"), plan.id), plan);
  const persistedSession = (await restarted.listLearningSessions(principal("user-a"))).find((item) => item.id === session.id);
  assert.equal(persistedSession?.revision, session.revision + 1);
  const resumed = await restarted.resumeLearningSession(principal("user-a"), session.id, persistedSession!.revision);
  assert.equal(resumed?.revision, persistedSession!.revision + 1);
  assert.equal(resumed?.status, "active");
  assert.deepEqual(await restarted.listStudyAttempts(principal("user-a"), session.id), [attempt]);
  assert.deepEqual(await restarted.listLearningSessions(principal("user-b")), []);
  assert.equal(await restarted.getLearningPlan(principal("user-b"), plan.id), null);
  assert.deepEqual(await restarted.listStudyAttempts(principal("user-b"), session.id), []);
});

test("study attempts reject sessions owned by another user", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-owner-"));
  const service = createLearningService(root, { now: () => at });
  const plan = await service.createLearningPlan(principal("user-a"), { title: "Private", description: "Only A", goals: [] });
  const session = await service.startLearningSession(principal("user-a"), plan.id);
  await assert.rejects(() => service.recordStudyAttempt(principal("user-b"), { sessionId: session.id, questionId: "q", answer: "no" }), /not found|forbidden/i);
});

test("concurrent legacy learning session starts across service instances remain one session", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-session-start-concurrent-"));
  const owner = principal("legacy-session-concurrent-owner");
  const firstService = createLearningService(root, { now: () => at });
  const secondService = createLearningService(root, { now: () => at });
  const plan = await firstService.createLearningPlan(owner, { title: "동시 세션", description: "one active session", goals: ["one"] });

  const results = await Promise.all([
    firstService.startLearningSession(owner, plan.id),
    secondService.startLearningSession(owner, plan.id),
  ]);

  assert.equal(new Set(results.map((session) => session.id)).size, 1);
  assert.equal((await firstService.listLearningSessions(owner)).filter((session) => session.planId === plan.id && session.status === "active").length, 1);
});

test("learning durable writes use the Windows transient rename retry boundary", async () => {
  const source = await readFile(resolve(process.cwd(), "src/learning/store.ts"), "utf8");
  assert.match(source, /renameWithTransientRetry\(temporary, path\)/);
});

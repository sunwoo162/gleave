import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createActivityService } from "../src/activity/service.js";
import { withDurableLearningCodingAttemptLock } from "../src/learning/coding-attempt-lock.js";
import { createLearningService } from "../src/learning/service.js";
import { saveCodingAttemptUnlocked } from "../src/learning/store.js";

const at = "2026-09-26T12:00:00.000Z";
function principal(userId: string): Principal { return { userId, sessionId: `${userId}-session`, roles: ["user"] }; }

test("coding exercise attempts are owner-bound, durable, idempotent, and honest about missing execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-coding-test-"));
  const service = createLearningService(root, { now: () => at });
  const owner = principal("user-a");
  const other = principal("user-b");
  const plan = await service.createLearningPlan(owner, { title: "TypeScript", description: "Practice", goals: ["Generics"] });
  const session = await service.startLearningSession(owner, plan.id);
  const exercise = await service.createCodingExercise(owner, {
    sessionId: session.id,
    title: "Generic identity",
    prompt: "Write an identity function that preserves the input type.",
    language: "typescript",
    estimatedMinutes: 15,
  });

  assert.equal(await service.getCodingExercise(other, exercise.id), null);
  await assert.rejects(() => service.submitCodingAttempt(other, {
    exerciseId: exercise.id,
    clientRequestId: "other-request",
    response: "function identity(value) { return value; }",
  }), /not found|forbidden/i);

  const first = await service.submitCodingAttempt(owner, {
    exerciseId: exercise.id,
    clientRequestId: "attempt-request-1",
    response: "function identity<T>(value: T): T { return value; }",
  });
  assert.equal(first.created, true);
  assert.equal(first.attempt.practiceResult.status, "environment-required");
  assert.equal(first.attempt.practiceResult.executorId, "none");
  assert.equal(first.attempt.revealedBeforeSubmit, false);

  const repeated = await service.submitCodingAttempt(owner, {
    exerciseId: exercise.id,
    clientRequestId: "attempt-request-1",
    response: "function identity<T>(value: T): T { return value; }",
  });
  assert.equal(repeated.created, false);
  assert.equal(repeated.attempt.id, first.attempt.id);
  await assert.rejects(() => service.submitCodingAttempt(owner, {
    exerciseId: exercise.id,
    clientRequestId: "attempt-request-1",
    response: "changed answer",
  }), /idempotency conflict/i);

  const restarted = createLearningService(root, { now: () => at });
  assert.deepEqual(await restarted.getCodingExercise(owner, exercise.id), exercise);
  assert.deepEqual(await restarted.listCodingAttempts(owner, exercise.id), [first.attempt]);
  assert.deepEqual(await restarted.listCodingExercises(other), []);
});

test("a configured coding verifier can complete a practice receipt without changing answer ownership", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-coding-verifier-"));
  const owner = principal("verifier-owner");
  const verifier = async ({ complete }: { complete: (result: unknown) => Promise<unknown> }) => ({
    status: "completed",
    attempt: await complete({
      status: "syntax-verified",
      artifactRefs: ["coding-syntax:receipt"],
      executorId: "local-syntax-verifier",
      policyRef: "local-syntax-verifier-v1",
      receipt: { checkKind: "syntax-only", passed: true, diagnostics: [] },
    }),
  });
  const service = createLearningService(root, { now: () => at, codingAttemptVerifier: verifier } as any);
  const plan = await service.createLearningPlan(owner, { title: "JavaScript", description: "Practice", goals: ["Syntax"] });
  const session = await service.startLearningSession(owner, plan.id);
  const exercise = await service.createCodingExercise(owner, {
    sessionId: session.id,
    title: "Syntax check",
    prompt: "Write valid JavaScript.",
    language: "javascript",
    estimatedMinutes: 5,
  });

  const result = await service.submitCodingAttempt(owner, {
    exerciseId: exercise.id,
    clientRequestId: "verifier-request-1",
    response: "const answer = 1;",
  });

  assert.equal(result.attempt.userId, owner.userId);
  assert.equal(result.attempt.practiceResult.status, "syntax-verified");
  assert.deepEqual(result.attempt.practiceResult.artifactRefs, ["coding-syntax:receipt"]);
  assert.equal((result.attempt.practiceResult as any).receipt.passed, true);
});

test("coding attempt lists wait for each durable attempt lock before projecting state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-coding-read-lock-"));
  const owner = principal("coding-read-lock-owner");
  const service = createLearningService(root, { now: () => at });
  const plan = await service.createLearningPlan(owner, { title: "Coding reads", description: "Coding reads", goals: ["Practice"] });
  const session = await service.startLearningSession(owner, plan.id);
  const exercise = await service.createCodingExercise(owner, { sessionId: session.id, title: "Read attempt", prompt: "Write an answer", language: "typescript", estimatedMinutes: 5 });
  const submitted = await service.submitCodingAttempt(owner, { exerciseId: exercise.id, clientRequestId: "coding-read-attempt", response: "const answer = 1;" });
  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableLearningCodingAttemptLock(root, owner.userId, exercise.id, submitted.attempt.clientRequestId, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let settled = false;
  const read = service.listCodingAttempts(owner, exercise.id).then((result) => { settled = true; return result; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  await saveCodingAttemptUnlocked(root, { ...submitted.attempt, response: "잠금 해제 후 시도" });
  releaseHolder();
  await lockHeld;
  assert.equal((await read)[0]?.response, "잠금 해제 후 시도");
});

test("coding attempt submissions create one owner-scoped unverified activity receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-coding-activity-"));
  const owner = principal("coding-activity-owner");
  const other = principal("coding-activity-other");
  const activity = createActivityService(join(root, "activity"), { now: () => at });
  const service = createLearningService(root, { now: () => at, activityService: activity });
  const plan = await service.createLearningPlan(owner, { title: "JavaScript", description: "Practice", goals: ["Submission evidence"] });
  const session = await service.startLearningSession(owner, plan.id);
  const exercise = await service.createCodingExercise(owner, {
    sessionId: session.id,
    title: "Submission receipt",
    prompt: "Write valid JavaScript.",
    language: "javascript",
    estimatedMinutes: 5,
  });

  const first = await service.submitCodingAttempt(owner, {
    exerciseId: exercise.id,
    clientRequestId: "activity-attempt-1",
    response: "const answer = 1;",
  });
  const repeated = await service.submitCodingAttempt(owner, {
    exerciseId: exercise.id,
    clientRequestId: "activity-attempt-1",
    response: "const answer = 1;",
  });

  assert.equal(repeated.created, false);
  const ownerEvents = await activity.listActivityEvents(owner);
  assert.equal(ownerEvents.length, 1);
  assert.deepEqual(ownerEvents[0], {
    version: 1,
    id: ownerEvents[0]?.id,
    userId: owner.userId,
    sourceType: "learning-coding-attempt",
    sourceId: first.attempt.id,
    eventType: "learning.coding.attempt.submitted",
    eventVersion: 1,
    actorType: "user",
    verificationStatus: "unverified",
    status: "active",
    payload: {
      exerciseId: exercise.id,
      language: "javascript",
      practiceStatus: first.attempt.practiceResult.status,
      executorId: first.attempt.practiceResult.executorId,
    },
    occurredAt: at,
    createdAt: at,
    updatedAt: at,
  });
  assert.deepEqual(await activity.listActivityEvents(other), []);
});

test("concurrent coding attempt submissions with one client request id remain one attempt", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-coding-concurrent-"));
  const owner = principal("coding-concurrent-owner");
  const firstService = createLearningService(root, { now: () => at });
  const secondService = createLearningService(root, { now: () => at });
  const plan = await firstService.createLearningPlan(owner, { title: "Concurrent coding", description: "One request", goals: ["one"] });
  const session = await firstService.startLearningSession(owner, plan.id);
  const exercise = await firstService.createCodingExercise(owner, { sessionId: session.id, title: "Concurrent exercise", prompt: "Answer once", language: "typescript", estimatedMinutes: 5 });
  const input = { exerciseId: exercise.id, clientRequestId: "coding-concurrent-request", response: "const answer = 1;" };

  const results = await Promise.all([
    firstService.submitCodingAttempt(owner, input),
    secondService.submitCodingAttempt(owner, input),
  ]);

  assert.deepEqual(results.map((result) => result.created).sort(), [false, true]);
  assert.equal(new Set(results.map((result) => result.attempt.id)).size, 1);
  assert.equal((await firstService.listCodingAttempts(owner, exercise.id)).length, 1);
});

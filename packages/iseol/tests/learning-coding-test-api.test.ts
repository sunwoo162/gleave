import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createLearningService } from "../src/learning/service.js";
import { createLocalCodingSyntaxVerifier } from "../src/learning/local-coding-verifier.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("learning API preserves coding exercise answers without claiming a test execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-coding-api-"));
  const now = () => "2026-09-26T12:00:00.000Z";
  const platform = createPlatformUserService(join(root, "platform"), { now });
  const learning = createLearningService(join(root, "platform"), { now });
  const user = await platform.createUser({ id: "coding-api-user", email: "coding@example.com", displayName: "Coder", timezone: "Asia/Seoul" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"),
    userService: platform, learningService: learning,
  });
  const address = server.address() as AddressInfo;
  const url = "http://127.0.0.1:" + address.port;
  const headers = { authorization: "Bearer " + session.token, "content-type": "application/json" };
  try {
    const exerciseResponse = await fetch(url + "/api/user/learning/coding-exercises", { method: "POST", headers, body: JSON.stringify({
      sessionId: "missing-session", title: "Should fail", prompt: "No", language: "typescript", estimatedMinutes: 10,
    }) });
    assert.equal(exerciseResponse.status, 404);

    const planResponse = await fetch(url + "/api/user/learning/plans", { method: "POST", headers, body: JSON.stringify({ title: "Coding", description: "Practice", goals: ["Types"] }) });
    const plan = (await planResponse.json() as any).plan;
    const sessionResponse = await fetch(url + "/api/user/learning/sessions", { method: "POST", headers, body: JSON.stringify({ planId: plan.id }) });
    const learningSession = (await sessionResponse.json() as any).session;
    const createdResponse = await fetch(url + "/api/user/learning/coding-exercises", { method: "POST", headers, body: JSON.stringify({
      sessionId: learningSession.id, title: "Identity", prompt: "Preserve the input type.", language: "typescript", estimatedMinutes: 15,
    }) });
    assert.equal(createdResponse.status, 201);
    const exercise = (await createdResponse.json() as any).exercise;
    const attemptResponse = await fetch(url + "/api/user/learning/coding-exercises/" + encodeURIComponent(exercise.id) + "/attempts", { method: "POST", headers, body: JSON.stringify({
      clientRequestId: "api-attempt-1", response: "function identity<T>(value: T): T { return value; }",
    }) });
    assert.equal(attemptResponse.status, 201);
    assert.equal((await attemptResponse.json() as any).attempt.practiceResult.status, "environment-required");
    const repeatedResponse = await fetch(url + "/api/user/learning/coding-exercises/" + encodeURIComponent(exercise.id) + "/attempts", { method: "POST", headers, body: JSON.stringify({
      clientRequestId: "api-attempt-1", response: "function identity<T>(value: T): T { return value; }",
    }) });
    assert.equal(repeatedResponse.status, 200);
    const attemptsResponse = await fetch(url + "/api/user/learning/coding-exercises/" + encodeURIComponent(exercise.id) + "/attempts", { headers });
    assert.equal(attemptsResponse.status, 200);
    assert.equal((await attemptsResponse.json() as any).attempts.length, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("learning API returns a local syntax receipt only when the verifier is explicitly injected", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-coding-verifier-api-"));
  const now = () => "2026-09-27T00:00:00.000Z";
  const platform = createPlatformUserService(join(root, "platform"), { now });
  const learning = createLearningService(join(root, "platform"), { now, codingAttemptVerifier: createLocalCodingSyntaxVerifier({ timeoutMs: 5_000 }) });
  const user = await platform.createUser({ id: "coding-verifier-api-user", email: "coding-verifier@example.com", displayName: "Verifier", timezone: "Asia/Seoul" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-28T00:00:00.000Z" });
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"),
    userService: platform, learningService: learning,
  });
  const address = server.address() as AddressInfo;
  const url = "http://127.0.0.1:" + address.port;
  const headers = { authorization: "Bearer " + session.token, "content-type": "application/json" };
  try {
    const planResponse = await fetch(url + "/api/user/learning/plans", { method: "POST", headers, body: JSON.stringify({ title: "JavaScript", description: "Syntax", goals: ["Syntax"] }) });
    const plan = (await planResponse.json() as any).plan;
    const sessionResponse = await fetch(url + "/api/user/learning/sessions", { method: "POST", headers, body: JSON.stringify({ planId: plan.id }) });
    const learningSession = (await sessionResponse.json() as any).session;
    const exerciseResponse = await fetch(url + "/api/user/learning/coding-exercises", { method: "POST", headers, body: JSON.stringify({ sessionId: learningSession.id, title: "Syntax", prompt: "Write JavaScript", language: "javascript", estimatedMinutes: 5 }) });
    const exercise = (await exerciseResponse.json() as any).exercise;
    const attemptResponse = await fetch(url + "/api/user/learning/coding-exercises/" + encodeURIComponent(exercise.id) + "/attempts", { method: "POST", headers, body: JSON.stringify({ clientRequestId: "api-verifier-1", response: "const answer = 1;" }) });
    assert.equal(attemptResponse.status, 201);
    const attempt = (await attemptResponse.json() as any).attempt;
    assert.equal(attempt.practiceResult.status, "syntax-verified");
    assert.equal(attempt.practiceResult.receipt.passed, true);
    assert.equal(attempt.practiceResult.receipt.checkKind, "syntax-only");
    const answerResponse = await fetch(url + "/api/user/learning/sessions/" + encodeURIComponent(learningSession.id) + "/answers", { method: "POST", headers, body: JSON.stringify({ exerciseId: exercise.id, attemptId: attempt.id, response: attempt.response, artifactRefs: [] }) });
    assert.equal(answerResponse.status, 201);
    assert.deepEqual((await answerResponse.json() as any).answer.artifactRefs, [`coding-syntax:${attempt.id}`]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

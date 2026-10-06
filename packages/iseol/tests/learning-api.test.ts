import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createLearningService } from "../src/learning/service.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("learning API persists a plan, attempt, and local code analysis behind the user session", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-api-"));
  const now = () => "2026-09-25T12:00:00.000Z";
  const platform = createPlatformUserService(join(root, "platform"), { now });
  const learning = createLearningService(join(root, "platform"), { now });
  const user = await platform.createUser({ id: "learning-api-user", email: "learning@example.com", displayName: "Learner", timezone: "Asia/Seoul" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-26T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"),
    userService: platform, learningService: learning,
  });
  const address = server.address() as AddressInfo;
  const url = "http://127.0.0.1:" + address.port;
  const headers = { authorization: "Bearer " + session.token, "content-type": "application/json" };
  try {
    const planResponse = await fetch(url + "/api/user/learning/plans", { method: "POST", headers, body: JSON.stringify({ title: "Generics", description: "Types", goals: ["constraints"] }) });
    assert.equal(planResponse.status, 201);
    const plan = (await planResponse.json() as any).plan;
    const sessionResponse = await fetch(url + "/api/user/learning/sessions", { method: "POST", headers, body: JSON.stringify({ planId: plan.id }) });
    assert.equal(sessionResponse.status, 201);
    const learningSession = (await sessionResponse.json() as any).session;
    const sessionsResponse = await fetch(url + "/api/user/learning/sessions", { headers });
    assert.equal(sessionsResponse.status, 200);
    assert.deepEqual((await sessionsResponse.json() as any).sessions.map((item: any) => item.id), [learningSession.id]);
    const attempt = await fetch(url + "/api/user/learning/attempts", { method: "POST", headers, body: JSON.stringify({ sessionId: learningSession.id, questionId: "q-1", answer: "T", correct: true }) });
    assert.equal(attempt.status, 201);
    const completion = await fetch(url + "/api/user/learning/sessions/" + encodeURIComponent(learningSession.id) + "/complete", { method: "POST", headers, body: "{}" });
    assert.equal(completion.status, 200);
    assert.equal((await completion.json() as any).session.status, "completed");
    const completedSessions = await fetch(url + "/api/user/learning/sessions", { headers });
    assert.equal((await completedSessions.json() as any).sessions[0].status, "completed");
    const analysis = await fetch(url + "/api/user/learning/analyze", { method: "POST", headers, body: JSON.stringify({ sourceType: "editor", sourceId: "snippet", language: "typescript", code: "// TODO" }) });
    assert.equal((await analysis.json() as any).result.provider, "local-static");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("learning API rejects a stale session completion and accepts the current revision", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-session-cas-api-"));
  const now = () => "2026-09-25T12:00:00.000Z";
  const platform = createPlatformUserService(join(root, "platform"), { now });
  const learning = createLearningService(join(root, "platform"), { now });
  const user = await platform.createUser({ id: "learning-cas-api-user", email: "learning-cas-api@example.com", displayName: "Learner CAS", timezone: "Asia/Seoul" });
  const authSession = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-26T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"),
    userService: platform, learningService: learning,
  });
  const address = server.address() as AddressInfo;
  const url = "http://127.0.0.1:" + address.port;
  const headers = { authorization: "Bearer " + authSession.token, "content-type": "application/json" };
  try {
    const planResponse = await fetch(url + "/api/user/learning/plans", { method: "POST", headers, body: JSON.stringify({ title: "CAS", description: "Session revisions", goals: ["Avoid stale writes"] }) });
    const plan = (await planResponse.json() as any).plan;
    const sessionResponse = await fetch(url + "/api/user/learning/sessions", { method: "POST", headers, body: JSON.stringify({ planId: plan.id }) });
    const session = (await sessionResponse.json() as any).session;
    assert.equal(session.revision, 1);

    const resumedResponse = await fetch(url + "/api/user/learning/sessions/" + encodeURIComponent(session.id) + "?expectedRevision=1", { headers });
    assert.equal(resumedResponse.status, 200);
    const resumed = (await resumedResponse.json() as any).session;
    assert.equal(resumed.revision, 2);

    const staleCompletion = await fetch(url + "/api/user/learning/sessions/" + encodeURIComponent(session.id) + "/complete", { method: "POST", headers, body: JSON.stringify({ expectedRevision: 1 }) });
    assert.equal(staleCompletion.status, 409);

    const currentCompletion = await fetch(url + "/api/user/learning/sessions/" + encodeURIComponent(session.id) + "/complete", { method: "POST", headers, body: JSON.stringify({ expectedRevision: 2 }) });
    assert.equal(currentCompletion.status, 200);
    assert.equal((await currentCompletion.json() as any).session.revision, 3);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

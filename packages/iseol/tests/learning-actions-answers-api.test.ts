import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createLearningService } from "../src/learning/service.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("learning actions and answer feedback API preserve pending/evaluation boundaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-actions-api-"));
  const now = () => "2026-09-26T12:00:00.000Z";
  const platform = createPlatformUserService(join(root, "platform"), { now });
  const learning = createLearningService(join(root, "platform"), { now });
  const user = await platform.createUser({ id: "actions-api-user", email: "actions@example.com", displayName: "Learner", timezone: "Asia/Seoul" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"), userService: platform, learningService: learning });
  const address = server.address() as AddressInfo;
  const url = "http://127.0.0.1:" + address.port;
  const headers = { authorization: "Bearer " + session.token, "content-type": "application/json" };
  try {
    const plan = (await (await fetch(url + "/api/user/learning/plans", { method: "POST", headers, body: JSON.stringify({ title: "Actions", description: "Actions", goals: ["Practice"] }) })).json() as any).plan;
    const activeSession = (await (await fetch(url + "/api/user/learning/sessions", { method: "POST", headers, body: JSON.stringify({ planId: plan.id }) })).json() as any).session;
    const actionResponse = await fetch(url + `/api/user/learning/sessions/${encodeURIComponent(activeSession.id)}/actions`, { method: "POST", headers, body: JSON.stringify({ actionId: "understood-api", type: "self-report", contentRef: "concept-api", question: "이해했어요" }) });
    assert.equal(actionResponse.status, 201);
    assert.equal((await actionResponse.json() as any).action.status, "recorded");
    const actionsResponse = await fetch(url + `/api/user/learning/sessions/${encodeURIComponent(activeSession.id)}/actions`, { headers });
    assert.equal((await actionsResponse.json() as any).actions.length, 1);
    const exercise = (await (await fetch(url + "/api/user/learning/coding-exercises", { method: "POST", headers, body: JSON.stringify({ sessionId: activeSession.id, title: "Identity", prompt: "Write identity", language: "typescript", estimatedMinutes: 10 }) })).json() as any).exercise;
    const attempt = (await (await fetch(url + `/api/user/learning/coding-exercises/${encodeURIComponent(exercise.id)}/attempts`, { method: "POST", headers, body: JSON.stringify({ clientRequestId: "api-answer-1", response: "identity" }) })).json() as any).attempt;
    const answerResponse = await fetch(url + `/api/user/learning/sessions/${encodeURIComponent(activeSession.id)}/answers`, { method: "POST", headers, body: JSON.stringify({ exerciseId: exercise.id, attemptId: attempt.id, response: attempt.response, artifactRefs: [] }) });
    assert.equal(answerResponse.status, 201);
    const answer = (await answerResponse.json() as any).answer;
    assert.equal(answer.status, "evaluation-pending");
    const feedbackResponse = await fetch(url + `/api/user/learning/answers/${encodeURIComponent(answer.id)}/feedback`, { headers });
    assert.equal(feedbackResponse.status, 200);
    assert.equal((await feedbackResponse.json() as any).feedback.status, "pending");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

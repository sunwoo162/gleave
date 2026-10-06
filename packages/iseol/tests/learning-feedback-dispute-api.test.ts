import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createLearningService } from "../src/learning/service.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("feedback dispute API is authenticated, owner-bound, and explicit about unavailable re-evaluation", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-dispute-api-"));
  const now = () => "2026-09-26T12:00:00.000Z";
  const platform = createPlatformUserService(join(root, "platform"), { now });
  const learning = createLearningService(join(root, "platform"), { now });
  const owner = await platform.createUser({ id: "dispute-api-owner", email: "dispute-api-owner@example.com", displayName: "Owner", timezone: "Asia/Seoul" });
  const other = await platform.createUser({ id: "dispute-api-other", email: "dispute-api-other@example.com", displayName: "Other", timezone: "Asia/Seoul" });
  const ownerSession = await platform.createSession({ userId: owner.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const otherSession = await platform.createSession({ userId: other.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"), userService: platform, learningService: learning });
  const address = server.address() as AddressInfo;
  const url = "http://127.0.0.1:" + address.port;
  const headers = { authorization: "Bearer " + ownerSession.token, "content-type": "application/json" };
  try {
    const plan = (await (await fetch(url + "/api/user/learning/plans", { method: "POST", headers, body: JSON.stringify({ title: "Dispute", description: "Dispute", goals: ["Practice"] }) })).json() as any).plan;
    const session = (await (await fetch(url + "/api/user/learning/sessions", { method: "POST", headers, body: JSON.stringify({ planId: plan.id }) })).json() as any).session;
    const exercise = (await (await fetch(url + "/api/user/learning/coding-exercises", { method: "POST", headers, body: JSON.stringify({ sessionId: session.id, title: "Explain", prompt: "Explain", language: "typescript", estimatedMinutes: 10 }) })).json() as any).exercise;
    const attempt = (await (await fetch(url + `/api/user/learning/coding-exercises/${encodeURIComponent(exercise.id)}/attempts`, { method: "POST", headers, body: JSON.stringify({ clientRequestId: "api-dispute-attempt", response: "answer" }) })).json() as any).attempt;
    const answer = (await (await fetch(url + `/api/user/learning/sessions/${encodeURIComponent(session.id)}/answers`, { method: "POST", headers, body: JSON.stringify({ exerciseId: exercise.id, attemptId: attempt.id, response: attempt.response }) })).json() as any).answer;
    const answersResponse = await fetch(url + `/api/user/learning/sessions/${encodeURIComponent(session.id)}/answers`, { headers });
    assert.equal(answersResponse.status, 200);
    assert.deepEqual((await answersResponse.json() as any).answers.map((item: any) => item.id), [answer.id]);
    const feedback = (await (await fetch(url + `/api/user/learning/answers/${encodeURIComponent(answer.id)}/feedback`, { headers })).json() as any).feedback;
    const disputeResponse = await fetch(url + `/api/user/learning/feedback/${encodeURIComponent(feedback.id)}/disputes`, { method: "POST", headers, body: JSON.stringify({ reason: "평가 근거를 다시 확인해 주세요." }) });
    assert.equal(disputeResponse.status, 201);
    const disputed = await disputeResponse.json() as any;
    assert.equal(disputed.dispute.status, "waiting-runtime");
    assert.equal(disputed.feedback.status, "disputed");
    assert.equal(disputed.answer.status, "disputed");
    const foreignResponse = await fetch(url + `/api/user/learning/feedback/${encodeURIComponent(feedback.id)}/disputes`, { method: "POST", headers: { authorization: "Bearer " + otherSession.token, "content-type": "application/json" }, body: JSON.stringify({ reason: "foreign" }) });
    assert.equal(foreignResponse.status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

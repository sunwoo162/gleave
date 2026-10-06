import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createLearningService } from "../src/learning/service.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("learning session content request API keeps waiting state durable and owner-scoped", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-content-api-"));
  const now = () => "2026-09-26T12:00:00.000Z";
  const platform = createPlatformUserService(join(root, "platform"), { now });
  const learning = createLearningService(join(root, "platform"), { now });
  const user = await platform.createUser({ id: "content-api-user", email: "content@example.com", displayName: "Learner", timezone: "Asia/Seoul" });
  const other = await platform.createUser({ id: "content-api-other", email: "other-content@example.com", displayName: "Other", timezone: "Asia/Seoul" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const otherSession = await platform.createSession({ userId: other.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"),
    userService: platform, learningService: learning,
  });
  const address = server.address() as AddressInfo;
  const url = "http://127.0.0.1:" + address.port;
  const headers = { authorization: "Bearer " + session.token, "content-type": "application/json" };
  const otherHeaders = { authorization: "Bearer " + otherSession.token, "content-type": "application/json" };
  try {
    const planResponse = await fetch(url + "/api/user/learning/plans", { method: "POST", headers, body: JSON.stringify({ title: "Content", description: "Content", goals: ["Practice"] }) });
    const plan = (await planResponse.json() as any).plan;
    const sessionResponse = await fetch(url + "/api/user/learning/sessions", { method: "POST", headers, body: JSON.stringify({ planId: plan.id }) });
    const legacySession = (await sessionResponse.json() as any).session;
    const missing = await fetch(url + "/api/user/learning/sessions/" + encodeURIComponent(legacySession.id) + "/content", { method: "POST", headers, body: "{}" });
    assert.equal(missing.status, 400);

    const goalResponse = await fetch(url + "/api/user/learning/goals", { method: "POST", headers, body: JSON.stringify({ subjectText: "TypeScript", duration: { days: 2 }, dailyMinutes: 20 }) });
    const goal = (await goalResponse.json() as any).goal;
    const previewResponse = await fetch(url + "/api/user/learning/goals/" + encodeURIComponent(goal.id) + "/plan-preview", { method: "POST", headers, body: JSON.stringify({ expectedRevision: goal.revision }) });
    const preview = await previewResponse.json() as any;
    const startResponse = await fetch(url + "/api/user/learning/goals/" + encodeURIComponent(goal.id) + "/start", { method: "POST", headers, body: JSON.stringify({ planVersionId: preview.plan.id, dayId: preview.plan.days[0].id, expectedRevision: preview.goal.revision }) });
    const goalSession = (await startResponse.json() as any).session;
    const requestResponse = await fetch(url + "/api/user/learning/sessions/" + encodeURIComponent(goalSession.id) + "/content", { method: "POST", headers, body: "{}" });
    assert.equal(requestResponse.status, 201);
    const request = (await requestResponse.json() as any).request;
    assert.equal(request.state, "waiting-runtime");
    const reloadResponse = await fetch(url + "/api/user/learning/sessions/" + encodeURIComponent(goalSession.id) + "/content", { headers });
    assert.equal((await reloadResponse.json() as any).request.id, request.id);
    const foreignResponse = await fetch(url + "/api/user/learning/sessions/" + encodeURIComponent(goalSession.id) + "/content", { method: "POST", headers: otherHeaders, body: "{}" });
    assert.equal(foreignResponse.status, 404);
    void otherSession;
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

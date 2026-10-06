import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createLearningService } from "../src/learning/service.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("learning goal preview API is authenticated, durable, and explicit about local template provenance", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-plan-preview-api-"));
  const now = () => "2026-09-26T12:00:00.000Z";
  const platform = createPlatformUserService(join(root, "platform"), { now });
  const learning = createLearningService(join(root, "platform"), { now });
  const user = await platform.createUser({ id: "preview-api-user", email: "preview@example.com", displayName: "Preview", timezone: "Asia/Seoul" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"),
    userService: platform, learningService: learning,
  });
  const address = server.address() as AddressInfo;
  const url = "http://127.0.0.1:" + address.port;
  const headers = { authorization: "Bearer " + session.token, "content-type": "application/json" };
  try {
    const unauthenticated = await fetch(url + "/api/user/learning/goals/learning-goal-missing/plan-preview", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(unauthenticated.status, 401);
    const goalResponse = await fetch(url + "/api/user/learning/goals", { method: "POST", headers, body: JSON.stringify({ subjectText: "HTTP", duration: { days: 3 }, dailyMinutes: 20 }) });
    assert.equal(goalResponse.status, 201);
    const goal = (await goalResponse.json() as any).goal;
    const previewResponse = await fetch(url + "/api/user/learning/goals/" + encodeURIComponent(goal.id) + "/plan-preview", { method: "POST", headers, body: JSON.stringify({ expectedRevision: goal.revision }) });
    assert.equal(previewResponse.status, 201);
    const preview = (await previewResponse.json() as any);
    assert.equal(preview.interpretation.source.kind, "local-template");
    assert.equal(preview.plan.days.length, 3);
    const plansResponse = await fetch(url + "/api/user/learning/goals/" + encodeURIComponent(goal.id) + "/plans", { headers });
    assert.equal(plansResponse.status, 200);
    assert.equal((await plansResponse.json() as any).plans.length, 1);
    const adjustmentResponse = await fetch(url + "/api/user/learning/goals/" + encodeURIComponent(goal.id) + "/adjustment-preview", { method: "POST", headers, body: JSON.stringify({ basePlanVersionId: preview.plan.id, expectedGoalRevision: preview.goal.revision, reason: "changed-time", dailyMinutes: 15 }) });
    assert.equal(adjustmentResponse.status, 201);
    const adjustment = (await adjustmentResponse.json() as any).adjustment;
    assert.equal(adjustment.status, "proposed");
    const adjustmentsResponse = await fetch(url + "/api/user/learning/goals/" + encodeURIComponent(goal.id) + "/adjustments", { headers });
    assert.equal(adjustmentsResponse.status, 200);
    assert.equal((await adjustmentsResponse.json() as any).adjustments.length, 1);
    const acceptedResponse = await fetch(url + "/api/user/learning/goals/" + encodeURIComponent(goal.id) + "/adjustments/" + encodeURIComponent(adjustment.id) + "/accept", { method: "POST", headers, body: "{}" });
    assert.equal(acceptedResponse.status, 200);
    const accepted = (await acceptedResponse.json() as any);
    assert.equal(accepted.adjustment.status, "accepted");
    assert.notEqual(accepted.plan.id, preview.plan.id);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

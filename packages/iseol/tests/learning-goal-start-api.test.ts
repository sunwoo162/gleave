import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createLearningService } from "../src/learning/service.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("goal start API activates only the selected version and returns the durable day session", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-goal-start-api-"));
  const now = () => "2026-09-26T12:00:00.000Z";
  const platform = createPlatformUserService(join(root, "platform"), { now });
  const learning = createLearningService(join(root, "platform"), { now });
  const user = await platform.createUser({ id: "goal-start-api-user", email: "goal-start@example.com", displayName: "Goal Start", timezone: "Asia/Seoul" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"), userService: platform, learningService: learning });
  const address = server.address() as AddressInfo;
  const url = "http://127.0.0.1:" + address.port;
  const headers = { authorization: "Bearer " + session.token, "content-type": "application/json" };
  try {
    const goalResponse = await fetch(url + "/api/user/learning/goals", { method: "POST", headers, body: JSON.stringify({ subjectText: "HTTP", duration: { days: 2 }, dailyMinutes: 20 }) });
    const goal = (await goalResponse.json() as any).goal;
    const previewResponse = await fetch(url + `/api/user/learning/goals/${encodeURIComponent(goal.id)}/plan-preview`, { method: "POST", headers, body: JSON.stringify({ expectedRevision: goal.revision }) });
    const preview = await previewResponse.json() as any;
    const startResponse = await fetch(url + `/api/user/learning/goals/${encodeURIComponent(goal.id)}/start`, { method: "POST", headers, body: JSON.stringify({ planVersionId: preview.plan.id, dayId: preview.plan.days[0].id, expectedRevision: preview.goal.revision }) });
    assert.equal(startResponse.status, 201);
    const started = await startResponse.json() as any;
    assert.equal(started.session.goalId, goal.id);
    assert.equal(started.session.contentStatus, "not-requested");
    const goalAfter = await (await fetch(url + `/api/user/learning/goals/${encodeURIComponent(goal.id)}`, { headers })).json() as any;
    assert.equal(goalAfter.goal.status, "active");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

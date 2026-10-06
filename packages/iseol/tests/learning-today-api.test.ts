import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createLearningService } from "../src/learning/service.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("today learning API returns only the authenticated user's scheduled day", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-today-api-"));
  const now = () => "2026-09-26T12:00:00.000Z";
  const platform = createPlatformUserService(join(root, "platform"), { now });
  const learning = createLearningService(join(root, "platform"), { now });
  const user = await platform.createUser({ id: "today-api-user", email: "today-api@example.com", displayName: "Today", timezone: "Pacific/Kiritimati" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"), userService: platform, learningService: learning });
  const address = server.address() as AddressInfo;
  const url = "http://127.0.0.1:" + address.port;
  const headers = { authorization: "Bearer " + session.token, "content-type": "application/json" };
  try {
    const goal = (await (await fetch(url + "/api/user/learning/goals", { method: "POST", headers, body: JSON.stringify({ subjectText: "Today", duration: { days: 2 }, dailyMinutes: 20 }) })).json() as any).goal;
    const preview = await (await fetch(url + `/api/user/learning/goals/${encodeURIComponent(goal.id)}/plan-preview`, { method: "POST", headers, body: JSON.stringify({ expectedRevision: goal.revision }) })).json() as any;
    const todayResponse = await fetch(url + `/api/user/learning/goals/${encodeURIComponent(goal.id)}/today`, { headers });
    assert.equal(todayResponse.status, 200);
    const today = (await todayResponse.json() as any).today;
    assert.equal(today.state, "available");
    assert.equal(today.plan.id, preview.plan.id);
    assert.equal(today.day.localDate, "2026-09-27");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createLearningService } from "../src/learning/service.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("learning report API is owner-bound, durable, and explicit about local evidence provenance", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-report-api-"));
  const now = () => "2026-09-27T12:00:00.000Z";
  const platform = createPlatformUserService(join(root, "platform"), { now });
  const learning = createLearningService(join(root, "platform"), { now });
  const owner = await platform.createUser({ id: "report-api-owner", email: "report-api-owner@example.com", displayName: "Owner", timezone: "Asia/Seoul" });
  const other = await platform.createUser({ id: "report-api-other", email: "report-api-other@example.com", displayName: "Other", timezone: "Asia/Seoul" });
  const ownerSession = await platform.createSession({ userId: owner.id, roles: ["user"], expiresAt: "2026-09-28T12:00:00.000Z" });
  const otherSession = await platform.createSession({ userId: other.id, roles: ["user"], expiresAt: "2026-09-28T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"), userService: platform, learningService: learning });
  const address = server.address() as AddressInfo;
  const url = "http://127.0.0.1:" + address.port;
  const headers = { authorization: "Bearer " + ownerSession.token, "content-type": "application/json" };
  try {
    const goal = (await (await fetch(url + "/api/user/learning/goals", { method: "POST", headers, body: JSON.stringify({ subjectText: "Reports", duration: { days: 2 }, dailyMinutes: 25 }) })).json() as any).goal;
    const createdResponse = await fetch(url + `/api/user/learning/goals/${encodeURIComponent(goal.id)}/reports`, { method: "POST", headers, body: JSON.stringify({ period: { from: "2026-09-27", to: "2026-09-27", kind: "final" } }) });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json() as any;
    assert.equal(created.report.provenance.kind, "local-evidence");
    const listedResponse = await fetch(url + `/api/user/learning/goals/${encodeURIComponent(goal.id)}/reports`, { headers });
    assert.equal(listedResponse.status, 200);
    assert.equal((await listedResponse.json() as any).reports.length, 1);
    const foreignResponse = await fetch(url + `/api/user/learning/goals/${encodeURIComponent(goal.id)}/reports`, { headers: { authorization: "Bearer " + otherSession.token } });
    assert.equal(foreignResponse.status, 200);
    assert.deepEqual((await foreignResponse.json() as any).reports, []);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

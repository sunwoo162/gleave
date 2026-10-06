import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createLearningService } from "../src/learning/service.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("learning goal progress API is owner-bound and exposes evidence states without mastery claims", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-progress-api-"));
  const now = () => "2026-09-26T12:00:00.000Z";
  const platform = createPlatformUserService(join(root, "platform"), { now });
  const learning = createLearningService(join(root, "platform"), { now });
  const owner = await platform.createUser({ id: "progress-api-owner", email: "progress-api-owner@example.com", displayName: "Owner", timezone: "Pacific/Kiritimati" });
  const other = await platform.createUser({ id: "progress-api-other", email: "progress-api-other@example.com", displayName: "Other", timezone: "Asia/Seoul" });
  const ownerSession = await platform.createSession({ userId: owner.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const otherSession = await platform.createSession({ userId: other.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"), userService: platform, learningService: learning });
  const address = server.address() as AddressInfo;
  const url = "http://127.0.0.1:" + address.port;
  const headers = { authorization: "Bearer " + ownerSession.token, "content-type": "application/json" };
  try {
    const goal = (await (await fetch(url + "/api/user/learning/goals", { method: "POST", headers, body: JSON.stringify({ subjectText: "Testing", duration: { days: 2 }, dailyMinutes: 25 }) })).json() as any).goal;
    const preview = await (await fetch(url + `/api/user/learning/goals/${encodeURIComponent(goal.id)}/plan-preview`, { method: "POST", headers, body: JSON.stringify({ expectedRevision: goal.revision }) })).json() as any;
    const progressResponse = await fetch(url + `/api/user/learning/goals/${encodeURIComponent(goal.id)}/progress`, { headers });
    assert.equal(progressResponse.status, 200);
    const progress = (await progressResponse.json() as any).progress;
    assert.equal(progress.plan.id, preview.plan.id);
    assert.equal(progress.schedule.plannedDays, 2);
    assert.ok(!progress.warnings.some((warning: string) => /서버 기준/.test(warning)));
    assert.equal(progress.actual.sessions.total, 0);
    assert.equal(progress.evaluation.pendingAnswers, 0);
    assert.ok(!("mastery" in progress));
    assert.ok(!("percentage" in progress));
    const foreignResponse = await fetch(url + `/api/user/learning/goals/${encodeURIComponent(goal.id)}/progress`, { headers: { authorization: "Bearer " + otherSession.token } });
    assert.equal(foreignResponse.status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

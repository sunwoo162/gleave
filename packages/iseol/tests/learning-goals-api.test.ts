import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createLearningService } from "../src/learning/service.js";
import type { LearningService } from "../src/learning/contracts.js";
import { routeLearningRequest } from "../src/learning/router.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("learning API redacts credential-shaped service errors without changing not-found status", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-error-redaction-"));
  const platformRoot = join(root, "platform");
  const platform = createPlatformUserService(platformRoot, { now: () => "2026-09-26T12:00:00.000Z" });
  const user = await platform.createUser({ id: "learning-error-user", email: "learning-error@example.com", displayName: "Learning Error", timezone: "Asia/Seoul" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const failingLearning = {
    listLearningGoals: async () => { throw new Error("learning not found token%ZZ=learning-secret"); },
  } as unknown as LearningService;

  const result = await routeLearningRequest({ method: "GET", path: "/api/user/learning/goals", headers: { authorization: `Bearer ${session.token}` } }, { platformUserService: platform, learningService: failingLearning });

  assert.equal(result.status, 404);
  const message = (result.body as { error: string }).error;
  assert.equal(message.includes("learning-secret"), false);
  assert.match(message, /\[redacted\]/i);
});

test("learning goal API stores the required input and does not expose another user's goal", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-learning-goal-api-"));
  const now = () => "2026-09-26T12:00:00.000Z";
  const platform = createPlatformUserService(join(root, "platform"), { now });
  const learning = createLearningService(join(root, "platform"), { now });
  const userA = await platform.createUser({ id: "goal-api-a", email: "goal-a@example.com", displayName: "A", timezone: "Asia/Seoul" });
  const userB = await platform.createUser({ id: "goal-api-b", email: "goal-b@example.com", displayName: "B", timezone: "Asia/Seoul" });
  const sessionA = await platform.createSession({ userId: userA.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const sessionB = await platform.createSession({ userId: userB.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"),
    userService: platform, learningService: learning,
  });
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  const headersA = { authorization: `Bearer ${sessionA.token}`, "content-type": "application/json" };
  const headersB = { authorization: `Bearer ${sessionB.token}` };
  try {
    const created = await fetch(`${url}/api/user/learning/goals`, { method: "POST", headers: headersA, body: JSON.stringify({ subjectText: "자료구조", duration: { days: 14 }, dailyMinutes: 30 }) });
    assert.equal(created.status, 201);
    const goal = (await created.json() as any).goal;
    assert.equal(goal.status, "draft");
    const listA = await fetch(`${url}/api/user/learning/goals`, { headers: headersA });
    assert.deepEqual((await listA.json() as any).goals.map((item: any) => item.id), [goal.id]);
    const listB = await fetch(`${url}/api/user/learning/goals`, { headers: headersB });
    assert.deepEqual((await listB.json() as any).goals, []);
    const detailB = await fetch(`${url}/api/user/learning/goals/${encodeURIComponent(goal.id)}`, { headers: headersB });
    assert.equal(detailB.status, 404);
    const malformedGoal = await fetch(`${url}/api/user/learning/goals/%E0%A4%A`, { headers: headersA });
    assert.equal(malformedGoal.status, 404);
    const malformedProposalGoal = await fetch(`${url}/api/user/learning/goals/%E0%A4%A/project-proposals`, { headers: headersA });
    assert.equal(malformedProposalGoal.status, 404);
    const malformedReportGoal = await fetch(`${url}/api/user/learning/goals/%E0%A4%A/reports`, { headers: headersA });
    assert.equal(malformedReportGoal.status, 404);
    const malformedProposalId = await fetch(`${url}/api/user/learning/goals/${encodeURIComponent(goal.id)}/project-proposals/%E0%A4%A/accept`, { method: "POST", headers: headersA, body: "{}" });
    assert.equal(malformedProposalId.status, 404);
    const encodedSlashPlanPreview = await fetch(`${url}/api/user/learning/goals/${goal.id}%2Fplan-preview`, { method: "POST", headers: headersA, body: JSON.stringify({ expectedRevision: goal.revision }) });
    assert.equal(encodedSlashPlanPreview.status, 404);
    const encodedSlashPlanList = await fetch(`${url}/api/user/learning/goals/${goal.id}%2Fplans`, { headers: headersA });
    assert.equal(encodedSlashPlanList.status, 404);
    const rawBackslashPlanPreview = await routeLearningRequest({
      method: "POST",
      path: `/api/user/learning/goals/${goal.id}/plan-preview`,
      rawPath: `/api/user/learning/goals/${goal.id}\\plan-preview`,
      headers: headersA,
      body: { expectedRevision: goal.revision },
    }, { platformUserService: platform, learningService: learning });
    assert.equal(rawBackslashPlanPreview.status, 404);
    const rawBackslashLearningPrefix = await routeLearningRequest({
      method: "POST",
      path: `/api/user/learning/goals/${goal.id}/plan-preview`,
      rawPath: `/api/user\\learning/goals/${goal.id}/plan-preview`,
      headers: headersA,
      body: { expectedRevision: goal.revision },
    }, { platformUserService: platform, learningService: learning });
    assert.equal(rawBackslashLearningPrefix.status, 404);
    const rawBackslashServerResponse = await new Promise<number>((resolve, reject) => {
      const rawRequest = httpRequest({
        hostname: "127.0.0.1",
        port: address.port,
        method: "POST",
        path: `/api/user\\learning/goals/${goal.id}/plan-preview`,
        headers: { ...headersA, "content-length": String(Buffer.byteLength(JSON.stringify({ expectedRevision: goal.revision }))) },
      }, (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      });
      rawRequest.on("error", reject);
      rawRequest.end(JSON.stringify({ expectedRevision: goal.revision }));
    });
    assert.equal(rawBackslashServerResponse, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

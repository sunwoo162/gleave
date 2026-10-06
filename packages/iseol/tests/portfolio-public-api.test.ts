import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { request as httpRequest } from "node:http";
import test from "node:test";
import { createActivityService } from "../src/activity/service.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import type { PortfolioService } from "../src/portfolio/contracts.js";
import { routePortfolioRequest } from "../src/portfolio/router.js";
import { createUserProjectService } from "../src/project-model/user-project-service.js";
import { createPortfolioService } from "../src/portfolio/service.js";
import { withDurablePortfolioEntryLock } from "../src/portfolio/entry-lock.js";
import { savePortfolioEntryUnlocked } from "../src/portfolio/store.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("authenticated portfolio API redacts credential-shaped service errors without changing not-found status", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-portfolio-error-redaction-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => "2026-09-26T12:00:00.000Z" });
  const user = await users.createUser({ id: "portfolio-error-user", email: "portfolio-error@example.com", displayName: "Portfolio Error", timezone: "Asia/Seoul" });
  const session = await users.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const failingPortfolio = {
    listPortfolio: async () => { throw new Error("portfolio not found token%ZZ=portfolio-secret"); },
  } as unknown as PortfolioService;

  const result = await routePortfolioRequest({ method: "GET", path: "/api/user/portfolio", headers: { authorization: `Bearer ${session.token}` } }, { platformUserService: users, portfolioService: failingPortfolio });

  assert.equal(result.status, 404);
  const message = (result.body as { error: string }).error;
  assert.equal(message.includes("portfolio-secret"), false);
  assert.match(message, /\[redacted\]/i);
});

test("public portfolio API exposes only public or unlisted entries without a session", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-public-portfolio-api-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => "2026-09-26T12:00:00.000Z" });
  const user = await users.createUser({ id: "public-portfolio-user", email: "public-portfolio@example.com", displayName: "Public Portfolio", timezone: "Asia/Seoul" });
  const activity = createActivityService(platformRoot, { now: () => "2026-09-26T12:00:00.000Z" });
  const projects = createUserProjectService({ platformRoot, projectModelRoot: join(root, "projects"), projectHarnessRoot: join(root, "runs"), iseolRoot: root });
  const portfolio = createPortfolioService(platformRoot, { activityService: activity, userProjectService: projects, now: () => "2026-09-26T12:00:00.000Z" });
  const principal = { userId: user.id, sessionId: "session", roles: ["user"] as const };
  const event = await activity.recordActivityEvent(principal, { sourceType: "learning", sourceId: "public-session", eventType: "study.completed", eventVersion: 1, actorType: "user", verificationStatus: "verified" });
  const publicEntry = await portfolio.createEntry(principal, { title: "공개 기록", summary: "검증된 활동을 공개합니다.", visibility: "public", evidenceIds: [`activity:${event.id}`] });
  const privateEntry = await portfolio.createEntry(principal, { title: "비공개 기록", summary: "사용자만 보는 활동입니다.", visibility: "private", evidenceIds: [`activity:${event.id}`] });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "control", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"), portfolioService: portfolio });
  const address = server.address() as AddressInfo;
  try {
    const publicResponse = await fetch(`http://127.0.0.1:${address.port}/api/public/portfolio/${publicEntry.id}`);
    assert.equal(publicResponse.status, 200);
    const publicBody = await publicResponse.json() as { entry: { id: string; userId?: string; evidenceIds?: string[] }; evidence: Array<{ id?: string; sourceId?: string; projectId?: string; reportId?: string }> };
    assert.equal(publicBody.entry.id, publicEntry.id);
    assert.equal("userId" in publicBody.entry, false);
    assert.equal("evidenceIds" in publicBody.entry, false);
    assert.equal("id" in publicBody.evidence[0], false);
    assert.equal("sourceId" in publicBody.evidence[0], false);
    assert.equal("projectId" in publicBody.evidence[0], false);
    assert.equal("reportId" in publicBody.evidence[0], false);
    const queryResponse = await fetch(`http://127.0.0.1:${address.port}/api/public/portfolio/${publicEntry.id}?next=%2F`);
    assert.equal(queryResponse.status, 200);
    const rawBackslashStatus = await new Promise<number>((resolveRaw, rejectRaw) => {
      const rawRequest = httpRequest({ hostname: "127.0.0.1", port: address.port, method: "GET", path: `/api/public/portfolio\\${publicEntry.id}` }, (rawResponse) => {
        rawResponse.resume();
        rawResponse.once("end", () => resolveRaw(rawResponse.statusCode ?? 0));
      });
      rawRequest.once("error", rejectRaw);
      rawRequest.end();
    });
    assert.equal(rawBackslashStatus, 404);
    const malformedResponse = await fetch(`http://127.0.0.1:${address.port}/api/public/portfolio/${encodeURIComponent(`${publicEntry.id}/suffix`)}`);
    assert.equal(malformedResponse.status, 404);
    const privateResponse = await fetch(`http://127.0.0.1:${address.port}/api/public/portfolio/${privateEntry.id}`);
    assert.equal(privateResponse.status, 404);
  } finally { await server.closeForShutdown(); }
});

test("public portfolio reads re-check visibility after waiting for the entry lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-public-portfolio-read-lock-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => "2026-09-26T12:00:00.000Z" });
  const user = await users.createUser({ id: "public-read-lock-user", email: "public-read-lock@example.com", displayName: "Public Read Lock", timezone: "Asia/Seoul" });
  const activity = createActivityService(platformRoot, { now: () => "2026-09-26T12:00:00.000Z" });
  const projects = createUserProjectService({ platformRoot, projectModelRoot: join(root, "projects"), projectHarnessRoot: join(root, "runs"), iseolRoot: root });
  const portfolio = createPortfolioService(platformRoot, { activityService: activity, userProjectService: projects, now: () => "2026-09-26T12:00:00.000Z" });
  const principal = { userId: user.id, sessionId: "session", roles: ["user"] as const };
  const event = await activity.recordActivityEvent(principal, { sourceType: "learning", sourceId: "public-read-lock-session", eventType: "study.completed", eventVersion: 1, actorType: "user", verificationStatus: "verified" });
  const entry = await portfolio.createEntry(principal, { title: "잠금 공개 기록", summary: "공개 상태 경쟁조건을 검증합니다.", visibility: "public", evidenceIds: [`activity:${event.id}`] });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurablePortfolioEntryLock(platformRoot, user.id, entry.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const reading = portfolio.getPublicEntry(entry.id).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  await savePortfolioEntryUnlocked(platformRoot, { ...entry, visibility: "private", updatedAt: "2026-09-26T12:00:01.000Z" });
  release();
  assert.equal(await reading, null);
  await holder;
});

test("public portfolio lists re-check visibility after waiting for each entry lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-public-portfolio-list-lock-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => "2026-09-26T12:00:00.000Z" });
  const user = await users.createUser({ id: "public-list-lock-user", email: "public-list-lock@example.com", displayName: "Public List Lock", timezone: "Asia/Seoul" });
  const activity = createActivityService(platformRoot, { now: () => "2026-09-26T12:00:00.000Z" });
  const projects = createUserProjectService({ platformRoot, projectModelRoot: join(root, "projects"), projectHarnessRoot: join(root, "runs"), iseolRoot: root });
  const portfolio = createPortfolioService(platformRoot, { activityService: activity, userProjectService: projects, now: () => "2026-09-26T12:00:00.000Z" });
  const principal = { userId: user.id, sessionId: "session", roles: ["user"] as const };
  const event = await activity.recordActivityEvent(principal, { sourceType: "learning", sourceId: "public-list-lock-session", eventType: "study.completed", eventVersion: 1, actorType: "user", verificationStatus: "verified" });
  const entry = await portfolio.createEntry(principal, { title: "잠금 목록 기록", summary: "공개 목록 경쟁조건을 검증합니다.", visibility: "public", evidenceIds: [`activity:${event.id}`] });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurablePortfolioEntryLock(platformRoot, user.id, entry.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const reading = portfolio.listPublicEntries(user.id).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  await savePortfolioEntryUnlocked(platformRoot, { ...entry, visibility: "private", updatedAt: "2026-09-26T12:00:01.000Z" });
  release();
  assert.deepEqual(await reading, []);
  await holder;
});

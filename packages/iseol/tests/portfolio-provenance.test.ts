import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createActivityService } from "../src/activity/service.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { createUserProjectService } from "../src/project-model/user-project-service.js";
import type { UserProjectService } from "../src/project-model/user-project-service.js";
import { createPortfolioService } from "../src/portfolio/service.js";
import { withDurablePortfolioEntryLock } from "../src/portfolio/entry-lock.js";
import { savePortfolioEntryUnlocked } from "../src/portfolio/store.js";

const at = "2026-09-25T12:00:00.000Z";
const principal = (userId: string): Principal => ({ userId, sessionId: `${userId}-session`, roles: ["user"] });

test("portfolio is built only from verified, user-scoped evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-portfolio-provenance-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  await users.createUser({ id: "portfolio-a", email: "portfolio-a@example.com", displayName: "Portfolio A", timezone: "Asia/Seoul" });
  await users.createUser({ id: "portfolio-b", email: "portfolio-b@example.com", displayName: "Portfolio B", timezone: "Asia/Seoul" });
  const activity = createActivityService(platformRoot, { now: () => at });
  const projects = createUserProjectService({ platformRoot, projectModelRoot: join(root, "projects"), projectHarnessRoot: join(root, "runs"), iseolRoot: root });
  const portfolio = createPortfolioService(platformRoot, { activityService: activity, userProjectService: projects, now: () => at });

  const verified = await activity.recordActivityEvent(principal("portfolio-a"), {
    sourceType: "learning",
    sourceId: "session-1",
    eventType: "study.completed",
    eventVersion: 1,
    actorType: "user",
    verificationStatus: "verified",
    payload: { topic: "TypeScript" },
  });
  await activity.recordActivityEvent(principal("portfolio-a"), {
    sourceType: "learning",
    sourceId: "session-2",
    eventType: "study.note",
    eventVersion: 1,
    actorType: "user",
    verificationStatus: "unverified",
  });
  await activity.recordActivityEvent(principal("portfolio-b"), {
    sourceType: "learning",
    sourceId: "session-foreign",
    eventType: "study.completed",
    eventVersion: 1,
    actorType: "user",
    verificationStatus: "verified",
  });

  const snapshot = await portfolio.listPortfolio(principal("portfolio-a"));
  assert.equal(snapshot.evidence.length, 2);
  assert.equal(snapshot.evidence.find((item) => item.id === `activity:${verified.id}`)?.verificationStatus, "verified");
  const verifiedEvidenceId = `activity:${verified.id}`;
  const entry = await portfolio.createEntry(principal("portfolio-a"), {
    title: "TypeScript 학습 기록",
    summary: "실제 학습 세션을 완료하고 핵심 개념을 정리했다.",
    visibility: "private",
    evidenceIds: [verifiedEvidenceId],
  });
  assert.deepEqual(entry.evidenceIds, [verifiedEvidenceId]);
  await assert.rejects(() => portfolio.createEntry(principal("portfolio-a"), {
    title: "검증 실패 기록",
    summary: "검증되지 않은 활동은 포트폴리오 근거가 될 수 없다.",
    visibility: "private",
    evidenceIds: ["missing-evidence"],
  }), /verified evidence/i);
  assert.equal((await portfolio.listPortfolio(principal("portfolio-b"))).entries.length, 0);
  const exported = await portfolio.exportPortfolio(principal("portfolio-a"), "markdown");
  assert.match(exported.content, /TypeScript 학습 기록/);
  assert.match(exported.content, /실제 학습 세션/);
  const publicEntry = await portfolio.createEntry(principal("portfolio-a"), {
    title: "공개 성장 기록",
    summary: "공개 가능한 검증 활동을 공유한다.",
    visibility: "public",
    evidenceIds: [verifiedEvidenceId],
  });
  const publicView = await portfolio.getPublicEntry(publicEntry.id);
  assert.equal(publicView?.entry.id, publicEntry.id);
  assert.equal(publicView?.evidence.length, 1);
  assert.equal(await portfolio.getPublicEntry(entry.id), null);
});

test("project provenance is available to the owner but is not exposed by public portfolio views", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-portfolio-project-provenance-"));
  const projectService = {
    async listProjects() { return [{ id: "project-owner-only", name: "Owner project" }]; },
    async getProject() {
      return { evidence: [{ id: "project-evidence-1", provider: "local-runtime", summary: "Runtime artifact api_key=project-evidence-secret", recordedAt: at }] };
    },
  } as unknown as UserProjectService;
  const activity = createActivityService(join(root, "platform"), { now: () => at });
  const portfolio = createPortfolioService(join(root, "platform"), { activityService: activity, userProjectService: projectService, now: () => at });
  const owner = principal("project-provenance-owner");

  const snapshot = await portfolio.listPortfolio(owner);
  const evidence = snapshot.evidence.find((item) => item.sourceType === "project-evidence");
  assert.equal(evidence?.projectId, "project-owner-only");
  assert.equal(evidence?.id, "project-evidence:project-owner-only:project-evidence-1");

  const entry = await portfolio.createEntry(owner, {
    title: "Runtime artifact api_key=portfolio-title-secret",
    summary: "Public Bearer portfolio-entry-token project artifact.",
    visibility: "public",
    evidenceIds: [evidence!.id],
  });
  const publicEntries = await portfolio.listPublicEntries(owner.userId);
  assert.equal(publicEntries[0]?.title.includes("portfolio-title-secret"), false);
  assert.equal(publicEntries[0]?.summary.includes("portfolio-entry-token"), false);
  const publicView = await portfolio.getPublicEntry(entry.id);
  assert.equal(publicView?.evidence.length, 1);
  assert.equal("projectId" in (publicView?.evidence[0] ?? {}), false);
  assert.equal(publicView?.entry.title.includes("portfolio-title-secret"), false);
  assert.equal(publicView?.entry.summary.includes("portfolio-entry-token"), false);
  assert.equal(publicView?.evidence[0]?.summary.includes("project-evidence-secret"), false);
});

test("portfolio entry mutations across service instances preserve both patches", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-portfolio-concurrent-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  const owner = principal("portfolio-concurrent-owner");
  await users.createUser({ id: owner.userId, email: "portfolio-concurrent@example.com", displayName: "Concurrent Portfolio", timezone: "Asia/Seoul" });
  const activity = createActivityService(platformRoot, { now: () => at });
  const projects = createUserProjectService({ platformRoot, projectModelRoot: join(root, "projects"), projectHarnessRoot: join(root, "runs"), iseolRoot: root });
  const firstService = createPortfolioService(platformRoot, { activityService: activity, userProjectService: projects, now: () => at });
  const secondService = createPortfolioService(platformRoot, { activityService: activity, userProjectService: projects, now: () => "2026-09-25T12:00:01.000Z" });
  const evidence = await activity.recordActivityEvent(owner, { sourceType: "learning", sourceId: "portfolio-concurrent", eventType: "study.completed", eventVersion: 1, actorType: "user", verificationStatus: "verified" });
  const entry = await firstService.createEntry(owner, { title: "초기 포트폴리오", summary: "동시 수정 테스트를 위한 초기 항목입니다.", visibility: "private", evidenceIds: [`activity:${evidence.id}`] });

  const results = await Promise.all([
    firstService.updateEntry(owner, entry.id, { title: "제목 수정 포트폴리오" }),
    secondService.updateEntry(owner, entry.id, { visibility: "public" }),
  ]);

  assert.equal(results.length, 2);
  const stored = (await firstService.listPortfolio(owner)).entries.find((item) => item.id === entry.id);
  assert.equal(stored?.title, "제목 수정 포트폴리오");
  assert.equal(stored?.visibility, "public");
});

test("owner portfolio snapshots re-check entries after waiting for the entry lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-portfolio-snapshot-lock-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  const owner = principal("portfolio-snapshot-lock-owner");
  await users.createUser({ id: owner.userId, email: "portfolio-snapshot-lock@example.com", displayName: "Snapshot Lock", timezone: "Asia/Seoul" });
  const activity = createActivityService(platformRoot, { now: () => at });
  const projects = createUserProjectService({ platformRoot, projectModelRoot: join(root, "projects"), projectHarnessRoot: join(root, "runs"), iseolRoot: root });
  const portfolio = createPortfolioService(platformRoot, { activityService: activity, userProjectService: projects, now: () => at });
  const evidence = await activity.recordActivityEvent(owner, { sourceType: "learning", sourceId: "portfolio-snapshot-lock", eventType: "study.completed", eventVersion: 1, actorType: "user", verificationStatus: "verified" });
  const entry = await portfolio.createEntry(owner, { title: "잠금 전 제목", summary: "소유자 스냅샷 경쟁조건을 검증합니다.", visibility: "private", evidenceIds: [`activity:${evidence.id}`] });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurablePortfolioEntryLock(platformRoot, owner.userId, entry.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const reading = portfolio.listPortfolio(owner).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  await savePortfolioEntryUnlocked(platformRoot, { ...entry, title: "잠금 후 제목", updatedAt: "2026-09-25T12:00:01.000Z" });
  release();
  assert.equal((await reading).entries.find((item) => item.id === entry.id)?.title, "잠금 후 제목");
  await holder;
});

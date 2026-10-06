import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createActivityService } from "../src/activity/service.js";
import { loadHarnessRun, saveHarnessRun } from "../src/harness/run-store.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { createPortfolioService } from "../src/portfolio/service.js";
import { createUserProjectService } from "../src/project-model/user-project-service.js";

const at = "2026-09-26T12:00:00.000Z";
const principal = (userId: string): Principal => ({ userId, sessionId: `${userId}-session`, roles: ["user"] });

test("portfolio preserves distinct user and AI actors for verified evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-portfolio-actors-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  const owner = await users.createUser({ id: "portfolio-actors-owner", email: "portfolio-actors@example.com", displayName: "Actors", timezone: "Asia/Seoul" });
  const ownerPrincipal = principal(owner.id);
  const activity = createActivityService(platformRoot, { now: () => at });
  const projects = createUserProjectService({ platformRoot, projectModelRoot: join(root, "projects"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, now: () => at });
  const portfolio = createPortfolioService(platformRoot, { activityService: activity, userProjectService: projects, now: () => at });

  const userEvent = await activity.recordActivityEvent(ownerPrincipal, {
    sourceType: "learning",
    sourceId: "actor-session-1",
    eventType: "study.completed",
    eventVersion: 1,
    actorType: "user",
    verificationStatus: "verified",
  });
  const project = await projects.createProject(ownerPrincipal, { name: "AI 협업 프로젝트", objective: "Runtime 증거의 기여자를 구분한다", purpose: "rapid-prototype", teamMode: "ai" });
  const work = await projects.createWorkRequest(ownerPrincipal, project.id, { title: "검증 실행", objective: "Agent가 생성한 검증 증거를 연결한다", idempotencyKey: "actor-run-1" });
  const started = await projects.startProjectRun(ownerPrincipal, project.id, { workRequestId: work.request.id, runId: "actor-run-1" }, async () => "accepted");
  assert.equal(started.status, "started");
  const run = await loadHarnessRun(join(root, "runs"), "actor-run-1");
  assert.ok(run);
  await saveHarnessRun(join(root, "runs"), {
    ...run,
    evidence: [{ version: 1, id: "ai-test", kind: "test", stage: "TEST", recordedAt: at, summary: "Agent가 실행한 검증", provider: "iseol-desktop-agent", projectId: project.id, runId: "actor-run-1" }],
  });

  const snapshot = await portfolio.listPortfolio(ownerPrincipal);
  const userEvidence = snapshot.evidence.find((item) => item.id === `activity:${userEvent.id}`);
  const aiEvidence = snapshot.evidence.find((item) => item.id === `project-evidence:${project.id}:ai-test`);
  assert.equal(userEvidence?.actorType, "user");
  assert.equal(userEvidence?.verificationStatus, "verified");
  assert.equal(aiEvidence?.actorType, "ai");
  assert.equal(aiEvidence?.provider, "iseol-desktop-agent");
  assert.equal(aiEvidence?.verificationStatus, "verified");

  const entry = await portfolio.createEntry(ownerPrincipal, {
    title: "사용자와 AI의 협업 기록",
    summary: "사용자 학습과 Agent 검증 실행을 서로 다른 근거로 기록한다.",
    visibility: "private",
    evidenceIds: [userEvidence!.id, aiEvidence!.id],
  });
  const exported = await portfolio.exportPortfolio(ownerPrincipal, "markdown");
  assert.equal(entry.evidenceIds.length, 2);
  assert.match(exported.content, /user, verified/);
  assert.match(exported.content, /ai, verified/);
});

import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createActivityService } from "../src/activity/service.js";
import { createGrowthService } from "../src/growth/read-model.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { createUserProjectService } from "../src/project-model/user-project-service.js";
import { createPortfolioService } from "../src/portfolio/service.js";
import { createSettingsService } from "../src/settings/service.js";
import { createSocialService } from "../src/social/service.js";

const at = "2026-09-27T17:00:00.000Z";
const principal = (userId: string): Principal => ({ userId, sessionId: `${userId}-session`, roles: ["user"] });

test("public profile lists only public portfolio entries and never copies evidence ids", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-public-profile-portfolio-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  await users.createUser({ id: "portfolio-owner", email: "portfolio-owner@example.com", displayName: "Portfolio Owner", timezone: "Asia/Seoul" });
  await users.createUser({ id: "portfolio-viewer", email: "portfolio-viewer@example.com", displayName: "Portfolio Viewer", timezone: "Asia/Seoul" });
  const activity = createActivityService(platformRoot, { now: () => at });
  const growth = createGrowthService(platformRoot, { now: () => at });
  const projects = createUserProjectService({ platformRoot, projectModelRoot: join(root, "model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, now: () => at });
  const portfolio = createPortfolioService(platformRoot, { activityService: activity, userProjectService: projects, now: () => at });
  const settings = createSettingsService(platformRoot, { now: () => at });
  const social = createSocialService(platformRoot, { platformUserService: users, settingsService: settings, growthService: growth, userProjectService: projects, portfolioService: portfolio, now: () => at });
  const event = await activity.recordActivityEvent(principal("portfolio-owner"), { sourceType: "learning", sourceId: "public-learning", eventType: "learning.session.completed", eventVersion: 1, actorType: "user", verificationStatus: "verified" });
  const publicEntry = await portfolio.createEntry(principal("portfolio-owner"), { title: "공개 성과", summary: "검증된 학습 성과입니다.", visibility: "public", evidenceIds: [`activity:${event.id}`] });
  await portfolio.createEntry(principal("portfolio-owner"), { title: "링크 전용 성과", summary: "직접 링크로만 보는 성과입니다.", visibility: "unlisted", evidenceIds: [`activity:${event.id}`] });
  await portfolio.createEntry(principal("portfolio-owner"), { title: "비공개 성과", summary: "소유자 전용 성과입니다.", visibility: "private", evidenceIds: [`activity:${event.id}`] });

  const profile = await social.getProfile(principal("portfolio-viewer"), "portfolio-owner");
  assert.ok(profile);
  assert.deepEqual(profile.publicPortfolio, [{ id: publicEntry.id, title: "공개 성과", summary: "검증된 학습 성과입니다.", updatedAt: at }]);
  assert.equal("evidenceIds" in (profile.publicPortfolio?.[0] ?? {}), false);
  assert.equal("userId" in (profile.publicPortfolio?.[0] ?? {}), false);
});

test("public portfolio projection does not depend on privacy settings service availability", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-public-profile-portfolio-no-settings-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  await users.createUser({ id: "portfolio-owner-no-settings", email: "portfolio-owner-no-settings@example.com", displayName: "Portfolio Owner", timezone: "Asia/Seoul" });
  await users.createUser({ id: "portfolio-viewer-no-settings", email: "portfolio-viewer-no-settings@example.com", displayName: "Portfolio Viewer", timezone: "Asia/Seoul" });
  const activity = createActivityService(platformRoot, { now: () => at });
  const growth = createGrowthService(platformRoot, { now: () => at });
  const projects = createUserProjectService({ platformRoot, projectModelRoot: join(root, "model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, now: () => at });
  const portfolio = createPortfolioService(platformRoot, { activityService: activity, userProjectService: projects, now: () => at });
  const social = createSocialService(platformRoot, { platformUserService: users, growthService: growth, userProjectService: projects, portfolioService: portfolio, now: () => at });
  const publicEntry = await portfolio.createEntry(principal("portfolio-owner-no-settings"), { title: "설정 없는 공개 성과", summary: "설정 서비스가 없어도 공개 ACL을 따릅니다.", visibility: "public", evidenceIds: [] });

  const profile = await social.getProfile(principal("portfolio-viewer-no-settings"), "portfolio-owner-no-settings");
  assert.ok(profile);
  assert.deepEqual(profile.publicPortfolio, [{ id: publicEntry.id, title: "설정 없는 공개 성과", summary: "설정 서비스가 없어도 공개 ACL을 따릅니다.", updatedAt: at }]);
  assert.equal("publicGrowth" in profile, false);
  assert.equal("publicProjects" in profile, false);
  assert.equal("publicLearning" in profile, false);
});

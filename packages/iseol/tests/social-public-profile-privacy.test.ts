import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createGrowthService } from "../src/growth/read-model.js";
import { createLearningService } from "../src/learning/service.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { createUserProjectService } from "../src/project-model/user-project-service.js";
import { createSettingsService } from "../src/settings/service.js";
import { createSocialService } from "../src/social/service.js";

const at = "2026-09-27T16:00:00.000Z";
const principal = (userId: string): Principal => ({ userId, sessionId: `${userId}-session`, roles: ["user"] });

test("public profile privacy settings gate bounded growth, project, and learning summaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-public-profile-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  await users.createUser({ id: "profile-owner", email: "profile-owner@example.com", displayName: "Profile Owner", timezone: "Asia/Seoul" });
  await users.createUser({ id: "profile-viewer", email: "profile-viewer@example.com", displayName: "Profile Viewer", timezone: "Asia/Seoul" });
  const settings = createSettingsService(platformRoot, { now: () => at });
  const growth = createGrowthService(platformRoot, { now: () => at });
  const projects = createUserProjectService({ platformRoot, projectModelRoot: join(root, "model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, now: () => at });
  const learning = createLearningService(platformRoot, { now: () => at, userProjectService: projects, growthService: growth });
  const social = createSocialService(platformRoot, { platformUserService: users, settingsService: settings, growthService: growth, userProjectService: projects, learningService: learning, now: () => at });

  await social.updateProfile(principal("profile-owner"), { handle: "profile-owner", bio: "public bio", skills: ["TypeScript"] });
  await projects.createProject(principal("profile-owner"), { name: "Public project", objective: "Build a durable product", purpose: "portfolio", teamMode: "solo" });
  await learning.createLearningGoal(principal("profile-owner"), { subjectText: "TypeScript fundamentals", duration: { days: 7 }, dailyMinutes: 30 });
  await settings.updateSettings(principal("profile-owner"), { privacy: { growthInfo: true, projectList: true, learningHistory: true } });

  const visible = await social.getProfile(principal("profile-viewer"), "profile-owner");
  assert.ok(visible);
  assert.equal(visible.publicGrowth?.level, 1);
  assert.equal(visible.publicProjects?.[0]?.name, "Public project");
  assert.equal(visible.publicLearning?.goals[0]?.subject, "TypeScript fundamentals");
  assert.equal("id" in (visible.publicProjects?.[0] ?? {}), false);
  assert.equal("workspaceRoot" in (visible.publicProjects?.[0] ?? {}), false);
  assert.equal("id" in (visible.publicLearning?.goals[0] ?? {}), false);
  assert.equal("evidenceEventIds" in (visible.publicGrowth ?? {}), false);

  await settings.updateSettings(principal("profile-owner"), { privacy: { growthInfo: false, projectList: false, learningHistory: false } });
  const hidden = await social.getProfile(principal("profile-viewer"), "profile-owner");
  assert.ok(hidden);
  assert.equal("publicGrowth" in hidden, false);
  assert.equal("publicProjects" in hidden, false);
  assert.equal("publicLearning" in hidden, false);

  await social.updateProfile(principal("profile-owner"), { visibility: "private" });
  assert.equal(await social.getProfile(principal("profile-viewer"), "profile-owner"), null);
});

test("social profile mutations across service instances preserve both patches", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-social-profile-concurrent-"));
  const users = createPlatformUserService(root, { now: () => at });
  await users.createUser({ id: "social-concurrent", email: "social-concurrent@example.com", displayName: "Concurrent Profile", timezone: "Asia/Seoul" });
  const firstService = createSocialService(root, { platformUserService: users, now: () => at });
  const secondService = createSocialService(root, { platformUserService: users, now: () => "2026-09-27T16:00:01.000Z" });
  const owner = principal("social-concurrent");

  await Promise.all([
    firstService.updateProfile(owner, { bio: "durable bio" }),
    secondService.updateProfile(owner, { skills: ["TypeScript"] }),
  ]);

  const persisted = await createSocialService(root, { platformUserService: users }).getProfile(owner);
  assert.equal(persisted?.bio, "durable bio");
  assert.deepEqual(persisted?.skills, ["TypeScript"]);
});

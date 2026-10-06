import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createActivityService } from "../src/activity/service.js";
import { createAiChatService } from "../src/ai-chat/service.js";
import { createCommunityService } from "../src/community/service.js";
import { createGrowthService } from "../src/growth/read-model.js";
import { createLearningService } from "../src/learning/service.js";
import { createMemoryService } from "../src/memory/service.js";
import { createPersonalWorldService } from "../src/personal-world/service.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { createPortfolioService } from "../src/portfolio/service.js";
import { createRecruitmentService } from "../src/recruitment/service.js";
import { createSettingsService } from "../src/settings/service.js";
import { createSocialService } from "../src/social/service.js";
import { createTeamService } from "../src/teams/service.js";
import { createUserProjectService } from "../src/project-model/user-project-service.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

type Json = Record<string, any> | any[];

async function requestJson<T extends Json | undefined>(baseUrl: string, path: string, init: RequestInit = {}): Promise<{ response: Response; body: T }> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = response.status === 204 ? undefined : await response.json() as T;
  return { response, body };
}

function jsonHeaders(token?: string): Record<string, string> {
  return {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    "content-type": "application/json",
  };
}

test("ISEOL user journey crosses durable domains without leaking user data", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-journey-e2e-"));
  const platformRoot = join(root, "platform");
  const now = () => "2026-09-26T12:00:00.000Z";
  const activityService = createActivityService(platformRoot, { now });
  const growthService = createGrowthService(platformRoot, { now });
  const userService = createPlatformUserService(platformRoot, { now });
  const memoryService = createMemoryService(platformRoot, { now });
  const teamService = createTeamService(platformRoot, { now, activityService });
  const userProjectService = createUserProjectService({
    platformRoot,
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    now,
    canAccessTeam: (principal, teamId) => teamService.canAccess(principal, teamId),
    canAccessTeamWithinMembershipLock: (principal, teamId) => teamService.canAccessWithinMembershipLock(principal, teamId),
    activityService,
  });
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1",
    port: 0,
    token: "isolated-e2e-operator",
    modelRoot: join(root, "model"),
    harnessRoot: join(root, "harness"),
    webRoot: join(root, "web"),
    userService,
    personalWorldService: createPersonalWorldService(platformRoot, { now }),
    memoryService,
    activityService,
    growthService,
    learningService: createLearningService(platformRoot, { now, activityService, growthService }),
    userProjectService,
    teamService,
    socialService: createSocialService(platformRoot, { platformUserService: userService, canCollaborate: teamService.canCollaborate, activityService, now }),
    recruitmentService: createRecruitmentService(platformRoot, { teamService, activityService, now }),
    portfolioService: createPortfolioService(platformRoot, { activityService, userProjectService, now }),
    communityService: createCommunityService(platformRoot, { platformUserService: userService, now }),
    settingsService: createSettingsService(platformRoot, { now }),
    aiChatService: createAiChatService(platformRoot, { memoryService, now }),
  });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const signedUpA = await requestJson<{ user: { id: string }; session: { token: string } }>(baseUrl, "/api/user/signup", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ email: "journey-a@example.com", displayName: "Journey A", timezone: "Asia/Seoul", password: "journey-password-a" }),
    });
    assert.equal(signedUpA.response.status, 201);
    const signedUpB = await requestJson<{ user: { id: string }; session: { token: string } }>(baseUrl, "/api/user/signup", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ email: "journey-b@example.com", displayName: "Journey B", timezone: "Asia/Seoul", password: "journey-password-b" }),
    });
    assert.equal(signedUpB.response.status, 201);
    const tokenA = signedUpA.body.session.token;
    const tokenB = signedUpB.body.session.token;

    const me = await requestJson<{ user: { id: string; email: string } }>(baseUrl, "/api/user/me", { headers: jsonHeaders(tokenA) });
    assert.equal(me.response.status, 200);
    assert.equal(me.body.user.email, "journey-a@example.com");

    const updatedProfile = await requestJson<{ profile: { userId: string; handle: string; bio: string; visibility: string } }>(baseUrl, "/api/user/social/profile", {
      method: "PUT",
      headers: jsonHeaders(tokenA),
      body: JSON.stringify({ handle: "journey-a", bio: "Learning and building in ISEOL.", skills: ["TypeScript", "testing"], visibility: "public" }),
    });
    assert.equal(updatedProfile.response.status, 200);
    assert.equal(updatedProfile.body.profile.userId, signedUpA.body.user.id);
    assert.equal(updatedProfile.body.profile.handle, "journey-a");
    const profileForB = await requestJson<{ profile: { handle: string; skills: string[] } | null }>(baseUrl, `/api/user/social/profile?userId=${encodeURIComponent(signedUpA.body.user.id)}`, { headers: jsonHeaders(tokenB) });
    assert.equal(profileForB.response.status, 200);
    assert.equal(profileForB.body.profile?.handle, "journey-a");
    assert.deepEqual(profileForB.body.profile?.skills, ["TypeScript", "testing"]);
    const privateProfile = await requestJson<{ profile: { visibility: string } }>(baseUrl, "/api/user/social/profile", {
      method: "PUT",
      headers: jsonHeaders(tokenA),
      body: JSON.stringify({ visibility: "private" }),
    });
    assert.equal(privateProfile.response.status, 200);
    const hiddenProfileForB = await requestJson<{ profile: null }>(baseUrl, `/api/user/social/profile?userId=${encodeURIComponent(signedUpA.body.user.id)}`, { headers: jsonHeaders(tokenB) });
    assert.equal(hiddenProfileForB.response.status, 200);
    assert.equal(hiddenProfileForB.body.profile, null);
    await requestJson(baseUrl, "/api/user/social/profile", { method: "PUT", headers: jsonHeaders(tokenA), body: JSON.stringify({ visibility: "public" }) });

    const world = await requestJson<{ world: { displayName: string; onboardingCompleted: boolean } }>(baseUrl, "/api/user/world", {
      method: "PUT",
      headers: jsonHeaders(tokenA),
      body: JSON.stringify({ displayName: "성장하는 개발자", handle: "journey_a", character: "b", interests: ["TypeScript"], activities: ["learning", "project"], onboardingCompleted: true }),
    });
    assert.equal(world.response.status, 200);
    assert.equal(world.body.world.displayName, "성장하는 개발자");
    assert.equal(world.body.world.onboardingCompleted, true);

    const memory = await requestJson<{ memory: { id: string } }>(baseUrl, "/api/user/memory", {
      method: "POST",
      headers: jsonHeaders(tokenA),
      body: JSON.stringify({ kind: "learning-note", content: "개인 학습 맥락", source: "journey-e2e" }),
    });
    assert.equal(memory.response.status, 201);
    const foreignMemory = await requestJson<{ memories: unknown[] }>(baseUrl, "/api/user/memory", { headers: jsonHeaders(tokenB) });
    assert.equal(foreignMemory.response.status, 200);
    assert.deepEqual(foreignMemory.body.memories, []);

    const plan = await requestJson<{ plan: { id: string } }>(baseUrl, "/api/user/learning/plans", {
      method: "POST",
      headers: jsonHeaders(tokenA),
      body: JSON.stringify({ title: "타입 시스템 학습", description: "실제 코드로 타입을 익힙니다.", goals: ["제네릭 이해", "타입 안전한 API 작성"] }),
    });
    assert.equal(plan.response.status, 201);
    const learningSession = await requestJson<{ session: { id: string } }>(baseUrl, "/api/user/learning/sessions", {
      method: "POST",
      headers: jsonHeaders(tokenA),
      body: JSON.stringify({ planId: plan.body.plan.id }),
    });
    assert.equal(learningSession.response.status, 201);
    const attempt = await requestJson<{ attempt: { correct?: boolean } }>(baseUrl, "/api/user/learning/attempts", {
      method: "POST",
      headers: jsonHeaders(tokenA),
      body: JSON.stringify({ sessionId: learningSession.body.session.id, questionId: "generic-1", answer: "T", correct: true }),
    });
    assert.equal(attempt.response.status, 201);
    assert.equal(attempt.body.attempt.correct, true);
    const analysis = await requestJson<{ result: { provider: string } }>(baseUrl, "/api/user/learning/analyze", {
      method: "POST",
      headers: jsonHeaders(tokenA),
      body: JSON.stringify({ sourceType: "learning-session", sourceId: learningSession.body.session.id, language: "typescript", code: "const value: unknown = 1;" }),
    });
    assert.equal(analysis.response.status, 201);
    assert.equal(analysis.body.result.provider, "local-static");
    const completedLearning = await requestJson<{ session: { status: string } }>(baseUrl, `/api/user/learning/sessions/${learningSession.body.session.id}/complete`, {
      method: "POST",
      headers: jsonHeaders(tokenA),
      body: "{}",
    });
    assert.equal(completedLearning.response.status, 200);
    assert.equal(completedLearning.body.session.status, "completed");

    const project = await requestJson<{ project: { id: string; teamMode: string } }>(baseUrl, "/api/user/projects", {
      method: "POST",
      headers: jsonHeaders(tokenA),
      body: JSON.stringify({ name: "학습 기록 프로젝트", objective: "학습 활동을 실제 결과로 연결", purpose: "rapid-prototype", teamMode: "solo" }),
    });
    assert.equal(project.response.status, 201);
    const foreignProject = await requestJson<{ error: string }>(baseUrl, `/api/user/projects/${project.body.project.id}`, { headers: jsonHeaders(tokenB) });
    assert.equal(foreignProject.response.status, 404);
    const workRequest = await requestJson<{ request: { id: string } }>(baseUrl, `/api/user/projects/${project.body.project.id}/work-requests`, {
      method: "POST",
      headers: jsonHeaders(tokenA),
      body: JSON.stringify({ title: "학습 기록 모델 연결", objective: "세션과 프로젝트의 증거를 연결", idempotencyKey: "journey-work-1" }),
    });
    assert.equal(workRequest.response.status, 201);
    const waitingRun = await requestJson<{ blocker: string }>(baseUrl, `/api/user/projects/${project.body.project.id}/runs`, {
      method: "POST",
      headers: jsonHeaders(tokenA),
      body: JSON.stringify({ workRequestId: workRequest.body.request.id, runId: "journey-run-1" }),
    });
    assert.equal(waitingRun.response.status, 409);
    assert.equal(waitingRun.body.blocker, "Project Runtime is not configured");

    const team = await requestJson<{ team: { id: string } }>(baseUrl, "/api/user/teams", {
      method: "POST",
      headers: jsonHeaders(tokenA),
      body: JSON.stringify({ name: "학습 프로젝트 팀", description: "학습과 개발을 함께 검증", kind: "project", visibility: "private", capacity: 3 }),
    });
    assert.equal(team.response.status, 201);
    const transitioned = await requestJson<{ project: { teamMode: string; teamId?: string } }>(baseUrl, `/api/user/projects/${project.body.project.id}/team`, {
      method: "PATCH",
      headers: jsonHeaders(tokenA),
      body: JSON.stringify({ teamMode: "human", teamId: team.body.team.id }),
    });
    assert.equal(transitioned.response.status, 200);
    assert.equal(transitioned.body.project.teamMode, "human");
    assert.equal(transitioned.body.project.teamId, team.body.team.id);
    const teamView = await requestJson<{ members: Array<{ userId: string }> }>(baseUrl, `/api/user/teams/${team.body.team.id}`, { headers: jsonHeaders(tokenA) });
    assert.equal(teamView.response.status, 200);
    assert.equal(teamView.body.members.some((member) => member.userId === signedUpA.body.user.id), true);

    const communityPost = await requestJson<{ post: { id: string } }>(baseUrl, "/api/user/community", {
      method: "POST",
      headers: jsonHeaders(tokenA),
      body: JSON.stringify({ category: "프로젝트 공유", title: "검증 가능한 학습 기록", content: "학습에서 프로젝트까지 연결했습니다.", tags: ["learning", "project"] }),
    });
    assert.equal(communityPost.response.status, 201);
    const communityForB = await requestJson<{ posts: Array<{ id: string }> }>(baseUrl, "/api/user/community", { headers: jsonHeaders(tokenB) });
    assert.equal(communityForB.response.status, 200);
    assert.equal(communityForB.body.posts.some((post) => post.id === communityPost.body.post.id), true);
    const like = await requestJson<{ liked: boolean }>(baseUrl, `/api/user/community/${communityPost.body.post.id}/like`, { method: "POST", headers: jsonHeaders(tokenB) });
    assert.equal(like.response.status, 200);
    assert.equal(like.body.liked, true);
    const communityComment = await requestJson<{ comment: { content: string; author: { userId: string } } }>(baseUrl, `/api/user/community/${communityPost.body.post.id}/comments`, {
      method: "POST",
      headers: jsonHeaders(tokenB),
      body: JSON.stringify({ content: "실제 사용자 댓글도 저장됩니다." }),
    });
    assert.equal(communityComment.response.status, 201);
    assert.equal(communityComment.body.comment.author.userId, signedUpB.body.user.id);
    const communityWithComment = await requestJson<{ posts: Array<{ id: string; comments: Array<{ content: string }> }> }>(baseUrl, "/api/user/community", { headers: jsonHeaders(tokenA) });
    assert.equal(communityWithComment.body.posts.find((post) => post.id === communityPost.body.post.id)?.comments[0]?.content, "실제 사용자 댓글도 저장됩니다.");

    const activityList = await requestJson<{ events: Array<{ id: string; sourceId: string; eventType: string; verificationStatus: string }> }>(baseUrl, "/api/user/activity", { headers: jsonHeaders(tokenA) });
    assert.equal(activityList.response.status, 200);
    const verifiedActivity = activityList.body.events.find((event) => event.sourceId === learningSession.body.session.id && event.eventType === "learning.session.completed");
    assert.ok(verifiedActivity);
    assert.equal(verifiedActivity.verificationStatus, "verified");
    const growth = await requestJson<{ xp: number; level: number }>(baseUrl, "/api/user/growth", { headers: jsonHeaders(tokenA) });
    assert.equal(growth.response.status, 200);
    assert.equal(growth.body.xp, 100);
    assert.equal(growth.body.level, 1);

    const portfolio = await requestJson<{ entry: { id: string; visibility: string } }>(baseUrl, "/api/user/portfolio", {
      method: "POST",
      headers: jsonHeaders(tokenA),
      body: JSON.stringify({ title: "학습에서 프로젝트로", summary: "검증된 학습 활동을 프로젝트 증거로 연결한 기록입니다.", visibility: "public", evidenceIds: [`activity:${verifiedActivity.id}`] }),
    });
    assert.equal(portfolio.response.status, 201);
    assert.equal(portfolio.body.entry.visibility, "public");
    const exported = await requestJson<{ format: string; content: string }>(baseUrl, "/api/user/portfolio/export?format=json", { headers: jsonHeaders(tokenA) });
    assert.equal(exported.response.status, 200);
    assert.equal(exported.body.format, "json");
    assert.match(exported.body.content, /학습에서 프로젝트로/);
    const publicPortfolio = await requestJson<{ entry: { id: string }; evidence: Array<{ verificationStatus: string }> }>(baseUrl, `/api/public/portfolio/${portfolio.body.entry.id}`);
    assert.equal(publicPortfolio.response.status, 200);
    assert.equal(publicPortfolio.body.entry.id, portfolio.body.entry.id);
    assert.equal(publicPortfolio.body.evidence.every((item) => item.verificationStatus === "verified"), true);

    const settings = await requestJson<{ settings: { notifications: { weekly: boolean } } }>(baseUrl, "/api/user/settings", { headers: jsonHeaders(tokenA) });
    assert.equal(settings.response.status, 200);
    assert.equal(settings.body.settings.notifications.weekly, false);
    const updatedSettings = await requestJson<{ settings: { notifications: { weekly: boolean } } }>(baseUrl, "/api/user/settings", {
      method: "PATCH",
      headers: jsonHeaders(tokenA),
      body: JSON.stringify({ notifications: { weekly: true } }),
    });
    assert.equal(updatedSettings.response.status, 200);
    assert.equal(updatedSettings.body.settings.notifications.weekly, true);

    const conversation = await requestJson<{ conversation: { id: string } }>(baseUrl, "/api/user/ai-chat/conversations", {
      method: "POST",
      headers: jsonHeaders(tokenA),
      body: JSON.stringify({ title: "학습 코치" }),
    });
    assert.equal(conversation.response.status, 201);
    const message = await requestJson<{ runtimeStatus: string }>(baseUrl, `/api/user/ai-chat/conversations/${conversation.body.conversation.id}/messages`, {
      method: "POST",
      headers: jsonHeaders(tokenA),
      body: JSON.stringify({ content: "이 학습 내용을 복습 질문으로 바꿔줘" }),
    });
    assert.equal(message.response.status, 201);
    assert.equal(message.body.runtimeStatus, "waiting_runtime");
    const foreignConversation = await requestJson<{ error: string }>(baseUrl, `/api/user/ai-chat/conversations/${conversation.body.conversation.id}`, { headers: jsonHeaders(tokenB) });
    assert.equal(foreignConversation.response.status, 404);

    const passwordChanged = await requestJson<{ passwordChanged: true }>(baseUrl, "/api/user/password", {
      method: "POST",
      headers: jsonHeaders(tokenB),
      body: JSON.stringify({ currentPassword: "journey-password-b", newPassword: "journey-password-b-new" }),
    });
    assert.equal(passwordChanged.response.status, 200);
    assert.deepEqual(passwordChanged.body, { passwordChanged: true });
    const revokedAfterPasswordChange = await requestJson<{ error: string }>(baseUrl, "/api/user/me", { headers: jsonHeaders(tokenB) });
    assert.equal(revokedAfterPasswordChange.response.status, 401);
    const reloginAfterPasswordChange = await requestJson<{ user: { email: string } }>(baseUrl, "/api/user/login", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ email: "journey-b@example.com", password: "journey-password-b-new" }),
    });
    assert.equal(reloginAfterPasswordChange.response.status, 200);
    assert.equal(reloginAfterPasswordChange.body.user.email, "journey-b@example.com");
  } finally {
    await server.closeForShutdown();
  }
});

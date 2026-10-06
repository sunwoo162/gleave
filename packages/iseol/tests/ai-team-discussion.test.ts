import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import type { Principal } from "../src/identity/contracts.js";
import { createTeamService } from "../src/teams/service.js";
import { withDurableTeamMembershipLock } from "../src/teams/membership-lock.js";
import { loadMembershipUnlocked, saveMembershipUnlocked } from "../src/teams/store.js";
import { createUserProjectService } from "../src/project-model/user-project-service.js";
import { createAiTeamDiscussionService } from "../src/ai-team/discussion-service.js";
import { withDurableAiTeamDiscussionLock } from "../src/ai-team/discussion-lock.js";
import { loadAiTeamDiscussion, saveAiTeamDiscussion, saveAiTeamDiscussionUnlocked } from "../src/ai-team/discussion-store.js";
import { createAiTeamProposalService } from "../src/ai-team/service.js";
import { createUserRuntimeDispatchGate } from "../src/runtime/user-runtime-dispatch-gate.js";

const at = "2026-09-27T14:00:00.000Z";
function principal(userId: string): Principal { return { userId, sessionId: `session-${userId}`, roles: ["user"] }; }

test("AI team technical discussions persist a bounded Runtime answer without creating work", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-team-discussion-"));
  const owner = principal("discussion-owner");
  const teams = createTeamService(join(root, "platform"), { now: () => at });
  const team = await teams.createTeam(owner, { name: "AI discussion team", description: "technical discussion", kind: "project", visibility: "private", capacity: 3 });
  await teams.addAiMember(owner, team.id, { agentId: "architect", assignmentRole: "architecture", capabilities: ["context.read", "discussion.propose"], approvalScope: "suggestion-only" }, at);
  const projects = createUserProjectService({ platformRoot: join(root, "platform"), projectModelRoot: join(root, "projects"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, canAccessTeam: (subject, teamId) => teams.canAccess(subject, teamId), canAccessTeamWithinMembershipLock: (subject, teamId) => teams.canAccessWithinMembershipLock(subject, teamId), now: () => at });
  const project = await projects.createProject(owner, { name: "Discussion project", objective: "keep AI technical reasoning reviewable", purpose: "rapid-prototype", teamMode: "mixed", teamId: team.id });
  const discussions = createAiTeamDiscussionService({ root: join(root, "ai-team"), teamService: teams, userProjectService: projects, now: () => at, dispatcher: async ({ question }) => ({ status: "completed", answer: `검토 결과: ${question}`, keyPoints: ["경계를 먼저 확인합니다."], alternatives: ["작게 나누어 검증합니다."], risks: ["실행 전 사람 검토가 필요합니다."] }) });

  const discussion = await discussions.requestDiscussion(owner, project.id, { agentId: "architect", requestId: "discussion-1", question: "API 경계를 어떻게 검증할까요?" });
  assert.equal(discussion.status, "completed");
  assert.equal(discussion.assignmentRole, "architecture");
  assert.equal(discussion.answer, "검토 결과: API 경계를 어떻게 검증할까요?");
  assert.equal((await projects.getProject(owner, project.id))?.workRequests.length, 0);
  const reloaded = createAiTeamDiscussionService({ root: join(root, "ai-team"), teamService: teams, userProjectService: projects, now: () => at });
  assert.equal((await reloaded.listDiscussions(owner, project.id))[0]?.id, discussion.id);
});

test("AI team discussion lists wait for each durable discussion lock before projecting state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-team-discussion-read-lock-"));
  const owner = principal("discussion-read-lock-owner");
  const teams = createTeamService(join(root, "platform"), { now: () => at });
  const team = await teams.createTeam(owner, { name: "Discussion read lock team", description: "read synchronization", kind: "project", visibility: "private", capacity: 3 });
  await teams.addAiMember(owner, team.id, { agentId: "architect", assignmentRole: "architecture", capabilities: ["discussion.propose"], approvalScope: "suggestion-only" }, at);
  const projects = createUserProjectService({ platformRoot: join(root, "platform"), projectModelRoot: join(root, "projects"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, canAccessTeam: (subject, teamId) => teams.canAccess(subject, teamId), canAccessTeamWithinMembershipLock: (subject, teamId) => teams.canAccessWithinMembershipLock(subject, teamId), now: () => at });
  const project = await projects.createProject(owner, { name: "Discussion read project", objective: "serialize discussion reads", purpose: "rapid-prototype", teamMode: "mixed", teamId: team.id });
  const discussions = createAiTeamDiscussionService({ root: join(root, "ai-team"), teamService: teams, userProjectService: projects, now: () => at, dispatcher: async () => ({ status: "completed" as const, answer: "기존 답변", keyPoints: [], alternatives: [], risks: [] }) });
  const discussion = await discussions.requestDiscussion(owner, project.id, { agentId: "architect", requestId: "discussion-read-lock", question: "기존 질문" });
  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableAiTeamDiscussionLock(join(root, "ai-team"), project.id, discussion.requestId, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let settled = false;
  const read = discussions.listDiscussions(owner, project.id).then((result) => { settled = true; return result; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  await saveAiTeamDiscussionUnlocked(join(root, "ai-team"), { ...discussion, question: "잠금 해제 후 질문", updatedAt: "2026-09-27T14:00:01.000Z" });
  releaseHolder();
  await lockHeld;
  assert.equal((await read)[0]?.question, "잠금 해제 후 질문");

  let releaseWriteHolder!: () => void;
  const writeHolderStarted = new Promise<void>((resolve) => {
    void withDurableAiTeamDiscussionLock(join(root, "ai-team"), project.id, discussion.requestId, async () => {
      resolve();
      await new Promise<void>((release) => { releaseWriteHolder = release; });
    });
  });
  await writeHolderStarted;
  let writeSettled = false;
  const writing = saveAiTeamDiscussion(join(root, "ai-team"), { ...discussion, question: "공개 저장 대기 후 질문", updatedAt: "2026-09-27T14:00:02.000Z" }).then(() => { writeSettled = true; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(writeSettled, false);
  releaseWriteHolder();
  await writing;

  let releaseReadHolder!: () => void;
  const readHolderStarted = new Promise<void>((resolve) => {
    void withDurableAiTeamDiscussionLock(join(root, "ai-team"), project.id, discussion.requestId, async () => {
      resolve();
      await new Promise<void>((release) => { releaseReadHolder = release; });
    });
  });
  await readHolderStarted;
  let directReadSettled = false;
  const directRead = loadAiTeamDiscussion(join(root, "ai-team"), project.id, discussion.id).then((value) => { directReadSettled = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(directReadSettled, false);
  releaseReadHolder();
  assert.equal((await directRead)?.question, "공개 저장 대기 후 질문");
});

test("AI team discussion without a local dispatcher stays durably waiting and membership is enforced", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-team-discussion-waiting-"));
  const owner = principal("discussion-waiting-owner");
  const outsider = principal("discussion-waiting-outsider");
  const teams = createTeamService(join(root, "platform"), { now: () => at });
  const team = await teams.createTeam(owner, { name: "Waiting discussion team", description: "waiting boundary", kind: "project", visibility: "public", capacity: 3 });
  await teams.addAiMember(owner, team.id, { agentId: "reviewer", assignmentRole: "review", capabilities: ["discussion.propose"], approvalScope: "suggestion-only" }, at);
  const projects = createUserProjectService({ platformRoot: join(root, "platform"), projectModelRoot: join(root, "projects"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, canAccessTeam: (subject, teamId) => teams.canAccess(subject, teamId), canAccessTeamWithinMembershipLock: (subject, teamId) => teams.canAccessWithinMembershipLock(subject, teamId), now: () => at });
  const project = await projects.createProject(owner, { name: "Waiting discussion project", objective: "preserve no-runtime state", purpose: "portfolio", teamMode: "mixed", teamId: team.id });
  const discussions = createAiTeamDiscussionService({ root: join(root, "ai-team"), teamService: teams, userProjectService: projects, now: () => at });

  const waiting = await discussions.requestDiscussion(owner, project.id, { agentId: "reviewer", requestId: "waiting-discussion-1", question: "무엇을 먼저 확인해야 하나요?" });
  assert.equal(waiting.status, "waiting-runtime");
  assert.match(waiting.blocker ?? "", /Runtime/i);
  assert.equal(waiting.answer, undefined);
  await assert.rejects(() => discussions.listDiscussions(outsider, project.id), /team member|access/i);
});

test("AI team discussion waiting blockers redact credential-shaped Runtime text", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-team-discussion-blocker-safety-"));
  const owner = principal("discussion-blocker-owner");
  const teams = createTeamService(join(root, "platform"), { now: () => at });
  const team = await teams.createTeam(owner, { name: "Discussion blocker safety team", description: "sanitize Runtime blockers", kind: "project", visibility: "private", capacity: 3 });
  await teams.addAiMember(owner, team.id, { agentId: "reviewer", assignmentRole: "review", capabilities: ["discussion.propose"], approvalScope: "suggestion-only" }, at);
  const projects = createUserProjectService({ platformRoot: join(root, "platform"), projectModelRoot: join(root, "projects"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, canAccessTeam: (subject, teamId) => teams.canAccess(subject, teamId), canAccessTeamWithinMembershipLock: (subject, teamId) => teams.canAccessWithinMembershipLock(subject, teamId), now: () => at });
  const project = await projects.createProject(owner, { name: "Discussion blocker safety project", objective: "redact Runtime failures", purpose: "portfolio", teamMode: "mixed", teamId: team.id });
  const secretText = "provider token=discussion-secret api_key=discussion-api-secret https://preview.example/?access_token=discussion-url-secret";
  let dispatchCount = 0;
  const discussions = createAiTeamDiscussionService({
    root: join(root, "ai-team"),
    teamService: teams,
    userProjectService: projects,
    now: () => at,
    dispatcher: async () => {
      dispatchCount += 1;
      if (dispatchCount === 1) return { status: "waiting" as const, blocker: secretText };
      throw new Error(secretText);
    },
  });

  for (const requestId of ["returned-blocker", "thrown-blocker"]) {
    const waiting = await discussions.requestDiscussion(owner, project.id, { agentId: "reviewer", requestId, question: "무엇을 먼저 확인해야 하나요?" });
    assert.equal(waiting.status, "waiting-runtime");
    assert.equal(waiting.blocker?.includes("discussion-secret"), false);
    assert.equal(waiting.blocker?.includes("discussion-api-secret"), false);
    assert.equal(waiting.blocker?.includes("discussion-url-secret"), false);
    assert.match(waiting.blocker ?? "", /\[redacted\]|\[redacted-url\]/i);
  }
});

test("AI team proposal and discussion dispatches share one per-user Runtime gate", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-team-shared-runtime-gate-"));
  const owner = principal("ai-team-shared-gate-owner");
  const teams = createTeamService(join(root, "platform"), { now: () => at });
  const team = await teams.createTeam(owner, { name: "Shared Runtime team", description: "one local Runtime boundary", kind: "project", visibility: "private", capacity: 4 });
  await teams.addAiMember(owner, team.id, { agentId: "architect", assignmentRole: "architecture", capabilities: ["context.read", "task.propose", "discussion.propose"], approvalScope: "suggestion-only" }, at);
  const projects = createUserProjectService({ platformRoot: join(root, "platform"), projectModelRoot: join(root, "projects"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, canAccessTeam: (subject, teamId) => teams.canAccess(subject, teamId), canAccessTeamWithinMembershipLock: (subject, teamId) => teams.canAccessWithinMembershipLock(subject, teamId), now: () => at });
  const project = await projects.createProject(owner, { name: "Shared Runtime project", objective: "serialize AI team work", purpose: "rapid-prototype", teamMode: "mixed", teamId: team.id });
  const sharedGate = createUserRuntimeDispatchGate();
  let active = 0;
  let maximumActive = 0;
  let dispatchCount = 0;
  let firstEntered: (() => void) | undefined;
  const firstEnteredPromise = new Promise<void>((resolve) => { firstEntered = resolve; });
  let releaseFirst: (() => void) | undefined;
  const firstReleasePromise = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const proposals = createAiTeamProposalService({ root: join(root, "ai-team"), teamService: teams, userProjectService: projects, now: () => at, dispatchForUser: sharedGate, dispatcher: async ({}) => {
    dispatchCount += 1;
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    if (dispatchCount === 1) firstEntered?.();
    await firstReleasePromise;
    active -= 1;
    return { status: "proposed" as const, draft: { title: "공용 게이트 제안", objective: "동시 실행을 막습니다.", acceptanceCriteria: ["한 번에 하나"], rationale: "로컬 Runtime 보호" } };
  } });
  const discussions = createAiTeamDiscussionService({ root: join(root, "ai-team"), teamService: teams, userProjectService: projects, now: () => at, dispatchForUser: sharedGate, dispatcher: async ({ question }) => {
    dispatchCount += 1;
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    active -= 1;
    return { status: "completed" as const, answer: `토론: ${question}`, keyPoints: ["권한 확인"], alternatives: [], risks: [] };
  } });

  const proposalRequest = proposals.requestProposal(owner, project.id, { agentId: "architect", requestId: "shared-proposal" });
  await firstEnteredPromise;
  const discussionRequest = discussions.requestDiscussion(owner, project.id, { agentId: "architect", requestId: "shared-discussion", question: "겹치나요?" });
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(dispatchCount, 1);
  assert.equal(maximumActive, 1);
  releaseFirst?.();
  const [proposal, discussion] = await Promise.all([proposalRequest, discussionRequest]);
  assert.equal(proposal.status, "proposed");
  assert.equal(discussion.status, "completed");
  assert.equal(dispatchCount, 2);
  assert.equal(maximumActive, 1);
});

test("concurrent AI team discussion requests across service instances remain one discussion", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-team-discussion-concurrent-"));
  const owner = principal("discussion-concurrent-owner");
  const teams = createTeamService(join(root, "platform"), { now: () => at });
  const team = await teams.createTeam(owner, { name: "Concurrent discussion team", description: "discussion idempotency", kind: "project", visibility: "public", capacity: 4 });
  await teams.addAiMember(owner, team.id, { agentId: "architect", assignmentRole: "architecture", capabilities: ["context.read", "discussion.propose"], approvalScope: "suggestion-only" }, at);
  const projects = createUserProjectService({ platformRoot: join(root, "platform"), projectModelRoot: join(root, "projects"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, canAccessTeam: (subject, teamId) => teams.canAccess(subject, teamId), canAccessTeamWithinMembershipLock: (subject, teamId) => teams.canAccessWithinMembershipLock(subject, teamId), now: () => at });
  const project = await projects.createProject(owner, { name: "Concurrent discussion project", objective: "one durable discussion", purpose: "rapid-prototype", teamMode: "mixed", teamId: team.id });
  let dispatchCount = 0;
  const dispatcher = async ({ question }: { question: string }) => {
    dispatchCount += 1;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
    return { status: "completed" as const, answer: `answer: ${question}`, keyPoints: ["bounded"], alternatives: [], risks: [] };
  };
  const firstService = createAiTeamDiscussionService({ root: join(root, "ai-team"), teamService: teams, userProjectService: projects, now: () => at, dispatcher });
  const secondService = createAiTeamDiscussionService({ root: join(root, "ai-team"), teamService: teams, userProjectService: projects, now: () => at, dispatcher });

  const results = await Promise.all([
    firstService.requestDiscussion(owner, project.id, { agentId: "architect", requestId: "concurrent-discussion", question: "How should this boundary be checked?" }),
    secondService.requestDiscussion(owner, project.id, { agentId: "architect", requestId: "concurrent-discussion", question: "How should this boundary be checked?" }),
  ]);

  assert.equal(dispatchCount, 1);
  assert.equal(new Set(results.map((result) => result.id)).size, 1);
  assert.equal((await firstService.listDiscussions(owner, project.id)).length, 1);
});

test("AI team discussions re-check active membership after waiting for the Team lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-team-discussion-lock-"));
  const platform = join(root, "platform");
  const owner = principal("discussion-lock-owner");
  const teams = createTeamService(platform, { now: () => at });
  const team = await teams.createTeam(owner, { name: "Discussion lock team", description: "membership recheck", kind: "project", visibility: "private", capacity: 4 });
  await teams.addAiMember(owner, team.id, { agentId: "reviewer", assignmentRole: "reviewer", capabilities: ["discussion.propose"], approvalScope: "suggestion-only" }, at);
  const projects = createUserProjectService({ platformRoot: platform, projectModelRoot: join(root, "projects"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, canAccessTeam: (subject, teamId) => teams.canAccess(subject, teamId), canAccessTeamWithinMembershipLock: (subject, teamId) => teams.canAccessWithinMembershipLock(subject, teamId), now: () => at });
  const project = await projects.createProject(owner, { name: "Discussion lock project", objective: "recheck team membership", purpose: "rapid-prototype", teamMode: "mixed", teamId: team.id });
  const discussions = createAiTeamDiscussionService({ root: join(platform, "ai-team"), teamService: teams, userProjectService: projects, now: () => at, dispatcher: async () => ({ status: "completed" as const, answer: "Should not persist", keyPoints: [], alternatives: [], risks: [] }) });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableTeamMembershipLock(platform, team.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  const request = discussions.requestDiscussion(owner, project.id, { agentId: "reviewer", requestId: "discussion-lock-request", question: "Should not run" });
  assert.equal(await Promise.race([
    request.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 40)),
  ]), false);
  const currentOwner = await loadMembershipUnlocked(platform, team.id, owner.userId);
  assert.ok(currentOwner);
  await saveMembershipUnlocked(platform, { ...currentOwner, status: "removed", updatedAt: at });
  release();
  await Promise.all([holder, assert.rejects(() => request, /team member|access/i)]);
  await saveMembershipUnlocked(platform, { ...currentOwner, status: "active", updatedAt: at });
  assert.deepEqual(await discussions.listDiscussions(owner, project.id), []);
});

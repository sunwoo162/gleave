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
import { createAiTeamProposalService } from "../src/ai-team/service.js";
import { withDurableAiTeamProposalLock } from "../src/ai-team/proposal-lock.js";
import { loadAiTeamProposal, saveAiTeamProposal, saveAiTeamProposalUnlocked } from "../src/ai-team/store.js";

const at = "2026-09-27T12:00:00.000Z";
function principal(userId: string): Principal { return { userId, sessionId: `session-${userId}`, roles: ["user"] }; }

test("AI team proposals require a bounded assigned capability and human acceptance before a work request exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-team-proposal-"));
  const owner = principal("proposal-owner");
  const outsider = principal("proposal-outsider");
  const teams = createTeamService(join(root, "platform"), { now: () => at });
  const team = await teams.createTeam(owner, { name: "AI delivery team", description: "bounded AI collaboration", kind: "project", visibility: "public", capacity: 5 });
  await teams.addAiMember(owner, team.id, { agentId: "frontend", assignmentRole: "frontend", capabilities: ["context.read", "task.propose"], approvalScope: "owner-approved-execution" }, at);
  const projects = createUserProjectService({ platformRoot: join(root, "platform"), projectModelRoot: join(root, "projects"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, canAccessTeam: (subject, teamId) => teams.canAccess(subject, teamId), canAccessTeamWithinMembershipLock: (subject, teamId) => teams.canAccessWithinMembershipLock(subject, teamId), now: () => at });
  const project = await projects.createProject(owner, { name: "AI proposal project", objective: "connect bounded proposals", purpose: "rapid-prototype", teamMode: "mixed", teamId: team.id });
  const proposalService = createAiTeamProposalService({ root: join(root, "ai-team"), teamService: teams, userProjectService: projects, now: () => at, dispatcher: async () => ({ status: "proposed", draft: { title: "Create typed client", objective: "Add a typed client boundary", acceptanceCriteria: ["API types compile", "scope remains owner-bound"], rationale: "Reduce integration drift" } }) });

  await assert.rejects(() => proposalService.requestProposal(outsider, project.id, { agentId: "frontend", requestId: "foreign-request" }), /team member|access/i);
  const proposal = await proposalService.requestProposal(owner, project.id, { agentId: "frontend", requestId: "proposal-1" });
  assert.equal(proposal.status, "proposed");
  assert.equal(proposal.assignmentRole, "frontend");
  assert.deepEqual(proposal.acceptanceCriteria, ["API types compile", "scope remains owner-bound"]);
  assert.equal(proposal.workRequestId, undefined);
  assert.equal((await projects.getProject(owner, project.id))?.workRequests.length, 0);

  const accepted = await proposalService.acceptProposal(owner, project.id, proposal.id);
  assert.equal(accepted.proposal.status, "accepted");
  assert.equal(accepted.workRequest.status, "queued");
  assert.equal(accepted.proposal.workRequestId, accepted.workRequest.id);
  const repeated = await proposalService.acceptProposal(owner, project.id, proposal.id);
  assert.equal(repeated.workRequest.id, accepted.workRequest.id);
  const reloaded = createAiTeamProposalService({ root: join(root, "ai-team"), teamService: teams, userProjectService: projects, now: () => at });
  assert.equal((await reloaded.listProposals(owner, project.id))[0]?.status, "accepted");
});

test("AI team proposal lists wait for each durable proposal lock before projecting state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-team-proposal-read-lock-"));
  const owner = principal("proposal-read-lock-owner");
  const teams = createTeamService(join(root, "platform"), { now: () => at });
  const team = await teams.createTeam(owner, { name: "Proposal read lock team", description: "read synchronization", kind: "project", visibility: "private", capacity: 3 });
  await teams.addAiMember(owner, team.id, { agentId: "planner", assignmentRole: "planner", capabilities: ["task.propose"], approvalScope: "suggestion-only" }, at);
  const projects = createUserProjectService({ platformRoot: join(root, "platform"), projectModelRoot: join(root, "projects"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, canAccessTeam: (subject, teamId) => teams.canAccess(subject, teamId), canAccessTeamWithinMembershipLock: (subject, teamId) => teams.canAccessWithinMembershipLock(subject, teamId), now: () => at });
  const project = await projects.createProject(owner, { name: "Proposal read project", objective: "serialize proposal reads", purpose: "rapid-prototype", teamMode: "mixed", teamId: team.id });
  const proposals = createAiTeamProposalService({ root: join(root, "ai-team"), teamService: teams, userProjectService: projects, now: () => at, dispatcher: async () => ({ status: "proposed" as const, draft: { title: "기존 제목", objective: "기존 목표", acceptanceCriteria: ["기존 조건"], rationale: "기존 근거" } }) });
  const proposal = await proposals.requestProposal(owner, project.id, { agentId: "planner", requestId: "proposal-read-lock" });
  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableAiTeamProposalLock(join(root, "ai-team"), project.id, proposal.requestId, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let settled = false;
  const read = proposals.listProposals(owner, project.id).then((result) => { settled = true; return result; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  await saveAiTeamProposalUnlocked(join(root, "ai-team"), { ...proposal, title: "잠금 해제 후 제목", updatedAt: "2026-09-27T12:00:01.000Z" });
  releaseHolder();
  await lockHeld;
  assert.equal((await read)[0]?.title, "잠금 해제 후 제목");

  let releaseWriteHolder!: () => void;
  const writeHolderStarted = new Promise<void>((resolve) => {
    void withDurableAiTeamProposalLock(join(root, "ai-team"), project.id, proposal.requestId, async () => {
      resolve();
      await new Promise<void>((release) => { releaseWriteHolder = release; });
    });
  });
  await writeHolderStarted;
  let writeSettled = false;
  const writing = saveAiTeamProposal(join(root, "ai-team"), { ...proposal, title: "공개 저장 대기 후 제목", updatedAt: "2026-09-27T12:00:02.000Z" }).then(() => { writeSettled = true; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(writeSettled, false);
  releaseWriteHolder();
  await writing;

  let releaseReadHolder!: () => void;
  const readHolderStarted = new Promise<void>((resolve) => {
    void withDurableAiTeamProposalLock(join(root, "ai-team"), project.id, proposal.requestId, async () => {
      resolve();
      await new Promise<void>((release) => { releaseReadHolder = release; });
    });
  });
  await readHolderStarted;
  let directReadSettled = false;
  const directRead = loadAiTeamProposal(join(root, "ai-team"), project.id, proposal.id).then((value) => { directReadSettled = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(directReadSettled, false);
  releaseReadHolder();
  assert.equal((await directRead)?.title, "공개 저장 대기 후 제목");
});

test("AI team proposal without a local dispatcher is durable waiting and does not fabricate a task", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-team-waiting-"));
  const owner = principal("waiting-owner");
  const teams = createTeamService(join(root, "platform"), { now: () => at });
  const team = await teams.createTeam(owner, { name: "Waiting AI team", description: "waiting boundary", kind: "project", visibility: "private", capacity: 3 });
  await teams.addAiMember(owner, team.id, { agentId: "qa", assignmentRole: "qa", capabilities: ["discussion.propose"], approvalScope: "suggestion-only" }, at);
  const projects = createUserProjectService({ platformRoot: join(root, "platform"), projectModelRoot: join(root, "projects"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, canAccessTeam: (subject, teamId) => teams.canAccess(subject, teamId), canAccessTeamWithinMembershipLock: (subject, teamId) => teams.canAccessWithinMembershipLock(subject, teamId), now: () => at });
  const project = await projects.createProject(owner, { name: "Waiting proposal project", objective: "preserve no-runtime state", purpose: "portfolio", teamMode: "mixed", teamId: team.id });
  const proposalService = createAiTeamProposalService({ root: join(root, "ai-team"), teamService: teams, userProjectService: projects, now: () => at });
  const waiting = await proposalService.requestProposal(owner, project.id, { agentId: "qa", requestId: "waiting-1" });
  assert.equal(waiting.status, "waiting-runtime");
  assert.match(waiting.blocker ?? "", /Runtime/i);
  assert.equal((await projects.getProject(owner, project.id))?.workRequests.length, 0);
});

test("AI team proposal waiting blockers redact credential-shaped Runtime text", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-team-proposal-blocker-safety-"));
  const owner = principal("proposal-blocker-owner");
  const teams = createTeamService(join(root, "platform"), { now: () => at });
  const team = await teams.createTeam(owner, { name: "Blocker safety team", description: "sanitize Runtime blockers", kind: "project", visibility: "private", capacity: 3 });
  await teams.addAiMember(owner, team.id, { agentId: "qa", assignmentRole: "qa", capabilities: ["task.propose"], approvalScope: "suggestion-only" }, at);
  const projects = createUserProjectService({ platformRoot: join(root, "platform"), projectModelRoot: join(root, "projects"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, canAccessTeam: (subject, teamId) => teams.canAccess(subject, teamId), canAccessTeamWithinMembershipLock: (subject, teamId) => teams.canAccessWithinMembershipLock(subject, teamId), now: () => at });
  const project = await projects.createProject(owner, { name: "Blocker safety project", objective: "redact Runtime failures", purpose: "portfolio", teamMode: "mixed", teamId: team.id });
  const secretText = "provider token=proposal-secret api_key=proposal-api-secret https://preview.example/?access_token=proposal-url-secret";
  let dispatchCount = 0;
  const proposals = createAiTeamProposalService({
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
    const waiting = await proposals.requestProposal(owner, project.id, { agentId: "qa", requestId });
    assert.equal(waiting.status, "waiting-runtime");
    assert.equal(waiting.blocker?.includes("proposal-secret"), false);
    assert.equal(waiting.blocker?.includes("proposal-api-secret"), false);
    assert.equal(waiting.blocker?.includes("proposal-url-secret"), false);
    assert.match(waiting.blocker ?? "", /\[redacted\]|\[redacted-url\]/i);
  }
});

test("concurrent AI team proposal requests across service instances remain one proposal", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-team-proposal-concurrent-"));
  const owner = principal("proposal-concurrent-owner");
  const teams = createTeamService(join(root, "platform"), { now: () => at });
  const team = await teams.createTeam(owner, { name: "Concurrent AI team", description: "proposal idempotency", kind: "project", visibility: "public", capacity: 5 });
  await teams.addAiMember(owner, team.id, { agentId: "frontend", assignmentRole: "frontend", capabilities: ["context.read", "task.propose"], approvalScope: "owner-approved-execution" }, at);
  const projects = createUserProjectService({ platformRoot: join(root, "platform"), projectModelRoot: join(root, "projects"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, canAccessTeam: (subject, teamId) => teams.canAccess(subject, teamId), canAccessTeamWithinMembershipLock: (subject, teamId) => teams.canAccessWithinMembershipLock(subject, teamId), now: () => at });
  const project = await projects.createProject(owner, { name: "Concurrent proposal project", objective: "one durable proposal", purpose: "rapid-prototype", teamMode: "mixed", teamId: team.id });
  let dispatchCount = 0;
  const dispatcher = async () => {
    dispatchCount += 1;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
    return { status: "proposed" as const, draft: { title: "Create typed client", objective: "Add one typed boundary", acceptanceCriteria: ["types compile"], rationale: "keep scope bounded" } };
  };
  const firstService = createAiTeamProposalService({ root: join(root, "ai-team"), teamService: teams, userProjectService: projects, now: () => at, dispatcher });
  const secondService = createAiTeamProposalService({ root: join(root, "ai-team"), teamService: teams, userProjectService: projects, now: () => at, dispatcher });

  const results = await Promise.all([
    firstService.requestProposal(owner, project.id, { agentId: "frontend", requestId: "concurrent-proposal" }),
    secondService.requestProposal(owner, project.id, { agentId: "frontend", requestId: "concurrent-proposal" }),
  ]);

  assert.equal(dispatchCount, 1);
  assert.equal(new Set(results.map((result) => result.id)).size, 1);
  assert.equal((await firstService.listProposals(owner, project.id)).length, 1);
});

test("concurrent AI team proposal decisions keep one terminal decision", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-team-proposal-decision-concurrent-"));
  const owner = principal("proposal-decision-concurrent-owner");
  const teams = createTeamService(join(root, "platform"), { now: () => at });
  const team = await teams.createTeam(owner, { name: "Decision AI team", description: "proposal decision serialization", kind: "project", visibility: "public", capacity: 5 });
  await teams.addAiMember(owner, team.id, { agentId: "frontend", assignmentRole: "frontend", capabilities: ["context.read", "task.propose"], approvalScope: "owner-approved-execution" }, at);
  const projects = createUserProjectService({ platformRoot: join(root, "platform"), projectModelRoot: join(root, "projects"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, canAccessTeam: (subject, teamId) => teams.canAccess(subject, teamId), canAccessTeamWithinMembershipLock: (subject, teamId) => teams.canAccessWithinMembershipLock(subject, teamId), now: () => at });
  const project = await projects.createProject(owner, { name: "Decision proposal project", objective: "one decision", purpose: "rapid-prototype", teamMode: "mixed", teamId: team.id });
  const firstService = createAiTeamProposalService({ root: join(root, "ai-team"), teamService: teams, userProjectService: projects, now: () => at, dispatcher: async () => ({ status: "proposed" as const, draft: { title: "One task", objective: "One bounded task", acceptanceCriteria: ["types compile"], rationale: "keep scope bounded" } }) });
  const secondService = createAiTeamProposalService({ root: join(root, "ai-team"), teamService: teams, userProjectService: projects, now: () => at });
  const proposal = await firstService.requestProposal(owner, project.id, { agentId: "frontend", requestId: "decision-race" });

  const results = await Promise.allSettled([
    firstService.acceptProposal(owner, project.id, proposal.id),
    secondService.rejectProposal(owner, project.id, proposal.id),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && /proposal|status|accepted|rejected/i.test(String(result.reason))).length, 1);
  const stored = (await firstService.listProposals(owner, project.id))[0];
  assert.ok(stored?.status === "accepted" || stored?.status === "rejected");
});

test("AI team proposal requests re-check active membership after waiting for the Team lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-team-proposal-lock-"));
  const platform = join(root, "platform");
  const owner = principal("proposal-lock-owner");
  const teams = createTeamService(platform, { now: () => at });
  const team = await teams.createTeam(owner, { name: "Proposal lock team", description: "membership recheck", kind: "project", visibility: "private", capacity: 4 });
  await teams.addAiMember(owner, team.id, { agentId: "planner", assignmentRole: "planner", capabilities: ["task.propose"], approvalScope: "suggestion-only" }, at);
  const projects = createUserProjectService({ platformRoot: platform, projectModelRoot: join(root, "projects"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, canAccessTeam: (subject, teamId) => teams.canAccess(subject, teamId), canAccessTeamWithinMembershipLock: (subject, teamId) => teams.canAccessWithinMembershipLock(subject, teamId), now: () => at });
  const project = await projects.createProject(owner, { name: "Proposal lock project", objective: "recheck team membership", purpose: "rapid-prototype", teamMode: "mixed", teamId: team.id });
  const proposals = createAiTeamProposalService({ root: join(platform, "ai-team"), teamService: teams, userProjectService: projects, now: () => at, dispatcher: async () => ({ status: "proposed" as const, draft: { title: "Should not persist", objective: "membership must remain active", acceptanceCriteria: ["recheck"], rationale: "lock race" } }) });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableTeamMembershipLock(platform, team.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  const request = proposals.requestProposal(owner, project.id, { agentId: "planner", requestId: "proposal-lock-request" });
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
  assert.deepEqual(await proposals.listProposals(owner, project.id), []);
});

test("AI team proposal acceptance re-checks manager authority after waiting for the Team lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-team-proposal-accept-lock-"));
  const platform = join(root, "platform");
  const owner = principal("proposal-accept-lock-owner");
  const teams = createTeamService(platform, { now: () => at });
  const team = await teams.createTeam(owner, { name: "Proposal accept lock team", description: "manager recheck", kind: "project", visibility: "private", capacity: 4 });
  await teams.addAiMember(owner, team.id, { agentId: "planner", assignmentRole: "planner", capabilities: ["task.propose"], approvalScope: "suggestion-only" }, at);
  const projects = createUserProjectService({ platformRoot: platform, projectModelRoot: join(root, "projects"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, canAccessTeam: (subject, teamId) => teams.canAccess(subject, teamId), canAccessTeamWithinMembershipLock: (subject, teamId) => teams.canAccessWithinMembershipLock(subject, teamId), now: () => at });
  const project = await projects.createProject(owner, { name: "Proposal accept lock project", objective: "recheck manager", purpose: "rapid-prototype", teamMode: "mixed", teamId: team.id });
  const proposals = createAiTeamProposalService({ root: join(platform, "ai-team"), teamService: teams, userProjectService: projects, now: () => at, dispatcher: async () => ({ status: "proposed" as const, draft: { title: "Approve me", objective: "only an active manager can accept", acceptanceCriteria: ["recheck"], rationale: "lock race" } }) });
  const proposal = await proposals.requestProposal(owner, project.id, { agentId: "planner", requestId: "proposal-accept-lock-request" });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableTeamMembershipLock(platform, team.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  const accept = proposals.acceptProposal(owner, project.id, proposal.id);
  assert.equal(await Promise.race([
    accept.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 40)),
  ]), false);
  const currentOwner = await loadMembershipUnlocked(platform, team.id, owner.userId);
  assert.ok(currentOwner);
  await saveMembershipUnlocked(platform, { ...currentOwner, status: "removed", updatedAt: at });
  release();
  await Promise.all([holder, assert.rejects(() => accept, /manager|access/i)]);
  assert.equal((await projects.getProject(owner, project.id))?.workRequests.length, 0);
});

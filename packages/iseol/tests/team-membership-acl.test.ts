import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createActivityService } from "../src/activity/service.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { createTeamService } from "../src/teams/service.js";
import { withDurableTeamMembershipLock } from "../src/teams/membership-lock.js";
import { loadMembershipUnlocked, saveMembershipUnlocked } from "../src/teams/store.js";
import { createUserProjectService } from "../src/project-model/user-project-service.js";

const at = "2026-09-25T12:00:00.000Z";
const principal = (userId: string): Principal => ({ userId, sessionId: `${userId}-session`, roles: ["user"] });

test("team membership is durable and immediately changes private access and collaboration ACL", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-team-acl-"));
  const users = createPlatformUserService(join(root, "platform"), { now: () => at });
  for (const id of ["team-a", "team-b", "team-c"]) await users.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" });
  const activity = createActivityService(join(root, "platform"), { now: () => at });
  const teams = createTeamService(join(root, "platform"), { now: () => at, activityService: activity });
  const team = await teams.createTeam(principal("team-a"), { name: "Private study", description: "shared learning", kind: "study", visibility: "private", capacity: 3 });
  assert.equal((await activity.listActivityEvents(principal("team-a"))).some((event) => event.eventType === "team.created" && event.sourceId === team.id), true);

  assert.equal(await teams.getTeam(principal("team-b"), team.id), null);
  await teams.addMember(team.id, "team-b", "member");
  assert.equal((await teams.getTeam(principal("team-b"), team.id))?.members.some((member) => member.userId === "team-b"), true);
  assert.equal(await teams.canCollaborate("team-a", "team-b"), true);

  await teams.removeMember(principal("team-a"), team.id, "team-b");
  assert.equal(await teams.getTeam(principal("team-b"), team.id), null);
  assert.equal(await teams.canCollaborate("team-a", "team-b"), false);

  const projects = createUserProjectService({
    platformRoot: join(root, "platform"), projectModelRoot: join(root, "project-model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root,
    canAccessTeam: (viewer, teamId) => teams.canAccess(viewer, teamId), canAccessTeamWithinMembershipLock: (viewer, teamId) => teams.canAccessWithinMembershipLock(viewer, teamId), now: () => at,
  });
  const teamProject = await projects.createProject(principal("team-a"), { name: "Shared project", objective: "team project access", purpose: "rapid-prototype", teamMode: "human", teamId: team.id });
  assert.equal(await projects.getProject(principal("team-b"), teamProject.id), null);
  await teams.addMember(team.id, "team-b", "member");
  assert.equal((await projects.getProject(principal("team-b"), teamProject.id))?.project.teamId, team.id);
  await teams.removeMember(principal("team-a"), team.id, "team-b");
  assert.equal(await projects.getProject(principal("team-b"), teamProject.id), null);
});

test("AI team membership stores bounded role capabilities and approval scope without becoming a human ACL", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-ai-team-member-"));
  const users = createPlatformUserService(join(root, "platform"), { now: () => at });
  for (const id of ["ai-owner", "ai-outsider"]) await users.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" });
  const teams = createTeamService(join(root, "platform"), { now: () => at });
  const team = await teams.createTeam(principal("ai-owner"), { name: "AI delivery team", description: "bounded AI collaboration", kind: "project", visibility: "private", capacity: 4 });

  const aiMember = await teams.addAiMember(principal("ai-owner"), team.id, {
    agentId: "frontend",
    assignmentRole: "frontend",
    capabilities: ["context.read", "task.propose"],
    approvalScope: "suggestion-only",
  });
  assert.equal(aiMember.memberType, "ai");
  assert.equal(aiMember.aiMemberId, "frontend");
  assert.equal(aiMember.assignmentRole, "frontend");
  assert.deepEqual(aiMember.capabilities, ["context.read", "task.propose"]);
  assert.equal(aiMember.approvalScope, "suggestion-only");
  assert.equal(await teams.canCollaborate("ai-owner", aiMember.userId), false);
  await assert.rejects(() => teams.addAiMember(principal("ai-outsider"), team.id, { agentId: "qa", assignmentRole: "qa", capabilities: ["task.propose"], approvalScope: "suggestion-only" }), /manager/i);

  const restarted = createTeamService(join(root, "platform"), { now: () => at });
  const persisted = (await restarted.getTeam(principal("ai-owner"), team.id))?.members.find((member) => member.memberType === "ai");
  assert.deepEqual(persisted, aiMember);
  const removed = await restarted.removeAiMember(principal("ai-owner"), team.id, "frontend");
  assert.equal(removed.status, "removed");
  assert.equal((await restarted.getTeam(principal("ai-owner"), team.id))?.members.some((member) => member.memberType === "ai"), false);
});

test("team membership mutations across service instances preserve capacity", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-team-membership-concurrent-"));
  const teamsRoot = join(root, "teams");
  const firstService = createTeamService(teamsRoot, { now: () => at });
  const secondService = createTeamService(teamsRoot, { now: () => "2026-09-25T12:00:01.000Z" });
  const owner = principal("capacity-owner");
  const team = await firstService.createTeam(owner, { name: "Capacity team", description: "serialized membership", kind: "project", visibility: "private", capacity: 2 });

  const results = await Promise.allSettled([
    firstService.addMember(team.id, "capacity-a", "member"),
    secondService.addMember(team.id, "capacity-b", "member"),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && /Team is full/.test(String(result.reason))).length, 1);
  assert.equal((await firstService.listMemberships(team.id)).filter((member) => member.status === "active").length, 2);
});

test("team membership mutations re-check manager authority after waiting for the lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-team-manager-lock-"));
  const owner = principal("manager-lock-owner");
  const teams = createTeamService(root, { now: () => at });
  const team = await teams.createTeam(owner, { name: "Manager lock team", description: "recheck manager authority", kind: "project", visibility: "private", capacity: 3 });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableTeamMembershipLock(root, team.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  const addAi = teams.addAiMember(owner, team.id, { agentId: "manager-lock-agent", assignmentRole: "reviewer", capabilities: ["context.read"], approvalScope: "suggestion-only" });
  assert.equal(await Promise.race([
    addAi.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 40)),
  ]), false);
  const currentOwner = await loadMembershipUnlocked(root, team.id, owner.userId);
  assert.ok(currentOwner);
  await saveMembershipUnlocked(root, { ...currentOwner, status: "removed", updatedAt: at });
  release();
  await Promise.all([holder, assert.rejects(() => addAi, /manager/i)]);
  assert.equal((await teams.listMemberships(team.id)).some((member) => member.aiMemberId === "manager-lock-agent"), false);
});

test("team list reads re-check private membership after waiting for the lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-team-list-read-lock-"));
  const owner = principal("team-list-read-owner");
  const teams = createTeamService(root, { now: () => at });
  const team = await teams.createTeam(owner, { name: "List read team", description: "membership read recheck", kind: "project", visibility: "private", capacity: 3 });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableTeamMembershipLock(root, team.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const reading = teams.listTeams(owner).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  const membership = await loadMembershipUnlocked(root, team.id, owner.userId);
  assert.ok(membership);
  await saveMembershipUnlocked(root, { ...membership, status: "removed", updatedAt: at });
  release();
  assert.deepEqual(await reading, []);
  await holder;
});

test("team get reads wait for the membership lock and re-check current membership", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-team-get-read-lock-"));
  const owner = principal("team-get-read-owner");
  const teams = createTeamService(root, { now: () => at });
  const team = await teams.createTeam(owner, { name: "Get read team", description: "membership read recheck", kind: "project", visibility: "private", capacity: 3 });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableTeamMembershipLock(root, team.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const reading = teams.getTeam(owner, team.id).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  const membership = await loadMembershipUnlocked(root, team.id, owner.userId);
  assert.ok(membership);
  await saveMembershipUnlocked(root, { ...membership, status: "removed", updatedAt: at });
  release();
  assert.equal(await reading, null);
  await holder;
});

test("team membership list reads wait for the membership lock and reload current members", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-team-membership-list-read-lock-"));
  const owner = principal("team-membership-list-owner");
  const teams = createTeamService(root, { now: () => at });
  const team = await teams.createTeam(owner, { name: "Membership list read team", description: "membership list read recheck", kind: "project", visibility: "private", capacity: 3 });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableTeamMembershipLock(root, team.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const reading = teams.listMemberships(team.id).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  const membership = await loadMembershipUnlocked(root, team.id, owner.userId);
  assert.ok(membership);
  await saveMembershipUnlocked(root, { ...membership, status: "removed", updatedAt: at });
  release();
  assert.deepEqual(await reading, []);
  await holder;
});

test("team collaboration checks wait for the membership lock and re-check both members", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-team-collaboration-read-lock-"));
  const owner = principal("team-collaboration-owner");
  const member = principal("team-collaboration-member");
  const teams = createTeamService(root, { now: () => at });
  const team = await teams.createTeam(owner, { name: "Collaboration read team", description: "collaboration read recheck", kind: "project", visibility: "public", capacity: 3 });
  await teams.addMember(team.id, member.userId, "member");

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableTeamMembershipLock(root, team.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  const collaboration = teams.canCollaborate(owner.userId, member.userId);
  assert.equal(await Promise.race([
    collaboration,
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 40)),
  ]), false);
  const membership = await loadMembershipUnlocked(root, team.id, member.userId);
  assert.ok(membership);
  await saveMembershipUnlocked(root, { ...membership, status: "removed", updatedAt: at });
  release();
  await Promise.all([holder, assert.doesNotReject(async () => assert.equal(await collaboration, false))]);
});

test("team access checks wait for the membership lock and re-check the viewer", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-team-access-read-lock-"));
  const owner = principal("team-access-owner");
  const teams = createTeamService(root, { now: () => at });
  const team = await teams.createTeam(owner, { name: "Access read team", description: "access read recheck", kind: "project", visibility: "private", capacity: 3 });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableTeamMembershipLock(root, team.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  const access = teams.canAccess(owner, team.id);
  assert.equal(await Promise.race([
    access,
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 40)),
  ]), false);
  const membership = await loadMembershipUnlocked(root, team.id, owner.userId);
  assert.ok(membership);
  await saveMembershipUnlocked(root, { ...membership, status: "removed", updatedAt: at });
  release();
  await Promise.all([holder, assert.doesNotReject(async () => assert.equal(await access, false))]);
});

test("team manager checks wait for the membership lock and re-check the viewer role", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-team-manager-read-lock-"));
  const owner = principal("team-manager-read-owner");
  const teams = createTeamService(root, { now: () => at });
  const team = await teams.createTeam(owner, { name: "Manager read team", description: "manager read recheck", kind: "project", visibility: "private", capacity: 3 });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableTeamMembershipLock(root, team.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  const manager = teams.isManager(owner, team.id);
  assert.equal(await Promise.race([
    manager,
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 40)),
  ]), false);
  const membership = await loadMembershipUnlocked(root, team.id, owner.userId);
  assert.ok(membership);
  await saveMembershipUnlocked(root, { ...membership, role: "member", assignmentRole: "member", updatedAt: at });
  release();
  await Promise.all([holder, assert.doesNotReject(async () => assert.equal(await manager, false))]);
});

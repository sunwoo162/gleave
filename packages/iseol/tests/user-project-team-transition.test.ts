import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createActivityService } from "../src/activity/service.js";
import { createTeamService } from "../src/teams/service.js";
import { createUserProjectService } from "../src/project-model/user-project-service.js";
import { loadProjectWorkspace } from "../src/project-model/workspace-store.js";
import { withDurableProjectWorkspaceLock } from "../src/project-model/workspace-lock.js";
import { withDurableTeamMembershipLock } from "../src/teams/membership-lock.js";
import { loadMembershipUnlocked, saveMembershipUnlocked } from "../src/teams/store.js";

const at = "2026-09-26T12:00:00.000Z";
const principal = (userId: string): Principal => ({ userId, sessionId: `${userId}-session`, roles: ["user"] });

test("an active project can change teams without leaking workspace access or stale team identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-team-transition-"));
  const activity = createActivityService(join(root, "platform"), { now: () => at });
  const teams = createTeamService(join(root, "platform"), { now: () => at, activityService: activity });
  const team = await teams.createTeam(principal("owner"), { name: "Build team", description: "shared work", kind: "project", visibility: "private", capacity: 4 });
  await teams.addMember(team.id, "member", "member");
  const projects = createUserProjectService({
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    canAccessTeam: (viewer, teamId) => teams.canAccess(viewer, teamId),
    canAccessTeamWithinMembershipLock: (viewer, teamId) => teams.canAccessWithinMembershipLock(viewer, teamId),
    activityService: activity,
    now: () => at,
  });

  const project = await projects.createProject(principal("owner"), { name: "Transition", objective: "change team safely", purpose: "rapid-prototype", teamMode: "solo" });
  const aiProject = await projects.createProject(principal("owner"), { name: "AI only", objective: "ignore stale team id", purpose: "rapid-prototype", teamMode: "ai", teamId: team.id });
  assert.equal("teamId" in aiProject, false);
  await assert.rejects(() => projects.createProject(principal("owner"), { name: "Missing team", objective: "require team id", purpose: "rapid-prototype", teamMode: "human" }), /Team id is required/);
  const joined = await projects.updateProjectTeam(principal("owner"), project.id, { teamMode: "human", teamId: team.id });
  assert.equal(joined.teamMode, "human");
  assert.equal(joined.teamId, team.id);
  assert.equal((await projects.getProject(principal("member"), project.id))?.project.id, project.id);
  assert.equal((await activity.listActivityEvents(principal("owner"))).some((event) => event.eventType === "project.team.changed" && event.sourceId.startsWith(`${project.id}:team:`)), true);

  const returned = await projects.updateProjectTeam(principal("owner"), project.id, { teamMode: "solo" });
  assert.equal(returned.teamMode, "solo");
  assert.equal("teamId" in returned, false);
  const workspace = await loadProjectWorkspace(join(root, "project-model"), project.id);
  assert.ok(workspace);
  assert.equal("teamId" in workspace, false);
  assert.equal(await projects.getProject(principal("member"), project.id), null);
  assert.equal((await activity.listActivityEvents(principal("owner"))).filter((event) => event.eventType === "project.team.changed").length, 2);
});

test("project team transition waits for the durable Workspace mutation lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-team-lock-"));
  const platformRoot = join(root, "platform");
  const projectModelRoot = join(root, "project-model");
  const teams = createTeamService(platformRoot, { now: () => at });
  const team = await teams.createTeam(principal("owner"), { name: "Locked team", description: "workspace lock", kind: "project", visibility: "private", capacity: 4 });
  await teams.addMember(team.id, "owner", "owner");
  const options = {
    platformRoot,
    projectModelRoot,
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    canAccessTeam: async (viewer: Principal, teamId: string) => teams.canAccess(viewer, teamId),
    canAccessTeamWithinMembershipLock: async (viewer: Principal, teamId: string) => teams.canAccessWithinMembershipLock(viewer, teamId),
    now: () => at,
  };
  const projects = createUserProjectService(options);
  const project = await projects.createProject(principal("owner"), { name: "Locked transition", objective: "wait for workspace lock", purpose: "rapid-prototype", teamMode: "solo" });
  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurableProjectWorkspaceLock(projectModelRoot, project.id, async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    });
  });
  await holderStarted;
  let settled = false;
  const transition = projects.updateProjectTeam(principal("owner"), project.id, { teamMode: "human", teamId: team.id }).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  releaseHolder();
  const updated = await transition;
  assert.equal(updated.teamMode, "human");
  assert.equal(updated.teamId, team.id);
});

test("project team transition re-checks team access after waiting for the Team membership lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-team-membership-lock-"));
  const platformRoot = join(root, "platform");
  const projectModelRoot = join(root, "project-model");
  const teams = createTeamService(platformRoot, { now: () => at });
  const team = await teams.createTeam(principal("owner"), { name: "Membership race", description: "access recheck", kind: "project", visibility: "private", capacity: 4 });
  await teams.addMember(team.id, "owner", "owner");
  const options = {
    platformRoot,
    projectModelRoot,
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    canAccessTeam: async (viewer: Principal, teamId: string) => teams.canAccess(viewer, teamId),
    canAccessTeamWithinMembershipLock: async (viewer: Principal, teamId: string) => teams.canAccessWithinMembershipLock(viewer, teamId),
    now: () => at,
  };
  const projects = createUserProjectService(options);
  const project = await projects.createProject(principal("owner"), { name: "Membership transition", objective: "recheck team access", purpose: "rapid-prototype", teamMode: "solo" });
  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurableTeamMembershipLock(platformRoot, team.id, async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    }, { waitForMs: 2_000 });
  });
  await holderStarted;
  let settled = false;
  const transition = projects.updateProjectTeam(principal("owner"), project.id, { teamMode: "human", teamId: team.id }).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  const membership = await loadMembershipUnlocked(platformRoot, team.id, "owner");
  assert.ok(membership);
  await saveMembershipUnlocked(platformRoot, { ...membership, status: "removed" });
  releaseHolder();
  await assert.rejects(() => transition, /Team access required/);
  const current = await loadMembershipUnlocked(platformRoot, team.id, "owner");
  assert.equal(current?.status, "removed");
  assert.equal((await projects.getProject(principal("owner"), project.id))?.project.teamMode, "solo");
});

import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { TeamMembership, TeamRecord } from "../src/teams/contracts.js";
import { withDurableTeamMembershipLock } from "../src/teams/membership-lock.js";
import { listMemberships, listTeams, loadMembership, loadTeam, saveMembership, saveMembershipUnlocked, saveTeam, saveTeamUnlocked } from "../src/teams/store.js";

test("public team and membership stores wait for the shared team lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-team-store-lock-"));
  const team: TeamRecord = {
    version: 1,
    id: "team-store-lock",
    ownerUserId: "team-store-owner",
    name: "기존 팀",
    description: "팀 저장소 lock 경계를 검증합니다.",
    kind: "project",
    visibility: "private",
    capacity: 4,
    status: "active",
    createdAt: "2026-09-29T12:00:00.000Z",
    updatedAt: "2026-09-29T12:00:00.000Z",
  };
  const membership: TeamMembership = {
    version: 1,
    id: `${team.id}:team-store-owner`,
    teamId: team.id,
    userId: team.ownerUserId,
    memberType: "human",
    role: "owner",
    assignmentRole: "owner",
    capabilities: [],
    approvalScope: "suggestion-only",
    status: "active",
    joinedAt: team.createdAt,
    updatedAt: team.updatedAt,
  };
  await saveTeamUnlocked(root, team);
  await saveMembershipUnlocked(root, membership);
  const updatedTeam = { ...team, name: "잠금 해제 후 팀", updatedAt: "2026-09-29T12:00:01.000Z" };
  const updatedMembership = { ...membership, assignmentRole: "maintainer", updatedAt: "2026-09-29T12:00:01.000Z" };

  let release!: () => void;
  let acquired!: () => void;
  const lockAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableTeamMembershipLock(root, team.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await lockAcquired;

  let teamSaveSettled = false;
  const pendingTeamSave = saveTeam(root, updatedTeam).then(() => { teamSaveSettled = true; });
  let membershipSaveSettled = false;
  const pendingMembershipSave = saveMembership(root, updatedMembership).then(() => { membershipSaveSettled = true; });
  let teamLoadSettled = false;
  const pendingTeamLoad = loadTeam(root, team.id).then((value) => { teamLoadSettled = true; return value; });
  let membershipLoadSettled = false;
  const pendingMembershipLoad = loadMembership(root, team.id, team.ownerUserId).then((value) => { membershipLoadSettled = true; return value; });
  let teamListSettled = false;
  const pendingTeamList = listTeams(root).then((value) => { teamListSettled = true; return value; });
  let membershipListSettled = false;
  const pendingMembershipList = listMemberships(root, team.id).then((value) => { membershipListSettled = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(teamSaveSettled, false);
  assert.equal(membershipSaveSettled, false);
  assert.equal(teamLoadSettled, false);
  assert.equal(membershipLoadSettled, false);
  assert.equal(teamListSettled, false);
  assert.equal(membershipListSettled, false);

  release();
  await holder;
  await Promise.all([pendingTeamSave, pendingMembershipSave, pendingTeamLoad, pendingMembershipLoad, pendingTeamList, pendingMembershipList]);
  assert.equal((await loadTeam(root, team.id))?.name, "잠금 해제 후 팀");
  assert.equal((await loadMembership(root, team.id, team.ownerUserId))?.assignmentRole, "maintainer");
  assert.equal((await listTeams(root))[0]?.name, "잠금 해제 후 팀");
  assert.equal((await listMemberships(root, team.id))[0]?.assignmentRole, "maintainer");
});

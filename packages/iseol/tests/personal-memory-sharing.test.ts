import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createMemoryService } from "../src/memory/service.js";
import { withDurableMemoryLock } from "../src/memory/memory-lock.js";
import { saveMemoryUnlocked } from "../src/memory/store.js";
import { withDurableTeamMembershipLock } from "../src/teams/membership-lock.js";
import { createTeamService } from "../src/teams/service.js";
import { loadMembershipUnlocked, saveMembershipUnlocked } from "../src/teams/store.js";

const at = "2026-09-28T12:00:00.000Z";
const principal = (userId: string): Principal => ({ userId, sessionId: `${userId}-session`, roles: ["user"] });

test("personal memory sharing is explicit, durable, and limited to active team members", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-memory-sharing-"));
  const teams = createTeamService(root, { now: () => at });
  const memory = createMemoryService(root, { now: () => at, teamService: teams });
  const owner = principal("memory-share-owner");
  const member = principal("memory-share-member");
  const outsider = principal("memory-share-outsider");
  const team = await teams.createTeam(owner, { name: "공유 팀", description: "개인 기억 ACL", kind: "study", visibility: "private", capacity: 4 });
  await teams.addMember(team.id, member.userId, "member");
  const record = await memory.appendPrivateMemory(owner, { kind: "설계 결정", content: "팀에 공유하기 전까지는 개인 전용입니다." });

  assert.deepEqual(await memory.listSharedMemories(member, team.id), []);
  const shared = await memory.updatePrivateMemorySharing(owner, record.id, [team.id]);
  assert.deepEqual(shared?.sharedTeamIds, [team.id]);
  assert.deepEqual((await memory.listSharedMemories(member, team.id)).map((item) => item.content), [record.content]);
  assert.deepEqual(await memory.listSharedMemories(outsider, team.id), []);

  const restarted = createMemoryService(root, { now: () => at, teamService: teams });
  assert.deepEqual((await restarted.listPrivateMemories(owner, {}))[0]?.sharedTeamIds, [team.id]);
  assert.deepEqual((await restarted.listSharedMemories(member, team.id))[0]?.id, record.id);

  await teams.leaveTeam(member, team.id);
  assert.deepEqual(await restarted.listSharedMemories(member, team.id), []);
  const revoked = await restarted.updatePrivateMemorySharing(owner, record.id, []);
  assert.deepEqual(revoked?.sharedTeamIds, []);
  assert.deepEqual(await restarted.listSharedMemories(owner, team.id), []);
});

test("memory sharing cannot be enabled for a team where the owner is not an active member", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-memory-sharing-owner-acl-"));
  const teams = createTeamService(root, { now: () => at });
  const memory = createMemoryService(root, { now: () => at, teamService: teams });
  const owner = principal("memory-share-owner-acl");
  const other = principal("memory-share-other-acl");
  const team = await teams.createTeam(other, { name: "타인 팀", description: "공유 권한 거부", kind: "project", visibility: "public", capacity: 4 });
  const record = await memory.appendPrivateMemory(owner, { kind: "private", content: "공유할 수 없어야 합니다." });

  await assert.rejects(() => memory.updatePrivateMemorySharing(owner, record.id, [team.id]), /active team member/i);
  assert.deepEqual((await memory.listPrivateMemories(owner, {}))[0]?.sharedTeamIds, []);
});

test("memory sharing cannot be re-saved after the owner leaves the selected team", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-memory-sharing-owner-leave-"));
  const teams = createTeamService(root, { now: () => at });
  const memory = createMemoryService(root, { now: () => at, teamService: teams });
  const owner = principal("memory-share-owner-leave");
  const manager = principal("memory-share-manager-leave");
  const team = await teams.createTeam(manager, { name: "소유자 탈퇴 팀", description: "재저장 ACL", kind: "project", visibility: "private", capacity: 4 });
  await teams.addMember(team.id, owner.userId, "member");
  const record = await memory.appendPrivateMemory(owner, { kind: "private", content: "탈퇴 뒤에는 공유 범위를 재저장할 수 없어야 합니다." });

  await memory.updatePrivateMemorySharing(owner, record.id, [team.id]);
  await teams.leaveTeam(owner, team.id);

  await assert.rejects(() => memory.updatePrivateMemorySharing(owner, record.id, [team.id]), /active team member/i);
});

test("memory sharing re-checks active membership after waiting for the Team lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-memory-sharing-lock-"));
  const teams = createTeamService(root, { now: () => at });
  const memory = createMemoryService(root, { now: () => at, teamService: teams });
  const manager = principal("memory-share-lock-manager");
  const owner = principal("memory-share-lock-owner");
  const team = await teams.createTeam(manager, { name: "공유 경합 팀", description: "공유 권한 재검증", kind: "project", visibility: "private", capacity: 4 });
  await teams.addMember(team.id, owner.userId, "member");
  const record = await memory.appendPrivateMemory(owner, { kind: "private", content: "멤버십 락 대기 뒤 재검증해야 합니다." });

  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurableTeamMembershipLock(root, team.id, async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    }, { waitForMs: 2_000 });
  });
  await holderStarted;
  let settled = false;
  const sharing = memory.updatePrivateMemorySharing(owner, record.id, [team.id]).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  const membership = await loadMembershipUnlocked(root, team.id, owner.userId);
  assert.ok(membership);
  await saveMembershipUnlocked(root, { ...membership, status: "removed" });
  releaseHolder();
  await assert.rejects(() => sharing, /active team member/i);
  assert.deepEqual((await memory.listPrivateMemories(owner, {}))[0]?.sharedTeamIds, []);
});

test("shared memory reads re-check active membership after waiting for the Team lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-memory-sharing-read-lock-"));
  const teams = createTeamService(root, { now: () => at });
  const memory = createMemoryService(root, { now: () => at, teamService: teams });
  const owner = principal("memory-share-read-owner");
  const member = principal("memory-share-read-member");
  const team = await teams.createTeam(owner, { name: "공유 읽기 팀", description: "읽기 권한 재검증", kind: "project", visibility: "private", capacity: 4 });
  await teams.addMember(team.id, member.userId, "member");
  const record = await memory.appendPrivateMemory(owner, { kind: "private", content: "읽기 권한도 멤버십 스냅샷이 필요합니다." });
  await memory.updatePrivateMemorySharing(owner, record.id, [team.id]);

  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurableTeamMembershipLock(root, team.id, async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    }, { waitForMs: 2_000 });
  });
  await holderStarted;
  let settled = false;
  const reading = memory.listSharedMemories(member, team.id).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  const membership = await loadMembershipUnlocked(root, team.id, member.userId);
  assert.ok(membership);
  await saveMembershipUnlocked(root, { ...membership, status: "removed" });
  releaseHolder();
  assert.deepEqual(await reading, []);
});

test("shared memory reads wait for the memory lock and reload current state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-memory-sharing-memory-lock-"));
  const teams = createTeamService(root, { now: () => at });
  const memory = createMemoryService(root, { now: () => at, teamService: teams });
  const owner = principal("memory-share-memory-lock-owner");
  const member = principal("memory-share-memory-lock-member");
  const team = await teams.createTeam(owner, { name: "공유 메모리 잠금 팀", description: "메모리 read lock", kind: "project", visibility: "private", capacity: 4 });
  await teams.addMember(team.id, member.userId, "member");
  const record = await memory.appendPrivateMemory(owner, { kind: "private", content: "변경 전 공유 메모리입니다." });
  const shared = await memory.updatePrivateMemorySharing(owner, record.id, [team.id]);
  assert.ok(shared);

  let releaseHolder!: () => void;
  let signalStarted!: () => void;
  const holderStarted = new Promise<void>((resolve) => { signalStarted = resolve; });
  const holder = withDurableMemoryLock(root, owner.userId, record.id, async () => {
    signalStarted();
    await new Promise<void>((resolve) => { releaseHolder = resolve; });
  }, { waitForMs: 0 });
  await holderStarted;

  let settled = false;
  const reading = memory.listSharedMemories(member, team.id).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  await saveMemoryUnlocked(root, { ...shared, content: "변경 후 공유 메모리입니다.", updatedAt: at });
  releaseHolder();
  await holder;
  assert.deepEqual((await reading).map((item) => item.content), ["변경 후 공유 메모리입니다."]);
});

import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { createTeamService } from "../src/teams/service.js";
import { withDurableTeamMembershipLock } from "../src/teams/membership-lock.js";
import { withDurableStudySpaceLock } from "../src/study/space-lock.js";
import { withDurableStudySubmissionLock } from "../src/study/submission-lock.js";
import { loadMembershipUnlocked, saveMembershipUnlocked } from "../src/teams/store.js";
import { createStudyService } from "../src/study/service.js";
import { saveStudySpaceUnlocked, saveTaskSubmissionUnlocked } from "../src/study/store.js";

const at = "2026-09-27T14:00:00.000Z";
const principal = (userId: string): Principal => ({ userId, sessionId: `${userId}-session`, roles: ["user"] });

test("study spaces expose shared curriculum and tasks while personal submissions stay private and durable", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-study-space-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  for (const id of ["study-owner", "study-member", "study-outsider"]) await users.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" });
  const teams = createTeamService(platformRoot, { now: () => at });
  const team = await teams.createTeam(principal("study-owner"), { name: "TypeScript study", description: "shared curriculum", kind: "study", visibility: "private", capacity: 4 });
  await teams.addMember(team.id, "study-member", "member", at);
  const studies = createStudyService(join(platformRoot, "study"), { teamService: teams, now: () => at });

  const space = await studies.createStudySpace(principal("study-owner"), { teamId: team.id, title: "TypeScript foundations", description: "shared lessons and tasks" });
  const link = await studies.addCurriculumLink(principal("study-owner"), space.id, { kind: "resource", referenceId: "typescript-handbook", label: "TypeScript Handbook" });
  const task = await studies.createTask(principal("study-owner"), space.id, { title: "Explain narrowing", instructions: "Write one example of control-flow narrowing", dueLocalDate: "2026-09-30" });

  const memberView = await studies.getStudySpace(principal("study-member"), space.id);
  assert.ok(memberView);
  assert.equal(memberView.space.teamId, team.id);
  assert.deepEqual(memberView.curriculumLinks.map((item) => item.id), [link.id]);
  assert.deepEqual(memberView.tasks.map((item) => item.id), [task.id]);
  assert.deepEqual(memberView.mySubmissions, []);

  const submission = await studies.saveTaskSubmission(principal("study-member"), space.id, task.id, { answer: "A value check narrows a union in the guarded branch.", status: "submitted" });
  assert.equal(submission.userId, "study-member");
  assert.equal((await studies.getStudySpace(principal("study-member"), space.id))?.mySubmissions[0]?.answer, submission.answer);
  assert.deepEqual((await studies.getStudySpace(principal("study-owner"), space.id))?.mySubmissions, []);
  assert.equal(await studies.getStudySpace(principal("study-outsider"), space.id), null);

  const restarted = createStudyService(join(platformRoot, "study"), { teamService: teams, now: () => at });
  assert.equal((await restarted.getStudySpace(principal("study-member"), space.id))?.mySubmissions[0]?.id, submission.id);
});

test("study managers alone can create shared curriculum and tasks", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-study-manager-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  for (const id of ["study-manager", "study-member"]) await users.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" });
  const teams = createTeamService(platformRoot, { now: () => at });
  const team = await teams.createTeam(principal("study-manager"), { name: "Study manager team", description: "manager boundary", kind: "study", visibility: "public", capacity: 3 });
  await teams.addMember(team.id, "study-member", "member", at);
  const studies = createStudyService(join(platformRoot, "study"), { teamService: teams, now: () => at });
  const space = await studies.createStudySpace(principal("study-manager"), { teamId: team.id, title: "Shared room", description: "controlled study space" });
  await assert.rejects(() => studies.createStudySpace(principal("study-member"), { teamId: team.id, title: "Another room", description: "not allowed" }), /manager/i);
  await assert.rejects(() => studies.addCurriculumLink(principal("study-member"), space.id, { kind: "resource", referenceId: "x", label: "x" }), /manager/i);
  await assert.rejects(() => studies.createTask(principal("study-member"), space.id, { title: "x", instructions: "x" }), /manager/i);
});

test("concurrent study submissions across service instances remain durable", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-study-submission-concurrent-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  await users.createUser({ id: "submission-owner", email: "submission-owner@example.com", displayName: "Submission owner", timezone: "Asia/Seoul" });
  await users.createUser({ id: "submission-member", email: "submission-member@example.com", displayName: "Submission member", timezone: "Asia/Seoul" });
  const teams = createTeamService(platformRoot, { now: () => at });
  const team = await teams.createTeam(principal("submission-owner"), { name: "Submission team", description: "concurrent submissions", kind: "study", visibility: "private", capacity: 3 });
  await teams.addMember(team.id, "submission-member", "member", at);
  const firstService = createStudyService(join(platformRoot, "study"), { teamService: teams, now: () => at });
  const secondService = createStudyService(join(platformRoot, "study"), { teamService: teams, now: () => at });
  const space = await firstService.createStudySpace(principal("submission-owner"), { teamId: team.id, title: "Submission room", description: "repeated answer writes" });
  const task = await firstService.createTask(principal("submission-owner"), space.id, { title: "Answer task", instructions: "Write an answer" });

  const results = await Promise.allSettled(Array.from({ length: 24 }, (_, index) => Promise.all([
    firstService.saveTaskSubmission(principal("submission-member"), space.id, task.id, { answer: `answer-a-${index}`, status: "submitted" }),
    secondService.saveTaskSubmission(principal("submission-member"), space.id, task.id, { answer: `answer-b-${index}`, status: "submitted" }),
  ])));

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 24);
  const submission = (await firstService.getStudySpace(principal("submission-member"), space.id))?.mySubmissions[0];
  assert.match(submission?.answer ?? "", /^answer-[ab]-\d+$/);
});

test("concurrent study space creation across service instances remains one active space", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-study-space-concurrent-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  await users.createUser({ id: "space-owner", email: "space-owner@example.com", displayName: "Space owner", timezone: "Asia/Seoul" });
  const teams = createTeamService(platformRoot, { now: () => at });
  const team = await teams.createTeam(principal("space-owner"), { name: "Single study space team", description: "one active space", kind: "study", visibility: "private", capacity: 3 });
  const firstService = createStudyService(join(platformRoot, "study"), { teamService: teams, now: () => at });
  const secondService = createStudyService(join(platformRoot, "study"), { teamService: teams, now: () => at });

  const results = await Promise.all([
    firstService.createStudySpace(principal("space-owner"), { teamId: team.id, title: "Concurrent room A", description: "same team invariant" }),
    secondService.createStudySpace(principal("space-owner"), { teamId: team.id, title: "Concurrent room B", description: "same team invariant" }),
  ]);

  assert.equal(results[0].id, results[1].id);
  assert.equal((await firstService.listStudySpaces(principal("space-owner"))).length, 1);
});

test("study manager mutations re-check authority after waiting for the Team membership lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-study-manager-lock-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  await users.createUser({ id: "study-lock-owner", email: "study-lock-owner@example.com", displayName: "Study lock owner", timezone: "Asia/Seoul" });
  const teams = createTeamService(platformRoot, { now: () => at });
  const team = await teams.createTeam(principal("study-lock-owner"), { name: "Study lock team", description: "manager recheck", kind: "study", visibility: "private", capacity: 3 });
  const studies = createStudyService(join(platformRoot, "study"), { teamService: teams, now: () => at });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableTeamMembershipLock(platformRoot, team.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  const createSpace = studies.createStudySpace(principal("study-lock-owner"), { teamId: team.id, title: "Should not persist", description: "manager is revoked while waiting" });
  assert.equal(await Promise.race([
    createSpace.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 40)),
  ]), false);
  const currentOwner = await loadMembershipUnlocked(platformRoot, team.id, "study-lock-owner");
  assert.ok(currentOwner);
  await saveMembershipUnlocked(platformRoot, { ...currentOwner, status: "removed", updatedAt: at });
  release();
  await Promise.all([holder, assert.rejects(() => createSpace, /manager/i)]);
  assert.deepEqual(await studies.listStudySpaces(principal("study-lock-owner")), []);
});

test("study submissions re-check active membership after waiting for the Team membership lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-study-member-lock-"));
  const platformRoot = join(root, "platform");
  const users = createPlatformUserService(platformRoot, { now: () => at });
  for (const id of ["study-submission-owner", "study-submission-member"]) await users.createUser({ id, email: `${id}@example.com`, displayName: id, timezone: "Asia/Seoul" });
  const teams = createTeamService(platformRoot, { now: () => at });
  const team = await teams.createTeam(principal("study-submission-owner"), { name: "Submission lock team", description: "member recheck", kind: "study", visibility: "private", capacity: 3 });
  await teams.addMember(team.id, "study-submission-member", "member", at);
  const studies = createStudyService(join(platformRoot, "study"), { teamService: teams, now: () => at });
  const space = await studies.createStudySpace(principal("study-submission-owner"), { teamId: team.id, title: "Submission lock room", description: "member is revoked while waiting" });
  const task = await studies.createTask(principal("study-submission-owner"), space.id, { title: "Lock task", instructions: "Submit only while active" });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableTeamMembershipLock(platformRoot, team.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  const submit = studies.saveTaskSubmission(principal("study-submission-member"), space.id, task.id, { answer: "This must not persist after removal.", status: "submitted" });
  assert.equal(await Promise.race([
    submit.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 40)),
  ]), false);
  const currentMember = await loadMembershipUnlocked(platformRoot, team.id, "study-submission-member");
  assert.ok(currentMember);
  await saveMembershipUnlocked(platformRoot, { ...currentMember, status: "removed", updatedAt: at });
  release();
  await Promise.all([holder, assert.rejects(() => submit, /study space/i)]);
  assert.deepEqual((await studies.getStudySpace(principal("study-submission-owner"), space.id))?.mySubmissions, []);
});

test("study space reads re-check active membership after waiting for the Team membership lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-study-read-lock-"));
  const platformRoot = join(root, "platform");
  const teams = createTeamService(platformRoot, { now: () => at });
  const owner = principal("study-read-lock-owner");
  const team = await teams.createTeam(owner, { name: "Study read lock team", description: "read access recheck", kind: "study", visibility: "private", capacity: 3 });
  const studies = createStudyService(join(platformRoot, "study"), { teamService: teams, now: () => at });
  const space = await studies.createStudySpace(owner, { teamId: team.id, title: "Read lock room", description: "membership changes while reading" });
  await studies.createTask(owner, space.id, { title: "Read lock task", instructions: "Only active members may read" });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableTeamMembershipLock(platformRoot, team.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const reading = studies.getStudySpace(owner, space.id).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  const membership = await loadMembershipUnlocked(platformRoot, team.id, owner.userId);
  assert.ok(membership);
  await saveMembershipUnlocked(platformRoot, { ...membership, status: "removed", updatedAt: at });
  release();
  assert.equal(await reading, null);
  await holder;
});

test("study space reads wait for the space lock and reload current state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-study-space-read-state-lock-"));
  const platformRoot = join(root, "platform");
  const owner = principal("study-space-state-owner");
  const teams = createTeamService(platformRoot, { now: () => at });
  const team = await teams.createTeam(owner, { name: "Study state lock team", description: "space state read recheck", kind: "study", visibility: "private", capacity: 3 });
  const studies = createStudyService(join(platformRoot, "study"), { teamService: teams, now: () => at });
  const space = await studies.createStudySpace(owner, { teamId: team.id, title: "State lock room", description: "space changes while reading" });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableStudySpaceLock(join(platformRoot, "study"), team.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let getSettled = false;
  let listSettled = false;
  const fetched = studies.getStudySpace(owner, space.id).then((result) => {
    getSettled = true;
    return result;
  });
  const listed = studies.listStudySpaces(owner).then((result) => {
    listSettled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(getSettled, false);
  assert.equal(listSettled, false);

  await saveStudySpaceUnlocked(join(platformRoot, "study"), { ...space, status: "archived", updatedAt: at });
  release();
  await holder;
  assert.equal(await fetched, null);
  assert.deepEqual(await listed, []);
});

test("study space reads wait for each personal submission lock and reload current state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-study-submission-read-lock-"));
  const platformRoot = join(root, "platform");
  const owner = principal("study-submission-read-owner");
  const member = principal("study-submission-read-member");
  const teams = createTeamService(platformRoot, { now: () => at });
  const team = await teams.createTeam(owner, { name: "Study submission read team", description: "submission projection recheck", kind: "study", visibility: "private", capacity: 3 });
  await teams.addMember(team.id, member.userId, "member", at);
  const studies = createStudyService(join(platformRoot, "study"), { teamService: teams, now: () => at });
  const space = await studies.createStudySpace(owner, { teamId: team.id, title: "Submission lock room", description: "personal answers re-read" });
  const task = await studies.createTask(owner, space.id, { title: "Explain locks", instructions: "Describe the read boundary" });
  const submission = await studies.saveTaskSubmission(member, space.id, task.id, { answer: "Before", status: "draft" });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableStudySubmissionLock(join(platformRoot, "study"), space.id, task.id, member.userId, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const reading = studies.getStudySpace(member, space.id).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  await saveTaskSubmissionUnlocked(join(platformRoot, "study"), { ...submission, answer: "After", updatedAt: at });
  release();
  await holder;
  assert.equal((await reading)?.mySubmissions[0]?.answer, "After");
});

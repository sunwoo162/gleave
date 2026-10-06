import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { assertIdentityId, assertTimestamp, type Principal } from "../identity/contracts.js";
import type { CurriculumLink, StudyService, StudyServiceOptions, StudySpace, StudyTask, StudyTaskSubmission } from "./contracts.js";
import { withDurableStudySubmissionLock } from "./submission-lock.js";
import { withDurableStudySpaceLock } from "./space-lock.js";
import { withDurableTeamMembershipLock } from "../teams/membership-lock.js";
import { listCurriculumLinksUnlocked, listStudySpaces, listStudySpacesUnlocked, listStudyTasksUnlocked, loadStudySpace, loadStudySpaceUnlocked, loadStudyTask, loadTaskSubmissionUnlocked, saveCurriculumLink, saveStudySpaceUnlocked, saveStudyTask, saveTaskSubmissionUnlocked } from "./store.js";

function ensurePrincipal(principal: Principal): void { assertIdentityId(principal.userId); }
function required(value: string, label: string, max: number): string { const trimmed = value.trim(); if (!trimmed || trimmed.length > max) throw new Error(`${label} is required`); return trimmed; }
function isActiveHumanMember(members: Array<{ userId: string; memberType: string; status: string }>, userId: string): boolean { return members.some((member) => member.userId === userId && member.memberType === "human" && member.status === "active"); }

export function createStudyService(root: string, options: StudyServiceOptions): StudyService {
  const now = options.now ?? (() => new Date().toISOString());
  const teamMembershipRoot = options.teamMembershipRoot ?? dirname(root);
  const withTeamMembershipMutationLock = <T>(teamId: string, task: () => Promise<T>, waitForMs = 2_000): Promise<T> => withDurableTeamMembershipLock(teamMembershipRoot, teamId, task, { waitForMs });
  const loadAccessibleSpace = async (principal: Principal, studySpaceId: string, membershipLockHeld = false, spaceLockHeld = false): Promise<StudySpace | null> => {
    ensurePrincipal(principal);
    try { assertIdentityId(studySpaceId); } catch { return null; }
    const space = spaceLockHeld ? await loadStudySpaceUnlocked(root, studySpaceId) : await loadStudySpace(root, studySpaceId);
    if (!space || space.status !== "active") return null;
    const team = membershipLockHeld ? await options.teamService.getTeamWithinMembershipLock(principal, space.teamId) : await options.teamService.getTeam(principal, space.teamId);
    return team && isActiveHumanMember(team.members, principal.userId) ? space : null;
  };
  const requireManager = async (principal: Principal, studySpaceId: string, membershipLockHeld = false): Promise<StudySpace> => {
    const space = await loadAccessibleSpace(principal, studySpaceId, membershipLockHeld);
    const manager = space && (membershipLockHeld ? await options.teamService.isManagerWithinMembershipLock(principal, space.teamId) : await options.teamService.isManager(principal, space.teamId));
    if (!space || !manager) throw new Error("Study manager access required");
    return space;
  };
  const withAccessibleSpaceMembershipLock = async <T>(principal: Principal, studySpaceId: string, task: (space: StudySpace) => Promise<T>): Promise<T | null> => {
    ensurePrincipal(principal);
    try { assertIdentityId(studySpaceId); } catch { return null; }
    const initial = await loadStudySpace(root, studySpaceId);
    if (!initial || initial.status !== "active") return null;
    return withDurableTeamMembershipLock(teamMembershipRoot, initial.teamId, async () => {
      const space = await loadAccessibleSpace(principal, studySpaceId, true);
      if (!space) return null;
      return withDurableStudySpaceLock(root, space.teamId, async () => {
        const current = await loadAccessibleSpace(principal, studySpaceId, true, true);
        return current ? task(current) : null;
      }, { waitForMs: 2_000 });
    }, { waitForMs: 2_000 });
  };

  return {
    async createStudySpace(principal, input) {
      ensurePrincipal(principal); assertIdentityId(input.teamId);
      if (!await options.teamService.isManager(principal, input.teamId)) throw new Error("Study manager access required");
      return withTeamMembershipMutationLock(input.teamId, async () => {
        if (!await options.teamService.isManagerWithinMembershipLock(principal, input.teamId)) throw new Error("Study manager access required");
        const team = await options.teamService.getTeamWithinMembershipLock(principal, input.teamId);
        if (!team || team.team.kind !== "study") throw new Error("Study team required");
        return withDurableStudySpaceLock(root, input.teamId, async () => {
          const existing = (await listStudySpacesUnlocked(root)).find((item) => item.teamId === input.teamId && item.status === "active");
          if (existing) return existing;
          const at = now(); assertTimestamp(at, "study space timestamp");
          const space: StudySpace = { version: 1, id: `study-${randomUUID()}`, teamId: input.teamId, ownerUserId: principal.userId, title: required(input.title, "Study title", 200), description: required(input.description, "Study description", 5_000), status: "active", createdAt: at, updatedAt: at };
          await saveStudySpaceUnlocked(root, space);
          await options.activityService?.recordActivityEvent(principal, { sourceType: "study", sourceId: space.id, eventType: "study.space.created", eventVersion: 1, actorType: "user", verificationStatus: "verified", payload: { teamId: space.teamId } });
          return space;
        }, { waitForMs: 2_000 });
      });
    },
    async listStudySpaces(principal) {
      ensurePrincipal(principal); const spaces = await listStudySpaces(root); const visible = (await Promise.all(spaces.filter((item) => item.status === "active").map((space) => withAccessibleSpaceMembershipLock(principal, space.id, async (accessible) => accessible)))).filter((space): space is StudySpace => Boolean(space));
      return visible.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    },
    async getStudySpace(principal, studySpaceId) {
      return withAccessibleSpaceMembershipLock(principal, studySpaceId, async (space) => {
        const [curriculumLinks, tasks] = await Promise.all([listCurriculumLinksUnlocked(root, space.id), listStudyTasksUnlocked(root, space.id)]);
        const mySubmissions: StudyTaskSubmission[] = [];
        for (const task of tasks) {
          const submission = await withDurableStudySubmissionLock(root, space.id, task.id, principal.userId, () => loadTaskSubmissionUnlocked(root, space.id, task.id, principal.userId), { waitForMs: 2_000 });
          if (submission) mySubmissions.push(submission);
        }
        return { space, curriculumLinks: curriculumLinks.sort((a, b) => a.createdAt.localeCompare(b.createdAt)), tasks: tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt)), mySubmissions: mySubmissions.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)) };
      });
    },
    async addCurriculumLink(principal, studySpaceId, input) {
      const initialSpace = await requireManager(principal, studySpaceId);
      return withTeamMembershipMutationLock(initialSpace.teamId, async () => {
        const space = await requireManager(principal, studySpaceId, true); if (!(input.kind === "learning-goal" || input.kind === "resource")) throw new Error("Invalid curriculum link kind");
        const referenceId = required(input.referenceId, "Curriculum reference", 240); const label = required(input.label, "Curriculum label", 240);
        if (input.kind === "learning-goal") { if (!options.learningService) throw new Error("Learning service unavailable"); if (!await options.learningService.getLearningGoal(principal, referenceId)) throw new Error("Learning goal not found"); }
        const at = now(); assertTimestamp(at, "curriculum link timestamp"); const link: CurriculumLink = { version: 1, id: `curriculum-${randomUUID()}`, studySpaceId: space.id, kind: input.kind, referenceId, label, createdByUserId: principal.userId, createdAt: at }; await saveCurriculumLink(root, link); return link;
      });
    },
    async createTask(principal, studySpaceId, input) {
      const initialSpace = await requireManager(principal, studySpaceId);
      return withTeamMembershipMutationLock(initialSpace.teamId, async () => {
        const space = await requireManager(principal, studySpaceId, true); const title = required(input.title, "Study task title", 240); const instructions = required(input.instructions, "Study task instructions", 10_000);
        if (input.dueLocalDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueLocalDate)) throw new Error("Invalid task due date");
        const at = now(); assertTimestamp(at, "study task timestamp"); const task: StudyTask = { version: 1, id: `study-task-${randomUUID()}`, studySpaceId: space.id, createdByUserId: principal.userId, title, instructions, ...(input.dueLocalDate ? { dueLocalDate: input.dueLocalDate } : {}), status: "open", createdAt: at, updatedAt: at }; await saveStudyTask(root, task); return task;
      });
    },
    async saveTaskSubmission(principal, studySpaceId, taskId, input) {
      const initialSpace = await loadStudySpaceUnlocked(root, studySpaceId); if (!initialSpace || initialSpace.status !== "active") throw new Error("Study space not found"); assertIdentityId(taskId); if (!(input.status === "draft" || input.status === "submitted")) throw new Error("Invalid submission status"); const answer = required(input.answer, "Study answer", 20_000);
      return withTeamMembershipMutationLock(initialSpace.teamId, async () => {
        const space = await loadAccessibleSpace(principal, studySpaceId, true); if (!space) throw new Error("Study space not found");
        return withDurableStudySubmissionLock(root, space.id, taskId, principal.userId, async () => {
          const task = await loadStudyTask(root, space.id, taskId); if (!task || task.status !== "open") throw new Error("Study task not found"); const previous = await loadTaskSubmissionUnlocked(root, space.id, task.id, principal.userId); const at = now(); assertTimestamp(at, "study submission timestamp"); const submission: StudyTaskSubmission = { version: 1, id: previous?.id ?? `submission-${randomUUID()}`, studySpaceId: space.id, taskId: task.id, userId: principal.userId, answer, status: input.status, createdAt: previous?.createdAt ?? at, updatedAt: at }; await saveTaskSubmissionUnlocked(root, submission); await options.activityService?.recordActivityEvent(principal, { sourceType: "study", sourceId: submission.id, eventType: "study.task.submission.saved", eventVersion: 1, actorType: "user", verificationStatus: "unverified", payload: { studySpaceId: space.id, taskId: task.id, submissionStatus: submission.status } }); return submission;
        }, { waitForMs: 2_000 });
      }, 10_000);
    },
  };
}

import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertIdentityId } from "../identity/contracts.js";
import type { CurriculumLink, StudySpace, StudyTask, StudyTaskSubmission } from "./contracts.js";
import { withDurableStudySpaceLock } from "./space-lock.js";
import { withDurableStudySubmissionLock } from "./submission-lock.js";

function studyPath(root: string, studySpaceId: string): string { assertIdentityId(studySpaceId); return resolve(root, "studies", studySpaceId, "study.json"); }
function linkPath(root: string, studySpaceId: string, linkId: string): string { assertIdentityId(studySpaceId); assertIdentityId(linkId); return resolve(root, "studies", studySpaceId, "curriculum-links", `${linkId}.json`); }
function taskPath(root: string, studySpaceId: string, taskId: string): string { assertIdentityId(studySpaceId); assertIdentityId(taskId); return resolve(root, "studies", studySpaceId, "tasks", `${taskId}.json`); }
function submissionPath(root: string, studySpaceId: string, taskId: string, userId: string): string { assertIdentityId(studySpaceId); assertIdentityId(taskId); assertIdentityId(userId); return resolve(root, "studies", studySpaceId, "tasks", taskId, "submissions", `${userId}.json`); }

async function saveJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await rename(temporary, path);
}
async function loadJson<T>(path: string): Promise<T | null> {
  try { return JSON.parse(await readFile(path, "utf8")) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
async function listJson<T>(directory: string): Promise<T[]> {
  let names: string[];
  try { names = await readdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const result: T[] = [];
  for (const name of names.filter((item) => item.endsWith(".json"))) {
    const value = await loadJson<T>(resolve(directory, name));
    if (value) result.push(value);
  }
  return result;
}

export const saveStudySpaceUnlocked = (root: string, value: StudySpace) => saveJson(studyPath(root, value.id), value);
export const saveStudySpace = (root: string, value: StudySpace) => withDurableStudySpaceLock(root, value.teamId, () => saveStudySpaceUnlocked(root, value), { waitForMs: 2_000 });
export const loadStudySpaceUnlocked = (root: string, studySpaceId: string) => loadJson<StudySpace>(studyPath(root, studySpaceId));
export async function loadStudySpace(root: string, studySpaceId: string): Promise<StudySpace | null> {
  const candidate = await loadStudySpaceUnlocked(root, studySpaceId);
  if (!candidate) return null;
  return withDurableStudySpaceLock(root, candidate.teamId, () => loadStudySpaceUnlocked(root, studySpaceId), { waitForMs: 2_000 });
}
export async function listStudySpacesUnlocked(root: string): Promise<StudySpace[]> {
  let names: string[];
  try { names = await readdir(resolve(root, "studies")); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const result: StudySpace[] = [];
  for (const name of names) { const value = await loadJson<StudySpace>(resolve(root, "studies", name, "study.json")); if (value) result.push(value); }
  return result;
}
export async function listStudySpaces(root: string): Promise<StudySpace[]> {
  const candidates = await listStudySpacesUnlocked(root);
  const result: StudySpace[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); assertIdentityId(candidate.teamId); } catch { continue; }
    await withDurableStudySpaceLock(root, candidate.teamId, async () => {
      const current = await loadStudySpaceUnlocked(root, candidate.id);
      if (current?.id === candidate.id) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}
async function withStudySpaceLock<T>(root: string, studySpaceId: string, task: () => Promise<T>): Promise<T> {
  const space = await loadStudySpaceUnlocked(root, studySpaceId);
  return space ? withDurableStudySpaceLock(root, space.teamId, task, { waitForMs: 2_000 }) : task();
}
export const saveCurriculumLinkUnlocked = (root: string, value: CurriculumLink) => saveJson(linkPath(root, value.studySpaceId, value.id), value);
export const saveCurriculumLink = (root: string, value: CurriculumLink) => withStudySpaceLock(root, value.studySpaceId, () => saveCurriculumLinkUnlocked(root, value));
export const listCurriculumLinksUnlocked = (root: string, studySpaceId: string) => listJson<CurriculumLink>(resolve(root, "studies", studySpaceId, "curriculum-links"));
export const listCurriculumLinks = (root: string, studySpaceId: string) => withStudySpaceLock(root, studySpaceId, () => listCurriculumLinksUnlocked(root, studySpaceId));
export const saveStudyTaskUnlocked = (root: string, value: StudyTask) => saveJson(taskPath(root, value.studySpaceId, value.id), value);
export const saveStudyTask = (root: string, value: StudyTask) => withStudySpaceLock(root, value.studySpaceId, () => saveStudyTaskUnlocked(root, value));
export const loadStudyTaskUnlocked = (root: string, studySpaceId: string, taskId: string) => loadJson<StudyTask>(taskPath(root, studySpaceId, taskId));
export const loadStudyTask = (root: string, studySpaceId: string, taskId: string) => withStudySpaceLock(root, studySpaceId, () => loadStudyTaskUnlocked(root, studySpaceId, taskId));
export const listStudyTasksUnlocked = (root: string, studySpaceId: string) => listJson<StudyTask>(resolve(root, "studies", studySpaceId, "tasks"));
export const listStudyTasks = (root: string, studySpaceId: string) => withStudySpaceLock(root, studySpaceId, () => listStudyTasksUnlocked(root, studySpaceId));
export const saveTaskSubmissionUnlocked = (root: string, value: StudyTaskSubmission) => saveJson(submissionPath(root, value.studySpaceId, value.taskId, value.userId), value);
export const saveTaskSubmission = (root: string, value: StudyTaskSubmission) => withDurableStudySubmissionLock(root, value.studySpaceId, value.taskId, value.userId, () => saveTaskSubmissionUnlocked(root, value), { waitForMs: 2_000 });
export const loadTaskSubmissionUnlocked = (root: string, studySpaceId: string, taskId: string, userId: string) => loadJson<StudyTaskSubmission>(submissionPath(root, studySpaceId, taskId, userId));
export const loadTaskSubmission = (root: string, studySpaceId: string, taskId: string, userId: string) => withDurableStudySubmissionLock(root, studySpaceId, taskId, userId, () => loadTaskSubmissionUnlocked(root, studySpaceId, taskId, userId), { waitForMs: 2_000 });

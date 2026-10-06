import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertIdentityId } from "../identity/contracts.js";
import type { RecruitmentApplication, RecruitmentPost } from "./contracts.js";
import { withDurableRecruitmentReviewLock } from "./review-lock.js";
import { withDurableTeamMembershipLock } from "../teams/membership-lock.js";

function base(root: string): string { return resolve(root, "recruitment"); }
function postPath(root: string, id: string): string { assertIdentityId(id); return resolve(base(root), "posts", `${id}.json`); }
function applicationPath(root: string, id: string): string { assertIdentityId(id); return resolve(base(root), "applications", `${id}.json`); }
async function saveJson(path: string, value: unknown): Promise<void> { await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`; await writeFile(temporary, JSON.stringify(value, null, 2), "utf8"); await rename(temporary, path); }
async function loadJson<T>(path: string): Promise<T | null> { try { return JSON.parse(await readFile(path, "utf8")) as T; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } }
async function listJson<T>(directory: string): Promise<T[]> { let names: string[]; try { names = await readdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; } const values: T[] = []; for (const name of names.filter((item) => item.endsWith(".json"))) { const value = await loadJson<T>(resolve(directory, name)); if (value) values.push(value); } return values; }
export const savePostUnlocked = (root: string, value: RecruitmentPost) => saveJson(postPath(root, value.id), value);
export const savePost = (root: string, value: RecruitmentPost) => withDurableTeamMembershipLock(root, value.teamId, () => savePostUnlocked(root, value), { waitForMs: 2_000 });
export const loadPostUnlocked = (root: string, id: string) => loadJson<RecruitmentPost>(postPath(root, id));
export async function loadPost(root: string, id: string): Promise<RecruitmentPost | null> {
  const candidate = await loadPostUnlocked(root, id);
  if (!candidate) return null;
  return withDurableTeamMembershipLock(root, candidate.teamId, () => loadPostUnlocked(root, id), { waitForMs: 2_000 });
}
export const listPostsUnlocked = (root: string) => listJson<RecruitmentPost>(resolve(base(root), "posts"));
export async function listPosts(root: string): Promise<RecruitmentPost[]> {
  const candidates = await listPostsUnlocked(root);
  const values: RecruitmentPost[] = [];
  for (const candidate of candidates) {
    await withDurableTeamMembershipLock(root, candidate.teamId, async () => {
      const current = await loadPostUnlocked(root, candidate.id);
      if (current?.id === candidate.id) values.push(current);
    }, { waitForMs: 2_000 });
  }
  return values;
}
export const saveApplicationUnlocked = (root: string, value: RecruitmentApplication) => saveJson(applicationPath(root, value.id), value);
export const saveApplication = (root: string, value: RecruitmentApplication) => withDurableRecruitmentReviewLock(root, value.id, () => saveApplicationUnlocked(root, value), { waitForMs: 2_000 });
export const loadApplicationUnlocked = (root: string, id: string) => loadJson<RecruitmentApplication>(applicationPath(root, id));
export const loadApplication = (root: string, id: string) => withDurableRecruitmentReviewLock(root, id, () => loadApplicationUnlocked(root, id), { waitForMs: 2_000 });
export const listApplicationsUnlocked = (root: string) => listJson<RecruitmentApplication>(resolve(base(root), "applications"));
export async function listApplications(root: string): Promise<RecruitmentApplication[]> {
  const candidates = await listApplicationsUnlocked(root);
  const values: RecruitmentApplication[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); } catch { continue; }
    await withDurableRecruitmentReviewLock(root, candidate.id, async () => {
      const current = await loadApplicationUnlocked(root, candidate.id);
      if (current?.id === candidate.id) values.push(current);
    }, { waitForMs: 2_000 });
  }
  return values;
}

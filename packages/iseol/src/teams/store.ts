import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertIdentityId } from "../identity/contracts.js";
import type { TeamMembership, TeamRecord, TeamApprovalScope, TeamCapability, TeamMemberType } from "./contracts.js";
import { withDurableTeamMembershipLock } from "./membership-lock.js";

function teamDirectory(root: string): string { return resolve(root, "teams"); }
function teamPath(root: string, teamId: string): string { assertIdentityId(teamId); return resolve(teamDirectory(root), teamId, "team.json"); }
function memberPath(root: string, teamId: string, userId: string): string { assertIdentityId(teamId); assertIdentityId(userId); return resolve(teamDirectory(root), teamId, "members", `${userId}.json`); }

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
  const values: T[] = [];
  for (const name of names.filter((item) => item.endsWith(".json"))) {
    const value = await loadJson<T>(resolve(directory, name));
    if (value) values.push(value);
  }
  return values;
}

export const saveTeamUnlocked = (root: string, value: TeamRecord) => saveJson(teamPath(root, value.id), value);
export const saveTeam = (root: string, value: TeamRecord) => withDurableTeamMembershipLock(root, value.id, () => saveTeamUnlocked(root, value), { waitForMs: 2_000 });
export const loadTeamUnlocked = (root: string, teamId: string) => loadJson<TeamRecord>(teamPath(root, teamId));
export const loadTeam = (root: string, teamId: string) => withDurableTeamMembershipLock(root, teamId, () => loadTeamUnlocked(root, teamId), { waitForMs: 2_000 });
export async function listTeamsUnlocked(root: string): Promise<TeamRecord[]> {
  let names: string[];
  try { names = await readdir(teamDirectory(root)); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const values: TeamRecord[] = [];
  for (const name of names) {
    const value = await loadJson<TeamRecord>(resolve(teamDirectory(root), name, "team.json"));
    if (value) values.push(value);
  }
  return values;
}
export async function listTeams(root: string): Promise<TeamRecord[]> {
  const candidates = await listTeamsUnlocked(root);
  const values: TeamRecord[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); } catch { continue; }
    await withDurableTeamMembershipLock(root, candidate.id, async () => {
      const current = await loadTeamUnlocked(root, candidate.id);
      if (current) values.push(current);
    }, { waitForMs: 2_000 });
  }
  return values;
}
function normalizeMembership(value: Omit<TeamMembership, "memberType" | "assignmentRole" | "capabilities" | "approvalScope"> & Partial<Pick<TeamMembership, "memberType" | "assignmentRole" | "capabilities" | "approvalScope">>): TeamMembership {
  const memberType: TeamMemberType = value.memberType === "ai" ? "ai" : "human";
  const approvalScope: TeamApprovalScope = value.approvalScope === "owner-approved-execution" ? "owner-approved-execution" : "suggestion-only";
  const capabilities: TeamCapability[] = Array.isArray(value.capabilities) ? [...value.capabilities] : [];
  return {
    ...value,
    memberType,
    assignmentRole: value.assignmentRole?.trim() || value.role,
    capabilities,
    approvalScope,
    ...(memberType === "ai" && value.aiMemberId ? { aiMemberId: value.aiMemberId } : {}),
  };
}

export const saveMembershipUnlocked = (root: string, value: TeamMembership) => saveJson(memberPath(root, value.teamId, value.userId), normalizeMembership(value));
export const saveMembership = (root: string, value: TeamMembership) => withDurableTeamMembershipLock(root, value.teamId, () => saveMembershipUnlocked(root, value), { waitForMs: 2_000 });
export async function loadMembershipUnlocked(root: string, teamId: string, userId: string): Promise<TeamMembership | null> {
  const value = await loadJson<Parameters<typeof normalizeMembership>[0]>(memberPath(root, teamId, userId));
  return value ? normalizeMembership(value) : null;
}
export const loadMembership = (root: string, teamId: string, userId: string) => withDurableTeamMembershipLock(root, teamId, () => loadMembershipUnlocked(root, teamId, userId), { waitForMs: 2_000 });
export async function listMembershipsUnlocked(root: string, teamId: string): Promise<TeamMembership[]> { return (await listJson<Parameters<typeof normalizeMembership>[0]>(resolve(teamDirectory(root), teamId, "members"))).map(normalizeMembership); }
export const listMemberships = (root: string, teamId: string) => withDurableTeamMembershipLock(root, teamId, () => listMembershipsUnlocked(root, teamId), { waitForMs: 2_000 });

import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertIdentityId } from "../identity/contracts.js";
import { withDurableTeamMembershipLock } from "../teams/membership-lock.js";
import type { TeamMessage } from "./contracts.js";

function messageDirectory(root: string, teamId: string): string { assertIdentityId(teamId); return resolve(root, "team-chat", "teams", teamId, "messages"); }
function messagePath(root: string, teamId: string, messageId: string): string { assertIdentityId(messageId); return resolve(messageDirectory(root, teamId), `${messageId}.json`); }

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

export const saveTeamMessageUnlocked = (root: string, value: TeamMessage) => saveJson(messagePath(root, value.teamId, value.id), value);
export const saveTeamMessage = (root: string, value: TeamMessage) => withDurableTeamMembershipLock(root, value.teamId, () => saveTeamMessageUnlocked(root, value), { waitForMs: 2_000 });
export const loadTeamMessageUnlocked = (root: string, teamId: string, messageId: string) => loadJson<TeamMessage>(messagePath(root, teamId, messageId));
export const loadTeamMessage = (root: string, teamId: string, messageId: string) => withDurableTeamMembershipLock(root, teamId, () => loadTeamMessageUnlocked(root, teamId, messageId), { waitForMs: 2_000 });
export async function listTeamMessagesUnlocked(root: string, teamId: string): Promise<TeamMessage[]> {
  const directory = messageDirectory(root, teamId);
  let names: string[];
  try { names = await readdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const result: TeamMessage[] = [];
  for (const name of names.filter((item) => item.endsWith(".json")).sort()) {
    const value = await loadJson<TeamMessage>(resolve(directory, name));
    if (value) result.push(value);
  }
  return result;
}
export const listTeamMessages = (root: string, teamId: string) => withDurableTeamMembershipLock(root, teamId, () => listTeamMessagesUnlocked(root, teamId), { waitForMs: 2_000 });

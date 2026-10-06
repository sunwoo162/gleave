import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { assertIdentityId } from "../identity/contracts.js";
import type { AiAgentProfile } from "./contracts.js";
import { withDurableAiAgentProfileLock } from "./profile-lock.js";

function profilePath(root: string, userId: string): string {
  assertIdentityId(userId);
  return resolve(root, "users", userId, "ai-agent", "profile.json");
}

export async function loadAiAgentProfileUnlocked(root: string, userId: string): Promise<AiAgentProfile | null> {
  try {
    return JSON.parse(await readFile(profilePath(root, userId), "utf8")) as AiAgentProfile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function loadAiAgentProfile(root: string, userId: string): Promise<AiAgentProfile | null> {
  return withDurableAiAgentProfileLock(root, userId, () => loadAiAgentProfileUnlocked(root, userId), { waitForMs: 2_000 });
}

export async function saveAiAgentProfileUnlocked(root: string, profile: AiAgentProfile): Promise<void> {
  const path = profilePath(root, profile.userId);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporary, JSON.stringify(profile, null, 2), "utf8");
  await rename(temporary, path);
}

export async function saveAiAgentProfile(root: string, profile: AiAgentProfile): Promise<void> {
  await withDurableAiAgentProfileLock(root, profile.userId, () => saveAiAgentProfileUnlocked(root, profile), { waitForMs: 2_000 });
}

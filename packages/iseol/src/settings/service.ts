import { assertIdentityId, assertTimestamp, type Principal } from "../identity/contracts.js";
import type { SettingsService, UserSettings, UserSettingsPatch } from "./contracts.js";
import { withDurableSettingsLock } from "./settings-lock.js";
import { loadSettingsUnlocked, saveSettingsUnlocked } from "./store.js";

const defaults: Omit<UserSettings, "version" | "userId" | "createdAt" | "updatedAt"> = {
  aiAccess: { memory: true, projectFiles: true, learningHistory: true, activityTimeline: true, teamDocs: false },
  aiApproval: { fileWrite: true, packageInstall: true, buildRun: false, externalApi: true },
  notifications: { aiDone: true, teamInvite: true, newMessage: true, achieve: true, weekly: false },
  privacy: { growthInfo: true, projectList: true, learningHistory: false },
  integrations: { calendar: false, github: false, discord: false },
};

function ensurePrincipal(principal: Principal): void { assertIdentityId(principal.userId); }
function booleanPatch<T extends Record<string, boolean>>(current: T, patch: Partial<T> | undefined, label: string): T {
  if (!patch) return { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in current) || typeof value !== "boolean") throw new Error(`Invalid ${label} setting`);
  }
  return { ...current, ...patch };
}

export function createSettingsService(root: string, options: { now?: () => string } = {}): SettingsService {
  const now = options.now ?? (() => new Date().toISOString());
  async function readSettings(principal: Principal): Promise<UserSettings> {
    const existing = await loadSettingsUnlocked(root, principal.userId);
    if (existing && existing.userId === principal.userId) {
      const normalized: UserSettings = {
        ...existing,
        aiAccess: { ...defaults.aiAccess, ...existing.aiAccess },
        aiApproval: { ...defaults.aiApproval, ...existing.aiApproval },
        notifications: { ...defaults.notifications, ...existing.notifications },
        privacy: { ...defaults.privacy, ...existing.privacy },
        integrations: { ...defaults.integrations, ...existing.integrations },
      };
      if (JSON.stringify(normalized) !== JSON.stringify(existing)) await saveSettingsUnlocked(root, normalized);
      return normalized;
    }
    const at = now();
    assertTimestamp(at, "settings timestamp");
    const created: UserSettings = { version: 1, userId: principal.userId, ...defaults, createdAt: at, updatedAt: at };
    await saveSettingsUnlocked(root, created);
    return created;
  }
  return {
    async getSettings(principal) {
      ensurePrincipal(principal);
      return withDurableSettingsLock(root, principal.userId, () => readSettings(principal), { waitForMs: 2_000 });
    },
    async updateSettings(principal, patch: UserSettingsPatch) {
      ensurePrincipal(principal);
      return withDurableSettingsLock(root, principal.userId, async () => {
        const current = await readSettings(principal);
        if (!patch || typeof patch !== "object") throw new Error("Settings patch is required");
        const at = now();
        assertTimestamp(at, "settings timestamp");
        const next: UserSettings = {
          ...current,
          aiAccess: booleanPatch(current.aiAccess, patch.aiAccess, "AI access"),
          aiApproval: booleanPatch(current.aiApproval, patch.aiApproval, "AI approval"),
          notifications: booleanPatch(current.notifications, patch.notifications, "notification"),
          privacy: booleanPatch(current.privacy, patch.privacy, "privacy"),
          integrations: booleanPatch(current.integrations, patch.integrations, "integration"),
          updatedAt: at,
        };
        await saveSettingsUnlocked(root, next);
        return next;
      }, { waitForMs: 2_000 });
    },
  };
}

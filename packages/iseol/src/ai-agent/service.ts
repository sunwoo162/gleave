import { assertIdentityId, assertTimestamp, type Principal } from "../identity/contracts.js";
import type { AiAgentProfile, AiAgentProfilePatch, AiAgentProfileService } from "./contracts.js";
import { withDurableAiAgentProfileLock } from "./profile-lock.js";
import { loadAiAgentProfileUnlocked, saveAiAgentProfileUnlocked } from "./store.js";

const DEFAULT_NAME = "이설";
const DEFAULT_PERSONALITY = "사용자와 함께 배우고 만드는 개인 AI";
const DEFAULT_TONE = "친근하고 간결한 말투";
const DEFAULT_ROLE = "개인 AI 동반자";

function ensureText(value: string | undefined, field: string, max: number): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length > max) throw new Error(`${field} must be at most ${max} characters`);
  return trimmed;
}

function ensureName(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Agent name is required");
  if (trimmed.length > 40) throw new Error("Agent name must be between 1 and 40 characters");
  return trimmed;
}

function ensureAvatarUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length > 2_048) throw new Error("Agent avatar URL must be at most 2048 characters");
  if (/[\\\u0000-\u001f\u007f]/.test(trimmed) || /%5c/i.test(trimmed)) {
    throw new Error("Agent avatar URL must be an http, https, or image data URL");
  }
  if (trimmed.startsWith("data:image/")) return trimmed;
  try {
    const url = new URL(trimmed);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:")
      || url.username
      || url.password
      || !url.hostname
    ) throw new Error("unsupported avatar URL");
    return trimmed;
  } catch {
    throw new Error("Agent avatar URL must be an http, https, or image data URL");
  }
}

function validatePatch(patch: AiAgentProfilePatch): AiAgentProfilePatch {
  return {
    ...(patch.name !== undefined ? { name: ensureName(patch.name)! } : {}),
    ...(patch.avatarUrl !== undefined ? { avatarUrl: ensureAvatarUrl(patch.avatarUrl)! } : {}),
    ...(patch.personality !== undefined ? { personality: ensureText(patch.personality, "Agent personality", 500)! } : {}),
    ...(patch.tone !== undefined ? { tone: ensureText(patch.tone, "Agent tone", 200)! } : {}),
    ...(patch.role !== undefined ? { role: ensureText(patch.role, "Agent role", 200)! } : {}),
  };
}

function defaultProfile(userId: string, at: string): AiAgentProfile {
  assertIdentityId(userId);
  assertTimestamp(at, "agent profile timestamp");
  return {
    version: 1,
    userId,
    agentId: "default",
    name: DEFAULT_NAME,
    avatarUrl: "",
    personality: DEFAULT_PERSONALITY,
    tone: DEFAULT_TONE,
    role: DEFAULT_ROLE,
    createdAt: at,
    updatedAt: at,
  };
}

export function createAiAgentProfileService(root: string, options: { now?: () => string } = {}): AiAgentProfileService {
  const now = options.now ?? (() => new Date().toISOString());
  return {
    async getProfile(principal): Promise<AiAgentProfile> {
      assertIdentityId(principal.userId);
      return withDurableAiAgentProfileLock(root, principal.userId, async () => {
        return (await loadAiAgentProfileUnlocked(root, principal.userId)) ?? defaultProfile(principal.userId, now());
      }, { waitForMs: 2_000 });
    },
    async updateProfile(principal: Principal, patch: AiAgentProfilePatch): Promise<AiAgentProfile> {
      assertIdentityId(principal.userId);
      return withDurableAiAgentProfileLock(root, principal.userId, async () => {
        const current = (await loadAiAgentProfileUnlocked(root, principal.userId)) ?? defaultProfile(principal.userId, now());
        const validated = validatePatch(patch);
        const updated: AiAgentProfile = { ...current, ...validated, updatedAt: now() };
        assertTimestamp(updated.updatedAt, "agent profile timestamp");
        await saveAiAgentProfileUnlocked(root, updated);
        return updated;
      }, { waitForMs: 2_000 });
    },
  };
}

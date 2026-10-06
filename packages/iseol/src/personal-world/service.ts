import { assertIdentityId, assertTimestamp, type Principal } from "../identity/contracts.js";
import type {
  CharacterPatch,
  CharacterRecord,
  CharacterType,
  PersonalWorldService,
  WorldPatch,
  WorldRecord,
} from "./contracts.js";
import { withDurablePersonalWorldLock } from "./world-lock.js";
import { loadCharacterUnlocked, loadWorldUnlocked, saveCharacterUnlocked, saveWorldUnlocked } from "./store.js";

const CHARACTER_TYPES = new Set<CharacterType>(["a", "b", "c", "d"]);

function ensurePrincipal(principal: Principal): void {
  assertIdentityId(principal.userId);
}

function ensureCharacter(value: CharacterType | undefined): void {
  if (value !== undefined && !CHARACTER_TYPES.has(value)) throw new Error("Invalid character type");
}

function cleanList(value: string[] | undefined, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim() || item.length > 100)) {
    throw new Error(`${label} must contain non-empty strings`);
  }
  return [...new Set(value.map((item) => item.trim()))].slice(0, 32);
}

function defaultWorld(userId: string, at: string): WorldRecord {
  return {
    version: 1,
    userId,
    displayName: "이설 사용자",
    handle: `user_${userId.slice(0, 12)}`,
    character: "a",
    interests: [],
    activities: [],
    onboardingCompleted: false,
    createdAt: at,
    updatedAt: at,
  };
}

function defaultCharacter(userId: string, character: CharacterType, at: string): CharacterRecord {
  return { version: 1, userId, character, appearance: {}, updatedAt: at };
}

async function readWorld(root: string, userId: string, at: string): Promise<WorldRecord> {
  const existing = await loadWorldUnlocked(root, userId);
  if (existing) return existing;
  const world = defaultWorld(userId, at);
  await saveWorldUnlocked(root, world);
  return world;
}

export function createPersonalWorldService(root: string, options: { now?: () => string } = {}): PersonalWorldService {
  const now = options.now ?? (() => new Date().toISOString());

  return {
    async getWorld(principal): Promise<WorldRecord> {
      ensurePrincipal(principal);
      const at = now();
      assertTimestamp(at, "world timestamp");
      return withDurablePersonalWorldLock(root, principal.userId, () => readWorld(root, principal.userId, at), { waitForMs: 2_000 });
    },

    async updateWorld(principal, patch: WorldPatch): Promise<WorldRecord> {
      ensurePrincipal(principal);
      ensureCharacter(patch.character);
      const interests = cleanList(patch.interests, "interests");
      const activities = cleanList(patch.activities, "activities");
      if (patch.displayName !== undefined && (!patch.displayName.trim() || patch.displayName.length > 120)) throw new Error("Invalid display name");
      if (patch.handle !== undefined && !/^[A-Za-z0-9_-]{1,64}$/.test(patch.handle.trim())) throw new Error("Invalid handle");
      if (patch.onboardingCompleted !== undefined && typeof patch.onboardingCompleted !== "boolean") throw new Error("Invalid onboarding state");
      const at = now();
      assertTimestamp(at, "world timestamp");
      return withDurablePersonalWorldLock(root, principal.userId, async () => {
        const current = await loadWorldUnlocked(root, principal.userId) ?? defaultWorld(principal.userId, at);
        const next: WorldRecord = {
          ...current,
          ...(patch.displayName === undefined ? {} : { displayName: patch.displayName.trim() }),
          ...(patch.handle === undefined ? {} : { handle: patch.handle.trim() }),
          ...(patch.character === undefined ? {} : { character: patch.character }),
          ...(interests === undefined ? {} : { interests }),
          ...(activities === undefined ? {} : { activities }),
          ...(patch.onboardingCompleted === undefined ? {} : { onboardingCompleted: patch.onboardingCompleted }),
          updatedAt: at,
        };
        await saveWorldUnlocked(root, next);
        const character = await loadCharacterUnlocked(root, principal.userId);
        if (character) await saveCharacterUnlocked(root, { ...character, character: next.character, updatedAt: at });
        return next;
      }, { waitForMs: 2_000 });
    },

    async getCharacter(principal): Promise<CharacterRecord> {
      ensurePrincipal(principal);
      const at = now();
      assertTimestamp(at, "character timestamp");
      return withDurablePersonalWorldLock(root, principal.userId, async () => {
        const existing = await loadCharacterUnlocked(root, principal.userId);
        if (existing) return existing;
        const world = await readWorld(root, principal.userId, at);
        const character = defaultCharacter(principal.userId, world.character, at);
        await saveCharacterUnlocked(root, character);
        return character;
      }, { waitForMs: 2_000 });
    },

    async updateCharacter(principal, patch: CharacterPatch): Promise<CharacterRecord> {
      ensurePrincipal(principal);
      ensureCharacter(patch.character);
      if (patch.appearance !== undefined) {
        if (typeof patch.appearance !== "object" || Array.isArray(patch.appearance) || Object.keys(patch.appearance).length > 32) throw new Error("Invalid character appearance");
        for (const [key, value] of Object.entries(patch.appearance)) {
          if (!/^[A-Za-z0-9_-]{1,64}$/.test(key) || !["string", "number", "boolean"].includes(typeof value)) throw new Error("Invalid character appearance");
        }
      }
      const at = now();
      assertTimestamp(at, "character timestamp");
      return withDurablePersonalWorldLock(root, principal.userId, async () => {
        const world = await readWorld(root, principal.userId, at);
        const current = await loadCharacterUnlocked(root, principal.userId) ?? defaultCharacter(principal.userId, world.character, at);
        const next: CharacterRecord = {
          ...current,
          ...(patch.character === undefined ? {} : { character: patch.character }),
          ...(patch.appearance === undefined ? {} : { appearance: { ...current.appearance, ...patch.appearance } }),
          updatedAt: at,
        };
        await saveCharacterUnlocked(root, next);
        if (world.character !== next.character) await saveWorldUnlocked(root, { ...world, character: next.character, updatedAt: at });
        return next;
      }, { waitForMs: 2_000 });
    },
  };
}

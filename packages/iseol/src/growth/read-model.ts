import { assertIdentityId, assertTimestamp, type Principal } from "../identity/contracts.js";
import type { ActivityEvent } from "../activity/contracts.js";
import type { GrowthAchievement, GrowthLedgerEntry, GrowthService, GrowthServiceOptions, GrowthSnapshot } from "./contracts.js";
import { withDurableGrowthProjectionLock } from "./projection-lock.js";
import { growthProjection, listGrowthEntries, listGrowthEntriesUnlocked, loadGrowthEntryUnlocked, saveGrowthEntryUnlocked } from "./ledger.js";

function ensurePrincipal(principal: Principal): void { assertIdentityId(principal.userId); }

const ACHIEVEMENT_DEFINITIONS: Array<Pick<GrowthAchievement, "id" | "badgeKey" | "title" | "description"> & { matches: (entry: GrowthLedgerEntry) => boolean }> = [
  { id: "first-evidence", badgeKey: "verified-evidence-1", title: "첫 검증 기록", description: "검증된 성장 증거를 처음 남겼습니다.", matches: () => true },
  { id: "learning-session", badgeKey: "learning-session-1", title: "학습 기록", description: "검증된 학습 세션을 완료했습니다.", matches: (entry) => entry.stat === "learning" },
  { id: "project-run", badgeKey: "project-run-1", title: "프로젝트 실행", description: "검증된 프로젝트 실행을 완료했습니다.", matches: (entry) => entry.stat === "development" },
  { id: "collaboration", badgeKey: "collaboration-1", title: "협업 기록", description: "검증된 협업 활동을 완료했습니다.", matches: (entry) => entry.stat === "collaboration" },
  { id: "consistency", badgeKey: "consistency-1", title: "꾸준한 한 걸음", description: "검증된 연속 활동 기록을 남겼습니다.", matches: (entry) => entry.stat === "consistency" },
];

function activeGrowthEntries(entries: GrowthLedgerEntry[]): GrowthLedgerEntry[] {
  const byEvent = new Map<string, { netXp: number; entries: GrowthLedgerEntry[] }>();
  for (const entry of entries) {
    const current = byEvent.get(entry.eventId) ?? { netXp: 0, entries: [] };
    current.netXp += entry.xpDelta;
    current.entries.push(entry);
    byEvent.set(entry.eventId, current);
  }
  return [...byEvent.values()]
    .filter((group) => group.netXp > 0)
    .map((group) => group.entries.find((entry) => entry.xpDelta > 0) ?? group.entries[0])
    .filter((entry): entry is GrowthLedgerEntry => Boolean(entry));
}

function achievementsFor(entries: GrowthLedgerEntry[]): GrowthAchievement[] {
  const active = activeGrowthEntries(entries);
  return ACHIEVEMENT_DEFINITIONS.flatMap((definition) => {
    const evidence = active.filter(definition.matches).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (!evidence.length) return [];
    const firstEvidence = evidence[0];
    if (!firstEvidence) return [];
    return [{
      id: definition.id,
      badgeKey: definition.badgeKey,
      title: definition.title,
      description: definition.description,
      unlockedAt: firstEvidence.createdAt,
      evidenceEventIds: [...new Set(evidence.map((entry) => entry.eventId))].sort(),
    }];
  });
}

async function readLockedGrowthEntries(root: string, userId: string, candidates: GrowthLedgerEntry[]): Promise<GrowthLedgerEntry[]> {
  const idsByEvent = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    if (candidate.userId !== userId) continue;
    try {
      assertIdentityId(candidate.id);
      assertIdentityId(candidate.eventId);
    } catch {
      continue;
    }
    const ids = idsByEvent.get(candidate.eventId) ?? new Set<string>();
    ids.add(candidate.id);
    idsByEvent.set(candidate.eventId, ids);
  }

  const entries: GrowthLedgerEntry[] = [];
  for (const [eventId, ids] of idsByEvent) {
    const refreshed = await withDurableGrowthProjectionLock(root, userId, eventId, async () => {
      const loaded = await Promise.all([...ids].map((entryId) => loadGrowthEntryUnlocked(root, userId, entryId)));
      return loaded.filter((entry): entry is GrowthLedgerEntry => {
        if (!entry) return false;
        return entry.userId === userId && entry.eventId === eventId;
      });
    }, { waitForMs: 2_000 });
    entries.push(...refreshed);
  }
  return entries;
}

export function createGrowthService(root: string, options: GrowthServiceOptions = {}): GrowthService {
  const now = options.now ?? (() => new Date().toISOString());
  return {
    async applyGrowthProjection(event: ActivityEvent): Promise<GrowthLedgerEntry | null> {
      assertIdentityId(event.userId);
      if (event.verificationStatus !== "verified") return null;
      const projection = growthProjection(event);
      if (!projection) return null;
      const activeId = `growth-${event.id}-active`;
      return withDurableGrowthProjectionLock(root, event.userId, event.id, async () => {
        if (event.status === "active") {
          const existing = await loadGrowthEntryUnlocked(root, event.userId, activeId);
          if (existing) return existing;
          const beforeEntries = await listGrowthEntriesUnlocked(root, event.userId);
          const beforeAchievements = achievementsFor(beforeEntries);
          const at = now();
          assertTimestamp(at, "growth timestamp");
          const entry: GrowthLedgerEntry = { version: 1, id: activeId, userId: event.userId, eventId: event.id, actorType: event.actorType, xpDelta: projection.xpDelta, stat: projection.stat, statDelta: projection.xpDelta, createdAt: at };
          await saveGrowthEntryUnlocked(root, entry);
          if (options.notificationService) {
            let enabled = !options.settingsService;
            if (options.settingsService) {
              try {
                enabled = (await options.settingsService.getSettings({ userId: event.userId, sessionId: "notification-system", roles: ["system"] })).notifications.achieve;
              } catch {
                enabled = false;
              }
            }
            if (enabled) {
              const afterAchievements = achievementsFor([...beforeEntries, entry]);
              const beforeIds = new Set(beforeAchievements.map((achievement) => achievement.id));
              for (const achievement of afterAchievements.filter((candidate) => !beforeIds.has(candidate.id))) {
                const evidenceEventId = achievement.evidenceEventIds[0];
                if (!evidenceEventId) continue;
                await options.notificationService.createAchievementNotification({ userId: event.userId, achievementId: achievement.id, evidenceEventId, title: achievement.title, body: achievement.description, createdAt: at });
              }
            }
          }
          return entry;
        }
        const active = await loadGrowthEntryUnlocked(root, event.userId, activeId);
        if (!active) return null;
        const correctionId = `growth-${event.id}-retracted`;
        const existingCorrection = await loadGrowthEntryUnlocked(root, event.userId, correctionId);
        if (existingCorrection) return existingCorrection;
        const at = now();
        assertTimestamp(at, "growth correction timestamp");
        const correction: GrowthLedgerEntry = { ...active, id: correctionId, xpDelta: -active.xpDelta, statDelta: -active.statDelta, createdAt: at };
        await saveGrowthEntryUnlocked(root, correction);
        return correction;
      }, { waitForMs: 2_000 });
    },

    async getGrowthSnapshot(principal): Promise<GrowthSnapshot> {
      ensurePrincipal(principal);
      const candidates = await listGrowthEntries(root, principal.userId);
      const entries = await readLockedGrowthEntries(root, principal.userId, candidates);
      const stats = { development: 0, learning: 0, collaboration: 0, consistency: 0 } as GrowthSnapshot["stats"];
      const actorBreakdown = { user: 0, ai: 0, system: 0 } as GrowthSnapshot["actorBreakdown"];
      const eventIds = new Set<string>();
      let xp = 0;
      for (const entry of entries) {
        if (entry.userId !== principal.userId) continue;
        xp += entry.xpDelta;
        stats[entry.stat] += entry.statDelta;
        actorBreakdown[entry.actorType] += entry.xpDelta;
        eventIds.add(entry.eventId);
      }
      const boundedXp = Math.max(0, xp);
      return {
        userId: principal.userId,
        level: Math.floor(boundedXp / 1000) + 1,
        xp: boundedXp,
        xpMax: 1000,
        stats,
        actorBreakdown,
        evidenceEventIds: [...eventIds].sort(),
        achievements: achievementsFor(entries.filter((entry) => entry.userId === principal.userId)),
      };
    },
  };
}

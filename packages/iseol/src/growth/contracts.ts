import type { ActivityEvent } from "../activity/contracts.js";
import type { Principal } from "../identity/contracts.js";
import type { NotificationService } from "../notifications/contracts.js";
import type { SettingsService } from "../settings/contracts.js";

export type GrowthStat = "development" | "learning" | "collaboration" | "consistency";

export type GrowthLedgerEntry = {
  version: 1;
  id: string;
  userId: string;
  eventId: string;
  actorType: "user" | "ai" | "system";
  xpDelta: number;
  stat: GrowthStat;
  statDelta: number;
  createdAt: string;
};

export type GrowthAchievementId = "first-evidence" | "learning-session" | "project-run" | "collaboration" | "consistency";

export type GrowthAchievement = {
  id: GrowthAchievementId;
  badgeKey: string;
  title: string;
  description: string;
  unlockedAt: string;
  evidenceEventIds: string[];
};

export type GrowthSnapshot = {
  userId: string;
  level: number;
  xp: number;
  xpMax: number;
  stats: Record<GrowthStat, number>;
  actorBreakdown: Record<"user" | "ai" | "system", number>;
  evidenceEventIds: string[];
  achievements: GrowthAchievement[];
};

export type GrowthService = {
  applyGrowthProjection(event: ActivityEvent): Promise<GrowthLedgerEntry | null>;
  getGrowthSnapshot(principal: Principal): Promise<GrowthSnapshot>;
};

export type GrowthServiceOptions = { now?: () => string; notificationService?: NotificationService; settingsService?: SettingsService };

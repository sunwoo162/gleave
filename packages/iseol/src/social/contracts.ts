import type { Principal } from "../identity/contracts.js";
import type { PlatformUserService } from "../platform-user/contracts.js";
import type { ActivityService } from "../activity/contracts.js";
import type { NotificationService } from "../notifications/contracts.js";
import type { SettingsService } from "../settings/contracts.js";
import type { GrowthService } from "../growth/contracts.js";
import type { LearningService } from "../learning/contracts.js";
import type { UserProjectService } from "../project-model/user-project-service.js";
import type { PortfolioService } from "../portfolio/contracts.js";

export type SocialProfile = {
  version: 1;
  userId: string;
  handle: string;
  bio: string;
  skills: string[];
  visibility: "public" | "private";
  createdAt: string;
  updatedAt: string;
};

export type PublicGrowthSummary = {
  level: number;
  xp: number;
  xpMax: number;
  stats: Record<"development" | "learning" | "collaboration" | "consistency", number>;
  achievements: Array<{ id: string; badgeKey: string; title: string; description: string; unlockedAt: string }>;
};
export type PublicProjectSummary = {
  name: string;
  objective: string;
  purpose: string;
  teamMode: "solo" | "ai" | "human" | "mixed";
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};
export type PublicLearningSummary = {
  goals: Array<{ subject: string; status: string; updatedAt: string }>;
  plans: Array<{ title: string; status: string; updatedAt: string }>;
  sessions: Array<{ status: string; startedAt: string; completedAt?: string }>;
};
export type PublicPortfolioSummary = { id: string; title: string; summary: string; updatedAt: string };
export type PublicProfile = SocialProfile & {
  displayName: string;
  publicGrowth?: PublicGrowthSummary;
  publicProjects?: PublicProjectSummary[];
  publicLearning?: PublicLearningSummary;
  publicPortfolio?: PublicPortfolioSummary[];
};
export type FriendshipStatus = "pending" | "accepted" | "rejected";
export type FriendRequest = { version: 1; id: string; requesterUserId: string; targetUserId: string; status: FriendshipStatus; createdAt: string; updatedAt: string };
export type DirectMessage = { version: 1; id: string; senderUserId: string; recipientUserId: string; body: string; createdAt: string };
export type SocialBlock = { version: 1; id: string; blockerUserId: string; blockedUserId: string; status: "active" | "removed"; createdAt: string; updatedAt: string };
export type SocialReport = { version: 1; id: string; reporterUserId: string; targetUserId: string; reason: string; status: "open" | "closed"; createdAt: string; updatedAt: string };

export type SocialService = {
  updateProfile(principal: Principal, patch: Partial<Pick<SocialProfile, "handle" | "bio" | "skills" | "visibility">>): Promise<PublicProfile>;
  getProfile(principal: Principal, userId?: string): Promise<PublicProfile | null>;
  listProfiles(principal: Principal, search?: string): Promise<PublicProfile[]>;
  listFriends(principal: Principal): Promise<PublicProfile[]>;
  createFriendRequest(principal: Principal, targetUserId: string): Promise<{ request: FriendRequest; created: boolean }>;
  listIncomingFriendRequests(principal: Principal): Promise<Array<FriendRequest & { requester: PublicProfile | null }>>;
  respondToFriendRequest(principal: Principal, requestId: string, action: "accept" | "reject"): Promise<FriendRequest>;
  sendDirectMessage(principal: Principal, recipientUserId: string, body: string): Promise<DirectMessage>;
  listDirectMessages(principal: Principal, otherUserId: string): Promise<DirectMessage[]>;
  blockUser(principal: Principal, targetUserId: string): Promise<SocialBlock>;
  unblockUser(principal: Principal, targetUserId: string): Promise<SocialBlock>;
  listBlocks(principal: Principal): Promise<SocialBlock[]>;
  reportUser(principal: Principal, targetUserId: string, reason: string): Promise<SocialReport>;
  listReports(principal: Principal): Promise<SocialReport[]>;
};

export type SocialServiceOptions = { platformUserService: PlatformUserService; canCollaborate?: (userA: string, userB: string) => Promise<boolean>; activityService?: ActivityService; notificationService?: NotificationService; settingsService?: SettingsService; growthService?: GrowthService; userProjectService?: UserProjectService; learningService?: LearningService; portfolioService?: PortfolioService; now?: () => string };

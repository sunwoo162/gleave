import type { ActivityService } from "../activity/contracts.js";
import type { Principal } from "../identity/contracts.js";
import type { LearningService } from "../learning/contracts.js";
import type { UserProjectService } from "../project-model/user-project-service.js";

export type PortfolioVisibility = "public" | "unlisted" | "private";
export type PortfolioEvidence = { id: string; sourceType: "activity" | "project-evidence" | "learning-report"; sourceId: string; projectId?: string; reportId?: string; actorType: "user" | "ai" | "system"; verificationStatus: "verified" | "unverified" | "unknown"; summary: string; occurredAt: string; provider?: string };
export type PortfolioEntry = { version: 1; id: string; userId: string; title: string; summary: string; visibility: PortfolioVisibility; evidenceIds: string[]; createdAt: string; updatedAt: string };
export type PortfolioEntryInput = { title: string; summary: string; visibility: PortfolioVisibility; evidenceIds: string[] };
export type PortfolioSnapshot = { entries: PortfolioEntry[]; evidence: PortfolioEvidence[] };
export type PublicPortfolioEntry = Omit<PortfolioEntry, "userId" | "evidenceIds">;
export type PublicPortfolioEvidence = Omit<PortfolioEvidence, "id" | "sourceId" | "projectId" | "reportId">;
export type PublicPortfolioView = { entry: PublicPortfolioEntry; evidence: PublicPortfolioEvidence[] };
export type ExportedPortfolio = { format: "json" | "markdown"; filename: string; content: string };
export type PortfolioService = {
  listPortfolio(principal: Principal): Promise<PortfolioSnapshot>;
  listPublicEntries(userId: string): Promise<PortfolioEntry[]>;
  createEntry(principal: Principal, input: PortfolioEntryInput): Promise<PortfolioEntry>;
  updateEntry(principal: Principal, entryId: string, patch: Partial<PortfolioEntryInput>): Promise<PortfolioEntry>;
  exportPortfolio(principal: Principal, format: "json" | "markdown"): Promise<ExportedPortfolio>;
  getPublicEntry(entryId: string): Promise<PublicPortfolioView | null>;
};
export type PortfolioServiceOptions = { activityService: ActivityService; userProjectService: UserProjectService; learningService?: Pick<LearningService, "listLearningGoals" | "listLearningReports">; now?: () => string };

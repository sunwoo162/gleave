import type { Principal } from "../identity/contracts.js";
import type { TeamService } from "../teams/contracts.js";
import type { ActivityService } from "../activity/contracts.js";
import type { NotificationService } from "../notifications/contracts.js";
import type { SettingsService } from "../settings/contracts.js";

export type RecruitmentPost = {
  version: 1;
  id: string;
  teamId: string;
  authorUserId: string;
  kind: "project" | "study";
  title: string;
  description: string;
  roles: string[];
  tags: string[];
  status: "open" | "closed";
  createdAt: string;
  updatedAt: string;
};
export type RecruitmentApplicationStatus = "pending" | "accepted" | "rejected" | "withdrawn";
export type RecruitmentApplication = { version: 1; id: string; postId: string; teamId: string; applicantUserId: string; message: string; status: RecruitmentApplicationStatus; createdAt: string; updatedAt: string };
export type RecruitmentInput = { teamId: string; kind: "project" | "study"; title: string; description: string; roles: string[]; tags: string[] };
export type RecruitmentService = {
  createPost(principal: Principal, input: RecruitmentInput): Promise<RecruitmentPost>;
  listPosts(principal: Principal, kind?: "project" | "study"): Promise<RecruitmentPost[]>;
  getPost(principal: Principal, postId: string): Promise<{ post: RecruitmentPost; applications: RecruitmentApplication[] } | null>;
  apply(principal: Principal, postId: string, message: string): Promise<{ application: RecruitmentApplication; created: boolean }>;
  reviewApplication(principal: Principal, applicationId: string, action: "accept" | "reject"): Promise<RecruitmentApplication>;
};
export type RecruitmentServiceOptions = { teamService: TeamService; activityService?: ActivityService; notificationService?: NotificationService; settingsService?: SettingsService; now?: () => string };

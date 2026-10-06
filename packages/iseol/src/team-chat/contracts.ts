import type { Principal } from "../identity/contracts.js";
import type { ActivityService } from "../activity/contracts.js";
import type { TeamService } from "../teams/contracts.js";
import type { NotificationService } from "../notifications/contracts.js";
import type { SettingsService } from "../settings/contracts.js";

export type TeamMessage = {
  version: 1;
  id: string;
  teamId: string;
  senderUserId: string;
  body: string;
  createdAt: string;
};

export type TeamChatServiceOptions = {
  teamService: TeamService;
  activityService?: ActivityService;
  notificationService?: NotificationService;
  settingsService?: SettingsService;
  now?: () => string;
};

export type TeamChatService = {
  listMessages(principal: Principal, teamId: string): Promise<TeamMessage[]>;
  sendMessage(principal: Principal, teamId: string, body: string): Promise<TeamMessage>;
};

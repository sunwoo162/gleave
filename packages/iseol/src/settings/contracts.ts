import type { Principal } from "../identity/contracts.js";

export type UserSettings = {
  version: 1;
  userId: string;
  aiAccess: {
    memory: boolean;
    projectFiles: boolean;
    learningHistory: boolean;
    activityTimeline: boolean;
    teamDocs: boolean;
  };
  aiApproval: {
    fileWrite: boolean;
    packageInstall: boolean;
    buildRun: boolean;
    externalApi: boolean;
  };
  notifications: {
    aiDone: boolean;
    teamInvite: boolean;
    newMessage: boolean;
    achieve: boolean;
    weekly: boolean;
  };
  privacy: {
    growthInfo: boolean;
    projectList: boolean;
    learningHistory: boolean;
  };
  integrations: {
    calendar: boolean;
    github: boolean;
    discord: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export type UserSettingsPatch = {
  aiAccess?: Partial<UserSettings["aiAccess"]>;
  aiApproval?: Partial<UserSettings["aiApproval"]>;
  notifications?: Partial<UserSettings["notifications"]>;
  privacy?: Partial<UserSettings["privacy"]>;
  integrations?: Partial<UserSettings["integrations"]>;
};

export type SettingsService = {
  getSettings(principal: Principal): Promise<UserSettings>;
  updateSettings(principal: Principal, patch: UserSettingsPatch): Promise<UserSettings>;
};

import type { Principal } from "../identity/contracts.js";

export type AiAgentProfile = {
  version: 1;
  userId: string;
  agentId: "default";
  name: string;
  avatarUrl: string;
  personality: string;
  tone: string;
  role: string;
  createdAt: string;
  updatedAt: string;
};

export type AiAgentProfilePatch = {
  name?: string;
  avatarUrl?: string;
  personality?: string;
  tone?: string;
  role?: string;
};

export type AiAgentProfileService = {
  getProfile(principal: Principal): Promise<AiAgentProfile>;
  updateProfile(principal: Principal, patch: AiAgentProfilePatch): Promise<AiAgentProfile>;
};

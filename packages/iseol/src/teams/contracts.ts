import type { Principal } from "../identity/contracts.js";
import type { ActivityService } from "../activity/contracts.js";

export type TeamKind = "project" | "study";
export type TeamVisibility = "public" | "private";
export type TeamMemberRole = "owner" | "admin" | "member";
export type TeamMemberStatus = "active" | "left" | "removed";
export type TeamMemberType = "human" | "ai";
export type TeamCapability = "context.read" | "discussion.propose" | "task.propose" | "execution.request";
export type TeamApprovalScope = "suggestion-only" | "owner-approved-execution";

export type TeamRecord = {
  version: 1;
  id: string;
  ownerUserId: string;
  name: string;
  description: string;
  kind: TeamKind;
  visibility: TeamVisibility;
  capacity: number;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type TeamMembership = {
  version: 1;
  id: string;
  teamId: string;
  userId: string;
  memberType: TeamMemberType;
  aiMemberId?: string;
  role: TeamMemberRole;
  assignmentRole: string;
  capabilities: TeamCapability[];
  approvalScope: TeamApprovalScope;
  status: TeamMemberStatus;
  joinedAt: string;
  updatedAt: string;
};

export type AiTeamMemberInput = {
  agentId: string;
  assignmentRole: string;
  capabilities: TeamCapability[];
  approvalScope: TeamApprovalScope;
};

export type TeamInput = {
  name: string;
  description: string;
  kind: TeamKind;
  visibility: TeamVisibility;
  capacity: number;
};
export type TeamListItem = TeamRecord & { viewerRole?: TeamMemberRole };
export type TeamServiceOptions = { now?: () => string; activityService?: ActivityService };

export type TeamService = {
  createTeam(principal: Principal, input: TeamInput): Promise<TeamRecord>;
  listTeams(principal: Principal): Promise<TeamListItem[]>;
  getTeam(principal: Principal, teamId: string): Promise<{ team: TeamRecord; members: TeamMembership[] } | null>;
  /** Use only while the caller already holds the canonical team membership lock. */
  getTeamWithinMembershipLock(principal: Principal, teamId: string): Promise<{ team: TeamRecord; members: TeamMembership[] } | null>;
  listMemberships(teamId: string): Promise<TeamMembership[]>;
  /** Use only while the caller already holds the canonical team membership lock. */
  listMembershipsWithinMembershipLock(teamId: string): Promise<TeamMembership[]>;
  addMember(teamId: string, userId: string, role: TeamMemberRole, at?: string): Promise<TeamMembership>;
  /** Use only while the caller already holds the canonical team membership lock. */
  addMemberWithinMembershipLock(teamId: string, userId: string, role: TeamMemberRole, at?: string): Promise<TeamMembership>;
  addAiMember(principal: Principal, teamId: string, input: AiTeamMemberInput, at?: string): Promise<TeamMembership>;
  removeMember(principal: Principal, teamId: string, userId: string): Promise<TeamMembership>;
  removeAiMember(principal: Principal, teamId: string, agentId: string): Promise<TeamMembership>;
  leaveTeam(principal: Principal, teamId: string): Promise<TeamMembership>;
  isManager(principal: Principal, teamId: string): Promise<boolean>;
  /** Use only while the caller already holds the canonical team membership lock. */
  isManagerWithinMembershipLock(principal: Principal, teamId: string): Promise<boolean>;
  canAccess(principal: Principal, teamId: string): Promise<boolean>;
  /** Use only while the caller already holds the canonical team membership lock. */
  canAccessWithinMembershipLock(principal: Principal, teamId: string): Promise<boolean>;
  canCollaborate(userA: string, userB: string): Promise<boolean>;
};

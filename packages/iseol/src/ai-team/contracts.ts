import type { Principal } from "../identity/contracts.js";
import type { TeamApprovalScope, TeamCapability, TeamService } from "../teams/contracts.js";
import type { UserProjectService } from "../project-model/user-project-service.js";
import type { ActivityService } from "../activity/contracts.js";
import type { UserRuntimeDispatchGate } from "../runtime/user-runtime-dispatch-gate.js";

export type AiTeamProposalStatus = "waiting-runtime" | "proposed" | "accepted" | "rejected";
export type AiTeamProposal = {
  version: 1;
  id: string;
  projectId: string;
  teamId: string;
  agentId: string;
  assignmentRole: string;
  capabilities: TeamCapability[];
  approvalScope: TeamApprovalScope;
  requestId: string;
  title: string;
  objective: string;
  acceptanceCriteria: string[];
  rationale: string;
  status: AiTeamProposalStatus;
  source: "local-runtime";
  workRequestId?: string;
  blocker?: string;
  createdAt: string;
  updatedAt: string;
};

export type AiTeamProposalDraft = { title: string; objective: string; acceptanceCriteria: string[]; rationale: string };
export type AiTeamProposalDispatchResult = { status: "proposed"; draft: AiTeamProposalDraft } | { status: "waiting"; blocker: string };
export type AiTeamProposalDispatcher = (input: { principal: Principal; projectId: string; teamId: string; agentId: string; assignmentRole: string; capabilities: TeamCapability[] }) => Promise<AiTeamProposalDispatchResult>;
export type AiTeamProposalServiceOptions = { root: string; teamMembershipRoot?: string; teamService: TeamService; userProjectService: UserProjectService; activityService?: ActivityService; dispatcher?: AiTeamProposalDispatcher; dispatchForUser?: UserRuntimeDispatchGate; now?: () => string };
export type AiTeamProposalService = {
  requestProposal(principal: Principal, projectId: string, input: { agentId: string; requestId: string }): Promise<AiTeamProposal>;
  listProposals(principal: Principal, projectId: string): Promise<AiTeamProposal[]>;
  acceptProposal(principal: Principal, projectId: string, proposalId: string): Promise<{ proposal: AiTeamProposal; workRequest: { id: string; title: string; objective: string; status: string } }>;
  rejectProposal(principal: Principal, projectId: string, proposalId: string): Promise<AiTeamProposal>;
};

export type AiTeamDiscussionStatus = "waiting-runtime" | "completed";
export type AiTeamDiscussion = {
  version: 1;
  id: string;
  projectId: string;
  teamId: string;
  agentId: string;
  assignmentRole: string;
  capabilities: TeamCapability[];
  approvalScope: TeamApprovalScope;
  requestId: string;
  question: string;
  answer?: string;
  keyPoints: string[];
  alternatives: string[];
  risks: string[];
  status: AiTeamDiscussionStatus;
  source: "local-runtime";
  blocker?: string;
  createdAt: string;
  updatedAt: string;
};

export type AiTeamDiscussionResult = {
  status: "completed";
  answer: string;
  keyPoints: string[];
  alternatives: string[];
  risks: string[];
} | { status: "waiting"; blocker: string };
export type AiTeamDiscussionDispatcher = (input: { principal: Principal; projectId: string; teamId: string; agentId: string; assignmentRole: string; capabilities: TeamCapability[]; question: string }) => Promise<AiTeamDiscussionResult>;
export type AiTeamDiscussionServiceOptions = { root: string; teamMembershipRoot?: string; teamService: TeamService; userProjectService: UserProjectService; activityService?: ActivityService; dispatcher?: AiTeamDiscussionDispatcher; dispatchForUser?: UserRuntimeDispatchGate; now?: () => string };
export type AiTeamDiscussionService = {
  requestDiscussion(principal: Principal, projectId: string, input: { agentId: string; requestId: string; question: string }): Promise<AiTeamDiscussion>;
  listDiscussions(principal: Principal, projectId: string): Promise<AiTeamDiscussion[]>;
};

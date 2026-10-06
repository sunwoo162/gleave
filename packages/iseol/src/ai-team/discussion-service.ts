import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { assertIdentityId, assertTimestamp, type Principal } from "../identity/contracts.js";
import type { TeamCapability, TeamMembership } from "../teams/contracts.js";
import type { AiTeamDiscussion, AiTeamDiscussionResult, AiTeamDiscussionService, AiTeamDiscussionServiceOptions } from "./contracts.js";
import { withDurableAiTeamDiscussionLock } from "./discussion-lock.js";
import { listAiTeamDiscussions, listAiTeamDiscussionsUnlocked, loadAiTeamDiscussionUnlocked, saveAiTeamDiscussionUnlocked } from "./discussion-store.js";
import { createUserRuntimeDispatchGate } from "../runtime/user-runtime-dispatch-gate.js";
import { withDurableTeamMembershipLock } from "../teams/membership-lock.js";
import { sanitizeCredentialText } from "../security/text-safety.js";

function ensurePrincipal(principal: Principal): void { assertIdentityId(principal.userId); }
function required(value: string, label: string, max: number): string { const result = value.trim(); if (!result || result.length > max) throw new Error(label + " is required"); return result; }
function safeRuntimeBlocker(value: string): string { return sanitizeCredentialText(value, 240); }
function boundedList(values: string[], label: string): string[] { if (values.length > 8) throw new Error(label + " has too many items"); return values.map((value) => required(value, label, 500)); }
function validateResult(result: AiTeamDiscussionResult): Exclude<AiTeamDiscussionResult, { status: "waiting" }> {
  if (result.status !== "completed") throw new Error("AI discussion result is not complete");
  return { status: "completed", answer: required(result.answer, "AI discussion answer", 10_000), keyPoints: boundedList(result.keyPoints, "AI discussion key point"), alternatives: boundedList(result.alternatives, "AI discussion alternative"), risks: boundedList(result.risks, "AI discussion risk") };
}
async function projectAccess(options: AiTeamDiscussionServiceOptions, principal: Principal, projectId: string, membershipLockHeld = false): Promise<{ teamId: string; members: TeamMembership[] }> {
  const view = await options.userProjectService.getProject(principal, projectId);
  if (!view) throw new Error("Project not found");
  const teamId = view.project.teamId;
  if (!teamId || !["ai", "mixed"].includes(view.project.teamMode)) throw new Error("AI team project is required");
  const members = await (membershipLockHeld ? options.teamService.listMembershipsWithinMembershipLock(teamId) : options.teamService.listMemberships(teamId));
  if (!members.some((member) => member.memberType === "human" && member.userId === principal.userId && member.status === "active")) throw new Error("Team member access required");
  return { teamId, members };
}
function aiAssignment(members: TeamMembership[], agentId: string): TeamMembership {
  const agent = members.find((member) => member.memberType === "ai" && member.status === "active" && member.aiMemberId === agentId);
  if (!agent) throw new Error("AI team member not found");
  if (!agent.capabilities.includes("discussion.propose")) throw new Error("AI discussion capability required");
  return agent;
}
function waiting(input: { projectId: string; teamId: string; agent: TeamMembership; requestId: string; question: string; at: string; blocker: string }): AiTeamDiscussion {
  return { version: 1, id: "ai-discussion-" + randomUUID(), projectId: input.projectId, teamId: input.teamId, agentId: input.agent.aiMemberId!, assignmentRole: input.agent.assignmentRole, capabilities: [...input.agent.capabilities], approvalScope: input.agent.approvalScope, requestId: input.requestId, question: input.question, keyPoints: [], alternatives: [], risks: [], status: "waiting-runtime", source: "local-runtime", blocker: input.blocker, createdAt: input.at, updatedAt: input.at };
}
async function persistDiscussion(options: AiTeamDiscussionServiceOptions, principal: Principal, discussion: AiTeamDiscussion): Promise<AiTeamDiscussion> {
  await saveAiTeamDiscussionUnlocked(options.root, discussion);
  await options.activityService?.recordActivityEvent(principal, {
    sourceType: "ai-team-discussion",
    sourceId: discussion.id,
    eventType: "ai.team.discussion.requested",
    eventVersion: 1,
    actorType: "user",
    verificationStatus: "unverified",
    payload: { projectId: discussion.projectId, teamId: discussion.teamId, discussionId: discussion.id, requestId: discussion.requestId, agentId: discussion.agentId, status: discussion.status },
    occurredAt: discussion.createdAt,
  });
  return discussion;
}
export function createAiTeamDiscussionService(options: AiTeamDiscussionServiceOptions): AiTeamDiscussionService {
  const now = options.now ?? (() => new Date().toISOString());
  const teamMembershipRoot = options.teamMembershipRoot ?? dirname(options.root);
  const dispatchForUser = options.dispatchForUser ?? createUserRuntimeDispatchGate();
  return {
    async requestDiscussion(principal, projectId, input) {
      ensurePrincipal(principal); assertIdentityId(projectId); const requestId = required(input.requestId, "AI discussion requestId", 160); const agentId = required(input.agentId, "AI agentId", 128); const question = required(input.question, "AI discussion question", 4_000); const initialContext = await projectAccess(options, principal, projectId); aiAssignment(initialContext.members, agentId);
      return withDurableTeamMembershipLock(teamMembershipRoot, initialContext.teamId, async () => {
      const context = await projectAccess(options, principal, projectId, true); const agent = aiAssignment(context.members, agentId);
      return withDurableAiTeamDiscussionLock(options.root, projectId, requestId, async () => {
        const existing = (await listAiTeamDiscussionsUnlocked(options.root, projectId)).find((item) => item.requestId === requestId);
        if (existing) { if (existing.agentId !== agentId || existing.question !== question) throw new Error("AI discussion requestId conflict"); return existing; }
        const at = now(); assertTimestamp(at, "AI discussion timestamp");
        if (!options.dispatcher) { const result = waiting({ projectId, teamId: context.teamId, agent, requestId, question, at, blocker: "AI Team Runtime is not configured" }); return persistDiscussion(options, principal, result); }
        try {
          const dispatched = await dispatchForUser(principal.userId, () => options.dispatcher!({ principal, projectId, teamId: context.teamId, agentId, assignmentRole: agent.assignmentRole, capabilities: [...agent.capabilities] as TeamCapability[], question }));
          if (dispatched.status === "waiting") { const result = waiting({ projectId, teamId: context.teamId, agent, requestId, question, at, blocker: safeRuntimeBlocker(required(dispatched.blocker, "AI discussion blocker", 240)) }); return persistDiscussion(options, principal, result); }
          const normalized = validateResult(dispatched); const discussion: AiTeamDiscussion = { version: 1, id: "ai-discussion-" + randomUUID(), projectId, teamId: context.teamId, agentId, assignmentRole: agent.assignmentRole, capabilities: [...agent.capabilities], approvalScope: agent.approvalScope, requestId, question, ...normalized, source: "local-runtime", createdAt: at, updatedAt: at }; return persistDiscussion(options, principal, discussion);
        } catch (error) { const blocker = error instanceof Error ? safeRuntimeBlocker(error.message) : "AI Team Runtime discussion failed"; const result = waiting({ projectId, teamId: context.teamId, agent, requestId, question, at, blocker }); return persistDiscussion(options, principal, result); }
      }, { waitForMs: 2_000 });
      }, { waitForMs: 2_000 });
    },
    async listDiscussions(principal, projectId) {
      ensurePrincipal(principal); assertIdentityId(projectId); await projectAccess(options, principal, projectId);
      const candidates = await listAiTeamDiscussions(options.root, projectId);
      const current: AiTeamDiscussion[] = [];
      for (const candidate of candidates) {
        await withDurableAiTeamDiscussionLock(options.root, projectId, candidate.requestId, async () => {
          const discussion = await loadAiTeamDiscussionUnlocked(options.root, projectId, candidate.id);
          if (discussion?.projectId === projectId) current.push(discussion);
        }, { waitForMs: 2_000 });
      }
      return current.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    },
  };
}

import { randomUUID } from "node:crypto";
import { assertIdentityId, assertTimestamp, type Principal } from "../identity/contracts.js";
import type { TeamChatService, TeamChatServiceOptions, TeamMessage } from "./contracts.js";
import { withDurableTeamMembershipLock } from "../teams/membership-lock.js";
import { listTeamMessagesUnlocked, saveTeamMessageUnlocked } from "./store.js";

function ensurePrincipal(principal: Principal): void { assertIdentityId(principal.userId); }
function requiredBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 10_000) throw new Error("Team message is required");
  return trimmed;
}

export function createTeamChatService(root: string, options: TeamChatServiceOptions): TeamChatService {
  const now = options.now ?? (() => new Date().toISOString());
  const requireMember = async (principal: Principal, teamId: string) => {
    ensurePrincipal(principal);
    assertIdentityId(teamId);
    const view = await options.teamService.getTeamWithinMembershipLock(principal, teamId);
    if (!view || !view.members.some((member) => member.memberType === "human" && member.userId === principal.userId && member.status === "active")) throw new Error("Team chat membership required");
    return view;
  };

  return {
    async listMessages(principal, teamId) {
      return withDurableTeamMembershipLock(root, teamId, async () => {
        await requireMember(principal, teamId);
        return (await listTeamMessagesUnlocked(root, teamId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      }, { waitForMs: 2_000 });
    },
    async sendMessage(principal, teamId, body) {
      return withDurableTeamMembershipLock(root, teamId, async () => {
        const view = await requireMember(principal, teamId);
        const at = now();
        assertTimestamp(at, "team message timestamp");
        const message: TeamMessage = { version: 1, id: `team-message-${randomUUID()}`, teamId, senderUserId: principal.userId, body: requiredBody(body), createdAt: at };
        await saveTeamMessageUnlocked(root, message);
        await options.activityService?.recordActivityEvent(principal, { sourceType: "team-chat", sourceId: message.id, eventType: "team.message.sent", eventVersion: 1, actorType: "user", verificationStatus: "verified", payload: { teamId } });
        if (options.notificationService) {
          for (const member of view.members) {
            if (member.memberType !== "human" || member.userId === principal.userId || member.status !== "active") continue;
            const recipientSettings = options.settingsService
              ? await options.settingsService.getSettings({ userId: member.userId, sessionId: "team-chat-notification", roles: ["system"] })
              : undefined;
            if (recipientSettings?.notifications.newMessage === false) continue;
            await options.notificationService.createTeamMessageNotification({ userId: member.userId, teamId, messageId: message.id, actorUserId: principal.userId, createdAt: at });
          }
        }
        return message;
      }, { waitForMs: 2_000 });
    },
  };
}

import type { PlatformUserService } from "./platform-user/contracts.js";
import type { RecruitmentService } from "./recruitment/contracts.js";
import type { SocialService } from "./social/contracts.js";
import type { TeamService } from "./teams/contracts.js";
import type { TeamChatService } from "./team-chat/contracts.js";
import type { UserRequest, UserResponse } from "./web-control-plane/user-router.js";
import { sanitizeCredentialText } from "./security/text-safety.js";

export type CollaborationRouteServices = { platformUserService: PlatformUserService; teamService?: TeamService; teamChatService?: TeamChatService; socialService?: SocialService; recruitmentService?: RecruitmentService };
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
function response(status: number, body: unknown): UserResponse { return { status, headers: JSON_HEADERS, body }; }
function bearer(headers: Record<string, string | undefined>): string | null { const value = headers.authorization; return value?.startsWith("Bearer ") ? value.slice("Bearer ".length).trim() || null : null; }
function objectBody(body: unknown): Record<string, unknown> | null { return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null; }
function stringValue(body: Record<string, unknown> | null, key: string): string | null { return typeof body?.[key] === "string" && (body[key] as string).trim() ? body[key] as string : null; }
function decodePathValue(value: string): string | null {
  if (/%(?:2f|5c)/i.test(value)) return null;
  try {
    const decoded = decodeURIComponent(value);
    return decoded || null;
  } catch {
    return null;
  }
}
function idAfter(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  return decodePathValue(pathname.slice(prefix.length));
}
function errorResponse(error: unknown): UserResponse { const rawMessage = error instanceof Error ? error.message : "collaboration request failed"; const message = sanitizeCredentialText(rawMessage, 240); if (/not found/i.test(rawMessage)) return response(404, { error: message }); if (/access|required|requires|invalid|cannot|already|blocked/i.test(rawMessage)) return response(/access|manager|member|messaging|requires|blocked/i.test(rawMessage) ? 403 : 400, { error: message }); return response(409, { error: message }); }

export async function routeCollaborationRequest(request: UserRequest, services: CollaborationRouteServices): Promise<UserResponse> {
  const url = new URL(request.path, "http://iseol.local");
  const rawPathname = (request.rawPath ?? request.path).split("?", 1)[0] ?? "";
  const isCollaborationPath = ["/api/user/teams", "/api/user/recruitment", "/api/user/social"].some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
  if (isCollaborationPath && rawPathname.includes("\\")) return response(404, { error: "collaboration route not found" });
  const token = bearer(request.headers); const principal = token ? await services.platformUserService.resolveAuthenticatedPrincipal(token) : null;
  if (!principal) return response(401, { error: "authentication required" });
  try {
    if (url.pathname === "/api/user/teams" || url.pathname.startsWith("/api/user/teams/")) {
      if (!services.teamService) return response(503, { error: "team service unavailable" });
      const teamService = services.teamService;
      if (url.pathname === "/api/user/teams") {
        if (request.method === "GET") return response(200, { teams: await teamService.listTeams(principal) });
        if (request.method !== "POST") return response(405, { error: "method not allowed" });
        const body = objectBody(request.body); const name = stringValue(body, "name"); const description = stringValue(body, "description"); const kind = stringValue(body, "kind") as "project" | "study" | null; const visibility = stringValue(body, "visibility") as "public" | "private" | null; const capacity = typeof body?.capacity === "number" ? body.capacity : null;
        if (!name || !description || !kind || !visibility || capacity === null) return response(400, { error: "name, description, kind, visibility, and capacity are required" });
        return response(201, { team: await teamService.createTeam(principal, { name, description, kind, visibility, capacity }) });
      }
      const rest = idAfter(url.pathname, "/api/user/teams/");
      const messageMatch = rest?.match(/^([^/]+)\/messages$/);
      if (messageMatch) {
        if (!services.teamChatService) return response(503, { error: "team chat service unavailable" });
        const teamId = messageMatch[1]!;
        if (request.method === "GET") return response(200, { messages: await services.teamChatService.listMessages(principal, teamId) });
        if (request.method !== "POST") return response(405, { error: "method not allowed" });
        const body = stringValue(objectBody(request.body), "body");
        if (!body) return response(400, { error: "body is required" });
        return response(201, { message: await services.teamChatService.sendMessage(principal, teamId, body) });
      }
      const aiMemberMatch = rest?.match(/^([^/]+)\/ai-members(?:\/([^/]+))?$/);
      if (aiMemberMatch) {
        const teamId = aiMemberMatch[1]!; const agentId = aiMemberMatch[2];
        if (!agentId) {
          if (request.method !== "POST") return response(405, { error: "method not allowed" });
          const body = objectBody(request.body); const inputAgentId = stringValue(body, "agentId"); const assignmentRole = stringValue(body, "assignmentRole"); const approvalScope = stringValue(body, "approvalScope") as "suggestion-only" | "owner-approved-execution" | null; const capabilities = Array.isArray(body?.capabilities) && body.capabilities.every((item) => typeof item === "string") ? body.capabilities as ("context.read" | "discussion.propose" | "task.propose" | "execution.request")[] : null;
          if (!inputAgentId || !assignmentRole || !approvalScope || !capabilities) return response(400, { error: "agentId, assignmentRole, capabilities, and approvalScope are required" });
          return response(201, { member: await teamService.addAiMember(principal, teamId, { agentId: inputAgentId, assignmentRole, capabilities, approvalScope }) });
        }
        if (request.method !== "DELETE") return response(405, { error: "method not allowed" });
        return response(200, { member: await teamService.removeAiMember(principal, teamId, agentId) });
      }
      const leaveSuffix = "/leave"; const teamId = rest?.endsWith(leaveSuffix) ? rest.slice(0, -leaveSuffix.length) : rest;
      if (!teamId) return response(404, { error: "team not found" });
      if (rest?.endsWith(leaveSuffix)) { if (request.method !== "POST") return response(405, { error: "method not allowed" }); return response(200, { membership: await teamService.leaveTeam(principal, teamId) }); }
      if (request.method !== "GET") return response(405, { error: "method not allowed" }); const team = await teamService.getTeam(principal, teamId); return team ? response(200, team) : response(404, { error: "team not found" });
    }

    if (url.pathname === "/api/user/recruitment" || url.pathname.startsWith("/api/user/recruitment/")) {
      if (!services.recruitmentService) return response(503, { error: "recruitment service unavailable" });
      const recruitment = services.recruitmentService;
      if (url.pathname === "/api/user/recruitment") {
        if (request.method === "GET") { const kind = url.searchParams.get("kind"); return response(200, { posts: await recruitment.listPosts(principal, kind === "project" || kind === "study" ? kind : undefined) }); }
        if (request.method !== "POST") return response(405, { error: "method not allowed" });
        const body = objectBody(request.body); const teamId = stringValue(body, "teamId"); const kind = stringValue(body, "kind") as "project" | "study" | null; const title = stringValue(body, "title"); const description = stringValue(body, "description"); const roles = Array.isArray(body?.roles) && body.roles.every((item) => typeof item === "string") ? body.roles as string[] : null; const tags = Array.isArray(body?.tags) && body.tags.every((item) => typeof item === "string") ? body.tags as string[] : null;
        if (!teamId || !kind || !title || !description || !roles || !tags) return response(400, { error: "teamId, kind, title, description, roles, and tags are required" });
        return response(201, { post: await recruitment.createPost(principal, { teamId, kind, title, description, roles, tags }) });
      }
      const rest = idAfter(url.pathname, "/api/user/recruitment/"); const applicationSuffix = "/applications"; const applicationPath = rest?.endsWith(applicationSuffix) ? rest.slice(0, -applicationSuffix.length) : null;
      if (applicationPath) { if (request.method !== "POST") return response(405, { error: "method not allowed" }); const message = stringValue(objectBody(request.body), "message"); if (!message) return response(400, { error: "message is required" }); return response(201, { application: (await recruitment.apply(principal, applicationPath, message)).application }); }
      const applicationId = rest?.startsWith("applications/") ? rest.slice("applications/".length) : null;
      if (applicationId) { if (request.method !== "POST") return response(405, { error: "method not allowed" }); const action = stringValue(objectBody(request.body), "action") as "accept" | "reject" | null; if (!action) return response(400, { error: "action is required" }); return response(200, { application: await recruitment.reviewApplication(principal, applicationId, action) }); }
      if (!rest) return response(404, { error: "recruitment post not found" });
      if (request.method !== "GET") return response(405, { error: "method not allowed" }); const post = await recruitment.getPost(principal, rest); return post ? response(200, post) : response(404, { error: "recruitment post not found" });
    }

    if (url.pathname.startsWith("/api/user/social")) {
      if (!services.socialService) return response(503, { error: "social service unavailable" });
      const social = services.socialService;
      if (url.pathname === "/api/user/social/profile") { if (request.method === "GET") return response(200, { profile: await social.getProfile(principal, url.searchParams.get("userId") ?? undefined) }); if (request.method !== "PUT") return response(405, { error: "method not allowed" }); const body = objectBody(request.body); return response(200, { profile: await social.updateProfile(principal, { ...(typeof body?.handle === "string" ? { handle: body.handle } : {}), ...(typeof body?.bio === "string" ? { bio: body.bio } : {}), ...(Array.isArray(body?.skills) && body.skills.every((item) => typeof item === "string") ? { skills: body.skills as string[] } : {}), ...(body?.visibility === "public" || body?.visibility === "private" ? { visibility: body.visibility } : {}) }) }); }
      if (url.pathname === "/api/user/social/users") { if (request.method !== "GET") return response(405, { error: "method not allowed" }); return response(200, { profiles: await social.listProfiles(principal, url.searchParams.get("search") ?? "") }); }
      if (url.pathname === "/api/user/social/friends") { if (request.method !== "GET") return response(405, { error: "method not allowed" }); return response(200, { friends: await social.listFriends(principal) }); }
      if (url.pathname === "/api/user/social/blocks") { if (request.method === "GET") return response(200, { blocks: await social.listBlocks(principal) }); if (request.method !== "POST") return response(405, { error: "method not allowed" }); const targetUserId = stringValue(objectBody(request.body), "targetUserId"); if (!targetUserId) return response(400, { error: "targetUserId is required" }); return response(201, { block: await social.blockUser(principal, targetUserId) }); }
      const blockedUserId = idAfter(url.pathname, "/api/user/social/blocks/"); if (blockedUserId) { if (request.method !== "DELETE") return response(405, { error: "method not allowed" }); return response(200, { block: await social.unblockUser(principal, blockedUserId) }); }
      if (url.pathname === "/api/user/social/reports") { if (request.method === "GET") return response(200, { reports: await social.listReports(principal) }); if (request.method !== "POST") return response(405, { error: "method not allowed" }); const body = objectBody(request.body); const targetUserId = stringValue(body, "targetUserId"); const reason = stringValue(body, "reason"); if (!targetUserId || !reason) return response(400, { error: "targetUserId and reason are required" }); return response(201, { report: await social.reportUser(principal, targetUserId, reason) }); }
      if (url.pathname === "/api/user/social/friend-requests") { if (request.method === "GET") return response(200, { requests: await social.listIncomingFriendRequests(principal) }); if (request.method !== "POST") return response(405, { error: "method not allowed" }); const targetUserId = stringValue(objectBody(request.body), "targetUserId"); if (!targetUserId) return response(400, { error: "targetUserId is required" }); return response(201, await social.createFriendRequest(principal, targetUserId)); }
      const requestId = idAfter(url.pathname, "/api/user/social/friend-requests/"); if (requestId) { if (request.method !== "POST") return response(405, { error: "method not allowed" }); const action = stringValue(objectBody(request.body), "action") as "accept" | "reject" | null; if (!action) return response(400, { error: "action is required" }); return response(200, { request: await social.respondToFriendRequest(principal, requestId, action) }); }
      if (url.pathname === "/api/user/social/messages") { const otherUserId = url.searchParams.get("userId"); if (!otherUserId) return response(400, { error: "userId is required" }); if (request.method === "GET") return response(200, { messages: await social.listDirectMessages(principal, otherUserId) }); if (request.method !== "POST") return response(405, { error: "method not allowed" }); const body = objectBody(request.body); const message = stringValue(body, "body"); if (!message) return response(400, { error: "body is required" }); return response(201, { message: await social.sendDirectMessage(principal, otherUserId, message) }); }
      return response(404, { error: "social route not found" });
    }
    return response(404, { error: "collaboration route not found" });
  } catch (error) { return errorResponse(error); }
}

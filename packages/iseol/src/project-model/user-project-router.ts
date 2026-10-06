import type { PlatformUserService } from "../platform-user/contracts.js";
import type { UserRequest, UserResponse } from "../web-control-plane/user-router.js";
import type { ProjectPurpose } from "./execution-profile.js";
import type { UserProjectService, UserProjectTeamMode } from "./user-project-service.js";
import type { SettingsService } from "../settings/contracts.js";
import type { AiTeamProposalService } from "../ai-team/contracts.js";
import type { AiTeamDiscussionService } from "../ai-team/contracts.js";
import { sanitizeCredentialText } from "../security/text-safety.js";

export type UserProjectRouteServices = { platformUserService: PlatformUserService; userProjectService?: UserProjectService; aiTeamProposalService?: AiTeamProposalService; aiTeamDiscussionService?: AiTeamDiscussionService; settingsService?: SettingsService; enqueueProjectRun?: (runId: string) => Promise<"accepted" | "already-active" | "not-configured"> };
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
function response(status: number, body: unknown): UserResponse { return { status, headers: JSON_HEADERS, body }; }
function bearer(headers: Record<string, string | undefined>): string | null { const value = headers.authorization; return value?.startsWith("Bearer ") ? value.slice(7).trim() || null : null; }
function bodyObject(body: unknown): Record<string, unknown> | null { return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null; }
function stringValue(body: Record<string, unknown>, key: string): string | null { return typeof body[key] === "string" && body[key].trim() ? body[key] as string : null; }
function decodePathValue(value: string): string | null {
  if (/%(?:2f|5c)/i.test(value)) return null;
  try {
    const decoded = decodeURIComponent(value);
    return decoded || null;
  } catch {
    return null;
  }
}

export async function routeUserProjectRequest(request: UserRequest, services: UserProjectRouteServices): Promise<UserResponse> {
  const url = new URL(request.path, "http://iseol.local");
  const rawPathname = (request.rawPath ?? request.path).split("?", 1)[0] ?? "";
  const isProjectPath = url.pathname === "/api/user/projects" || url.pathname.startsWith("/api/user/projects/");
  if (isProjectPath && rawPathname.includes("\\")) return response(404, { error: "project route not found" });
  const token = bearer(request.headers);
  const principal = token ? await services.platformUserService.resolveAuthenticatedPrincipal(token) : null;
  if (!principal) return response(401, { error: "authentication required" });
  if (!services.userProjectService) return response(503, { error: "user projects unavailable" });
  const projects = services.userProjectService;
  try {
    if (url.pathname === "/api/user/projects") {
      if (request.method === "GET") return response(200, { projects: await projects.listProjects(principal) });
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const body = bodyObject(request.body);
      const name = body ? stringValue(body, "name") : null;
      const objective = body ? stringValue(body, "objective") : null;
      const purpose = body ? stringValue(body, "purpose") : null;
      const teamMode = body ? stringValue(body, "teamMode") : null;
      const teamId = body && typeof body.teamId === "string" && body.teamId.trim() ? body.teamId : undefined;
      if (!name || !objective || !purpose || !teamMode) return response(400, { error: "name, objective, purpose, and teamMode are required" });
      return response(201, { project: await projects.createProject(principal, { name, objective, purpose: purpose as ProjectPurpose, teamMode: teamMode as UserProjectTeamMode, ...(teamId ? { teamId } : {}) }) });
    }

    const proposalMatch = /^\/api\/user\/projects\/([^/]+)\/ai-proposals(?:\/([^/]+)\/(accept|reject))?$/.exec(url.pathname);
    if (proposalMatch) {
      if (!services.aiTeamProposalService) return response(503, { error: "AI team proposal service unavailable" });
      const projectId = decodePathValue(proposalMatch[1] ?? ""); const proposalId = proposalMatch[2] ? decodePathValue(proposalMatch[2]) : null; const action = proposalMatch[3];
      if (!projectId || (proposalMatch[2] && !proposalId)) return response(404, { error: "not found" });
      if (!proposalId && !action) {
        if (request.method === "GET") return response(200, { proposals: await services.aiTeamProposalService.listProposals(principal, projectId) });
        if (request.method !== "POST") return response(405, { error: "method not allowed" });
        const body = bodyObject(request.body); const agentId = body ? stringValue(body, "agentId") : null; const requestId = body ? stringValue(body, "requestId") : null;
        if (!agentId || !requestId) return response(400, { error: "agentId and requestId are required" });
        const proposal = await services.aiTeamProposalService.requestProposal(principal, projectId, { agentId, requestId });
        return response(proposal.status === "proposed" ? 201 : 202, { proposal });
      }
      if (request.method !== "POST" || !proposalId || !action) return response(405, { error: "method not allowed" });
      if (action === "accept") return response(200, await services.aiTeamProposalService.acceptProposal(principal, projectId, proposalId));
      return response(200, { proposal: await services.aiTeamProposalService.rejectProposal(principal, projectId, proposalId) });
    }

    const discussionMatch = /^\/api\/user\/projects\/([^/]+)\/ai-discussions$/.exec(url.pathname);
    if (discussionMatch) {
      if (!services.aiTeamDiscussionService) return response(503, { error: "AI team discussion service unavailable" });
      const projectId = decodePathValue(discussionMatch[1] ?? "");
      if (!projectId) return response(404, { error: "not found" });
      if (request.method === "GET") return response(200, { discussions: await services.aiTeamDiscussionService.listDiscussions(principal, projectId) });
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const body = bodyObject(request.body); const agentId = body ? stringValue(body, "agentId") : null; const requestId = body ? stringValue(body, "requestId") : null; const question = body ? stringValue(body, "question") : null;
      if (!agentId || !requestId || !question) return response(400, { error: "agentId, requestId, and question are required" });
      const discussion = await services.aiTeamDiscussionService.requestDiscussion(principal, projectId, { agentId, requestId, question });
      return response(discussion.status === "completed" ? 201 : 202, { discussion });
    }

    const scheduleMatch = /^\/api\/user\/projects\/([^/]+)\/schedule$/.exec(url.pathname);
    if (scheduleMatch) {
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const body = bodyObject(request.body);
      const maxConcurrent = body?.maxConcurrent === undefined ? undefined : typeof body.maxConcurrent === "number" && Number.isFinite(body.maxConcurrent) ? body.maxConcurrent : null;
      if (maxConcurrent === null) return response(400, { error: "maxConcurrent must be a number" });
      const approved = body?.approved === undefined ? undefined : typeof body.approved === "boolean" ? body.approved : null;
      if (approved === null) return response(400, { error: "approved must be a boolean" });
      const projectId = decodePathValue(scheduleMatch[1] ?? "");
      if (!projectId) return response(404, { error: "not found" });
      const result = await projects.scheduleProjectRuns(principal, projectId, { ...(maxConcurrent === undefined ? {} : { maxConcurrent }), ...(approved === undefined ? {} : { approved }) }, services.enqueueProjectRun);
      return response(result.selected > 0 ? 202 : 200, result);
    }

    const pauseMatch = /^\/api\/user\/projects\/([^/]+)\/runs\/pause$/.exec(url.pathname);
    if (pauseMatch) {
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const body = bodyObject(request.body);
      const workRequestId = body ? stringValue(body, "workRequestId") : null;
      if (!workRequestId) return response(400, { error: "workRequestId is required" });
      const projectId = decodePathValue(pauseMatch[1] ?? "");
      if (!projectId) return response(404, { error: "not found" });
      const result = await projects.pauseProjectRun(principal, projectId, { workRequestId });
      return response(200, result);
    }

    const resumeMatch = /^\/api\/user\/projects\/([^/]+)\/runs\/resume$/.exec(url.pathname);
    if (resumeMatch) {
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const body = bodyObject(request.body);
      const workRequestId = body ? stringValue(body, "workRequestId") : null;
      if (!workRequestId) return response(400, { error: "workRequestId is required" });
      const approved = body?.approved === undefined ? undefined : typeof body.approved === "boolean" ? body.approved : null;
      if (approved === null) return response(400, { error: "approved must be a boolean" });
      const projectId = decodePathValue(resumeMatch[1] ?? "");
      if (!projectId) return response(404, { error: "not found" });
      const result = await projects.resumeProjectRun(principal, projectId, { workRequestId, ...(approved === undefined ? {} : { approved }) }, services.enqueueProjectRun);
      return response(result.status === "waiting" ? 409 : result.status === "started" ? 202 : 200, result);
    }

    const retryMatch = /^\/api\/user\/projects\/([^/]+)\/runs\/retry$/.exec(url.pathname);
    if (retryMatch) {
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const body = bodyObject(request.body);
      const workRequestId = body ? stringValue(body, "workRequestId") : null;
      if (!workRequestId) return response(400, { error: "workRequestId is required" });
      const approved = body?.approved === undefined ? undefined : typeof body.approved === "boolean" ? body.approved : null;
      if (approved === null) return response(400, { error: "approved must be a boolean" });
      const projectId = decodePathValue(retryMatch[1] ?? "");
      if (!projectId) return response(404, { error: "not found" });
      const result = await projects.retryProjectRun(principal, projectId, { workRequestId, ...(approved === undefined ? {} : { approved }) }, services.enqueueProjectRun);
      return response(result.status === "waiting" ? 409 : result.status === "started" ? 202 : 200, result);
    }

    const cancelWorkMatch = /^\/api\/user\/projects\/([^/]+)\/work-requests\/([^/]+)\/cancel$/.exec(url.pathname);
    if (cancelWorkMatch) {
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const projectId = decodePathValue(cancelWorkMatch[1] ?? "");
      const workRequestId = decodePathValue(cancelWorkMatch[2] ?? "");
      if (!projectId || !workRequestId) return response(404, { error: "not found" });
      const cancelled = await projects.cancelWorkRequest(principal, projectId, workRequestId);
      return response(200, { request: cancelled });
    }

    const fileMatch = /^\/api\/user\/projects\/([^/]+)\/files$/.exec(url.pathname);
    if (fileMatch) {
      if (request.method !== "GET") return response(405, { error: "method not allowed" });
      const relativePath = url.searchParams.get("path");
      if (!relativePath) return response(400, { error: "path is required" });
      const projectId = decodePathValue(fileMatch[1] ?? "");
      if (!projectId) return response(404, { error: "not found" });
      const preview = await projects.readWorkspaceFile(principal, projectId, relativePath);
      return preview ? response(200, preview) : response(404, { error: "project not found" });
    }

    const projectMatch = /^\/api\/user\/projects\/([^/]+)(?:\/(work-requests|runs|team))?$/.exec(url.pathname);
    if (!projectMatch) return response(404, { error: "not found" });
    const projectId = decodePathValue(projectMatch[1] ?? "");
    if (!projectId) return response(404, { error: "not found" });
    const child = projectMatch[2];
    if (!child) {
      if (request.method !== "GET") return response(405, { error: "method not allowed" });
      const project = await projects.getProject(principal, projectId);
      return project ? response(200, project) : response(404, { error: "project not found" });
    }

    if (child === "team") {
      if (request.method !== "PATCH") return response(405, { error: "method not allowed" });
      const body = bodyObject(request.body); const teamMode = body ? stringValue(body, "teamMode") : null; const teamId = body && typeof body.teamId === "string" && body.teamId.trim() ? body.teamId : undefined;
      if (!teamMode) return response(400, { error: "teamMode is required" });
      return response(200, { project: await projects.updateProjectTeam(principal, projectId, { teamMode: teamMode as UserProjectTeamMode, ...(teamId ? { teamId } : {}) }) });
    }

    if (child === "work-requests") {
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const body = bodyObject(request.body);
      const title = body ? stringValue(body, "title") : null;
      const objective = body ? stringValue(body, "objective") : null;
      const idempotencyKey = body ? stringValue(body, "idempotencyKey") : null;
      if (!title || !objective || !idempotencyKey) return response(400, { error: "title, objective, and idempotencyKey are required" });
      const dependencies = body?.dependencies === undefined ? undefined : Array.isArray(body.dependencies) && body.dependencies.every((item) => typeof item === "string") ? body.dependencies as string[] : null;
      if (dependencies === null) return response(400, { error: "dependencies must be an array" });
      const result = await projects.createWorkRequest(principal, projectId, { title, objective, idempotencyKey, ...(dependencies ? { dependencies } : {}) });
      return response(result.created ? 201 : 200, result);
    }

    if (child === "runs") {
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const body = bodyObject(request.body);
      const workRequestId = body ? stringValue(body, "workRequestId") : null;
      const runId = body ? stringValue(body, "runId") : null;
      if (!workRequestId || !runId) return response(400, { error: "workRequestId and runId are required" });
      const approved = body?.approved === undefined ? undefined : typeof body.approved === "boolean" ? body.approved : null;
      if (approved === null) return response(400, { error: "approved must be a boolean" });
      if (services.settingsService) {
        let settings;
        try { settings = await services.settingsService.getSettings(principal); }
        catch { return response(503, { error: "execution approval unavailable" }); }
        if (settings.aiApproval.buildRun && approved !== true) return response(409, { error: "Build run approval is required" });
      }
      const result = await projects.startProjectRun(principal, projectId, { workRequestId, runId, ...(approved === undefined ? {} : { approved }) }, services.enqueueProjectRun);
      return response(result.status === "waiting" ? 409 : 202, result);
    }
    return response(404, { error: "not found" });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "project request failed";
    const message = sanitizeCredentialText(rawMessage, 240);
    if (/not found/i.test(rawMessage)) return response(404, { error: message });
    if (/already|queued|waiting|running|terminal|runtime/i.test(rawMessage)) return response(409, { error: message });
    return response(400, { error: message });
  }
}

import type { PlatformUserService } from "../platform-user/contracts.js";
import type { UserRequest, UserResponse } from "../web-control-plane/user-router.js";
import type { AiChatService } from "./contracts.js";
import type { AiChatAttachmentInput, AiChatContextSelection } from "./contracts.js";
import { sanitizeCredentialText } from "../security/text-safety.js";

export type AiChatRouteServices = { platformUserService: PlatformUserService; aiChatService?: AiChatService };
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
function response(status: number, body: unknown): UserResponse { return { status, headers: JSON_HEADERS, body }; }
function bearer(headers: Record<string, string | undefined>): string | null { const value = headers.authorization; return value?.startsWith("Bearer ") ? value.slice(7).trim() || null : null; }
function bodyObject(body: unknown): Record<string, unknown> | null { return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null; }
function bodyString(body: Record<string, unknown> | null, key: string): string | null { return typeof body?.[key] === "string" && (body[key] as string).trim() ? body[key] as string : null; }
function decodePathValue(value: string): string | null { if (/%(?:2f|5c)/i.test(value)) return null; try { const decoded = decodeURIComponent(value); return decoded || null; } catch { return null; } }
function idAfter(path: string, prefix: string): string | null { if (!path.startsWith(prefix)) return null; return decodePathValue(path.slice(prefix.length)); }

export async function routeAiChatRequest(request: UserRequest, services: AiChatRouteServices): Promise<UserResponse> {
  const rawPathname = (request.rawPath ?? request.path).split("?", 1)[0] ?? "";
  const pathname = new URL(request.path, "http://iseol.local").pathname;
  const isAiChatPath = pathname === "/api/user/ai-chat" || pathname.startsWith("/api/user/ai-chat/");
  if (isAiChatPath && rawPathname.includes("\\")) return response(404, { error: "AI chat route not found" });
  const token = bearer(request.headers); const principal = token ? await services.platformUserService.resolveAuthenticatedPrincipal(token) : null;
  if (!principal) return response(401, { error: "authentication required" });
  if (!services.aiChatService) return response(503, { error: "AI chat unavailable" });
  const chat = services.aiChatService;
  try {
    const planWorkRequest = /^\/api\/user\/ai-chat\/conversations\/([^/]+)\/execution-plans\/([^/]+)\/work-requests$/.exec(pathname);
    if (planWorkRequest) {
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const conversationId = decodePathValue(planWorkRequest[1]!);
      const messageId = decodePathValue(planWorkRequest[2]!);
      if (!conversationId || !messageId) return response(404, { error: "AI chat route not found" });
      return response(201, await chat.createExecutionPlanWorkRequest(principal, conversationId, messageId));
    }
    const planAction = /^\/api\/user\/ai-chat\/conversations\/([^/]+)\/execution-plans\/([^/]+)\/(approve|reject)$/.exec(pathname);
    if (planAction) {
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const conversationId = decodePathValue(planAction[1]!);
      const messageId = decodePathValue(planAction[2]!);
      if (!conversationId || !messageId) return response(404, { error: "AI chat route not found" });
      const conversation = planAction[3] === "approve" ? await chat.approveExecutionPlan(principal, conversationId, messageId) : await chat.rejectExecutionPlan(principal, conversationId, messageId);
      return response(200, { conversation });
    }
    if (pathname === "/api/user/ai-chat/conversations") {
      if (request.method === "GET") return response(200, { conversations: await chat.listConversations(principal) });
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const title = bodyString(bodyObject(request.body), "title");
      return response(201, { conversation: await chat.createConversation(principal, title ?? undefined) });
    }
    const conversationId = idAfter(pathname, "/api/user/ai-chat/conversations/");
    if (!conversationId) return response(404, { error: "AI chat route not found" });
    const messageId = idAfter(conversationId, "/messages");
    if (messageId) return response(404, { error: "AI chat route not found" });
    if (pathname.endsWith("/messages")) {
      const id = conversationId.slice(0, -"/messages".length); const body = bodyObject(request.body); const content = bodyString(body, "content");
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      if (!content) return response(400, { error: "content is required" });
      const projectId = body?.projectId === undefined ? undefined : bodyString(body, "projectId");
      if (body?.projectId !== undefined && !projectId) return response(400, { error: "projectId must be a non-empty string" });
      if (body?.attachments !== undefined && !Array.isArray(body.attachments)) return response(400, { error: "attachments must be an array" });
      const attachments = body?.attachments as AiChatAttachmentInput[] | undefined;
      const contextSelection = body?.contextSelection as AiChatContextSelection | undefined;
      return response(201, await chat.sendMessage(principal, id, content, projectId || attachments || contextSelection !== undefined ? { ...(projectId ? { projectId } : {}), ...(attachments ? { attachments } : {}), ...(contextSelection !== undefined ? { contextSelection } : {}) } : undefined));
    }
    if (request.method !== "GET") return response(405, { error: "method not allowed" });
    const conversation = await chat.getConversation(principal, conversationId);
    return conversation ? response(200, { conversation }) : response(404, { error: "AI chat conversation not found" });
  } catch (error) { const rawMessage = error instanceof Error ? error.message : "AI chat request failed"; const message = sanitizeCredentialText(rawMessage, 240); if (/not found/i.test(rawMessage)) return response(404, { error: message }); return response(400, { error: message }); }
}

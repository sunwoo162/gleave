import type { UserRequest, UserResponse } from "../web-control-plane/user-router.js";
import { sanitizeCredentialText } from "../security/text-safety.js";
import type { PlatformUserService } from "../platform-user/contracts.js";
import type { CommunityCategory, CommunityService, CommunityReportInput } from "./contracts.js";

type Services = { platformUserService: PlatformUserService; communityService?: CommunityService };
const response = (status: number, body: unknown): UserResponse => ({ status, headers: { "content-type": "application/json; charset=utf-8" }, body });
const bearer = (headers: Record<string, string | undefined>): string | null => { const value = headers.authorization; return value?.startsWith("Bearer ") ? value.slice(7) : null; };
const bodyObject = (body: unknown): Record<string, unknown> | null => body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
const decodePathValue = (value: string): string | null => { if (/%(?:2f|5c)/i.test(value)) return null; try { const decoded = decodeURIComponent(value); return decoded || null; } catch { return null; } };

export async function routeCommunityRequest(request: UserRequest, services: Services): Promise<UserResponse> {
  const rawPathname = (request.rawPath ?? request.path).split("?", 1)[0] ?? "";
  const url = new URL(request.path, "http://iseol.local");
  const isCommunityPath = url.pathname === "/api/user/community" || url.pathname.startsWith("/api/user/community/");
  if (isCommunityPath && rawPathname.includes("\\")) return response(404, { error: "community route not found" });
  const token = bearer(request.headers); const principal = token ? await services.platformUserService.resolveAuthenticatedPrincipal(token) : null; if (!principal) return response(401, { error: "authentication required" }); if (!services.communityService) return response(503, { error: "community unavailable" }); const service = services.communityService;
  try {
    if (url.pathname === "/api/user/community") {
      if (request.method === "GET") { const category = url.searchParams.get("category") as CommunityCategory | null; return response(200, { posts: await service.listPosts(principal, category ?? undefined) }); }
      if (request.method !== "POST") return response(405, { error: "method not allowed" }); const body = bodyObject(request.body); const tags = Array.isArray(body?.tags) && body.tags.every((item) => typeof item === "string") ? body.tags as string[] : []; if (typeof body?.category !== "string" || typeof body.title !== "string" || typeof body.content !== "string") return response(400, { error: "category, title, and content are required" }); return response(201, { post: await service.createPost(principal, { category: body.category as CommunityCategory, title: body.title, content: body.content, tags }) });
    }
    const commentMatch = url.pathname.match(/^\/api\/user\/community\/([^/]+)\/comments$/); if (commentMatch) { const postId = decodePathValue(commentMatch[1]!); if (!postId) return response(404, { error: "community route not found" }); if (request.method === "GET") return response(200, { comments: await service.listComments(principal, postId) }); if (request.method !== "POST") return response(405, { error: "method not allowed" }); const body = bodyObject(request.body); if (typeof body?.content !== "string") return response(400, { error: "content is required" }); return response(201, await service.createComment(principal, postId, body.content)); }
    const reportMatch = url.pathname.match(/^\/api\/user\/community\/([^/]+)\/report$/); if (reportMatch) { const postId = decodePathValue(reportMatch[1]!); if (!postId) return response(404, { error: "community route not found" }); if (request.method !== "POST") return response(405, { error: "method not allowed" }); const body = bodyObject(request.body); if ((body?.targetType !== "post" && body?.targetType !== "comment") || typeof body.targetId !== "string" || typeof body.reason !== "string") return response(400, { error: "targetType, targetId, and reason are required" }); const input: CommunityReportInput = { targetType: body.targetType, targetId: body.targetId, postId, reason: body.reason }; return response(201, { report: await service.reportContent(principal, input) }); }
    const match = url.pathname.match(/^\/api\/user\/community\/([^/]+)\/like$/); if (!match || request.method !== "POST") return response(404, { error: "community route not found" }); const postId = decodePathValue(match[1]!); if (!postId) return response(404, { error: "community route not found" }); return response(200, await service.toggleLike(principal, postId));
  } catch (error) { const rawMessage = error instanceof Error ? error.message : "community request failed"; const message = sanitizeCredentialText(rawMessage, 240); if (/required|invalid|not found/i.test(rawMessage)) return response(400, { error: message }); return response(409, { error: message }); }
}

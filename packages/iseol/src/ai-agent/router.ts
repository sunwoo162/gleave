import type { AiAgentProfilePatch, AiAgentProfileService } from "./contracts.js";
import type { PlatformUserService } from "../platform-user/contracts.js";
import type { UserRequest, UserResponse } from "../web-control-plane/user-router.js";

export type AiAgentProfileRouteServices = {
  platformUserService: PlatformUserService;
  aiAgentProfileService?: AiAgentProfileService;
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
function response(status: number, body: unknown): UserResponse { return { status, headers: JSON_HEADERS, body }; }

function bearer(headers: Record<string, string | undefined>): string | null {
  const value = headers.authorization;
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token || null;
}

function objectBody(body: unknown): Record<string, unknown> | null {
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
}

async function authenticated(request: UserRequest, services: AiAgentProfileRouteServices) {
  const token = bearer(request.headers);
  return token ? services.platformUserService.resolveAuthenticatedPrincipal(token) : null;
}

function parsePatch(body: unknown): AiAgentProfilePatch | null {
  const value = objectBody(body);
  if (!value) return null;
  const keys = ["name", "avatarUrl", "personality", "tone", "role"] as const;
  for (const key of keys) if (value[key] !== undefined && typeof value[key] !== "string") return null;
  return Object.fromEntries(keys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]])) as AiAgentProfilePatch;
}

export async function routeAiAgentProfileRequest(request: UserRequest, services: AiAgentProfileRouteServices): Promise<UserResponse> {
  const url = new URL(request.path, "http://iseol.local");
  const rawPathname = (request.rawPath ?? request.path).split("?", 1)[0] ?? "";
  if (url.pathname !== "/api/user/agent" || rawPathname.includes("\\")) return response(404, { error: "AI agent route not found" });
  const principal = await authenticated(request, services);
  if (!principal) return response(401, { error: "authentication required" });
  if (!services.aiAgentProfileService) return response(503, { error: "AI agent profile unavailable" });
  if (request.method === "GET") return response(200, { profile: await services.aiAgentProfileService.getProfile(principal) });
  if (request.method !== "PATCH" && request.method !== "PUT") return response(405, { error: "method not allowed" });
  const patch = parsePatch(request.body);
  if (!patch) return response(400, { error: "json object with string profile fields required" });
  return response(200, { profile: await services.aiAgentProfileService.updateProfile(principal, patch) });
}

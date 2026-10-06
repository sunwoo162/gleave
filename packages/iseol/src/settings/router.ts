import type { PlatformUserService } from "../platform-user/contracts.js";
import type { UserRequest, UserResponse } from "../web-control-plane/user-router.js";
import { sanitizeCredentialText } from "../security/text-safety.js";
import type { SettingsService, UserSettingsPatch } from "./contracts.js";

export type SettingsRouteServices = { platformUserService: PlatformUserService; settingsService?: SettingsService };
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
function response(status: number, body: unknown): UserResponse { return { status, headers: JSON_HEADERS, body }; }
function bearer(headers: Record<string, string | undefined>): string | null { const value = headers.authorization; return value?.startsWith("Bearer ") ? value.slice(7).trim() || null : null; }
function objectBody(body: unknown): Record<string, unknown> | null { return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null; }
function partialBooleans(value: unknown): Record<string, boolean> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid settings group");
  const result: Record<string, boolean> = {};
  for (const [key, item] of Object.entries(value)) { if (typeof item !== "boolean") throw new Error("Settings values must be boolean"); result[key] = item; }
  return result;
}

export async function routeSettingsRequest(request: UserRequest, services: SettingsRouteServices): Promise<UserResponse> {
  const url = new URL(request.path, "http://iseol.local");
  const rawPathname = (request.rawPath ?? request.path).split("?", 1)[0] ?? "";
  if (url.pathname !== "/api/user/settings" || rawPathname.includes("\\")) return response(404, { error: "settings route not found" });
  const token = bearer(request.headers); const principal = token ? await services.platformUserService.resolveAuthenticatedPrincipal(token) : null;
  if (!principal) return response(401, { error: "authentication required" });
  if (!services.settingsService) return response(503, { error: "settings unavailable" });
  try {
    if (request.method === "GET") return response(200, { settings: await services.settingsService.getSettings(principal) });
    if (request.method !== "PATCH") return response(405, { error: "method not allowed" });
    const body = objectBody(request.body); if (!body) return response(400, { error: "settings patch is required" });
    const patch: UserSettingsPatch = {
      ...(body.aiAccess === undefined ? {} : { aiAccess: partialBooleans(body.aiAccess) }),
      ...(body.aiApproval === undefined ? {} : { aiApproval: partialBooleans(body.aiApproval) }),
      ...(body.notifications === undefined ? {} : { notifications: partialBooleans(body.notifications) }),
      ...(body.privacy === undefined ? {} : { privacy: partialBooleans(body.privacy) }),
      ...(body.integrations === undefined ? {} : { integrations: partialBooleans(body.integrations) }),
    };
    return response(200, { settings: await services.settingsService.updateSettings(principal, patch) });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "settings request failed";
    const message = sanitizeCredentialText(rawMessage, 240);
    if (/invalid|boolean|required/i.test(rawMessage)) return response(400, { error: message });
    return response(409, { error: message });
  }
}

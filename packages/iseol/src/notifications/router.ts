import type { PlatformUserService } from "../platform-user/contracts.js";
import { sanitizeCredentialText } from "../security/text-safety.js";
import type { UserRequest, UserResponse } from "../web-control-plane/user-router.js";
import type { NotificationService } from "./contracts.js";

export type NotificationRouteServices = { platformUserService: PlatformUserService; notificationService?: NotificationService };
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
function response(status: number, body: unknown): UserResponse { return { status, headers: JSON_HEADERS, body }; }
function bearer(headers: Record<string, string | undefined>): string | null { const value = headers.authorization; return value?.startsWith("Bearer ") ? value.slice(7).trim() || null : null; }
function decodePathValue(value: string): string | null {
  if (/%(?:2f|5c)/i.test(value)) return null;
  try {
    const decoded = decodeURIComponent(value);
    return decoded || null;
  } catch {
    return null;
  }
}

export async function routeNotificationsRequest(request: UserRequest, services: NotificationRouteServices): Promise<UserResponse> {
  const url = new URL(request.path, "http://iseol.local");
  const rawPathname = (request.rawPath ?? request.path).split("?", 1)[0] ?? "";
  const isNotificationPath = url.pathname === "/api/user/notifications" || url.pathname.startsWith("/api/user/notifications/");
  if (isNotificationPath && rawPathname.includes("\\")) return response(404, { error: "notification route not found" });
  const token = bearer(request.headers);
  const principal = token ? await services.platformUserService.resolveAuthenticatedPrincipal(token) : null;
  if (!principal) return response(401, { error: "authentication required" });
  if (!services.notificationService) return response(503, { error: "notifications unavailable" });
  try {
    if (url.pathname === "/api/user/notifications") {
      if (request.method !== "GET") return response(405, { error: "method not allowed" });
      const unreadOnly = url.searchParams.get("unreadOnly") === "1" || url.searchParams.get("unreadOnly") === "true";
      return response(200, await services.notificationService.listNotifications(principal, { unreadOnly }));
    }
    const match = url.pathname.match(/^\/api\/user\/notifications\/([^/]+)\/read$/);
    if (!match) return response(404, { error: "notification route not found" });
    const notificationId = decodePathValue(match[1] ?? "");
    if (!notificationId) return response(404, { error: "notification route not found" });
    if (request.method !== "POST") return response(405, { error: "method not allowed" });
    return response(200, { notification: await services.notificationService.markRead(principal, notificationId) });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "notification request failed";
    const message = sanitizeCredentialText(rawMessage, 240);
    if (/not found/i.test(rawMessage)) return response(404, { error: message });
    if (/invalid|required/i.test(rawMessage)) return response(400, { error: message });
    return response(409, { error: message });
  }
}

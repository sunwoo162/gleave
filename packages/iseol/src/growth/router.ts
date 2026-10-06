import type { ActivityService } from "../activity/contracts.js";
import { assertIdentityId } from "../identity/contracts.js";
import type { PlatformUserService } from "../platform-user/contracts.js";
import type { UserRequest, UserResponse } from "../web-control-plane/user-router.js";
import { sanitizeCredentialText } from "../security/text-safety.js";
import type { GrowthService } from "./contracts.js";

export type GrowthRouteServices = {
  platformUserService: PlatformUserService;
  activityService?: ActivityService;
  growthService?: GrowthService;
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
function response(status: number, body: unknown): UserResponse { return { status, headers: JSON_HEADERS, body }; }
function bearer(headers: Record<string, string | undefined>): string | null {
  const value = headers.authorization;
  if (!value?.startsWith("Bearer ")) return null;
  return value.slice("Bearer ".length).trim() || null;
}
function objectBody(body: unknown): Record<string, unknown> | null { return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null; }
function identityIdFromPath(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    assertIdentityId(decoded);
    return decoded;
  } catch {
    return null;
  }
}

export async function routeGrowthRequest(request: UserRequest, services: GrowthRouteServices): Promise<UserResponse> {
  const url = new URL(request.path, "http://iseol.local");
  const rawPathname = (request.rawPath ?? request.path).split("?", 1)[0] ?? "";
  const isGrowthPath = ["/api/user/growth", "/api/user/activity"].some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
  if (isGrowthPath && rawPathname.includes("\\")) return response(404, { error: "growth route not found" });
  const token = bearer(request.headers);
  const principal = token ? await services.platformUserService.resolveAuthenticatedPrincipal(token) : null;
  if (!principal) return response(401, { error: "authentication required" });
  if (url.pathname === "/api/user/growth") {
    if (request.method !== "GET") return response(405, { error: "method not allowed" });
    if (!services.growthService) return response(503, { error: "growth unavailable" });
    return response(200, await services.growthService.getGrowthSnapshot(principal));
  }
  if (url.pathname === "/api/user/activity") {
    if (!services.activityService) return response(503, { error: "activity unavailable" });
    if (request.method === "GET") return response(200, { events: await services.activityService.listActivityEvents(principal) });
    if (request.method !== "POST") return response(405, { error: "method not allowed" });
    const body = objectBody(request.body);
    if (!body || typeof body.sourceType !== "string" || typeof body.sourceId !== "string" || typeof body.eventType !== "string" || typeof body.eventVersion !== "number" || typeof body.actorType !== "string" || typeof body.verificationStatus !== "string") {
      return response(400, { error: "activity identity and verification fields are required" });
    }
    if (body.verificationStatus === "verified") return response(403, { error: "verified activity is service-owned" });
    const event = await services.activityService.recordActivityEvent(principal, {
      sourceType: body.sourceType,
      sourceId: body.sourceId,
      eventType: body.eventType,
      eventVersion: body.eventVersion,
      actorType: body.actorType as "user" | "ai" | "system",
      verificationStatus: body.verificationStatus as "verified" | "unverified" | "unknown",
      ...(body.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? { payload: body.payload as Record<string, string | number | boolean | null> } : {}),
      ...(typeof body.occurredAt === "string" ? { occurredAt: body.occurredAt } : {}),
    });
    const growth = services.growthService ? await services.growthService.applyGrowthProjection(event) : null;
    const snapshot = services.growthService ? await services.growthService.getGrowthSnapshot(principal) : null;
    return response(201, { event, growth, snapshot });
  }
  if (url.pathname === "/api/user/activity/export") {
    if (request.method !== "GET") return response(405, { error: "method not allowed" });
    if (!services.activityService) return response(503, { error: "activity unavailable" });
    const format = url.searchParams.get("format") ?? "json";
    if (format !== "json" && format !== "markdown") return response(400, { error: "format must be json or markdown" });
    const events = await services.activityService.listActivityEvents(principal);
    if (format === "json") {
      return response(200, {
        format,
        filename: "iseol-activity-export.json",
        events,
        content: JSON.stringify({ version: 1, events }, null, 2),
      });
    }
    const lines = ["# ISEOL 활동 기록", "", "본인 계정에 귀속된 활동 원장입니다.", "", ...events.map((event) => [
      `- ${event.occurredAt} · ${event.eventType}`,
      `  - 상태: ${event.status} · 검증: ${event.verificationStatus} · 행위자: ${event.actorType}`,
      `  - 출처: ${event.sourceType}/${event.sourceId}`,
    ].join("\n"))];
    return response(200, { format, filename: "iseol-activity-export.md", events, content: lines.join("\n") });
  }
  const prefix = "/api/user/activity/";
  if (url.pathname.startsWith(prefix)) {
    if (!services.activityService || !services.growthService) return response(503, { error: "activity growth unavailable" });
    if (request.method !== "DELETE") return response(405, { error: "method not allowed" });
    const eventId = identityIdFromPath(url.pathname.slice(prefix.length));
    if (!eventId) return response(404, { error: "activity event not found" });
    let event;
    try {
      event = await services.activityService.retractActivityEvent(principal, eventId);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "activity request failed";
      if (/not found/i.test(rawMessage)) return response(404, { error: sanitizeCredentialText(rawMessage, 240) });
      throw error;
    }
    const growth = await services.growthService.applyGrowthProjection(event);
    return response(200, { event, growth, snapshot: await services.growthService.getGrowthSnapshot(principal) });
  }
  return response(404, { error: "not found" });
}

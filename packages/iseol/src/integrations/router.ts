import type { PlatformUserService } from "../platform-user/contracts.js";
import { sanitizeCredentialText } from "../security/text-safety.js";
import type { UserRequest, UserResponse } from "../web-control-plane/user-router.js";
import { INTEGRATION_PROVIDERS, type IntegrationDeliveryInput, type IntegrationProvider, type IntegrationService } from "./contracts.js";
import type { SettingsService } from "../settings/contracts.js";

export type IntegrationRouteServices = {
  platformUserService: PlatformUserService;
  integrationService?: IntegrationService;
  settingsService?: SettingsService;
  configuredProviders?: IntegrationProvider[];
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
function response(status: number, body: unknown): UserResponse { return { status, headers: JSON_HEADERS, body }; }
function bearer(headers: Record<string, string | undefined>): string | null { const value = headers.authorization; return value?.startsWith("Bearer ") ? value.slice(7).trim() || null : null; }
function objectBody(body: unknown): Record<string, unknown> | null { return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null; }
function providerFromPath(path: string): IntegrationProvider | null {
  const match = /^\/api\/user\/integrations\/(calendar|github|discord)\/deliveries$/.exec(path);
  return match ? match[1] as IntegrationProvider : null;
}

export async function routeIntegrationsRequest(request: UserRequest, services: IntegrationRouteServices): Promise<UserResponse> {
  const url = new URL(request.path, "http://iseol.local");
  const rawPathname = (request.rawPath ?? request.path).split("?", 1)[0] ?? "";
  const isIntegrationPath = url.pathname === "/api/user/integrations" || url.pathname.startsWith("/api/user/integrations/");
  if (isIntegrationPath && rawPathname.includes("\\")) return response(404, { error: "integration route not found" });
  const token = bearer(request.headers);
  const principal = token ? await services.platformUserService.resolveAuthenticatedPrincipal(token) : null;
  if (!principal) return response(401, { error: "authentication required" });
  if (!services.integrationService || !services.settingsService) return response(503, { error: "integrations unavailable" });
  const path = url.pathname;
  try {
    if (path === "/api/user/integrations" && request.method === "GET") {
      const settings = await services.settingsService.getSettings(principal);
      const deliveries = await services.integrationService.listDeliveries(principal);
      return response(200, {
        integrations: INTEGRATION_PROVIDERS.map((provider) => ({
          provider,
          optedIn: settings.integrations[provider],
          configured: services.configuredProviders?.includes(provider) === true,
          lastDelivery: deliveries.find((delivery) => delivery.provider === provider) ?? null,
        })),
      });
    }
    const provider = providerFromPath(path);
    if (!provider) return response(404, { error: "integration route not found" });
    if (request.method !== "POST") return response(405, { error: "method not allowed" });
    const body = objectBody(request.body);
    if (!body || typeof body.sourceType !== "string" || typeof body.sourceId !== "string" || typeof body.eventType !== "string" || typeof body.eventVersion !== "number" || !Number.isInteger(body.eventVersion)) {
      return response(400, { error: "integration delivery input is invalid" });
    }
    const input: IntegrationDeliveryInput = {
      provider,
      sourceType: body.sourceType,
      sourceId: body.sourceId,
      eventType: body.eventType,
      eventVersion: body.eventVersion,
      ...(body.payload === undefined ? {} : { payload: body.payload as IntegrationDeliveryInput["payload"] }),
    };
    const queued = await services.integrationService.enqueueDelivery(principal, input);
    const delivery = await services.integrationService.dispatchDelivery(principal, queued.id);
    return response(200, { delivery });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "integration request failed";
    const message = sanitizeCredentialText(rawMessage, 240);
    if (/invalid|identity conflict/i.test(rawMessage)) return response(400, { error: message });
    if (/not found/i.test(rawMessage)) return response(404, { error: message });
    return response(409, { error: message });
  }
}

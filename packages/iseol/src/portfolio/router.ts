import type { PlatformUserService } from "../platform-user/contracts.js";
import type { UserRequest, UserResponse } from "../web-control-plane/user-router.js";
import { assertIdentityId } from "../identity/contracts.js";
import { sanitizeCredentialText } from "../security/text-safety.js";
import type { PortfolioService } from "./contracts.js";

export type PortfolioRouteServices = { platformUserService: PlatformUserService; portfolioService?: PortfolioService };
export type PublicPortfolioRouteServices = { portfolioService?: PortfolioService };
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
function response(status: number, body: unknown): UserResponse { return { status, headers: JSON_HEADERS, body }; }
function bearer(headers: Record<string, string | undefined>): string | null { const value = headers.authorization; return value?.startsWith("Bearer ") ? value.slice(7).trim() || null : null; }
function objectBody(body: unknown): Record<string, unknown> | null { return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null; }
function stringValue(body: Record<string, unknown> | null, key: string): string | null { return typeof body?.[key] === "string" && (body[key] as string).trim() ? body[key] as string : null; }
function decodePathValue(value: string): string | null { if (/%(?:2f|5c)/i.test(value)) return null; try { const decoded = decodeURIComponent(value); return decoded || null; } catch { return null; } }
function idAfter(pathname: string, prefix: string): string | null { if (!pathname.startsWith(prefix)) return null; return decodePathValue(pathname.slice(prefix.length)); }

export async function routePortfolioRequest(request: UserRequest, services: PortfolioRouteServices): Promise<UserResponse> {
  const url = new URL(request.path, "http://iseol.local"); const rawPathname = (request.rawPath ?? request.path).split("?", 1)[0] ?? ""; const isPortfolioPath = url.pathname === "/api/user/portfolio" || url.pathname.startsWith("/api/user/portfolio/"); if (isPortfolioPath && rawPathname.includes("\\")) return response(404, { error: "portfolio route not found" }); const token = bearer(request.headers); const principal = token ? await services.platformUserService.resolveAuthenticatedPrincipal(token) : null; if (!principal) return response(401, { error: "authentication required" }); if (!services.portfolioService) return response(503, { error: "portfolio unavailable" }); const portfolio = services.portfolioService;
  try {
    if (url.pathname === "/api/user/portfolio") {
      if (request.method === "GET") return response(200, await portfolio.listPortfolio(principal));
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const body = objectBody(request.body); const title = stringValue(body, "title"); const summary = stringValue(body, "summary"); const visibility = stringValue(body, "visibility") as "public" | "unlisted" | "private" | null; const evidenceIds = Array.isArray(body?.evidenceIds) && body.evidenceIds.every((item) => typeof item === "string") ? body.evidenceIds as string[] : null;
      if (!title || !summary || !visibility || !evidenceIds) return response(400, { error: "title, summary, visibility, and evidenceIds are required" });
      return response(201, { entry: await portfolio.createEntry(principal, { title, summary, visibility, evidenceIds }) });
    }
    if (url.pathname === "/api/user/portfolio/export") { if (request.method !== "GET") return response(405, { error: "method not allowed" }); const format = url.searchParams.get("format") as "json" | "markdown" | null; if (!format) return response(400, { error: "format is required" }); return response(200, await portfolio.exportPortfolio(principal, format)); }
    const entryId = idAfter(url.pathname, "/api/user/portfolio/"); if (!entryId) return response(404, { error: "portfolio entry not found" }); if (request.method !== "PATCH") return response(405, { error: "method not allowed" }); const body = objectBody(request.body); const evidenceIds = body?.evidenceIds === undefined ? undefined : Array.isArray(body.evidenceIds) && body.evidenceIds.every((item) => typeof item === "string") ? body.evidenceIds as string[] : null; if (evidenceIds === null) return response(400, { error: "evidenceIds must be an array" }); return response(200, { entry: await portfolio.updateEntry(principal, entryId, { ...(typeof body?.title === "string" ? { title: body.title } : {}), ...(typeof body?.summary === "string" ? { summary: body.summary } : {}), ...(body?.visibility === "public" || body?.visibility === "unlisted" || body?.visibility === "private" ? { visibility: body.visibility } : {}), ...(evidenceIds ? { evidenceIds } : {}) }) });
  } catch (error) { const rawMessage = error instanceof Error ? error.message : "portfolio request failed"; const message = sanitizeCredentialText(rawMessage, 240); if (/not found/i.test(rawMessage)) return response(404, { error: message }); if (/verified|invalid|required|unsupported/i.test(rawMessage)) return response(400, { error: message }); return response(409, { error: message }); }
}

export async function routePublicPortfolioRequest(request: UserRequest, services: PublicPortfolioRouteServices): Promise<UserResponse> {
  if (request.method !== "GET") return response(405, { error: "method not allowed" });
  if (!services.portfolioService) return response(503, { error: "portfolio unavailable" });
  const url = new URL(request.path, "http://iseol.local");
  const rawPathname = (request.rawPath ?? request.path).split("?", 1)[0] ?? "";
  const prefix = "/api/public/portfolio/";
  if (rawPathname.includes("\\")) return response(404, { error: "public portfolio not found" });
  if (!url.pathname.startsWith(prefix)) return response(404, { error: "public portfolio not found" });
  const entryId = decodePathValue(url.pathname.slice(prefix.length));
  if (!entryId) return response(404, { error: "public portfolio not found" });
  try { assertIdentityId(entryId); } catch { return response(404, { error: "public portfolio not found" }); }
  const view = await services.portfolioService.getPublicEntry(entryId);
  return view ? response(200, view) : response(404, { error: "public portfolio not found" });
}

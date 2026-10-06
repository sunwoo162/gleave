import type { PlatformUserService } from "../platform-user/contracts.js";
import type { UserRequest, UserResponse } from "../web-control-plane/user-router.js";
import type { StudyService } from "./contracts.js";
import { sanitizeCredentialText } from "../security/text-safety.js";

export type StudyRouteServices = { platformUserService: PlatformUserService; studyService?: StudyService };
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const response = (status: number, body: unknown): UserResponse => ({ status, headers: JSON_HEADERS, body });
const bearer = (headers: Record<string, string | undefined>): string | null => { const value = headers.authorization; return value?.startsWith("Bearer ") ? value.slice(7).trim() || null : null; };
const objectBody = (body: unknown): Record<string, unknown> | null => body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
const stringValue = (body: Record<string, unknown> | null, key: string): string | null => typeof body?.[key] === "string" && (body[key] as string).trim() ? body[key] as string : null;
const decodePathValue = (value: string): string | null => {
  if (/%(?:2f|5c)/i.test(value)) return null;
  try {
    const decoded = decodeURIComponent(value);
    return decoded || null;
  } catch {
    return null;
  }
};
const idAfter = (pathname: string, prefix: string): string | null => { if (!pathname.startsWith(prefix)) return null; return decodePathValue(pathname.slice(prefix.length)); };
function errorResponse(error: unknown): UserResponse { const rawMessage = error instanceof Error ? error.message : "study request failed"; const message = sanitizeCredentialText(rawMessage, 240); if (/not found/i.test(rawMessage)) return response(404, { error: message }); if (/access|required|invalid|private|manager/i.test(rawMessage)) return response(/access|manager|private/i.test(rawMessage) ? 403 : 400, { error: message }); return response(409, { error: message }); }

export async function routeStudyRequest(request: UserRequest, services: StudyRouteServices): Promise<UserResponse> {
  const url = new URL(request.path, "http://iseol.local");
  const rawPathname = (request.rawPath ?? request.path).split("?", 1)[0] ?? "";
  const isStudyPath = url.pathname === "/api/user/studies" || url.pathname.startsWith("/api/user/studies/");
  if (isStudyPath && rawPathname.includes("\\")) return response(404, { error: "study route not found" });
  const token = bearer(request.headers); const principal = token ? await services.platformUserService.resolveAuthenticatedPrincipal(token) : null; if (!principal) return response(401, { error: "authentication required" });
  if (!services.studyService) return response(503, { error: "study unavailable" });
  const study = services.studyService;
  try {
    if (url.pathname === "/api/user/studies") {
      if (request.method === "GET") return response(200, { studies: await study.listStudySpaces(principal) });
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const body = objectBody(request.body); const teamId = stringValue(body, "teamId"); const title = stringValue(body, "title"); const description = stringValue(body, "description");
      if (!teamId || !title || !description) return response(400, { error: "teamId, title, and description are required" });
      return response(201, { space: await study.createStudySpace(principal, { teamId, title, description }) });
    }
    const rest = idAfter(url.pathname, "/api/user/studies/"); if (!rest) return response(404, { error: "study not found" });
    const linksSuffix = "/curriculum-links"; if (rest.endsWith(linksSuffix)) {
      if (request.method !== "POST") return response(405, { error: "method not allowed" }); const studySpaceId = rest.slice(0, -linksSuffix.length); const body = objectBody(request.body); const kind = stringValue(body, "kind") as "learning-goal" | "resource" | null; const referenceId = stringValue(body, "referenceId"); const label = stringValue(body, "label"); if (!kind || !referenceId || !label) return response(400, { error: "kind, referenceId, and label are required" }); return response(201, { link: await study.addCurriculumLink(principal, studySpaceId, { kind, referenceId, label }) });
    }
    const submissionMatch = rest.match(/^([^/]+)\/tasks\/([^/]+)\/submissions$/); if (submissionMatch) {
      if (request.method !== "PUT") return response(405, { error: "method not allowed" }); const body = objectBody(request.body); const answer = stringValue(body, "answer"); const status = stringValue(body, "status") as "draft" | "submitted" | null; if (!answer || !status) return response(400, { error: "answer and status are required" }); return response(200, { submission: await study.saveTaskSubmission(principal, submissionMatch[1]!, submissionMatch[2]!, { answer, status }) });
    }
    const tasksSuffix = "/tasks"; if (rest.endsWith(tasksSuffix)) {
      if (request.method !== "POST") return response(405, { error: "method not allowed" }); const studySpaceId = rest.slice(0, -tasksSuffix.length); const body = objectBody(request.body); const title = stringValue(body, "title"); const instructions = stringValue(body, "instructions"); const dueLocalDate = body?.dueLocalDate === undefined ? undefined : stringValue(body, "dueLocalDate"); if (!title || !instructions || (body?.dueLocalDate !== undefined && !dueLocalDate)) return response(400, { error: "title and instructions are required" }); return response(201, { task: await study.createTask(principal, studySpaceId, { title, instructions, ...(dueLocalDate ? { dueLocalDate } : {}) }) });
    }
    if (request.method !== "GET") return response(405, { error: "method not allowed" }); const view = await study.getStudySpace(principal, rest); return view ? response(200, view) : response(404, { error: "study not found" });
  } catch (error) { return errorResponse(error); }
}

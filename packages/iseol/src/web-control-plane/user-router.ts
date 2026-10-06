import type { PlatformUserService } from "../platform-user/contracts.js";

export type UserRequest = {
  method: string;
  path: string;
  rawPath?: string;
  headers: Record<string, string | undefined>;
  body?: unknown;
};

export type UserResponse = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

export type UserRuntimeCapability = {
  state: "disabled" | "ready" | "blocked";
  agent?: "ready" | "unavailable";
  enqueueProjectRun?: unknown;
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function response(status: number, body: unknown): UserResponse {
  return { status, headers: JSON_HEADERS, body };
}

function bearer(headers: Record<string, string | undefined>): string | null {
  const value = headers.authorization;
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token || null;
}

function objectBody(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

function sessionExpiry(): string {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

export async function routeUserRequest(
  request: UserRequest,
  service: PlatformUserService,
  options: { runtimeCapability?: UserRuntimeCapability; aiChatRuntimeReady?: boolean; aiTeamRuntimeReady?: boolean; learningAiRuntimeReady?: boolean } = {},
): Promise<UserResponse> {
  const path = request.path.split("?", 1)[0] ?? request.path;
  const rawPathname = (request.rawPath ?? request.path).split("?", 1)[0] ?? "";
  const isTopLevelUserPath = [
    "/api/user/signup",
    "/api/user/login",
    "/api/user/password",
    "/api/user/logout",
    "/api/user/me",
    "/api/user/runtime-status",
  ].includes(path);
  if (isTopLevelUserPath && rawPathname.includes("\\")) return response(404, { error: "user route not found" });
  if (path === "/api/user/signup") {
    if (request.method !== "POST") return response(405, { error: "method not allowed" });
    const body = objectBody(request.body);
    if (!body || typeof body.email !== "string" || typeof body.displayName !== "string" || typeof body.timezone !== "string" || typeof body.password !== "string") {
      return response(400, { error: "email, displayName, timezone, and password are required" });
    }
    if (await service.findUserByEmail(body.email)) return response(409, { error: "user already exists" });
    let user;
    try {
      user = await service.createUser({ email: body.email, displayName: body.displayName, timezone: body.timezone, password: body.password });
    } catch (error) {
      const message = error instanceof Error ? error.message : "user validation failed";
      if (/password must be between/i.test(message)) return response(400, { error: "password must be between 8 and 256 characters" });
      if (/valid user email/i.test(message)) return response(400, { error: "valid email is required" });
      if (/display name is required/i.test(message)) return response(400, { error: "display name is required" });
      if (/timezone is required/i.test(message)) return response(400, { error: "timezone is required" });
      throw error;
    }
    const session = await service.createSession({ userId: user.id, roles: ["user"], expiresAt: sessionExpiry() });
    return response(201, { user, session: { id: session.id, token: session.token, expiresAt: session.expiresAt } });
  }
  if (path === "/api/user/login") {
    if (request.method !== "POST") return response(405, { error: "method not allowed" });
    const body = objectBody(request.body);
    if (!body || typeof body.email !== "string" || typeof body.password !== "string") return response(400, { error: "email and password are required" });
    const user = await service.authenticateUser(body.email, body.password);
    if (!user) return response(401, { error: "invalid credentials" });
    const session = await service.createSession({ userId: user.id, roles: ["user"], expiresAt: sessionExpiry() });
    return response(200, { user, session: { id: session.id, token: session.token, expiresAt: session.expiresAt } });
  }
  if (path === "/api/user/password") {
    if (request.method !== "POST") return response(405, { error: "method not allowed" });
    const body = objectBody(request.body);
    if (!body || typeof body.currentPassword !== "string" || typeof body.newPassword !== "string") return response(400, { error: "currentPassword and newPassword are required" });
    const token = bearer(request.headers);
    if (!token) return response(401, { error: "authentication required" });
    const principal = await service.resolveAuthenticatedPrincipal(token);
    if (!principal) return response(401, { error: "authentication required" });
    try {
      await service.changePassword(principal, body.currentPassword, body.newPassword);
      return response(200, { passwordChanged: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "password change failed";
      if (/current password/i.test(message)) return response(401, { error: "current password is invalid" });
      if (/Password must be between/i.test(message)) return response(400, { error: "password must be between 8 and 256 characters" });
      return response(400, { error: "password change failed" });
    }
  }
  if (path === "/api/user/logout") {
    if (request.method !== "POST") return response(405, { error: "method not allowed" });
    const token = bearer(request.headers);
    if (!token) return response(401, { error: "authentication required" });
    const principal = await service.resolveAuthenticatedPrincipal(token);
    if (!principal) return response(401, { error: "authentication required" });
    await service.revokeSession(principal.sessionId);
    return response(200, { loggedOut: true });
  }
  if (path !== "/api/user/me" && path !== "/api/user/runtime-status") return response(404, { error: "not found" });
  if (request.method !== "GET") return response(405, { error: "method not allowed" });
  const token = bearer(request.headers);
  if (!token) return response(401, { error: "authentication required" });
  const principal = await service.resolveAuthenticatedPrincipal(token);
  if (!principal) return response(401, { error: "authentication required" });
  if (path === "/api/user/runtime-status") {
    const capability = options.runtimeCapability;
    return response(200, {
      runtime: {
        version: 1,
        source: { kind: "local-runtime" },
        state: capability?.state ?? "disabled",
        projectExecution: capability?.enqueueProjectRun ? "ready" : "unavailable",
        agent: capability?.agent === "ready" ? "ready" : "unavailable",
        aiChat: options.aiChatRuntimeReady ? "ready" : "unavailable",
        aiTeam: options.aiTeamRuntimeReady ? "ready" : "unavailable",
        learningAi: options.learningAiRuntimeReady ? "ready" : "unavailable",
      },
    });
  }
  const user = await service.getUser(principal.userId);
  if (!user) return response(404, { error: "user not found" });
  return response(200, { user });
}

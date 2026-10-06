import { createServer, type IncomingHttpHeaders, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import {
  routeWebControlPlaneRequest,
  type IdeaLabRuntimeCapability,
  type WebControlPlaneRequest,
} from "./router.js";
import { WebProductEventBus, type WebProductEvent } from "./event-bus.js";
import { connectProgressEventBridge } from "../discord-project/progress-event-bridge.js";
import type { ProgressNotificationAdapter } from "../discord-project/progress-notifications.js";
import { routeUserRequest } from "./user-router.js";
import type { PlatformUserService } from "../platform-user/contracts.js";
import { routePersonalWorldRequest } from "../personal-world/router.js";
import type { PersonalWorldService } from "../personal-world/contracts.js";
import type { MemoryService } from "../memory/contracts.js";
import { routeGrowthRequest } from "../growth/router.js";
import type { ActivityService } from "../activity/contracts.js";
import type { GrowthService } from "../growth/contracts.js";
import { routeLearningRequest } from "../learning/router.js";
import type { LearningService } from "../learning/contracts.js";
import { routeUserProjectRequest } from "../project-model/user-project-router.js";
import type { UserProjectService } from "../project-model/user-project-service.js";
import type { AiTeamProposalService } from "../ai-team/contracts.js";
import type { AiTeamDiscussionService } from "../ai-team/contracts.js";
import { routeCollaborationRequest } from "../collaboration-router.js";
import type { RecruitmentService } from "../recruitment/contracts.js";
import type { SocialService } from "../social/contracts.js";
import type { TeamService } from "../teams/contracts.js";
import type { TeamChatService } from "../team-chat/contracts.js";
import { routePortfolioRequest, routePublicPortfolioRequest } from "../portfolio/router.js";
import type { PortfolioService } from "../portfolio/contracts.js";
import { routeCommunityRequest } from "../community/router.js";
import type { CommunityService } from "../community/contracts.js";
import { routeSettingsRequest } from "../settings/router.js";
import type { SettingsService } from "../settings/contracts.js";
import { routeAiChatRequest } from "../ai-chat/router.js";
import type { AiChatService } from "../ai-chat/contracts.js";
import { routeStudyRequest } from "../study/router.js";
import type { StudyService } from "../study/contracts.js";
import { routeNotificationsRequest } from "../notifications/router.js";
import type { NotificationService, NotificationStreamEvent } from "../notifications/contracts.js";
import { routeAiAgentProfileRequest } from "../ai-agent/router.js";
import type { AiAgentProfileService } from "../ai-agent/contracts.js";
import { routeIntegrationsRequest } from "../integrations/router.js";
import type { IntegrationProvider, IntegrationService } from "../integrations/contracts.js";

const DEFAULT_PORT = 8790;
const MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_SSE_CONNECTION_LIMIT = 64;

type SseState = { active: number; limit: number; responses: Set<ServerResponse> };

export type WebControlPlaneServer = Server & {
  closeForShutdown: () => Promise<void>;
};

export type WebControlPlaneConfig = {
  host: string;
  port: number;
  token: string;
  operatorToken?: string;
  operatorId?: string;
  modelRoot: string;
  harnessRoot: string;
  webRoot: string;
  userUiRoot?: string;
  platformRoot?: string;
  eventJournalRoot?: string;
  userService?: PlatformUserService;
  personalWorldService?: PersonalWorldService;
  memoryService?: MemoryService;
  activityService?: ActivityService;
  growthService?: GrowthService;
  learningService?: LearningService;
  userProjectService?: UserProjectService;
  teamService?: TeamService;
  teamChatService?: TeamChatService;
  socialService?: SocialService;
  recruitmentService?: RecruitmentService;
  portfolioService?: PortfolioService;
  communityService?: CommunityService;
  settingsService?: SettingsService;
  notificationService?: NotificationService;
  aiChatService?: AiChatService;
  aiAgentProfileService?: AiAgentProfileService;
  integrationService?: IntegrationService;
  integrationConfiguredProviders?: IntegrationProvider[];
  iseolRoot?: string;
  policyRoot?: string;
  projectModelRoot?: string;
  projectHarnessRoot?: string;
  aiTeamProposalService?: AiTeamProposalService;
  aiTeamDiscussionService?: AiTeamDiscussionService;
  studyService?: StudyService;
};

export type StartWebControlPlaneOptions = WebControlPlaneConfig & {
  port: number;
  ideaLabRuntime?: IdeaLabRuntimeCapability;
  aiChatRuntimeReady?: boolean;
  aiTeamRuntimeReady?: boolean;
  learningAiRuntimeReady?: boolean;
  eventBus?: WebProductEventBus;
  sseConnectionLimit?: number;
  progressNotificationRoot?: string;
  progressNotificationAdapter?: ProgressNotificationAdapter;
};

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

function envValue(env: Record<string, string | undefined>, name: string): string {
  return env[name]?.trim() ?? "";
}

export function resolveWebControlPlaneConfig(
  env: Record<string, string | undefined> = process.env,
): WebControlPlaneConfig {
  const host = envValue(env, "ISEOL_WEB_HOST") || "127.0.0.1";
  const portText = envValue(env, "ISEOL_WEB_PORT");
  const port = portText ? Number(portText) : DEFAULT_PORT;
  const token = envValue(env, "ISEOL_WEB_TOKEN");
  const operatorToken = envValue(env, "ISEOL_OPERATOR_TOKEN");
  const operatorId = envValue(env, "ISEOL_OPERATOR_ID");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid ISEOL_WEB_PORT: ${portText}`);
  }
  if (!isLoopbackHost(host) && !token) {
    throw new Error("ISEOL_WEB_TOKEN is required for non-loopback ISEOL_WEB_HOST");
  }
  const platformRoot = envValue(env, "ISEOL_PLATFORM_ROOT") || resolve(process.cwd(), "data", "platform");
  return {
    host,
    port,
    token,
    ...(operatorToken ? { operatorToken } : {}),
    ...(operatorId ? { operatorId } : {}),
    modelRoot: envValue(env, "ISEOL_MODEL_ROOT") || resolve(process.cwd(), "data", "iseol"),
    harnessRoot: envValue(env, "ISEOL_RUN_ROOT") || resolve(process.cwd(), "data", "runs"),
    webRoot: resolve(process.cwd(), "web"),
    userUiRoot: envValue(env, "ISEOL_USER_UI_ROOT") || resolve(process.cwd(), "user-ui", "dist"),
    platformRoot,
    eventJournalRoot: envValue(env, "ISEOL_WEB_EVENT_JOURNAL_ROOT") || resolve(platformRoot, "web-events"),
  };
}

function headerRecord(headers: IncomingHttpHeaders): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
  }
  return result;
}

async function readRequestBody(request: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("request body too large") as Error & { status?: number };
      error.status = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("invalid json") as Error & { status?: number };
    error.status = 400;
    throw error;
  }
}

function mimeType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".svg": return "image/svg+xml";
    default: return "application/octet-stream";
  }
}

function resolveStaticFile(webRoot: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const normalized = decoded === "/" ? "/index.html" : decoded;
  const target = resolve(webRoot, `.${normalized}`);
  const relation = relative(resolve(webRoot), target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${sep}`)) return null;
  return target;
}

async function sendStatic(
  webRoot: string,
  pathname: string,
  res: import("node:http").ServerResponse,
): Promise<boolean> {
  const target = resolveStaticFile(webRoot, pathname);
  if (!target) return false;
  try {
    const content = await readFile(target);
    res.writeHead(200, { "content-type": mimeType(target), "content-length": content.length });
    res.end(content);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function sendJson(
  res: import("node:http").ServerResponse,
  status: number,
  headers: Record<string, string>,
  body: unknown,
): void {
  if (status === 204) {
    res.writeHead(status, headers);
    res.end();
    return;
  }
  const content = Buffer.from(JSON.stringify(body), "utf8");
  res.writeHead(status, { ...headers, "content-length": content.length });
  res.end(content);
}

async function handleRequest(
  options: StartWebControlPlaneOptions,
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
  sseState: SseState,
  notificationSseState: SseState,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${options.host}`);
  const rawPathname = (req.url ?? "/").split("?", 1)[0] ?? "";
  const isLearningPath = url.pathname === "/api/user/learning" || url.pathname.startsWith("/api/user/learning/");
  if (isLearningPath && rawPathname.includes("\\")) {
    sendJson(res, 404, { "content-type": "application/json; charset=utf-8" }, { error: "learning route not found" });
    return;
  }
  const isCommunityPath = url.pathname === "/api/user/community" || url.pathname.startsWith("/api/user/community/");
  if (isCommunityPath && rawPathname.includes("\\")) {
    sendJson(res, 404, { "content-type": "application/json; charset=utf-8" }, { error: "community route not found" });
    return;
  }
  const isAiChatPath = url.pathname === "/api/user/ai-chat" || url.pathname.startsWith("/api/user/ai-chat/");
  if (isAiChatPath && rawPathname.includes("\\")) {
    sendJson(res, 404, { "content-type": "application/json; charset=utf-8" }, { error: "AI chat route not found" });
    return;
  }
  const isCollaborationPath = ["/api/user/teams", "/api/user/recruitment", "/api/user/social"].some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
  if (isCollaborationPath && rawPathname.includes("\\")) {
    sendJson(res, 404, { "content-type": "application/json; charset=utf-8" }, { error: "collaboration route not found" });
    return;
  }
  const isGrowthPath = ["/api/user/growth", "/api/user/activity"].some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
  if (isGrowthPath && rawPathname.includes("\\")) {
    sendJson(res, 404, { "content-type": "application/json; charset=utf-8" }, { error: "growth route not found" });
    return;
  }
  const isPublicPortfolioPath = url.pathname === "/api/public/portfolio" || url.pathname.startsWith("/api/public/portfolio/");
  if (isPublicPortfolioPath && rawPathname.includes("\\")) {
    sendJson(res, 404, { "content-type": "application/json; charset=utf-8" }, { error: "public portfolio not found" });
    return;
  }
  const isUserPortfolioPath = url.pathname === "/api/user/portfolio" || url.pathname.startsWith("/api/user/portfolio/");
  if (isUserPortfolioPath && rawPathname.includes("\\")) {
    sendJson(res, 404, { "content-type": "application/json; charset=utf-8" }, { error: "portfolio route not found" });
    return;
  }
  const isUserProjectPath = url.pathname === "/api/user/projects" || url.pathname.startsWith("/api/user/projects/");
  if (isUserProjectPath && rawPathname.includes("\\")) {
    sendJson(res, 404, { "content-type": "application/json; charset=utf-8" }, { error: "project route not found" });
    return;
  }
  const isUserStudyPath = url.pathname === "/api/user/studies" || url.pathname.startsWith("/api/user/studies/");
  if (isUserStudyPath && rawPathname.includes("\\")) {
    sendJson(res, 404, { "content-type": "application/json; charset=utf-8" }, { error: "study route not found" });
    return;
  }
  const isUserIntegrationPath = url.pathname === "/api/user/integrations" || url.pathname.startsWith("/api/user/integrations/");
  if (isUserIntegrationPath && rawPathname.includes("\\")) {
    sendJson(res, 404, { "content-type": "application/json; charset=utf-8" }, { error: "integration route not found" });
    return;
  }
  const isUserNotificationPath = url.pathname === "/api/user/notifications" || url.pathname.startsWith("/api/user/notifications/");
  if (isUserNotificationPath && rawPathname.includes("\\")) {
    sendJson(res, 404, { "content-type": "application/json; charset=utf-8" }, { error: "notification route not found" });
    return;
  }
  const isControlPlaneProjectPath = url.pathname === "/api/projects" || url.pathname.startsWith("/api/projects/");
  if (isControlPlaneProjectPath && rawPathname.includes("\\")) {
    sendJson(res, 404, { "content-type": "application/json; charset=utf-8" }, { error: "project route not found" });
    return;
  }
  const isTopLevelUserPath = [
    "/api/user/signup",
    "/api/user/login",
    "/api/user/password",
    "/api/user/logout",
    "/api/user/me",
    "/api/user/runtime-status",
    "/api/user/settings",
    "/api/user/world",
    "/api/user/character",
    "/api/user/agent",
  ].some((path) => url.pathname === path) || url.pathname === "/api/user/memory" || url.pathname.startsWith("/api/user/memory/");
  if (isTopLevelUserPath && rawPathname.includes("\\")) {
    sendJson(res, 404, { "content-type": "application/json; charset=utf-8" }, { error: "user route not found" });
    return;
  }
  if (url.pathname === "/api/events") {
    if (req.method !== "GET") {
      res.writeHead(405, { allow: "GET" }).end("method not allowed");
      return;
    }
    if (options.token && headerRecord(req.headers).authorization !== `Bearer ${options.token}`) {
      sendJson(res, 401, { "content-type": "application/json; charset=utf-8" }, { error: "unauthorized" });
      return;
    }
    if (sseState.active >= sseState.limit) {
      sendJson(res, 429, { "content-type": "application/json; charset=utf-8", "retry-after": "5" }, { error: "event stream capacity reached" });
      return;
    }
    sseState.active += 1;
    sseState.responses.add(res);
    const bus = options.eventBus ?? new WebProductEventBus(options.eventJournalRoot ? { journalRoot: options.eventJournalRoot } : {});
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });
    const write = (event: { id: string; type: string; occurredAt: string; scope?: unknown; payload: unknown }) => {
      if (res.destroyed) return;
      res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    const lastEventId = headerRecord(req.headers)["last-event-id"]?.trim();
    let replaying = Boolean(lastEventId);
    const buffered: WebProductEvent[] = [];
    const replayedIds = new Set<string>();
    const liveWrite = (event: WebProductEvent): void => {
      if (replaying) buffered.push(event);
      else write(event);
    };
    const unsubscribe = bus.subscribe(liveWrite);
    write({ id: `connected-${Date.now().toString(36)}`, type: "connected", occurredAt: new Date().toISOString(), payload: { replay: Boolean(lastEventId) } });
    if (lastEventId) {
      void (async () => {
        try {
          for (const event of await bus.replayAfter(lastEventId)) {
            replayedIds.add(event.id);
            write(event);
          }
          for (const event of buffered.splice(0)) {
            if (!replayedIds.has(event.id)) write(event);
          }
        } catch {
          // A stale/corrupt journal must not turn an authenticated live stream
          // into an error response or fabricate a historical event.
        } finally {
          replaying = false;
          for (const event of buffered.splice(0)) {
            if (!replayedIds.has(event.id)) write(event);
          }
        }
      })();
    }
    const heartbeat = setInterval(() => { if (!res.destroyed) res.write(": heartbeat\n\n"); }, 25_000);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      sseState.active = Math.max(0, sseState.active - 1);
      sseState.responses.delete(res);
      clearInterval(heartbeat);
      unsubscribe();
    };
    req.on("close", cleanup);
    res.on("close", cleanup);
    return;
  }
  if (url.pathname === "/api/user/notifications/stream") {
    if (req.method !== "GET") {
      res.writeHead(405, { allow: "GET" }).end("method not allowed");
      return;
    }
    if (!options.userService) {
      sendJson(res, 503, { "content-type": "application/json; charset=utf-8" }, { error: "user platform unavailable" });
      return;
    }
    const authorization = headerRecord(req.headers).authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
    const principal = token ? await options.userService.resolveAuthenticatedPrincipal(token) : null;
    if (!principal) {
      sendJson(res, 401, { "content-type": "application/json; charset=utf-8" }, { error: "authentication required" });
      return;
    }
    if (!options.notificationService) {
      sendJson(res, 503, { "content-type": "application/json; charset=utf-8" }, { error: "notifications unavailable" });
      return;
    }
    if (notificationSseState.active >= notificationSseState.limit) {
      sendJson(res, 429, { "content-type": "application/json; charset=utf-8", "retry-after": "5" }, { error: "user notification stream capacity reached" });
      return;
    }
    const lastEventId = headerRecord(req.headers)["last-event-id"]?.trim();
    notificationSseState.active += 1;
    notificationSseState.responses.add(res);
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });
    const write = (event: NotificationStreamEvent | { id: string; type: "connected"; occurredAt: string; payload: { replay: boolean } }): void => {
      if (res.destroyed) return;
      res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    let replaying = Boolean(lastEventId);
    const buffered: NotificationStreamEvent[] = [];
    const liveWrite = (event: NotificationStreamEvent): void => {
      if (replaying) buffered.push(event);
      else write(event);
    };
    write({ id: `connected-${Date.now().toString(36)}`, type: "connected", occurredAt: new Date().toISOString(), payload: { replay: Boolean(lastEventId) } });
    const unsubscribe = options.notificationService.subscribe(principal.userId, liveWrite);
    void (async () => {
      try {
        const replayedIds = new Set<string>();
        if (lastEventId) {
          for (const event of await options.notificationService!.listStreamEvents(principal.userId, lastEventId)) {
            replayedIds.add(event.id);
            write(event);
          }
        }
        for (const event of buffered.splice(0)) {
          if (!replayedIds.has(event.id)) write(event);
        }
      } catch {
        // A malformed/stale cursor never turns the authenticated stream into an error response.
      } finally {
        replaying = false;
        for (const event of buffered.splice(0)) write(event);
      }
    })();
    const heartbeat = setInterval(() => { if (!res.destroyed) res.write(": heartbeat\n\n"); }, 25_000);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      notificationSseState.active = Math.max(0, notificationSseState.active - 1);
      notificationSseState.responses.delete(res);
      clearInterval(heartbeat);
      unsubscribe();
    };
    req.on("close", cleanup);
    res.on("close", cleanup);
    return;
  }
  if (url.pathname === "/healthz") {
    sendJson(res, 200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, { status: "ok", live: true, ready: true });
    return;
  }
  if (url.pathname === "/readyz") {
    sendJson(res, 200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, { status: "ok", ready: true });
    return;
  }
  if (url.pathname === "/health") {
    sendJson(res, 200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, { status: "ok" });
    return;
  }
  if (url.pathname.startsWith("/api/public/portfolio/")) {
    const response = await routePublicPortfolioRequest({ method: req.method ?? "GET", path: url.pathname, headers: headerRecord(req.headers) }, {
      ...(options.portfolioService ? { portfolioService: options.portfolioService } : {}),
    });
    sendJson(res, response.status, response.headers, response.body);
    return;
  }
  if (url.pathname === "/api/user" || url.pathname.startsWith("/api/user/")) {
    if (!options.userService) {
      sendJson(res, 503, { "content-type": "application/json; charset=utf-8" }, { error: "user platform unavailable" });
      return;
    }
    let body: unknown;
    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
      body = await readRequestBody(req);
    }
    const userRequest = {
      method: req.method ?? "GET",
      path: `${url.pathname}${url.search}`,
      rawPath: req.url ?? "/",
      headers: headerRecord(req.headers),
      ...(body === undefined ? {} : { body }),
    };
    const response = ["/api/user/me", "/api/user/runtime-status", "/api/user/signup", "/api/user/login", "/api/user/logout", "/api/user/password"].includes(url.pathname)
      ? await routeUserRequest(userRequest, options.userService, { runtimeCapability: options.ideaLabRuntime, aiChatRuntimeReady: options.aiChatRuntimeReady, aiTeamRuntimeReady: options.aiTeamRuntimeReady, learningAiRuntimeReady: options.learningAiRuntimeReady })
      : (url.pathname === "/api/user/growth" || url.pathname === "/api/user/activity" || url.pathname.startsWith("/api/user/activity/"))
        ? await routeGrowthRequest(userRequest, {
            platformUserService: options.userService,
            ...(options.activityService ? { activityService: options.activityService } : {}),
            ...(options.growthService ? { growthService: options.growthService } : {}),
          })
      : url.pathname === "/api/user/learning" || url.pathname.startsWith("/api/user/learning/")
        ? await routeLearningRequest(userRequest, {
            platformUserService: options.userService,
            ...(options.learningService ? { learningService: options.learningService } : {}),
            ...(options.userProjectService ? { userProjectService: options.userProjectService } : {}),
          })
      : url.pathname === "/api/user/studies" || url.pathname.startsWith("/api/user/studies/")
        ? await routeStudyRequest(userRequest, {
            platformUserService: options.userService,
            ...(options.studyService ? { studyService: options.studyService } : {}),
          })
      : url.pathname === "/api/user/teams" || url.pathname.startsWith("/api/user/teams/") || url.pathname === "/api/user/social" || url.pathname.startsWith("/api/user/social/") || url.pathname === "/api/user/recruitment" || url.pathname.startsWith("/api/user/recruitment/")
        ? await routeCollaborationRequest(userRequest, {
            platformUserService: options.userService,
            ...(options.teamService ? { teamService: options.teamService } : {}),
            ...(options.teamChatService ? { teamChatService: options.teamChatService } : {}),
            ...(options.socialService ? { socialService: options.socialService } : {}),
            ...(options.recruitmentService ? { recruitmentService: options.recruitmentService } : {}),
          })
      : url.pathname === "/api/user/projects" || url.pathname.startsWith("/api/user/projects/")
        ? await routeUserProjectRequest(userRequest, {
            platformUserService: options.userService,
            ...(options.userProjectService ? { userProjectService: options.userProjectService } : {}),
            ...(options.aiTeamProposalService ? { aiTeamProposalService: options.aiTeamProposalService } : {}),
            ...(options.aiTeamDiscussionService ? { aiTeamDiscussionService: options.aiTeamDiscussionService } : {}),
            ...(options.settingsService ? { settingsService: options.settingsService } : {}),
            ...(options.ideaLabRuntime?.enqueueProjectRun ? { enqueueProjectRun: options.ideaLabRuntime.enqueueProjectRun } : {}),
          })
      : url.pathname === "/api/user/portfolio" || url.pathname.startsWith("/api/user/portfolio/")
        ? await routePortfolioRequest(userRequest, {
            platformUserService: options.userService,
            ...(options.portfolioService ? { portfolioService: options.portfolioService } : {}),
          })
      : url.pathname === "/api/user/community" || url.pathname.startsWith("/api/user/community/")
        ? await routeCommunityRequest(userRequest, {
            platformUserService: options.userService,
            ...(options.communityService ? { communityService: options.communityService } : {}),
          })
      : url.pathname === "/api/user/settings"
        ? await routeSettingsRequest(userRequest, {
            platformUserService: options.userService,
            ...(options.settingsService ? { settingsService: options.settingsService } : {}),
          })
      : url.pathname === "/api/user/integrations" || url.pathname.startsWith("/api/user/integrations/")
        ? await routeIntegrationsRequest(userRequest, {
            platformUserService: options.userService,
            ...(options.integrationService ? { integrationService: options.integrationService } : {}),
            ...(options.settingsService ? { settingsService: options.settingsService } : {}),
            ...(options.integrationConfiguredProviders ? { configuredProviders: options.integrationConfiguredProviders } : {}),
          })
      : url.pathname === "/api/user/notifications" || url.pathname.startsWith("/api/user/notifications/")
        ? await routeNotificationsRequest(userRequest, {
            platformUserService: options.userService,
            ...(options.notificationService ? { notificationService: options.notificationService } : {}),
          })
      : url.pathname === "/api/user/ai-chat" || url.pathname.startsWith("/api/user/ai-chat/")
        ? await routeAiChatRequest(userRequest, {
            platformUserService: options.userService,
            ...(options.aiChatService ? { aiChatService: options.aiChatService } : {}),
          })
      : url.pathname === "/api/user/agent"
        ? await routeAiAgentProfileRequest(userRequest, {
            platformUserService: options.userService,
            ...(options.aiAgentProfileService ? { aiAgentProfileService: options.aiAgentProfileService } : {}),
          })
      : await routePersonalWorldRequest(userRequest, {
          platformUserService: options.userService,
          ...(options.personalWorldService ? { personalWorldService: options.personalWorldService } : {}),
          ...(options.memoryService ? { memoryService: options.memoryService } : {}),
        });
    sendJson(res, response.status, response.headers, response.body);
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    let body: unknown;
    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
      body = await readRequestBody(req);
    }
    const routed: WebControlPlaneRequest = {
      method: req.method ?? "GET",
      path: url.pathname,
      rawPath: req.url ?? "/",
      headers: headerRecord(req.headers),
      ...(body === undefined ? {} : { body }),
    };
    const response = await routeWebControlPlaneRequest(routed, options);
    sendJson(res, response.status, response.headers, response.body);
    return;
  }

  if (url.pathname === "/app" || url.pathname.startsWith("/app/")) {
    const userPath = url.pathname === "/app" ? "/" : url.pathname.slice("/app".length);
    const userUiRoot = options.userUiRoot ?? resolve(options.webRoot, "user-ui");
    if (await sendStatic(userUiRoot, userPath, res)) return;
    // The approved user UI is an SPA. Client-side routes such as
    // /app/profile and /app/projects/:id must survive a browser refresh and
    // direct share-link navigation, while missing assets must remain 404s.
    if (!userPath.startsWith("/assets/") && extname(userPath) === "" && await sendStatic(userUiRoot, "/", res)) return;
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found");
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { allow: "GET, HEAD" }).end("method not allowed");
    return;
  }
  if (await sendStatic(options.webRoot, url.pathname, res)) return;
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found");
}

export async function startWebControlPlaneServer(
  options: StartWebControlPlaneOptions,
): Promise<WebControlPlaneServer> {
  if (!isLoopbackHost(options.host) && !options.token.trim()) {
    throw new Error("ISEOL_WEB_TOKEN is required for non-loopback ISEOL_WEB_HOST");
  }
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
    throw new Error(`Invalid Iseol web port: ${options.port}`);
  }

  const eventJournalRoot = options.eventJournalRoot ?? (options.platformRoot ? resolve(options.platformRoot, "web-events") : undefined);
  const eventBus = options.eventBus ?? new WebProductEventBus(eventJournalRoot ? { journalRoot: eventJournalRoot } : {});
  const sseState: SseState = {
    active: 0,
    limit: Math.max(1, Math.floor(options.sseConnectionLimit ?? DEFAULT_SSE_CONNECTION_LIMIT)),
    responses: new Set(),
  };
  const notificationSseState: SseState = {
    active: 0,
    limit: Math.max(1, Math.floor(options.sseConnectionLimit ?? DEFAULT_SSE_CONNECTION_LIMIT)),
    responses: new Set(),
  };
  const disconnectProgressBridge = options.progressNotificationRoot && options.progressNotificationAdapter
    ? connectProgressEventBridge({ eventBus, durableRoot: options.progressNotificationRoot, adapter: options.progressNotificationAdapter })
    : undefined;
  const server = createServer((req, res) => {
    void handleRequest({ ...options, eventBus }, req, res, sseState, notificationSseState).catch((error) => {
      if (res.headersSent) {
        res.destroy(error instanceof Error ? error : undefined);
        return;
      }
      const status = Number((error as { status?: number }).status ?? 500);
      const message = status >= 500 ? "internal server error" : String((error as Error).message);
      res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: message }));
    });
  });
  server.once("close", () => disconnectProgressBridge?.());

  const closeForShutdown = async (): Promise<void> => {
    // SSE is a deliberate long-lived read-only connection.  End those
    // responses first so server.close() can finish without force-closing an
    // in-flight mutation request.  Ordinary requests retain Node's normal
    // graceful close semantics.
    for (const response of [...sseState.responses]) {
      if (!response.destroyed) response.end();
    }
    for (const response of [...notificationSseState.responses]) {
      if (!response.destroyed) response.end();
    }
    server.closeIdleConnections?.();
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose());
    });
  };
  Object.defineProperty(server, "closeForShutdown", { value: closeForShutdown });

  await new Promise<void>((resolvePromise, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolvePromise();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(options.port, options.host);
  });
  return server as WebControlPlaneServer;
}

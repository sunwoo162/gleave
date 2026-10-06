import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Server } from "node:http";
import {
  resolveWebControlPlaneConfig,
  startWebControlPlaneServer,
  type WebControlPlaneConfig,
} from "../web-control-plane/server.js";
import {
  resolveDesktopAgentCoreConfig,
  startDesktopAgentCoreService,
  type DesktopAgentCoreConfig,
} from "../desktop-agent/core-service.js";
import { refreshDevelopmentRunPreflight } from "../harness/run-service.js";
import { listHarnessRuns, loadHarnessRun, requestHarnessRunRetry } from "../harness/run-store.js";
import { listDesktopJobs, loadDesktopJob } from "../desktop-agent/job-store.js";
import { containDesktopJobAsOperator, inspectDesktopJobReconciliation, issueDesktopJobContainmentApproval } from "../desktop-agent/operator-reconciliation.js";
import { inspectProjectRunReconciliation, reconcileProjectRunAsOperator, type ProjectRunReconciliationInput, type ProjectRunReconciliationResult } from "../harness/operator-reconciliation.js";
import { getActiveWebWorkerSession } from "../chatgpt-web/session-store.js";
import { issueOperatorApproval, type OperatorApproval } from "../harness/operator-approval-store.js";
import { appendHarnessRunEvent, loadHarnessRunEvents } from "../harness/event-store.js";
import { superviseHarnessRun } from "../harness/run-supervisor.js";
import {
  resolveProductionChatGptBrowserDriver,
  resolveChatGptWebBridgeConfig,
  startChatGptWebBridgeService,
  type ChatGptWebBridgeService,
} from "../chatgpt-web/browser-service.js";
import {
  createProductionChatGptWebAdapter,
  type ChatGptBrowserDriver,
} from "../chatgpt-web/production-browser-adapter.js";
import { createChatGptIdeaProposalProvider } from "../idea-lab/chatgpt-proposal-provider.js";
import { createRequestBudgetStore } from "../chatgpt-web/request-budget.js";
import { createRequestDiagnosticStore } from "../chatgpt-web/request-diagnostics.js";
import {
  resolveIdeaLabRuntimeConfig,
  type IdeaLabRuntimeConfig,
  type IdeaLabRuntimeRoots,
} from "../idea-lab/runtime-config.js";
import { createIdeaLabProductionDesktopTaskCompiler } from "../idea-lab/production-desktop-compiler.js";
import { createIdeaLabProductionRuntimeDriver } from "../idea-lab/production-runtime-driver.js";
import { listPrototypeProductions } from "../idea-lab/production-store.js";
import {
  createIdeaLabRuntimeService,
  type IdeaLabRuntimeService,
} from "../idea-lab/runtime-service.js";
import { superviseIdeaLabCampaign } from "../idea-lab/campaign-supervisor.js";
import {
  createDesktopPrototypeSandboxAdapter,
  type PrototypeSandboxAdapter,
} from "../idea-lab/sandbox-adapter.js";
import { resolveIdeaLabDeployAdapter } from "../idea-lab/local-preview-deploy-adapter.js";
import type { PrototypeDeployAdapter } from "../idea-lab/deploy-adapter.js";
import {
  disposeWithShutdownDiagnostics,
  type ShutdownDiagnostic,
  type ShutdownStage,
} from "./shutdown.js";
import { createProjectWorkspaceExecutor } from "./project-workspace-executor.js";
import { createProjectWorkspaceDesktopTaskCompiler } from "./project-workspace-desktop-compiler.js";
import type { ProgressNotificationAdapter } from "../discord-project/progress-notifications.js";
import { createPlatformUserService } from "../platform-user/service.js";
import type { PlatformUserService } from "../platform-user/contracts.js";
import { createPersonalWorldService } from "../personal-world/service.js";
import type { PersonalWorldService } from "../personal-world/contracts.js";
import { createMemoryService } from "../memory/service.js";
import type { MemoryService } from "../memory/contracts.js";
import { createActivityService } from "../activity/service.js";
import type { ActivityService } from "../activity/contracts.js";
import { createGrowthService } from "../growth/read-model.js";
import type { GrowthService } from "../growth/contracts.js";
import { createLearningService } from "../learning/service.js";
import type { LearningActionDispatcher, LearningContentDispatcher, LearningFeedbackDispatcher, LearningPlanDispatcher, LearningService } from "../learning/contracts.js";
import { createOllamaLearningActionDispatcher, createOllamaLearningContentDispatcher, createOllamaLearningFeedbackDispatcher, createOllamaLearningPlanDispatcher, resolveOllamaLearningRuntimeConfig, type OllamaLearningRuntimeConfig } from "../learning/local-runtime.js";
import { createLocalCodingSyntaxVerifier } from "../learning/local-coding-verifier.js";
import { createUserProjectService } from "../project-model/user-project-service.js";
import type { UserProjectService } from "../project-model/user-project-service.js";
import { createTeamService } from "../teams/service.js";
import type { TeamService } from "../teams/contracts.js";
import { createTeamChatService } from "../team-chat/service.js";
import type { TeamChatService } from "../team-chat/contracts.js";
import { createAiTeamProposalService } from "../ai-team/service.js";
import type { AiTeamProposalDispatcher, AiTeamProposalService } from "../ai-team/contracts.js";
import { createAiTeamDiscussionService } from "../ai-team/discussion-service.js";
import type { AiTeamDiscussionDispatcher, AiTeamDiscussionService } from "../ai-team/contracts.js";
import { createOllamaAiTeamDiscussionDispatcher, createOllamaAiTeamProposalDispatcher, resolveOllamaAiTeamRuntimeConfig, type OllamaAiTeamRuntimeConfig } from "../ai-team/local-runtime.js";
import { createStudyService } from "../study/service.js";
import type { StudyService } from "../study/contracts.js";
import { createSocialService } from "../social/service.js";
import type { SocialService } from "../social/contracts.js";
import { createRecruitmentService } from "../recruitment/service.js";
import type { RecruitmentService } from "../recruitment/contracts.js";
import { createPortfolioService } from "../portfolio/service.js";
import type { PortfolioService } from "../portfolio/contracts.js";
import { createCommunityService } from "../community/service.js";
import type { CommunityService } from "../community/contracts.js";
import { createSettingsService } from "../settings/service.js";
import { createNotificationService } from "../notifications/service.js";
import type { NotificationService } from "../notifications/contracts.js";
import type { SettingsService } from "../settings/contracts.js";
import { createAiChatService } from "../ai-chat/service.js";
import type { AiChatRuntimeDispatcher, AiChatService } from "../ai-chat/contracts.js";
import { createOllamaAiChatRuntimeDispatcher, resolveOllamaAiChatRuntimeConfig } from "../ai-chat/local-runtime.js";
import { createAiAgentProfileService } from "../ai-agent/service.js";
import type { AiAgentProfileService } from "../ai-agent/contracts.js";
import { createUserRuntimeDispatchGate } from "./user-runtime-dispatch-gate.js";
import { createIntegrationService } from "../integrations/service.js";
import { INTEGRATION_PROVIDERS, type IntegrationAdapter, type IntegrationProvider, type IntegrationService } from "../integrations/contracts.js";

export type IseolRuntimeCapability = {
  state: "disabled" | "ready" | "blocked";
  agent?: "ready" | "unavailable";
  enqueue?: (campaignId: string) => void;
  retryRun?: (runId: string) => Promise<"accepted" | "already-active" | "not-allowed">;
  enqueueProjectRun?: (runId: string) => Promise<"accepted" | "already-active" | "not-configured">;
  retryProjectRun?: (input: { projectId: string; runId: string }) => Promise<"accepted" | "already-active" | "not-allowed">;
  inspectProjectRunReconciliation?: (input: { projectId: string; runId: string; expectedRevision: string }) => Promise<Awaited<ReturnType<typeof inspectProjectRunReconciliation>>>;
  reconcileProjectRun?: (input: Omit<ProjectRunReconciliationInput, "storeRoot" | "observe">) => Promise<ProjectRunReconciliationResult>;
  issueProjectRunOperatorApproval?: (input: {
    projectId: string; runId: string; requestId: string; expectedRevision: string;
    reason: ProjectRunReconciliationInput["reason"]; at: string; expiresAt: string; issuedBy: string;
  }) => Promise<OperatorApproval | { status: "rejected"; reason: string }>;
  inspectDesktopJobReconciliation?: (input: { projectId: string; jobId: string; now: string }) => Promise<Awaited<ReturnType<typeof inspectDesktopJobReconciliation>> | { error: "project-mismatch" } | null>;
  issueDesktopJobContainmentApproval?: (input: { projectId: string; jobId: string; requestId: string; expectedRevision: string; at: string; expiresAt: string; issuedBy: string }) => Promise<Awaited<ReturnType<typeof issueDesktopJobContainmentApproval>> | { status: "rejected"; reason: string }>;
  containDesktopJob?: (input: { projectId: string; jobId: string; expectedRevision: string; operationId: string; approvalId: string; at: string; actor: "operator" }) => Promise<Awaited<ReturnType<typeof containDesktopJobAsOperator>>>;
};
type DesktopCoreService = Awaited<ReturnType<typeof startDesktopAgentCoreService>>;
type ProductionDriver = ReturnType<typeof createIdeaLabProductionRuntimeDriver>;

type RuntimeDependencies = {
  startDesktop?: typeof startDesktopAgentCoreService;
  startWeb?: typeof startWebControlPlaneServer;
  resolveBrowser?: typeof resolveProductionChatGptBrowserDriver;
  createBridge?: typeof startChatGptWebBridgeService;
  resolveDeploy?: (env: Record<string, string | undefined>, config?: Extract<IdeaLabRuntimeConfig, { enabled: true }>) => PrototypeDeployAdapter | null | Promise<PrototypeDeployAdapter | null>;
  createProposalProvider?: typeof createChatGptIdeaProposalProvider;
  createProductionDriver?: typeof createIdeaLabProductionRuntimeDriver;
  createRuntime?: typeof createIdeaLabRuntimeService;
  createSandboxAdapter?: typeof createDesktopPrototypeSandboxAdapter;
  createProjectExecutor?: typeof createProjectWorkspaceExecutor;
  sleep?: (ms: number) => Promise<void>;
};

export type IseolRuntimeInput = {
  env?: Record<string, string | undefined>;
  roots?: IdeaLabRuntimeRoots;
  webConfig?: WebControlPlaneConfig;
  platformUserService?: PlatformUserService;
  personalWorldService?: PersonalWorldService;
  memoryService?: MemoryService;
  activityService?: ActivityService;
  growthService?: GrowthService;
  learningService?: LearningService;
  learningActionDispatcher?: LearningActionDispatcher;
  learningContentDispatcher?: LearningContentDispatcher;
  learningFeedbackDispatcher?: LearningFeedbackDispatcher;
  learningPlanDispatcher?: LearningPlanDispatcher;
  localLearningRuntimeConfig?: OllamaLearningRuntimeConfig;
  userProjectService?: UserProjectService;
  teamService?: TeamService;
  teamChatService?: TeamChatService;
  aiTeamProposalService?: AiTeamProposalService;
  aiTeamDiscussionService?: AiTeamDiscussionService;
  aiTeamProposalDispatcher?: AiTeamProposalDispatcher;
  aiTeamDiscussionDispatcher?: AiTeamDiscussionDispatcher;
  localAiTeamRuntimeConfig?: OllamaAiTeamRuntimeConfig;
  studyService?: StudyService;
  socialService?: SocialService;
  recruitmentService?: RecruitmentService;
  portfolioService?: PortfolioService;
  communityService?: CommunityService;
  settingsService?: SettingsService;
  notificationService?: NotificationService;
  aiChatService?: AiChatService;
  aiAgentProfileService?: AiAgentProfileService;
  integrationService?: IntegrationService;
  integrationAdapters?: Partial<Record<IntegrationProvider, IntegrationAdapter>>;
  aiChatRuntimeDispatcher?: AiChatRuntimeDispatcher;
  localAiRuntimeConfig?: ReturnType<typeof resolveOllamaAiChatRuntimeConfig>;
  desktopConfig?: DesktopAgentCoreConfig;
  ideaLabConfig?: IdeaLabRuntimeConfig;
  agentReadyTimeoutMs?: number;
  deps?: RuntimeDependencies;
  progressNotificationRoot?: string;
  progressNotificationAdapter?: ProgressNotificationAdapter;
  shutdownDiagnosticsRoot?: string;
  shutdownStageTimeoutMs?: number;
};

export type IseolRuntimeServices = {
  webServer: Server;
  platformUserService: PlatformUserService;
  personalWorldService: PersonalWorldService;
  memoryService: MemoryService;
  activityService: ActivityService;
  growthService: GrowthService;
  learningService: LearningService;
  userProjectService: UserProjectService;
  teamService: TeamService;
  teamChatService: TeamChatService;
  aiTeamProposalService: AiTeamProposalService;
  aiTeamDiscussionService: AiTeamDiscussionService;
  studyService: StudyService;
  socialService: SocialService;
  recruitmentService: RecruitmentService;
  portfolioService: PortfolioService;
  communityService: CommunityService;
  settingsService: SettingsService;
  notificationService: NotificationService;
  aiChatService: AiChatService;
  integrationService: IntegrationService;
  desktopCore: DesktopCoreService | null;
  chatGptBridge?: ChatGptWebBridgeService;
  ideaLabRuntime?: IdeaLabRuntimeService;
  ideaLabCapability: IseolRuntimeCapability;
  dispose(): Promise<void>;
};

function projectRuntimeRequested(env: Record<string, string | undefined>): boolean {
  return env.ISEOL_PROJECT_RUNTIME_ENABLED?.trim().toLowerCase() === "true";
}

function projectAgentId(env: Record<string, string | undefined>, ideaLabConfig: IdeaLabRuntimeConfig): string | null {
  const explicit = env.ISEOL_PROJECT_AGENT_ID?.trim();
  if (explicit) return explicit;
  return ideaLabConfig.enabled ? ideaLabConfig.agentId : null;
}

export function shouldAutoRecoverProjectRun(status: string): boolean {
  void status;
  return false;
}

export async function shouldRecoverIdeaLabCampaign(modelRoot: string, runRoot: string, campaignId: string): Promise<boolean> {
  const productions = (await listPrototypeProductions(modelRoot)).filter((production) => production.campaignId === campaignId);
  for (const production of productions) {
    const run = await loadHarnessRun(runRoot, production.runId);
    if (run?.state.status === "WAITING_EXTERNAL") return false;
  }
  return true;
}

export function hasProjectRuntimeOwner(
  runs: ReadonlyArray<{ request: { mode: string; runId: string }; state: { status: string } }>,
  runId: string,
): boolean {
  return runs.some((candidate) =>
    candidate.request.mode === "project-workspace"
    && candidate.request.runId !== runId
    && candidate.state.status === "RUNNING",
  );
}

function projectTestConfig(env: Record<string, string | undefined>) {
  const executable = env.ISEOL_PROJECT_TEST_EXECUTABLE?.trim() || (process.platform === "win32" ? "npm.cmd" : "npm");
  let args = ["test"];
  const encoded = env.ISEOL_PROJECT_TEST_ARGS_JSON?.trim();
  if (encoded) {
    try {
      const parsed = JSON.parse(encoded);
      if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) throw new Error("invalid");
      args = parsed;
    } catch { throw new Error("ISEOL_PROJECT_TEST_ARGS_JSON must be a string array"); }
  }
  const timeoutMs = Number(env.ISEOL_PROJECT_TEST_TIMEOUT_MS?.trim() || "120000");
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error("ISEOL_PROJECT_TEST_TIMEOUT_MS must be positive");
  const buildExecutable = env.ISEOL_PROJECT_BUILD_EXECUTABLE?.trim() || (process.platform === "win32" ? "npm.cmd" : "npm");
  let buildArgs = ["run", "build"];
  const encodedBuild = env.ISEOL_PROJECT_BUILD_ARGS_JSON?.trim();
  if (encodedBuild) {
    try {
      const parsed = JSON.parse(encodedBuild);
      if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) throw new Error("invalid");
      buildArgs = parsed;
    } catch { throw new Error("ISEOL_PROJECT_BUILD_ARGS_JSON must be a string array"); }
  }
  const buildTimeoutMs = Number(env.ISEOL_PROJECT_BUILD_TIMEOUT_MS?.trim() || "120000");
  if (!Number.isInteger(buildTimeoutMs) || buildTimeoutMs <= 0) throw new Error("ISEOL_PROJECT_BUILD_TIMEOUT_MS must be positive");
  return { executable, args, timeoutMs, buildExecutable, buildArgs, buildTimeoutMs };
}
function defaultRoots(
  env: Record<string, string | undefined>,
  webConfig: WebControlPlaneConfig,
): IdeaLabRuntimeRoots {
  const cwd = process.cwd();
  const configuredProfile = env.ISEOL_CHATGPT_BROWSER_PROFILE_ROOT?.trim();
  return {
    iseolRoot: cwd,
    modelRoot: resolve(webConfig.modelRoot),
    runRoot: resolve(webConfig.harnessRoot),
    webRoot: resolve(webConfig.webRoot),
    webWorkerRoot: resolve(resolveChatGptWebBridgeConfig(env).workerRoot),
    browserProfileRoot: resolve(configuredProfile || resolve(cwd, "data", "chatgpt-profile")),
    ...(env.ISEOL_PROJECT_MODEL_ROOT?.trim() ? { projectModelRoot: resolve(env.ISEOL_PROJECT_MODEL_ROOT) } : {}),
    ...(env.ISEOL_PROJECT_RUN_ROOT?.trim() ? { projectRunRoot: resolve(env.ISEOL_PROJECT_RUN_ROOT) } : {}),
    ...(env.ISEOL_PROJECT_WEB_WORKER_ROOT?.trim() ? { projectWebWorkerRoot: resolve(env.ISEOL_PROJECT_WEB_WORKER_ROOT) } : {}),
    ...(env.ISEOL_PROJECT_DESKTOP_STATE_ROOT?.trim() ? { projectDesktopStateRoot: resolve(env.ISEOL_PROJECT_DESKTOP_STATE_ROOT) } : {}),
  };
}

async function resolveSharedBrowser(
  env: Record<string, string | undefined>,
  roots: IdeaLabRuntimeRoots,
  repositoryRoot: string,
  chatGptWebRoot: string,
  resolver: typeof resolveProductionChatGptBrowserDriver,
): Promise<ChatGptBrowserDriver | null> {
  return resolver(env, {
    repositoryRoot,
    modelRoot: roots.modelRoot,
    runRoot: roots.runRoot,
    webRoot: roots.webRoot,
    chatGptWebRoot: resolve(chatGptWebRoot),
  });
}

async function waitForDesktopAgentConnection(
  transport: { isAgentConnected(agentId: string): boolean },
  agentId: string,
  timeoutMs: number,
  sleep: (ms: number) => Promise<void>,
): Promise<boolean> {
  if (transport.isAgentConnected(agentId)) return true;
  if (timeoutMs === 0) return false;
  const pollMs = 50;
  for (let elapsed = 0; elapsed < timeoutMs; elapsed += pollMs) {
    await sleep(Math.min(pollMs, timeoutMs - elapsed));
    if (transport.isAgentConnected(agentId)) return true;
  }
  return false;
}

async function closeWebServer(server: Server | undefined): Promise<void> {
  if (!server) return;
  const closeForShutdown = (server as Server & { closeForShutdown?: () => Promise<void> }).closeForShutdown;
  if (closeForShutdown) {
    await closeForShutdown();
    return;
  }
  server.closeIdleConnections?.();
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => error ? reject(error) : resolveClose());
  });
}

type OwnedResources = {
  webServer?: Server;
  bridge?: ChatGptWebBridgeService;
  runtime?: IdeaLabRuntimeService;
  desktopCore?: DesktopCoreService | null;
  browser?: ChatGptBrowserDriver | null;
  deployAdapter?: PrototypeDeployAdapter & { dispose?: () => Promise<void> };
};

function createShutdownDiagnosticRecorder(root?: string): ((event: ShutdownDiagnostic) => void) | undefined {
  if (!root) return undefined;
  const path = resolve(root, "shutdown-diagnostics.jsonl");
  return (event) => {
    try {
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, `${JSON.stringify(event)}\n`, "utf8");
    } catch {
      // Diagnostics must never change the ownership or disposal outcome.
    }
  };
}

async function disposeOwnedResources(
  resources: OwnedResources,
  options: { suppressErrors?: boolean; record?: (event: ShutdownDiagnostic) => void; stageTimeoutMs?: number } = {},
): Promise<void> {
  const stages: Array<{ name: ShutdownStage; dispose: () => Promise<void> }> = [
    { name: "web-server", dispose: async () => closeWebServer(resources.webServer) },
    { name: "chatgpt-bridge", dispose: async () => { if (resources.bridge?.enabled) await resources.bridge.dispose(); } },
    { name: "idea-lab-runtime", dispose: async () => { await resources.runtime?.dispose(); } },
    { name: "deploy-adapter", dispose: async () => { await resources.deployAdapter?.dispose?.(); } },
    { name: "desktop-core", dispose: async () => { await resources.desktopCore?.close(); } },
    { name: "browser", dispose: async () => { await resources.browser?.dispose?.(); } },
  ];
  if (options.suppressErrors) {
    await disposeWithShutdownDiagnostics({
      stages,
      ...(options.record ? { record: options.record } : {}),
      ...(options.stageTimeoutMs ? { stageTimeoutMs: options.stageTimeoutMs } : {}),
    }).catch(() => undefined);
    return;
  }
  await disposeWithShutdownDiagnostics({
    stages,
    ...(options.record ? { record: options.record } : {}),
    ...(options.stageTimeoutMs ? { stageTimeoutMs: options.stageTimeoutMs } : {}),
  });
}

export async function startIseolRuntimeServices(
  input: IseolRuntimeInput = {},
): Promise<IseolRuntimeServices> {
  const env = input.env ?? process.env;
  const deps = input.deps ?? {};
  const webConfig = input.webConfig ?? resolveWebControlPlaneConfig(env);
  const roots = input.roots
    ? {
        ...input.roots,
        ...(input.roots.projectModelRoot ? { projectModelRoot: resolve(input.roots.projectModelRoot) } : {}),
        ...(input.roots.projectRunRoot ? { projectRunRoot: resolve(input.roots.projectRunRoot) } : {}),
        ...(input.roots.projectWebWorkerRoot ? { projectWebWorkerRoot: resolve(input.roots.projectWebWorkerRoot) } : {}),
        ...(input.roots.projectDesktopStateRoot ? { projectDesktopStateRoot: resolve(input.roots.projectDesktopStateRoot) } : {}),
        webWorkerRoot: input.roots.webWorkerRoot ?? resolve(resolveChatGptWebBridgeConfig(env).workerRoot),
      }
    : defaultRoots(env, webConfig);
  const platformUserService = input.platformUserService
    ?? createPlatformUserService(resolve(webConfig.platformRoot ?? resolve(roots.iseolRoot, "data", "platform")));
  const platformRoot = resolve(webConfig.platformRoot ?? resolve(roots.iseolRoot, "data", "platform"));
  const userRuntimeDispatchGate = createUserRuntimeDispatchGate();
  const personalWorldService = input.personalWorldService ?? createPersonalWorldService(platformRoot);
  const activityService = input.activityService ?? createActivityService(platformRoot);
  const settingsService = input.settingsService ?? createSettingsService(platformRoot);
  const integrationService = input.integrationService ?? createIntegrationService(platformRoot, {
    ...(input.integrationAdapters ? { adapters: input.integrationAdapters } : {}),
    isOptedIn: async (userId, provider) => (await settingsService.getSettings({ userId, sessionId: "integration-settings", roles: [] })).integrations[provider],
  });
  const integrationConfiguredProviders = input.integrationAdapters
    ? INTEGRATION_PROVIDERS.filter((provider) => Boolean(input.integrationAdapters?.[provider]))
    : webConfig.integrationConfiguredProviders;
  const notificationService = input.notificationService ?? createNotificationService(platformRoot);
  const growthService = input.growthService ?? createGrowthService(platformRoot, { settingsService, notificationService });
  const localLearningRuntimeConfig = input.localLearningRuntimeConfig ?? resolveOllamaLearningRuntimeConfig(env);
  const learningActionDispatcher = input.learningActionDispatcher
    ?? (localLearningRuntimeConfig.enabled ? createOllamaLearningActionDispatcher(localLearningRuntimeConfig) : undefined);
  const learningContentDispatcher = input.learningContentDispatcher
    ?? (localLearningRuntimeConfig.enabled ? createOllamaLearningContentDispatcher(localLearningRuntimeConfig) : undefined);
  const learningFeedbackDispatcher = input.learningFeedbackDispatcher
    ?? (localLearningRuntimeConfig.enabled ? createOllamaLearningFeedbackDispatcher(localLearningRuntimeConfig) : undefined);
  const learningPlanDispatcher = input.learningPlanDispatcher
    ?? (localLearningRuntimeConfig.enabled ? createOllamaLearningPlanDispatcher(localLearningRuntimeConfig) : undefined);
  const localAiTeamRuntimeConfig = input.localAiTeamRuntimeConfig ?? resolveOllamaAiTeamRuntimeConfig(env);
  const aiTeamProposalDispatcher = input.aiTeamProposalDispatcher
    ?? (localAiTeamRuntimeConfig.enabled ? createOllamaAiTeamProposalDispatcher(localAiTeamRuntimeConfig) : undefined);
  const aiTeamDiscussionDispatcher = input.aiTeamDiscussionDispatcher
    ?? (localAiTeamRuntimeConfig.enabled ? createOllamaAiTeamDiscussionDispatcher(localAiTeamRuntimeConfig) : undefined);
  const teamService = input.teamService ?? createTeamService(platformRoot, { activityService });
  const memoryService = input.memoryService ?? createMemoryService(platformRoot, { teamService });
  const teamChatService = input.teamChatService ?? createTeamChatService(platformRoot, { teamService, activityService, notificationService, settingsService });
  const userProjectService = input.userProjectService ?? createUserProjectService({
    platformRoot,
    projectModelRoot: roots.projectModelRoot ?? roots.modelRoot,
    projectHarnessRoot: roots.projectRunRoot ?? roots.runRoot,
    iseolRoot: roots.iseolRoot,
    canAccessTeam: (principal, teamId) => teamService.canAccess(principal, teamId),
    canAccessTeamWithinMembershipLock: (principal, teamId) => teamService.canAccessWithinMembershipLock(principal, teamId),
    activityService,
    growthService,
    settingsService,
  });
  const learningService = input.learningService ?? createLearningService(platformRoot, { activityService, growthService, userProjectService, codingAttemptVerifier: createLocalCodingSyntaxVerifier(), dispatchForUser: userRuntimeDispatchGate, ...(learningPlanDispatcher ? { planDispatcher: learningPlanDispatcher } : {}), ...(learningActionDispatcher ? { actionDispatcher: learningActionDispatcher } : {}), ...(learningContentDispatcher ? { contentDispatcher: learningContentDispatcher } : {}), ...(learningFeedbackDispatcher ? { feedbackDispatcher: learningFeedbackDispatcher } : {}) });
  const aiTeamProposalService = input.aiTeamProposalService ?? createAiTeamProposalService({ root: resolve(platformRoot, "ai-team"), teamService, userProjectService, activityService, dispatchForUser: userRuntimeDispatchGate, dispatcher: aiTeamProposalDispatcher });
  const aiTeamDiscussionService = input.aiTeamDiscussionService ?? createAiTeamDiscussionService({ root: resolve(platformRoot, "ai-team"), teamService, userProjectService, activityService, dispatchForUser: userRuntimeDispatchGate, dispatcher: aiTeamDiscussionDispatcher });
  const studyService = input.studyService ?? createStudyService(resolve(platformRoot, "study"), { teamService, learningService, activityService });
  const portfolioService = input.portfolioService ?? createPortfolioService(platformRoot, { activityService, userProjectService, learningService });
  const socialService = input.socialService ?? createSocialService(platformRoot, { platformUserService, canCollaborate: teamService.canCollaborate, activityService, notificationService, settingsService, growthService, userProjectService, learningService, portfolioService });
  const recruitmentService = input.recruitmentService ?? createRecruitmentService(platformRoot, { teamService, activityService, notificationService, settingsService });
  const communityService = input.communityService ?? createCommunityService(platformRoot, { platformUserService, notificationService, settingsService });
  const localAiRuntimeConfig = input.localAiRuntimeConfig ?? resolveOllamaAiChatRuntimeConfig(env);
  const aiChatRuntimeDispatcher = input.aiChatRuntimeDispatcher
    ?? (localAiRuntimeConfig.enabled ? createOllamaAiChatRuntimeDispatcher(localAiRuntimeConfig) : undefined);
  const aiAgentProfileService = input.aiAgentProfileService ?? createAiAgentProfileService(platformRoot);
  const aiChatService = input.aiChatService ?? createAiChatService(platformRoot, { memoryService, learningService, activityService, userProjectService, teamService, studyService, settingsService, notificationService, aiAgentProfileService, dispatchForUser: userRuntimeDispatchGate, ...(aiChatRuntimeDispatcher ? { runtimeDispatcher: aiChatRuntimeDispatcher } : {}) });
  const shutdownRecord = createShutdownDiagnosticRecorder(input.shutdownDiagnosticsRoot);
  const requestedFlag = env.ISEOL_IDEA_LAB_RUNTIME_ENABLED?.trim().toLowerCase() === "true";
  let ideaLabConfig: IdeaLabRuntimeConfig;
  let ideaLabConfigBlocked = false;
  try {
    ideaLabConfig = input.ideaLabConfig ?? resolveIdeaLabRuntimeConfig(env, roots);
  } catch (error) {
    if (!requestedFlag) throw error;
    ideaLabConfig = { enabled: false };
    ideaLabConfigBlocked = true;
  }
  const ideaLabRequested = ideaLabConfig.enabled || ideaLabConfigBlocked;
  let desktopConfig: DesktopAgentCoreConfig;
  try {
    desktopConfig = input.desktopConfig ?? resolveDesktopAgentCoreConfig(env);
  } catch (error) {
    if (!ideaLabRequested) throw error;
    desktopConfig = {
      enabled: false,
      host: "127.0.0.1",
      port: 8791,
      stateRoot: resolve(roots.iseolRoot, "data", "desktop-agent"),
    };
  }
  const bridgeConfig = resolveChatGptWebBridgeConfig(env);
  const startDesktop = deps.startDesktop ?? startDesktopAgentCoreService;
  const startWeb = deps.startWeb ?? startWebControlPlaneServer;
  const resolveBrowser = deps.resolveBrowser ?? resolveProductionChatGptBrowserDriver;
  const createBridge = deps.createBridge ?? startChatGptWebBridgeService;
  const resolveDeploy = deps.resolveDeploy ?? resolveIdeaLabDeployAdapter;
  const createProposalProvider = deps.createProposalProvider ?? createChatGptIdeaProposalProvider;
  const createProductionDriver = deps.createProductionDriver ?? createIdeaLabProductionRuntimeDriver;
  const createRuntime = deps.createRuntime ?? createIdeaLabRuntimeService;
  const createSandboxAdapter = deps.createSandboxAdapter ?? createDesktopPrototypeSandboxAdapter;
  const createProjectExecutor = deps.createProjectExecutor ?? createProjectWorkspaceExecutor;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolveDelay) => setTimeout(resolveDelay, ms)));
  const agentReadyTimeoutMs = input.agentReadyTimeoutMs ?? 31_000;
  if (!Number.isInteger(agentReadyTimeoutMs) || agentReadyTimeoutMs < 0) {
    throw new Error("agentReadyTimeoutMs must be a non-negative integer");
  }

  let desktopCore: DesktopCoreService | null = null;
  let browser: ChatGptBrowserDriver | null = null;
  let bridge: ChatGptWebBridgeService | undefined;
  let runtime: IdeaLabRuntimeService | undefined;
  let deployAdapterOwned: (PrototypeDeployAdapter & { dispose?: () => Promise<void> }) | undefined;
  let webServer: Server | undefined;
  let unsubscribeAgentConnected: (() => void) | undefined;
  let unsubscribeAgentDisconnected: (() => void) | undefined;
  const projectActiveRuns = new Map<string, Promise<void>>();
  let enqueueProjectRun: IseolRuntimeCapability["enqueueProjectRun"];
  let retryProjectRun: IseolRuntimeCapability["retryProjectRun"];
  let inspectProjectRun: IseolRuntimeCapability["inspectProjectRunReconciliation"];
  let reconcileProjectRun: IseolRuntimeCapability["reconcileProjectRun"];
  let issueProjectRunOperatorApproval: IseolRuntimeCapability["issueProjectRunOperatorApproval"];
  let inspectDesktopJobReconciliationCapability: IseolRuntimeCapability["inspectDesktopJobReconciliation"];
  let issueDesktopJobContainmentApprovalCapability: IseolRuntimeCapability["issueDesktopJobContainmentApproval"];
  let containDesktopJobCapability: IseolRuntimeCapability["containDesktopJob"];
  let capability: IseolRuntimeCapability = ideaLabRequested
    ? { state: "blocked", agent: "unavailable" }
    : { state: "disabled", agent: "unavailable" };

  try {
    if (desktopConfig.enabled) {
      try {
        desktopCore = await startDesktop(desktopConfig);
      } catch (error) {
        if (!ideaLabRequested) throw error;
        desktopCore = null;
      }
    }
    const projectFlag = projectRuntimeRequested(env);
    const projectRootsConfigured = Boolean(roots.projectModelRoot && roots.projectRunRoot && roots.projectWebWorkerRoot && roots.projectDesktopStateRoot);
    const projectRequested = projectFlag && projectRootsConfigured;
    const projectConfigBlocked = projectFlag && !projectRootsConfigured;
    if (projectConfigBlocked && !ideaLabRequested) capability.state = "blocked";
    const needsBrowser = bridgeConfig.enabled || ideaLabConfig.enabled || projectRequested;
    const browserRepositoryRoot = ideaLabConfig.enabled
      ? ideaLabConfig.repositoryRoot
      : roots.iseolRoot;
    if (needsBrowser) {
      try {
        browser = await resolveSharedBrowser(env, roots, browserRepositoryRoot, bridgeConfig.workerRoot, resolveBrowser);
      } catch (error) {
        if (!ideaLabRequested) throw error;
        browser = null;
      }
    }

    bridge = bridgeConfig.enabled && browser
      ? await createBridge(bridgeConfig, browser, { ownsDriver: false })
      : undefined;

    const configuredProjectAgentId = projectAgentId(env, ideaLabConfig);
    const runtimeAgentId = ideaLabConfig.enabled ? ideaLabConfig.agentId : configuredProjectAgentId;
    const ideaLabAgentId = ideaLabConfig.enabled ? ideaLabConfig.agentId : undefined;
    const agentTransport = desktopCore?.transport;
    const requiredAgentIds = [
      runtimeAgentId,
      projectRequested ? configuredProjectAgentId : null,
    ].filter((agentId, index, agentIds): agentId is string => Boolean(agentId) && agentIds.indexOf(agentId) === index);
    const refreshAgentCapability = (knownAgentId?: string, knownAgentReady?: boolean): void => {
      capability.agent = agentTransport && requiredAgentIds.length > 0
        && requiredAgentIds.every((agentId) => agentId === knownAgentId
          ? Boolean(knownAgentReady)
          : agentTransport.isAgentConnected(agentId))
        ? "ready"
        : "unavailable";
    };
    let initialReadinessWindow = true;
    let readinessChange: Promise<void> | undefined;
    let ideaLabInitializationStarted = false;
    let ideaLabRecoveryCompleted = false;
    let ideaLabRecoveryPromise: Promise<void> | undefined;

    const recoverIdeaLabOnce = (): Promise<void> => {
      if (!runtime || ideaLabRecoveryCompleted) return Promise.resolve();
      if (ideaLabRecoveryPromise) return ideaLabRecoveryPromise;
      const recovery = Promise.resolve()
        .then(() => runtime!.recover())
        .then(() => {
          ideaLabRecoveryCompleted = true;
        })
        .finally(() => {
          ideaLabRecoveryPromise = undefined;
        });
      ideaLabRecoveryPromise = recovery;
      return recovery;
    };

    const initializeIdeaLab = async (recoverOnStartup: boolean, connectedOverride?: boolean): Promise<void> => {
      if (!ideaLabConfig.enabled) return;
      const activeIdeaLabConfig = ideaLabConfig;
      const connected = connectedOverride ?? Boolean(agentTransport?.isAgentConnected(activeIdeaLabConfig.agentId));
      if (!agentTransport || !browser || !connected) {
        capability.state = "blocked";
        return;
      }
      if (runtime) {
        if (recoverOnStartup) {
          try {
            await recoverIdeaLabOnce();
          } catch (error) {
            capability.state = "blocked";
            throw error;
          }
        }
        if (!agentTransport.isAgentConnected(activeIdeaLabConfig.agentId)) {
          capability.state = "blocked";
          return;
        }
        capability.state = "ready";
        return;
      }
      if (ideaLabInitializationStarted) return;
      ideaLabInitializationStarted = true;

      let deployAdapter: PrototypeDeployAdapter | null = null;
      try {
        deployAdapter = await resolveDeploy(env, activeIdeaLabConfig);
      } catch {
        deployAdapter = null;
      }
      if (!deployAdapter) {
        ideaLabInitializationStarted = false;
        capability.state = "blocked";
        return;
      }

      deployAdapterOwned = deployAdapter;
      const requestBudget = ideaLabConfig.externalRequestBudget
        ? createRequestBudgetStore(roots.webWorkerRoot ?? roots.webRoot, ideaLabConfig.externalRequestBudget)
        : undefined;
      const requestDiagnostics = createRequestDiagnosticStore(roots.webWorkerRoot ?? roots.webRoot);
      const sandboxAdapter: PrototypeSandboxAdapter = createSandboxAdapter({
        dispatch: async (pack) => {
          agentTransport.sendTask(pack.agentId, pack, agentTransport.getAgentSessionId(pack.agentId) ?? undefined);
          return agentTransport.awaitResult(pack.jobId, 120_000);
        },
        refreshPreflight: refreshDevelopmentRunPreflight,
      });
      const proposalProvider = createProposalProvider(browser, {
        ...(requestBudget ? { requestBudget } : {}),
        diagnostics: requestDiagnostics,
      });
      const productionDriver: ProductionDriver = createProductionDriver({
        ...activeIdeaLabConfig,
        roots,
        sandboxAdapter,
        desktopTransport: agentTransport,
        browserAdapter: createProductionChatGptWebAdapter(browser),
        desktopTaskCompiler: createIdeaLabProductionDesktopTaskCompiler(activeIdeaLabConfig),
        desktopStateRoot: desktopConfig.stateRoot,
        deployAdapter,
      });
      runtime = createRuntime({
        modelRoot: roots.modelRoot,
        recoveryGuard: async (campaignId) => shouldRecoverIdeaLabCampaign(roots.modelRoot, roots.runRoot, campaignId),
        requestRetry: async (runId) => {
          const production = (await listPrototypeProductions(roots.modelRoot)).find((item) => item.runId === runId);
          if (!production) return "not-allowed";
          const result = await requestHarnessRunRetry(roots.runRoot, runId, {
            retryReason: "operator-request",
            actor: "operator",
            requestedAt: new Date().toISOString(),
          });
          if (result.status === "accepted") runtime?.enqueue(production.campaignId);
          return result.status;
        },
        superviseCampaign: async (campaignId) => {
          await superviseIdeaLabCampaign({
            root: roots.modelRoot,
            harnessRoot: roots.runRoot,
            campaignId,
            proposalProvider,
            ...productionDriver,
          });
        },
      });

      capability.enqueue = (campaignId) => runtime!.enqueue(campaignId);
      capability.retryRun = (runId) => runtime!.retryRun(runId);
      if (recoverOnStartup) await recoverIdeaLabOnce();
      if (!agentTransport.isAgentConnected(activeIdeaLabConfig.agentId)) {
        capability.state = "blocked";
        return;
      }
      capability.state = "ready";
    };

    const refreshIdeaLabReadiness = (recoverOnStartup: boolean, connectedOverride?: boolean): Promise<void> => {
      if (readinessChange) return readinessChange;
      readinessChange = initializeIdeaLab(recoverOnStartup, connectedOverride).finally(() => {
        readinessChange = undefined;
      });
      return readinessChange;
    };

    if (agentTransport && requiredAgentIds.length > 0) {
      unsubscribeAgentConnected = agentTransport.onAgentConnected?.((agentId: string) => {
        if (!requiredAgentIds.includes(agentId)) return;
        refreshAgentCapability();
        if (agentId === ideaLabAgentId && !initialReadinessWindow) {
          void refreshIdeaLabReadiness(true).catch(() => {
            capability.state = "blocked";
          });
        }
      });
      unsubscribeAgentDisconnected = agentTransport.onAgentDisconnected?.((agentId: string) => {
        if (!requiredAgentIds.includes(agentId)) return;
        refreshAgentCapability();
        if (agentId === ideaLabAgentId && !initialReadinessWindow) capability.state = "blocked";
      });
    }

    const desktopAgentReady = runtimeAgentId && desktopCore?.transport && browser
      ? await waitForDesktopAgentConnection(desktopCore.transport, runtimeAgentId, agentReadyTimeoutMs, sleep)
      : false;
    refreshAgentCapability(runtimeAgentId ?? undefined, desktopAgentReady);
    initialReadinessWindow = false;
    if (ideaLabConfig.enabled) {
      const connectedAtReadinessBoundary = Boolean(desktopAgentReady)
        || Boolean(agentTransport?.isAgentConnected(ideaLabConfig.agentId));
      await refreshIdeaLabReadiness(Boolean(desktopAgentReady), connectedAtReadinessBoundary);
    }
    if ((ideaLabConfig.enabled || projectRequested) && desktopCore?.transport && browser && desktopAgentReady) {
      if (projectRequested && desktopCore?.transport && browser && configuredProjectAgentId && desktopAgentReady) {
        const projectAgentReady = configuredProjectAgentId === runtimeAgentId
          ? true
          : await waitForDesktopAgentConnection(desktopCore.transport, configuredProjectAgentId, agentReadyTimeoutMs, sleep);
        refreshAgentCapability(configuredProjectAgentId, projectAgentReady);
        if (!projectAgentReady) {
          // Keep the Web control plane available; the Project Run will be reported as not configured
          // until the explicitly configured Agent is connected.
        } else {
        const browserAdapter = bridge?.enabled
          ? bridge.adapter
          : createProductionChatGptWebAdapter(browser);
        const compilerConfig = projectTestConfig(env);
        const projectExecutor = createProjectExecutor({
          runRoot: roots.projectRunRoot!,
          workerRoot: roots.projectWebWorkerRoot!,
          registryRoot: desktopConfig.stateRoot,
          desktopStateRoot: roots.projectDesktopStateRoot!,
          desktopTransport: desktopCore.transport,
          browserAdapter,
          agentId: configuredProjectAgentId,
          desktopTaskCompiler: createProjectWorkspaceDesktopTaskCompiler({
            testExecutable: compilerConfig.executable,
            testArgs: compilerConfig.args,
            testTimeoutMs: compilerConfig.timeoutMs,
            buildExecutable: compilerConfig.buildExecutable,
            buildArgs: compilerConfig.buildArgs,
            buildTimeoutMs: compilerConfig.buildTimeoutMs,
          }),
        });
        enqueueProjectRun = async (runId: string) => {
          const existing = projectActiveRuns.get(runId);
          if (existing) return "already-active";
          const run = await loadHarnessRun(roots.projectRunRoot!, runId);
          if (!run || run.request.mode !== "project-workspace") return "not-configured";
          if (!["READY", "RUNNING", "FAILED_RETRYABLE"].includes(run.state.status)) return "not-configured";
          if (hasProjectRuntimeOwner(await listHarnessRuns(roots.projectRunRoot!), runId)) return "already-active";
          const operation = superviseHarnessRun({ storeRoot: roots.projectRunRoot!, runId, executor: projectExecutor, maxSteps: 16 });
          const tracked = operation.then(() => undefined).finally(() => {
            if (projectActiveRuns.get(runId) === tracked) projectActiveRuns.delete(runId);
          });
          projectActiveRuns.set(runId, tracked);
          void tracked.catch(() => undefined);
          return "accepted";
        };
        retryProjectRun = async ({ projectId, runId }) => {
          const current = await loadHarnessRun(roots.projectRunRoot!, runId);
          if (!current || current.request.mode !== "project-workspace" || current.request.projectId !== projectId) return "not-allowed";
          const retry = await requestHarnessRunRetry(roots.projectRunRoot!, runId, {
            retryReason: "operator-request",
            actor: "operator",
            requestedAt: new Date().toISOString(),
          });
          if (retry.status === "already-active") return "already-active";
          if (retry.status === "not-allowed") return "not-allowed";
          const execution = await enqueueProjectRun!(runId);
          return execution === "accepted" ? "accepted" : execution === "already-active" ? "already-active" : "not-allowed";
        };
        const observeProjectRun = async (runId: string) => {
          const jobs = (await listDesktopJobs(roots.projectDesktopStateRoot!)).filter((job) => job.runId === runId);
          const persistedRun = await loadHarnessRun(roots.projectRunRoot!, runId);
          const session = persistedRun
            ? await getActiveWebWorkerSession(roots.projectWebWorkerRoot!, runId, persistedRun.state.stage).catch(() => null)
            : null;
          const active = projectActiveRuns.has(runId);
          const workerOwned = active || session?.status === "starting" || session?.status === "busy";
          return {
            activeRuntimeOwner: active,
            activeWorker: workerOwned,
            ...(workerOwned ? { browserSessionOwner: runId } : {}),
            desktopJobs: jobs,
            completedResultsReconciled: true,
          };
        };
        inspectProjectRun = async ({ projectId, runId, expectedRevision }) => inspectProjectRunReconciliation({
          storeRoot: roots.projectRunRoot!, projectId, runId, expectedRevision,
          observe: () => observeProjectRun(runId),
        });
        reconcileProjectRun = async (input) => reconcileProjectRunAsOperator({
          ...input,
          storeRoot: roots.projectRunRoot!,
          observe: () => observeProjectRun(input.runId),
        });
        issueProjectRunOperatorApproval = async (input) => {
          const inspection = await inspectProjectRunReconciliation({
            storeRoot: roots.projectRunRoot!, projectId: input.projectId, runId: input.runId,
            expectedRevision: input.expectedRevision, observe: () => observeProjectRun(input.runId),
          });
          if (!inspection.canReconcile) return { status: "rejected", reason: inspection.blockers.join(",") };
          const approval = await issueOperatorApproval({
            root: roots.projectRunRoot!, requestId: input.requestId, projectId: input.projectId, runId: input.runId,
            stage: inspection.stage, status: inspection.status, revision: inspection.revision,
            reason: input.reason, issuedAt: input.at, expiresAt: input.expiresAt, issuedBy: input.issuedBy,
          });
          const approvalEventId = `operator-approval-issued-${approval.approvalId}`;
          const priorEvents = await loadHarnessRunEvents(roots.projectRunRoot!, input.runId);
          if (!priorEvents.some((event) => event.id === approvalEventId)) {
            await appendHarnessRunEvent(roots.projectRunRoot!, {
              version: 1, id: approvalEventId, runId: input.runId,
              type: "operator-approval-issued", at: input.at, stage: inspection.stage, status: inspection.status,
              summary: "Operator approval issued for bounded Project Workspace reconciliation",
              operationId: approval.approvalId,
              metadata: { projectId: input.projectId, requestId: input.requestId, approvalId: approval.approvalId, issuedBy: approval.issuedBy, expiresAt: approval.expiresAt },
            });
          }
          return approval;
        };
        inspectDesktopJobReconciliationCapability = async (input) => {
          const inspection = await inspectDesktopJobReconciliation({ root: roots.projectDesktopStateRoot!, jobId: input.jobId, now: input.now });
          if (!inspection) return null;
          const job = await loadDesktopJob(roots.projectDesktopStateRoot!, input.jobId);
          const run = job ? await loadHarnessRun(roots.projectRunRoot!, job.runId) : null;
          if (!run || run.request.projectId !== input.projectId) return { error: "project-mismatch" };
          return inspection;
        };
        issueDesktopJobContainmentApprovalCapability = async (input) => {
          const inspection = await inspectDesktopJobReconciliationCapability?.({ projectId: input.projectId, jobId: input.jobId, now: input.at });
          if (!inspection || "error" in inspection || inspection.revision !== input.expectedRevision) return { status: "rejected", reason: "job-not-found-or-project-mismatch" };
          if (!inspection.canContain) return { status: "rejected", reason: inspection.blockers.join(",") };
          return issueDesktopJobContainmentApproval({ root: roots.projectDesktopStateRoot!, requestId: input.requestId, jobId: input.jobId, runId: inspection.runId, revision: input.expectedRevision, issuedAt: input.at, expiresAt: input.expiresAt, issuedBy: input.issuedBy });
        };
        containDesktopJobCapability = async (input) => {
          const job = await loadDesktopJob(roots.projectDesktopStateRoot!, input.jobId);
          const run = job ? await loadHarnessRun(roots.projectRunRoot!, job.runId) : null;
          if (!run || run.request.projectId !== input.projectId) return { status: "rejected", reason: "job-not-found-or-project-mismatch" };
          return containDesktopJobAsOperator({ root: roots.projectDesktopStateRoot!, jobId: input.jobId, expectedRevision: input.expectedRevision, operationId: input.operationId, approvalId: input.approvalId, at: input.at, actor: input.actor });
        };
        for (const run of await listHarnessRuns(roots.projectRunRoot!)) {
          if (run.request.mode === "project-workspace" && shouldAutoRecoverProjectRun(run.state.status)) {
            void enqueueProjectRun(run.request.runId);
          }
        }
        }
      }
    }

    if (enqueueProjectRun) capability.enqueueProjectRun = enqueueProjectRun;
    if (retryProjectRun) capability.retryProjectRun = retryProjectRun;
    if (inspectProjectRun) capability.inspectProjectRunReconciliation = inspectProjectRun;
    if (reconcileProjectRun) capability.reconcileProjectRun = reconcileProjectRun;
    if (issueProjectRunOperatorApproval) capability.issueProjectRunOperatorApproval = issueProjectRunOperatorApproval;
    if (inspectDesktopJobReconciliationCapability) capability.inspectDesktopJobReconciliation = inspectDesktopJobReconciliationCapability;
    if (issueDesktopJobContainmentApprovalCapability) capability.issueDesktopJobContainmentApproval = issueDesktopJobContainmentApprovalCapability;
    if (containDesktopJobCapability) capability.containDesktopJob = containDesktopJobCapability;

    webServer = await startWeb({
      ...webConfig,
      modelRoot: roots.modelRoot,
      harnessRoot: roots.runRoot,
      // Harness preflight resolves the global policy relative to iseolRoot.
      // Live Idea Lab and Project Workspace runs share the repository policy,
      // while their durable model/run roots remain isolated above.
      iseolRoot: ideaLabConfig.enabled ? ideaLabConfig.repositoryRoot : roots.iseolRoot,
      policyRoot: ideaLabConfig.enabled ? ideaLabConfig.repositoryRoot : roots.iseolRoot,
      ...(roots.projectModelRoot ? { projectModelRoot: roots.projectModelRoot } : {}),
      ...(roots.projectRunRoot ? { projectHarnessRoot: roots.projectRunRoot } : {}),
      userService: platformUserService,
      personalWorldService,
      memoryService,
      activityService,
      growthService,
      learningService,
      userProjectService,
      teamService,
      teamChatService,
      aiTeamProposalService,
      aiTeamDiscussionService,
      studyService,
      socialService,
      recruitmentService,
      portfolioService,
      communityService,
      settingsService,
      notificationService,
      aiChatService,
      aiAgentProfileService,
      integrationService,
      ...(integrationConfiguredProviders ? { integrationConfiguredProviders } : {}),
      aiChatRuntimeReady: Boolean(aiChatRuntimeDispatcher),
      aiTeamRuntimeReady: Boolean(aiTeamProposalDispatcher && aiTeamDiscussionDispatcher),
      learningAiRuntimeReady: Boolean(learningPlanDispatcher && learningContentDispatcher && learningActionDispatcher && learningFeedbackDispatcher),
      ...(input.progressNotificationRoot && input.progressNotificationAdapter ? { progressNotificationRoot: input.progressNotificationRoot, progressNotificationAdapter: input.progressNotificationAdapter } : {}),
      ideaLabRuntime: capability,
    });
  } catch (error) {
    unsubscribeAgentConnected?.();
    unsubscribeAgentConnected = undefined;
    unsubscribeAgentDisconnected?.();
    unsubscribeAgentDisconnected = undefined;
    await disposeOwnedResources(
      { webServer, bridge, runtime, deployAdapter: deployAdapterOwned, desktopCore, browser },
      { suppressErrors: true, ...(shutdownRecord ? { record: shutdownRecord } : {}), ...(input.shutdownStageTimeoutMs ? { stageTimeoutMs: input.shutdownStageTimeoutMs } : {}) },
    );
    throw error;
  }

  let disposed = false;
  return {
    webServer,
    platformUserService,
    personalWorldService,
    memoryService,
    activityService,
    growthService,
    learningService,
    userProjectService,
    teamService,
    teamChatService,
    aiTeamProposalService,
    aiTeamDiscussionService,
    studyService,
    socialService,
    recruitmentService,
    portfolioService,
    communityService,
    settingsService,
    notificationService,
    aiChatService,
    integrationService,
    desktopCore,
    ...(bridge ? { chatGptBridge: bridge } : {}),
    ...(runtime ? { ideaLabRuntime: runtime } : {}),
    ideaLabCapability: capability,
    async dispose() {
      if (disposed) return;

      unsubscribeAgentConnected?.();
      unsubscribeAgentConnected = undefined;
      unsubscribeAgentDisconnected?.();
      unsubscribeAgentDisconnected = undefined;
      disposed = true;
      await disposeOwnedResources(
        { webServer, bridge, runtime, deployAdapter: deployAdapterOwned, desktopCore, browser },
        { ...(shutdownRecord ? { record: shutdownRecord } : {}), ...(input.shutdownStageTimeoutMs ? { stageTimeoutMs: input.shutdownStageTimeoutMs } : {}) },
      );
    },
  };
}

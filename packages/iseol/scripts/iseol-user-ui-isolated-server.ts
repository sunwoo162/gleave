import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import type { HarnessEvidenceKind, HarnessStageExecutionResult } from "../src/harness/contracts.js";
import type { HarnessStageExecutor } from "../src/harness/run-supervisor.js";
import { loadHarnessRun } from "../src/harness/run-store.js";
import { superviseHarnessRun } from "../src/harness/run-supervisor.js";
import { createMemoryService } from "../src/memory/service.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { createPersonalWorldService } from "../src/personal-world/service.js";
import { createActivityService } from "../src/activity/service.js";
import { createGrowthService } from "../src/growth/read-model.js";
import { createLearningService } from "../src/learning/service.js";
import { createLocalCodingSyntaxVerifier } from "../src/learning/local-coding-verifier.js";
import { createUserProjectService } from "../src/project-model/user-project-service.js";
import { createTeamService } from "../src/teams/service.js";
import { createTeamChatService } from "../src/team-chat/service.js";
import { createAiTeamProposalService } from "../src/ai-team/service.js";
import { createAiTeamDiscussionService } from "../src/ai-team/discussion-service.js";
import { createSocialService } from "../src/social/service.js";
import { createRecruitmentService } from "../src/recruitment/service.js";
import { createPortfolioService } from "../src/portfolio/service.js";
import { createCommunityService } from "../src/community/service.js";
import { createSettingsService } from "../src/settings/service.js";
import { createNotificationService } from "../src/notifications/service.js";
import { createIntegrationService } from "../src/integrations/service.js";
import { createAiChatService } from "../src/ai-chat/service.js";
import { createAiAgentProfileService } from "../src/ai-agent/service.js";
import { createUserRuntimeDispatchGate } from "../src/runtime/user-runtime-dispatch-gate.js";
import { createStudyService } from "../src/study/service.js";
import { startDesktopAgentCoreService } from "../src/desktop-agent/core-service.js";
import { connectFakeDesktopAgent } from "../src/desktop-agent/test-support/fake-agent.js";
import { createProjectWorkspaceExecutor } from "../src/runtime/project-workspace-executor.js";
import { createProjectWorkspaceDesktopTaskCompiler } from "../src/runtime/project-workspace-desktop-compiler.js";
import type { ChatGptWebBrowserAdapter } from "../src/chatgpt-web/browser-adapter.js";
import type { LearningActionDispatcher, LearningContentDispatcher, LearningFeedbackDispatcher, LearningFeedbackEvaluationInput, LearningLessonInput } from "../src/learning/contracts.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

const root = await mkdtemp(join(tmpdir(), "iseol-browser-server-"));
const platformRoot = join(root, "platform");
const projectHarnessRoot = join(root, "runs");
const projectRuntimeMode = process.env.ISEOL_BROWSER_PROJECT_RUNTIME_MODE?.trim() || "success";
const projectRuntimeEnabled = ["deterministic", "real-agent"].includes(process.env.ISEOL_BROWSER_PROJECT_RUNTIME?.trim() ?? "");
const realAgentProjectRuntime = projectRuntimeEnabled && projectRuntimeMode === "real-agent";
const aiRuntimeEnabled = process.env.ISEOL_BROWSER_AI_RUNTIME?.trim() === "deterministic";
const aiExecutionPlanRuntimeEnabled = process.env.ISEOL_BROWSER_AI_EXECUTION_PLAN?.trim() === "deterministic";
const learningRuntimeEnabled = process.env.ISEOL_BROWSER_LEARNING_RUNTIME?.trim() === "deterministic";
const aiTeamRuntimeEnabled = process.env.ISEOL_BROWSER_AI_TEAM_RUNTIME?.trim() === "deterministic";
const userRuntimeDispatchGate = createUserRuntimeDispatchGate();
const failedProjectRuns = new Set<string>();
const pauseGateRuns = new Set<string>();
if (projectRuntimeEnabled) {
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "HARNESS_ENGINEERING.md"), "# Isolated Browser Runtime Policy\n", "utf8");
}

function deterministicProjectExecutor(): HarnessStageExecutor {
  const kindByStage: Partial<Record<string, HarnessEvidenceKind>> = {
    TEST: "test",
    SELF_REVIEW: "review",
    COMMIT: "commit",
    PR: "pull-request",
    CI: "ci",
    DEPLOY: "deployment",
    PRODUCTION_VERIFY: "production-verification",
  };
  return {
    async execute(run): Promise<HarnessStageExecutionResult> {
      if (projectRuntimeMode === "pause-gate" && !pauseGateRuns.has(run.request.runId)) {
        pauseGateRuns.add(run.request.runId);
        await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
      }
      if (projectRuntimeMode === "fail-once" && !failedProjectRuns.has(run.request.runId)) {
        failedProjectRuns.add(run.request.runId);
        return { type: "final-failure", reason: "isolated browser Runtime failure; owner retry required" };
      }
      const evidence = [{
        version: 1 as const,
        id: `isolated-browser-runtime-${run.state.stage.toLowerCase()}`,
        kind: kindByStage[run.state.stage] ?? "command",
        stage: run.state.stage,
        recordedAt: new Date().toISOString(),
        summary: `isolated browser Runtime ${run.state.stage}`,
        provider: "isolated-browser-runtime",
        projectId: run.request.projectId,
        runId: run.request.runId,
      }];
      if (run.state.stage === "TEST") evidence.push({
        version: 1 as const,
        id: "isolated-browser-runtime-build",
        kind: "build" as const,
        stage: run.state.stage,
        recordedAt: new Date().toISOString(),
        summary: "isolated browser Runtime BUILD",
        provider: "isolated-browser-runtime",
        projectId: run.request.projectId,
        runId: run.request.runId,
      });
      return { type: "completed", evidence };
    },
  };
}

function isolatedLocalProviderExecutor(): HarnessStageExecutor {
  const kindByStage: Partial<Record<string, HarnessEvidenceKind>> = {
    ANALYZE: "command",
    PLAN: "command",
    IMPLEMENT: "file-change",
    SELF_REVIEW: "review",
    PR: "pull-request",
    CI: "ci",
    MERGE: "command",
    DEPLOY: "deployment",
    PRODUCTION_VERIFY: "production-verification",
  };
  return {
    async execute(run): Promise<HarnessStageExecutionResult> {
      return {
        type: "completed",
        evidence: [{
          version: 1,
          id: `isolated-local-provider-${run.state.stage.toLowerCase()}`,
          kind: kindByStage[run.state.stage] ?? "command",
          stage: run.state.stage,
          recordedAt: new Date().toISOString(),
          summary: `isolated local provider ${run.state.stage}; no external AI or provider call`,
          provider: "isolated-local-provider",
          projectId: run.request.projectId,
          runId: run.request.runId,
        }],
      };
    },
  };
}

const isolatedLocalBrowserAdapter: ChatGptWebBrowserAdapter = {
  async openOrResumeSession() { throw new Error("isolated real-agent browser mode does not use external Web reasoning"); },
  async submitTurn() { throw new Error("isolated real-agent browser mode does not use external Web reasoning"); },
  async awaitStructuredResult() { throw new Error("isolated real-agent browser mode does not use external Web reasoning"); },
  async probeSession() { return "lost"; },
  async closeSession() { return undefined; },
};

const projectDesktopStateRoot = join(root, "project-desktop-state");
const projectWorkerRoot = join(root, "project-workers");
const projectAgentId = "isolated-browser-project-agent";
let desktopCore: Awaited<ReturnType<typeof startDesktopAgentCoreService>> | undefined;
let localAgent: Awaited<ReturnType<typeof connectFakeDesktopAgent>> | undefined;
let projectExecutor: HarnessStageExecutor | undefined;
if (realAgentProjectRuntime) {
  await mkdir(projectWorkerRoot, { recursive: true });
  desktopCore = await startDesktopAgentCoreService({
    enabled: true,
    host: "127.0.0.1",
    port: 0,
    stateRoot: projectDesktopStateRoot,
    token: "isolated-browser-desktop-token",
  });
  localAgent = await connectFakeDesktopAgent({
    url: desktopCore.url,
    hello: {
      version: 1,
      agentId: projectAgentId,
      agentVersion: "isolated-browser-local-agent",
      os: process.platform,
      capabilities: ["operation:GIT_INIT", "operation:GIT_INSPECT", "operation:RUN_PROCESS", "operation:GIT_COMMIT"],
      workspaceRoots: [root],
      token: "isolated-browser-desktop-token",
    },
    allowedRoots: [root],
  });
  projectExecutor = createProjectWorkspaceExecutor({
    runRoot: projectHarnessRoot,
    workerRoot: projectWorkerRoot,
    registryRoot: projectDesktopStateRoot,
    desktopStateRoot: projectDesktopStateRoot,
    desktopTransport: desktopCore.transport,
    browserAdapter: isolatedLocalBrowserAdapter,
    desktopTaskCompiler: createProjectWorkspaceDesktopTaskCompiler({
      testExecutable: "node",
      testArgs: ["--test"],
      testTimeoutMs: 10_000,
      buildExecutable: "npm.cmd",
      buildArgs: ["run", "build"],
      buildTimeoutMs: 10_000,
      commitMessage: "test: verify isolated local Agent boundary",
    }),
    agentId: projectAgentId,
    webExecutor: isolatedLocalProviderExecutor(),
    providerExecutor: isolatedLocalProviderExecutor(),
  });
}

const activeProjectRuns = new Map<string, Promise<void>>();
const enqueueProjectRun = projectRuntimeEnabled
  ? async (runId: string): Promise<"accepted" | "already-active" | "not-configured"> => {
      if (activeProjectRuns.has(runId)) return "already-active";
      const run = await loadHarnessRun(projectHarnessRoot, runId);
      if (!run || run.request.mode !== "project-workspace") return "not-configured";
      if (!["READY", "RUNNING", "FAILED_RETRYABLE"].includes(run.state.status)) return "not-configured";
      const operation = superviseHarnessRun({ storeRoot: projectHarnessRoot, runId, executor: projectExecutor ?? deterministicProjectExecutor(), maxSteps: 32 });
      const tracked = operation.then(() => undefined).finally(() => {
        if (activeProjectRuns.get(runId) === tracked) activeProjectRuns.delete(runId);
      });
      activeProjectRuns.set(runId, tracked);
      void tracked.catch(() => undefined);
      return "accepted";
    }
  : undefined;
const aiChatRuntimeDispatcher = aiRuntimeEnabled
  ? async ({ content }: { content: string }) => aiExecutionPlanRuntimeEnabled
    ? {
        status: "completed" as const,
        assistantContent: `isolated browser AI Runtime response with a proposal: ${content}`,
        executionPlan: {
          title: "격리 Runtime 읽기 계획",
          summary: "허가된 대화 맥락만 읽고 별도 실행 없이 검토 결과를 제안합니다.",
          steps: [{ id: "isolated-plan-step-1", title: "허가된 맥락 읽기", description: "사용자가 선택한 개인 맥락을 읽습니다.", operation: "read" as const, approvalRequired: true }],
        },
      }
    : {
        status: "completed" as const,
        assistantContent: `isolated browser AI Runtime response: ${content}`,
      }
  : undefined;
const learningContentDispatcher: LearningContentDispatcher | undefined = learningRuntimeEnabled
  ? async ({ day }) => {
      const conceptId = day.conceptIds[0] ?? "isolated-learning-concept";
      const lesson: LearningLessonInput = {
        title: "격리 브라우저 Runtime 오늘 수업",
        estimatedMinutes: Math.min(day.minutes, 8),
        blocks: [{
          id: "isolated-learning-content-block",
          kind: "concept",
          conceptIds: [conceptId],
          minutes: Math.min(day.minutes, 8),
          title: "Runtime이 준비한 핵심 개념",
          content: "이 수업은 임시 격리 Runtime에서 반환되어 저장된 학습 콘텐츠입니다.",
        }],
      };
      return { status: "completed" as const, lesson };
    }
  : undefined;
const learningActionDispatcher: LearningActionDispatcher | undefined = learningRuntimeEnabled
  ? async ({ action, complete }) => ({
      status: "completed" as const,
      action: await complete(`격리 브라우저 Runtime 설명: ${action.question ?? "학습 중인 개념"}`),
    })
  : undefined;
const learningFeedbackDispatcher: LearningFeedbackDispatcher | undefined = learningRuntimeEnabled
  ? async ({ attempt, complete }) => {
      const evaluation: LearningFeedbackEvaluationInput = {
        attemptId: attempt.id,
        rubricVersion: "isolated-browser-rubric-v1",
        evaluatorVersion: "isolated-browser-evaluator-v1",
        criteriaResults: [{
          criterionId: "structure",
          result: "partial",
          evidenceRefs: [],
          explanation: "답변 구조를 확인했지만 실행 증거는 연결되지 않았습니다.",
        }],
        feedback: "격리 Runtime 평가가 저장되었습니다.",
        misconceptions: [],
        verification: "verified",
        nextAction: "실행 가능한 검증 환경에서 다시 확인하세요.",
      };
      return { status: "completed" as const, feedback: await complete(evaluation) };
    }
  : undefined;
const activityService = createActivityService(platformRoot);
const userService = createPlatformUserService(platformRoot);
const teamService = createTeamService(platformRoot, { activityService });
const settingsService = createSettingsService(platformRoot);
const integrationService = createIntegrationService(platformRoot, {
  isOptedIn: async (userId, provider) => (await settingsService.getSettings({ userId, sessionId: "integration-settings", roles: [] })).integrations[provider],
});
const notificationService = createNotificationService(platformRoot);
const growthService = createGrowthService(platformRoot, { settingsService, notificationService });
const userProjectService = createUserProjectService({
  platformRoot,
  projectModelRoot: join(root, "project-model"),
  projectHarnessRoot,
  iseolRoot: root,
  canAccessTeam: (principal, teamId) => teamService.canAccess(principal, teamId),
  canAccessTeamWithinMembershipLock: (principal, teamId) => teamService.canAccessWithinMembershipLock(principal, teamId),
  activityService,
  growthService,
});
const aiTeamProposalService = createAiTeamProposalService({ root: join(platformRoot, "ai-team"), teamService, userProjectService, activityService, dispatchForUser: userRuntimeDispatchGate, ...(aiTeamRuntimeEnabled ? { dispatcher: async () => ({ status: "proposed" as const, draft: { title: "격리 AI 팀 제안", objective: "승인 전 작업 제안 경계를 확인합니다.", acceptanceCriteria: ["사람 승인 필요", "실행은 별도 승인"], rationale: "격리 브라우저 검증" } }) } : {}) });
const aiTeamDiscussionService = createAiTeamDiscussionService({ root: join(platformRoot, "ai-team"), teamService, userProjectService, activityService, dispatchForUser: userRuntimeDispatchGate, ...(aiTeamRuntimeEnabled ? { dispatcher: async ({ question }) => ({ status: "completed" as const, answer: `격리 Runtime 토론 답변: ${question}`, keyPoints: ["권한 범위를 먼저 확인합니다."], alternatives: ["작게 나누어 검증합니다."], risks: ["실행 전 사람 검토가 필요합니다."] }) } : {}) });
const studyService = createStudyService(join(platformRoot, "study"), { teamService, activityService });
const teamChatService = createTeamChatService(platformRoot, { teamService, activityService, settingsService, notificationService });
const learningService = createLearningService(platformRoot, {
  activityService,
  growthService,
  userProjectService,
  codingAttemptVerifier: createLocalCodingSyntaxVerifier({ timeoutMs: 5_000 }),
  dispatchForUser: userRuntimeDispatchGate,
  ...(learningContentDispatcher ? { contentDispatcher: learningContentDispatcher } : {}),
  ...(learningActionDispatcher ? { actionDispatcher: learningActionDispatcher } : {}),
  ...(learningFeedbackDispatcher ? { feedbackDispatcher: learningFeedbackDispatcher } : {}),
});
const memoryService = createMemoryService(platformRoot, { teamService });
const portfolioService = createPortfolioService(platformRoot, { activityService, userProjectService, learningService });
const aiAgentProfileService = createAiAgentProfileService(platformRoot);
const server = await startWebControlPlaneServer({
  host: "127.0.0.1",
  port: Number(process.env.ISEOL_BROWSER_SERVER_PORT ?? 0),
  token: "isolated-operator-token",
  modelRoot: join(root, "model"),
  harnessRoot: projectHarnessRoot,
  webRoot: resolve(process.cwd(), "web"),
  userUiRoot: resolve(process.cwd(), "user-ui", "dist"),
  userService,
  personalWorldService: createPersonalWorldService(platformRoot),
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
  socialService: createSocialService(platformRoot, { platformUserService: userService, canCollaborate: teamService.canCollaborate, activityService, notificationService, settingsService, growthService, userProjectService, learningService, portfolioService }),
  recruitmentService: createRecruitmentService(platformRoot, { teamService, activityService, notificationService, settingsService }),
  portfolioService,
  communityService: createCommunityService(platformRoot, { platformUserService: userService, notificationService, settingsService }),
  settingsService,
  integrationService,
  notificationService,
  aiAgentProfileService,
  aiChatService: createAiChatService(platformRoot, {
    memoryService,
    teamService,
    studyService,
    activityService,
    userProjectService,
    settingsService,
    notificationService,
    aiAgentProfileService,
    dispatchForUser: userRuntimeDispatchGate,
    ...(aiChatRuntimeDispatcher ? { runtimeDispatcher: aiChatRuntimeDispatcher } : {}),
  }),
  aiChatRuntimeReady: Boolean(aiChatRuntimeDispatcher),
  aiTeamRuntimeReady: aiTeamRuntimeEnabled,
  learningAiRuntimeReady: learningRuntimeEnabled,
  ...(enqueueProjectRun ? { ideaLabRuntime: { state: "ready" as const, enqueueProjectRun } } : {}),
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("isolated server did not bind to a TCP address");
console.log(`ISEOL_BROWSER_SERVER_URL=http://127.0.0.1:${address.port}`);

const close = async () => {
  await server.closeForShutdown();
  await localAgent?.close();
  await desktopCore?.close();
  process.exit(0);
};
process.once("SIGINT", () => { void close(); });
process.once("SIGTERM", () => { void close(); });
await new Promise<void>(() => undefined);

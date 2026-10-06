import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { test } from "node:test";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { ChatGptBrowserDriver } from "../src/chatgpt-web/production-browser-adapter.js";
import { hasProjectRuntimeOwner, shouldAutoRecoverProjectRun, shouldRecoverIdeaLabCampaign, startIseolRuntimeServices } from "../src/runtime/iseol-runtime-services.js";
import { saveHarnessRun } from "../src/harness/run-store.js";
import { savePrototypeProduction } from "../src/idea-lab/production-store.js";
import type { HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";

function browserDriver(onDispose: () => void = () => undefined): ChatGptBrowserDriver {
  return {
    openOrResumeConversation: async () => ({ conversationRef: "conversation-1" }),
    submitPrompt: async () => ({ conversationRef: "conversation-1" }),
    readStructuredResult: async () => [],
    closeConversation: async () => undefined,
    dispose: async () => onDispose(),
  };
}

function fixture(overrides: Record<string, unknown> = {}) {
  const events: string[] = [];
  const roots = {
    iseolRoot: "C:/iseol",
    modelRoot: "C:/iseol-model",
    runRoot: "C:/iseol-runs",
    webRoot: "C:/iseol-web",
    browserProfileRoot: "C:/chatgpt-profile",
    projectModelRoot: "C:/project-model",
    projectRunRoot: "C:/project-runs",
    projectWebWorkerRoot: "C:/project-workers",
    projectDesktopStateRoot: "C:/project-desktop-state",
  };
  return {
    env: {},
    roots,
    webConfig: {
      host: "127.0.0.1", port: 0, token: "",
      modelRoot: roots.modelRoot, harnessRoot: roots.runRoot, webRoot: roots.webRoot,
    },
    desktopConfig: {
      enabled: true, host: "127.0.0.1", port: 0,
      stateRoot: "C:/desktop-state", token: "desktop-token",
    },
    ideaLabConfig: { enabled: false },
    agentReadyTimeoutMs: 0,
    deps: {
      resolveBrowser: async () => browserDriver(),
      startDesktop: async () => ({
        transport: { isAgentConnected: () => true, sendTask() {}, awaitResult: async () => { throw new Error("unused"); } },
        close: async () => { events.push("desktop"); },
      }),
      startWeb: async (options: any) => {
        events.push(`web:${options.ideaLabRuntime?.state ?? "none"}`);
        return { close: (done?: (error?: Error) => void) => { events.push("web-close"); done?.(); } };
      },
    },
    ...overrides,
    events,
  } as any;
}
function liveConfig() {
  return {
    enabled: true as const,
    repositoryRoot: "C:/sandbox/source",
    repositoryUrl: "https://github.com/example/idea-lab.git",
    baseRef: "main",
    sandboxRoot: "C:/sandbox",
    agentId: "agent-live",
    testExecutable: "npm.cmd",
    testArgs: ["test"],
    testTimeoutMs: 30_000,
  };
}

test("Project Workspace recovery does not auto-retry FAILED_RETRYABLE runs", () => {
  assert.equal(shouldAutoRecoverProjectRun("READY"), false);
  assert.equal(shouldAutoRecoverProjectRun("RUNNING"), false);
  assert.equal(shouldAutoRecoverProjectRun("FAILED_RETRYABLE"), false);
  assert.equal(shouldAutoRecoverProjectRun("FAILED_FINAL"), false);
  assert.equal(hasProjectRuntimeOwner([
    { request: { mode: "project-workspace", runId: "run-3" }, state: { status: "RUNNING" } },
  ], "run-4"), true);
  assert.equal(hasProjectRuntimeOwner([
    { request: { mode: "project-workspace", runId: "run-4" }, state: { status: "RUNNING" } },
  ], "run-4"), false);
});

test("Idea Lab recovery barrier blocks a producing campaign with WAITING_EXTERNAL production", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-recovery-barrier-"));
  const modelRoot = join(root, "model");
  const runRoot = join(root, "runs");
  await savePrototypeProduction(modelRoot, {
    version: 1, id: "production-1", campaignId: "campaign-1", proposalId: "proposal-1", runId: "run-1",
    repositoryUrl: "https://github.com/example/repo.git", sandboxRoot: join(root, "sandbox"), worktreeRoot: join(root, "worktree"),
    branch: "idea/production-1", baseRef: "main", status: "running", createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:00:00.000Z",
  });
  const run: HarnessRuntimeRunEnvelope = {
    version: 1, request: { version: 1, mode: "idea-lab", runId: "run-1", projectId: "campaign-1", objective: "prototype", targetRoot: join(root, "worktree") },
    preflight: { version: 1, runId: "run-1", status: "ready" },
    state: { version: 1, stage: "IMPLEMENT", status: "WAITING_EXTERNAL", completedStages: [], skippedStages: [], updatedAt: "2026-09-20T00:00:00.000Z", reason: "temporary rate limit" },
    evidence: [], updatedAt: "2026-09-20T00:00:00.000Z",
  };
  await saveHarnessRun(runRoot, run);
  assert.equal(await shouldRecoverIdeaLabCampaign(modelRoot, runRoot, "campaign-1"), false);
});

test("Idea Lab recovery barrier permits a producing campaign without external-waiting production", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-recovery-barrier-allow-"));
  await savePrototypeProduction(join(root, "model"), {
    version: 1, id: "production-1", campaignId: "campaign-1", proposalId: "proposal-1", runId: "run-1",
    repositoryUrl: "https://github.com/example/repo.git", sandboxRoot: join(root, "sandbox"), worktreeRoot: join(root, "worktree"),
    branch: "idea/production-1", baseRef: "main", status: "running", createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:00:00.000Z",
  });
  assert.equal(await shouldRecoverIdeaLabCampaign(join(root, "model"), join(root, "runs"), "campaign-1"), true);
});

test("shares one browser across bridge and Idea Lab and disposes it exactly once", async () => {
  let browserCreates = 0;
  let browserDisposes = 0;
  let bridgeDriver: unknown;
  let providerDriver: unknown;
  const shared = browserDriver(() => { browserDisposes += 1; });
  const value = fixture({ env: { ISEOL_CHATGPT_WEB_ENABLED: "true" }, ideaLabConfig: liveConfig() });
  value.deps.resolveBrowser = async () => { browserCreates += 1; return shared; };
  value.deps.resolveDeploy = async () => ({});
  value.deps.createBridge = async (_config: unknown, driver: unknown) => {
    bridgeDriver = driver;
    return { enabled: true, dispose: async () => undefined };
  };
  value.deps.createProposalProvider = (driver: unknown) => { providerDriver = driver; return {}; };
  value.deps.createProductionDriver = () => ({});
  value.deps.createRuntime = () => ({ recover: async () => undefined, dispose: async () => undefined });

  const services = await startIseolRuntimeServices(value);
  assert.equal(browserCreates, 1);
  assert.equal(bridgeDriver, shared);
  assert.equal(providerDriver, shared);
  await services.dispose();
  await services.dispose();
  assert.equal(browserDisposes, 1);
});

test("writes bounded shutdown diagnostics without exposing disposal errors", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-shutdown-diagnostics-"));
  const value = fixture({ shutdownDiagnosticsRoot: root });
  const services = await startIseolRuntimeServices(value);
  await services.dispose();
  const content = await readFile(join(root, "shutdown-diagnostics.jsonl"), "utf8");
  const events = content.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.ok(events.some((entry) => entry.event === "started" && entry.stage === "web-server"));
  assert.ok(events.some((entry) => entry.event === "completed" && entry.stage === "browser"));
  assert.ok(events.some((entry) => entry.event === "summary" && entry.ok === true));
  assert.doesNotMatch(content, /unused|token|cookie|page/i);
});

test("composed Runtime learning service persists local JavaScript syntax receipts", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-runtime-learning-coding-"));
  const value = fixture();
  value.roots = {
    iseolRoot: root,
    modelRoot: join(root, "model"),
    runRoot: join(root, "runs"),
    webRoot: join(root, "web"),
    browserProfileRoot: join(root, "browser"),
    projectModelRoot: join(root, "project-model"),
    projectRunRoot: join(root, "project-runs"),
    projectWebWorkerRoot: join(root, "project-workers"),
    projectDesktopStateRoot: join(root, "desktop-state"),
  };
  value.webConfig = {
    host: "127.0.0.1", port: 0, token: "",
    modelRoot: value.roots.modelRoot, harnessRoot: value.roots.runRoot, webRoot: value.roots.webRoot,
  };
  const services = await startIseolRuntimeServices(value);
  try {
    const user = await services.platformUserService.createUser({ id: "coding-runtime-user", email: "coding-runtime@example.com", displayName: "Coding Runtime", timezone: "Asia/Seoul" });
    const principal = { userId: user.id, sessionId: "coding-runtime-session", roles: ["user"] };
    const exercise = await services.learningService.createCodingExercise(principal, { title: "Runtime syntax", prompt: "Write JavaScript", language: "javascript", estimatedMinutes: 5 });
    const result = await services.learningService.submitCodingAttempt(principal, { exerciseId: exercise.id, clientRequestId: "coding-runtime-1", response: "const answer = 1;" });
    assert.equal(result.attempt.practiceResult.status, "syntax-verified");
    assert.equal(result.attempt.practiceResult.receipt.checkKind, "syntax-only");
  } finally {
    await services.dispose();
  }
});

test("composed Runtime shares one per-user dispatch gate between learning and Personal AI", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-runtime-shared-user-gate-"));
  const value = fixture();
  value.roots = {
    iseolRoot: root,
    modelRoot: join(root, "model"),
    runRoot: join(root, "runs"),
    webRoot: join(root, "web"),
    browserProfileRoot: join(root, "browser"),
    projectModelRoot: join(root, "project-model"),
    projectRunRoot: join(root, "project-runs"),
    projectWebWorkerRoot: join(root, "project-workers"),
    projectDesktopStateRoot: join(root, "desktop-state"),
  };
  value.webConfig = {
    host: "127.0.0.1", port: 0, token: "",
    modelRoot: value.roots.modelRoot, harnessRoot: value.roots.runRoot, webRoot: value.roots.webRoot,
    platformRoot: join(root, "platform"),
  };
  let active = 0;
  let maximumActive = 0;
  let dispatchCount = 0;
  let firstEntered: (() => void) | undefined;
  const firstEnteredPromise = new Promise<void>((resolve) => { firstEntered = resolve; });
  let releaseFirst: (() => void) | undefined;
  const firstReleasePromise = new Promise<void>((resolve) => { releaseFirst = resolve; });
  value.learningActionDispatcher = async ({ action, complete }) => {
    dispatchCount += 1;
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    if (dispatchCount === 1) firstEntered?.();
    await firstReleasePromise;
    active -= 1;
    return { status: "completed" as const, action: await complete(`학습 Runtime 응답: ${action.actionId}`) };
  };
  value.aiChatRuntimeDispatcher = async () => {
    dispatchCount += 1;
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    active -= 1;
    return { status: "completed" as const, assistantContent: "개인 AI Runtime 응답" };
  };
  const services = await startIseolRuntimeServices(value);
  try {
    const user = await services.platformUserService.createUser({ id: "shared-gate-user", email: "shared-gate@example.com", displayName: "Shared Gate", timezone: "Asia/Seoul" });
    const principal = { userId: user.id, sessionId: "shared-gate-session", roles: ["user"] };
    const plan = await services.learningService.createLearningPlan(principal, { title: "공통 게이트", description: "학습과 개인 AI", goals: ["겹치지 않기"] });
    const session = await services.learningService.startLearningSession(principal, plan.id);
    const conversation = await services.aiChatService.createConversation(principal, "개인 AI");
    const learningRequest = services.learningService.recordLearningSessionAction(principal, session.id, { actionId: "shared-gate-action", type: "explanation", question: "동시성" });
    await firstEnteredPromise;
    const chatRequest = services.aiChatService.sendMessage(principal, conversation.id, "개인 AI도 실행해줘");
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(dispatchCount, 1);
    assert.equal(maximumActive, 1);
    releaseFirst?.();
    await Promise.all([learningRequest, chatRequest]);
    assert.equal(dispatchCount, 2);
    assert.equal(maximumActive, 1);
  } finally {
    await services.dispose();
  }
});

test("composed Runtime forwards explicit local AI team dispatchers without enabling a default one", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-runtime-ai-team-dispatchers-"));
  const value = fixture();
  value.roots = {
    iseolRoot: root,
    modelRoot: join(root, "model"),
    runRoot: join(root, "runs"),
    webRoot: join(root, "web"),
    browserProfileRoot: join(root, "browser"),
    projectModelRoot: join(root, "project-model"),
    projectRunRoot: join(root, "project-runs"),
    projectWebWorkerRoot: join(root, "project-workers"),
    projectDesktopStateRoot: join(root, "desktop-state"),
  };
  value.webConfig = {
    host: "127.0.0.1", port: 0, token: "",
    modelRoot: value.roots.modelRoot, harnessRoot: value.roots.runRoot, webRoot: value.roots.webRoot,
    platformRoot: join(root, "platform"),
  };
  value.aiTeamProposalDispatcher = async () => ({ status: "proposed" as const, draft: { title: "구성된 AI 제안", objective: "명시적으로 주입된 로컬 dispatcher를 사용합니다.", acceptanceCriteria: ["사람 승인"], rationale: "기본 자동 실행을 열지 않습니다." } });
  value.aiTeamDiscussionDispatcher = async ({ question }: { question: string }) => ({ status: "completed" as const, answer: `구성된 토론: ${question}`, keyPoints: ["로컬 경계"], alternatives: [], risks: [] });
  const services = await startIseolRuntimeServices(value);
  try {
    const user = await services.platformUserService.createUser({ id: "composed-ai-team-user", email: "composed-ai-team@example.com", displayName: "Composed AI Team", timezone: "Asia/Seoul" });
    const principal = { userId: user.id, sessionId: "composed-ai-team-session", roles: ["user"] };
    const team = await services.teamService.createTeam(principal, { name: "구성 AI 팀", description: "explicit dispatcher", kind: "project", visibility: "private", capacity: 3 });
    await services.teamService.addAiMember(principal, team.id, { agentId: "architect", assignmentRole: "architecture", capabilities: ["context.read", "task.propose", "discussion.propose"], approvalScope: "suggestion-only" }, "2026-09-28T12:00:00.000Z");
    const project = await services.userProjectService.createProject(principal, { name: "구성 AI 팀 프로젝트", objective: "dispatcher wiring", purpose: "rapid-prototype", teamMode: "mixed", teamId: team.id });
    const proposal = await services.aiTeamProposalService.requestProposal(principal, project.id, { agentId: "architect", requestId: "composed-proposal" });
    const discussion = await services.aiTeamDiscussionService.requestDiscussion(principal, project.id, { agentId: "architect", requestId: "composed-discussion", question: "구성이 전달되나요?" });
    assert.equal(proposal.status, "proposed");
    assert.equal(discussion.status, "completed");
    assert.equal(discussion.answer, "구성된 토론: 구성이 전달되나요?");
  } finally {
    await services.dispose();
  }
});

test("composed Runtime creates AI Team Ollama dispatchers only from explicit local configuration", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-runtime-ai-team-ollama-"));
  const value = fixture();
  value.roots = {
    iseolRoot: root,
    modelRoot: join(root, "model"),
    runRoot: join(root, "runs"),
    webRoot: join(root, "web"),
    browserProfileRoot: join(root, "browser"),
    projectModelRoot: join(root, "project-model"),
    projectRunRoot: join(root, "project-runs"),
    projectWebWorkerRoot: join(root, "project-workers"),
    projectDesktopStateRoot: join(root, "desktop-state"),
  };
  value.webConfig = {
    host: "127.0.0.1", port: 0, token: "",
    modelRoot: value.roots.modelRoot, harnessRoot: value.roots.runRoot, webRoot: value.roots.webRoot,
    platformRoot: join(root, "platform"),
  };
  value.localAiTeamRuntimeConfig = {
    enabled: true,
    baseUrl: "http://127.0.0.1:11434",
    model: "qwen-local",
    fetchImpl: async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages?: Array<{ content?: string }> };
      const prompt = body.messages?.[1]?.content ?? "";
      const content = prompt.includes("ai-team-proposal")
        ? JSON.stringify({ title: "Ollama 제안", objective: "구성된 로컬 모델 경계를 확인합니다.", acceptanceCriteria: ["사람 승인"], rationale: "명시적 local config" })
        : JSON.stringify({ answer: "작업을 작은 단계로 나눕니다.", keyPoints: ["권한 확인"], alternatives: ["읽기 우선"], risks: ["검토 누락"] });
      return new Response(JSON.stringify({ message: { content } }), { status: 200 });
    },
  };
  const services = await startIseolRuntimeServices(value);
  try {
    const user = await services.platformUserService.createUser({ id: "composed-ai-team-ollama-user", email: "composed-ai-team-ollama@example.com", displayName: "Composed AI Team Ollama", timezone: "Asia/Seoul" });
    const principal = { userId: user.id, sessionId: "composed-ai-team-ollama-session", roles: ["user"] };
    const team = await services.teamService.createTeam(principal, { name: "Ollama AI 팀", description: "local config", kind: "project", visibility: "private", capacity: 3 });
    await services.teamService.addAiMember(principal, team.id, { agentId: "architect", assignmentRole: "architecture", capabilities: ["context.read", "task.propose", "discussion.propose"], approvalScope: "suggestion-only" }, "2026-09-28T12:00:00.000Z");
    const project = await services.userProjectService.createProject(principal, { name: "Ollama AI 팀 프로젝트", objective: "local adapter wiring", purpose: "rapid-prototype", teamMode: "mixed", teamId: team.id });
    const proposal = await services.aiTeamProposalService.requestProposal(principal, project.id, { agentId: "architect", requestId: "ollama-proposal" });
    const discussion = await services.aiTeamDiscussionService.requestDiscussion(principal, project.id, { agentId: "architect", requestId: "ollama-discussion", question: "로컬 모델이 연결되나요?" });
    assert.equal(proposal.status, "proposed");
    assert.equal(proposal.title, "Ollama 제안");
    assert.equal(discussion.status, "completed");
    assert.equal(discussion.answer, "작업을 작은 단계로 나눕니다.");
  } finally {
    await services.dispose();
  }
});

test("Idea-Lab-only runtime resolves the browser once even when standalone bridge is disabled", async () => {
  let browserCreates = 0;
  const value = fixture({ env: { ISEOL_CHATGPT_WEB_ENABLED: "false" }, ideaLabConfig: liveConfig() });
  value.deps.resolveBrowser = async () => { browserCreates += 1; return browserDriver(); };
  value.deps.resolveDeploy = async () => ({});
  value.deps.createProductionDriver = () => ({});
  value.deps.createRuntime = () => ({ recover: async () => undefined, dispose: async () => undefined });

  const services = await startIseolRuntimeServices(value);
  assert.equal(services.ideaLabCapability.state, "ready");
  assert.equal(browserCreates, 1);
  await services.dispose();
});

test("Project Workspace runs use the configured repository policy root for global Harness policy", async () => {
  let webOptions: any;
  const value = fixture({
    env: { ISEOL_PROJECT_RUNTIME_ENABLED: "true", ISEOL_PROJECT_AGENT_ID: "agent-project" },
    ideaLabConfig: liveConfig(),
  });
  value.deps.resolveBrowser = async () => browserDriver();
  value.deps.startWeb = async (options: any) => {
    webOptions = options;
    return { close: (done?: (error?: Error) => void) => done?.() };
  };

  const services = await startIseolRuntimeServices(value);
  assert.equal(webOptions.iseolRoot, "C:/sandbox/source");
  assert.equal(webOptions.policyRoot, "C:/sandbox/source");
  await services.dispose();
});

test("Project Workspace executor uses the shared Desktop registry and isolated job state", async () => {
  let executorInput: any;
  const value = fixture({
    env: { ISEOL_PROJECT_RUNTIME_ENABLED: "true", ISEOL_PROJECT_AGENT_ID: "agent-project" },
  });
  value.deps.createProjectExecutor = (input: any) => {
    executorInput = input;
    return {};
  };
  value.deps.startWeb = async (options: any) => ({
    close: (done?: (error?: Error) => void) => done?.(),
    options,
  });

  const services = await startIseolRuntimeServices(value);
  assert.equal(executorInput.registryRoot, "C:/desktop-state");
  assert.equal(executorInput.desktopStateRoot, resolve("C:/project-desktop-state"));
  await services.dispose();
});

test("Project Workspace runtime registers the shared AI/Desktop executor when explicitly enabled", async () => {
  let capability: any;
  const value = fixture({ env: {
    ISEOL_PROJECT_RUNTIME_ENABLED: "true",
    ISEOL_PROJECT_AGENT_ID: "agent-project",
  } });
  value.deps.resolveBrowser = async () => browserDriver();
  value.deps.startDesktop = async () => ({
    transport: { isAgentConnected: (agentId: string) => agentId === "agent-project", sendTask() {}, awaitResult: async () => { throw new Error("unused"); } },
    close: async () => undefined,
  });
  value.deps.startWeb = async (options: any) => {
    capability = options.ideaLabRuntime;
    return { close: (done?: (error?: Error) => void) => done?.() };
  };
  const services = await startIseolRuntimeServices(value);
  assert.equal(services.ideaLabCapability.agent, "ready");
  assert.equal(typeof capability.enqueueProjectRun, "function");
  assert.equal(typeof capability.retryProjectRun, "function");
  assert.equal(await capability.enqueueProjectRun("missing-project-run"), "not-configured");
  assert.equal(await capability.retryProjectRun({ projectId: "missing-project", runId: "missing-project-run" }), "not-allowed");
  await services.dispose();
});

test("Project Workspace Agent capability follows late disconnects and reconnects", async () => {
  let connected = true;
  let connectedListener: ((agentId: string) => void) | undefined;
  let disconnectedListener: ((agentId: string) => void) | undefined;
  const transport = {
    isAgentConnected: (agentId: string) => {
      assert.equal(agentId, "agent-project");
      return connected;
    },
    onAgentConnected(listener: (agentId: string) => void) {
      connectedListener = listener;
      return () => { if (connectedListener === listener) connectedListener = undefined; };
    },
    onAgentDisconnected(listener: (agentId: string) => void) {
      disconnectedListener = listener;
      return () => { if (disconnectedListener === listener) disconnectedListener = undefined; };
    },
    sendTask() {},
    awaitResult: async () => { throw new Error("unused"); },
  };
  const value = fixture({
    env: { ISEOL_PROJECT_RUNTIME_ENABLED: "true", ISEOL_PROJECT_AGENT_ID: "agent-project" },
  });
  value.deps.startDesktop = async () => ({ transport, close: async () => undefined });
  value.deps.createProjectExecutor = () => ({});
  const services = await startIseolRuntimeServices(value);

  assert.equal(services.ideaLabCapability.agent, "ready");
  assert.equal(typeof connectedListener, "function");
  assert.equal(typeof disconnectedListener, "function");

  connected = false;
  disconnectedListener!("agent-project");
  assert.equal(services.ideaLabCapability.agent, "unavailable");

  connected = true;
  connectedListener!("agent-project");
  assert.equal(services.ideaLabCapability.agent, "ready");

  await services.dispose();
});

test("Project Workspace runtime exposes isolated roots to the web control plane", async () => {
  let webOptions: any;
  const value = fixture({
    env: { ISEOL_PROJECT_RUNTIME_ENABLED: "true", ISEOL_PROJECT_AGENT_ID: "agent-project" },
    roots: {
      iseolRoot: "C:/iseol",
      modelRoot: "C:/iseol-model",
      runRoot: "C:/iseol-runs",
      webRoot: "C:/iseol-web",
      webWorkerRoot: "C:/idea-lab-workers",
      browserProfileRoot: "C:/chatgpt-profile",
      projectModelRoot: "C:/project-model",
      projectRunRoot: "C:/project-runs",
      projectWebWorkerRoot: "C:/project-workers",
      projectDesktopStateRoot: "C:/project-desktop-state",
    },
  });
  value.deps.startWeb = async (options: any) => {
    webOptions = options;
    return { close: (done?: (error?: Error) => void) => done?.() };
  };
  const services = await startIseolRuntimeServices(value);
  assert.equal(webOptions.projectModelRoot, resolve("C:/project-model"));
  assert.equal(webOptions.projectHarnessRoot, resolve("C:/project-runs"));
  await services.dispose();
});

test("runtime wires a durable platform user service into the web control plane", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-platform-runtime-"));
  let webOptions: any;
  const value = fixture({
    webConfig: {
      host: "127.0.0.1", port: 0, token: "",
      modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"),
      platformRoot: join(root, "platform"),
    },
    deps: {
      startWeb: async (options: any) => {
        webOptions = options;
        return { close: (done?: (error?: Error) => void) => done?.() };
      },
    },
  });
  const services = await startIseolRuntimeServices(value);
  try {
    assert.equal(typeof webOptions.userService?.createUser, "function");
    const user = await webOptions.userService.createUser({
      id: "runtime-user",
      email: "runtime@example.com",
      displayName: "Runtime User",
      timezone: "Asia/Seoul",
    });
    assert.equal(user.id, "runtime-user");
    assert.equal(typeof services.platformUserService?.resolveAuthenticatedPrincipal, "function");
  } finally {
    await services.dispose();
  }
});

test("composed Runtime forwards explicitly injected integration adapters to the user Control Plane", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-runtime-integrations-"));
  let webOptions: any;
  let adapterCalls = 0;
  const value = fixture({
    roots: {
      iseolRoot: root,
      modelRoot: join(root, "model"),
      runRoot: join(root, "runs"),
      webRoot: join(root, "web"),
      browserProfileRoot: join(root, "browser"),
      projectModelRoot: join(root, "project-model"),
      projectRunRoot: join(root, "project-runs"),
      projectWebWorkerRoot: join(root, "project-workers"),
      projectDesktopStateRoot: join(root, "desktop-state"),
    },
    webConfig: {
      host: "127.0.0.1", port: 0, token: "",
      modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot: join(root, "web"),
      platformRoot: join(root, "platform"),
    },
    integrationAdapters: {
      calendar: {
        deliver: async () => {
          adapterCalls += 1;
          return { externalRef: "calendar-event-1" };
        },
      },
    },
    deps: {
      startWeb: async (options: any) => {
        webOptions = options;
        return { close: (done?: (error?: Error) => void) => done?.() };
      },
    },
  });
  const services = await startIseolRuntimeServices(value);
  try {
    assert.deepEqual(webOptions.integrationConfiguredProviders, ["calendar"]);
    const user = await services.platformUserService.createUser({ id: "runtime-integrations-user", email: "runtime-integrations@example.com", displayName: "Runtime Integrations", timezone: "Asia/Seoul" });
    const principal = { userId: user.id, sessionId: "runtime-integrations-session", roles: ["user"] };
    await services.settingsService.updateSettings(principal, { integrations: { calendar: true } });
    const queued = await services.integrationService.enqueueDelivery(principal, {
      provider: "calendar", sourceType: "learning-session", sourceId: "session-1", eventType: "session.scheduled", eventVersion: 1,
    });
    const delivered = await services.integrationService.dispatchDelivery(principal, queued.id);
    assert.equal(delivered.state, "delivered");
    assert.equal(delivered.externalRef, "calendar-event-1");
    assert.equal(adapterCalls, 1);
  } finally {
    await services.dispose();
  }
});

test("Project Workspace runtime stays unavailable when isolated roots are incomplete", async () => {
  let capability: any;
  const value = fixture({ env: { ISEOL_PROJECT_RUNTIME_ENABLED: "true", ISEOL_PROJECT_AGENT_ID: "agent-project" } });
  delete value.roots.projectModelRoot;
  value.deps.startWeb = async (options: any) => {
    capability = options.ideaLabRuntime;
    return { close: (done?: (error?: Error) => void) => done?.() };
  };
  const services = await startIseolRuntimeServices(value);
  assert.equal(capability.state, "blocked");
  assert.equal(capability.enqueueProjectRun, undefined);
  await services.dispose();
});

test("Project Workspace recovery never consumes a Run from the Idea Lab root", async () => {
  const value = fixture({ env: { ISEOL_PROJECT_RUNTIME_ENABLED: "true", ISEOL_PROJECT_AGENT_ID: "agent-project" } });
  await saveHarnessRun(value.roots.runRoot, {
    version: 1,
    request: { version: 1, mode: "project-workspace", runId: "idea-lab-root-run", objective: "old", targetRoot: "C:/other" },
    preflight: { version: 1, runId: "idea-lab-root-run", status: "blocked", policy: { version: 1, loadedAt: "2026-09-19T00:00:00.000Z", sources: [], effectiveSha256: "a".repeat(64) }, blockers: ["fixture"] },
    state: { version: 1, stage: "PREFLIGHT", status: "READY", completedStages: [], skippedStages: [], updatedAt: "2026-09-19T00:00:00.000Z" },
    evidence: [],
    updatedAt: "2026-09-19T00:00:00.000Z",
  });
  let capability: any;
  value.deps.startWeb = async (options: any) => {
    capability = options.ideaLabRuntime;
    return { close: (done?: (error?: Error) => void) => done?.() };
  };
  const services = await startIseolRuntimeServices(value);
  assert.equal(await capability.enqueueProjectRun("idea-lab-root-run"), "not-configured");
  await services.dispose();
});

test("Idea Lab worker sessions use the configured ChatGPT Web root, separate from static web content", async () => {
  const value = fixture({
    env: { ISEOL_CHATGPT_WEB_ENABLED: "false", ISEOL_CHATGPT_WEB_ROOT: "C:/fresh-chatgpt-workers" },
    ideaLabConfig: liveConfig(),
  });
  value.deps.resolveBrowser = async () => browserDriver();
  value.deps.resolveDeploy = async () => ({});
  let driverRoots: any;
  value.deps.createProductionDriver = (input: any) => { driverRoots = input.roots; return {}; };
  value.deps.createRuntime = () => ({ recover: async () => undefined, dispose: async () => undefined });
  delete value.roots;

  const services = await startIseolRuntimeServices(value);

  assert.equal(driverRoots.webRoot, resolve("C:/iseol-web"));
  assert.equal(driverRoots.webWorkerRoot, resolve("C:/fresh-chatgpt-workers"));
  await services.dispose();
});
for (const [name, configure] of [
  ["Desktop Core", (value: any) => { value.desktopConfig = { ...value.desktopConfig, enabled: false }; }],
  ["browser", (value: any) => { value.deps.resolveBrowser = async () => null; }],
  ["Vercel adapter", (value: any) => { value.deps.resolveDeploy = async () => null; }],
] as const) {
  test(`missing ${name} blocks live Idea Lab before driver construction or recovery`, async () => {
    let constructed = 0;
    let recovered = 0;
    const value = fixture({ ideaLabConfig: liveConfig() });
    value.deps.resolveDeploy = async () => ({});
    value.deps.createProductionDriver = () => { constructed += 1; return {}; };
    value.deps.createRuntime = () => ({
      recover: async () => { recovered += 1; },
      dispose: async () => undefined,
    });
    configure(value);

    const services = await startIseolRuntimeServices(value);
    assert.equal(services.ideaLabCapability.state, "blocked");
    assert.equal(constructed, 0);
    assert.equal(recovered, 0);
    await services.dispose();
  });
}

test("live dependency startup failure leaves Web available with Idea Lab blocked", async () => {
  for (const failing of ["desktop", "browser"] as const) {
    let constructed = 0;
    let recovered = 0;
    const value = fixture({ ideaLabConfig: liveConfig() });
    value.deps.resolveDeploy = async () => ({});
    value.deps.createProductionDriver = () => { constructed += 1; return {}; };
    value.deps.createRuntime = () => ({
      recover: async () => { recovered += 1; },
      dispose: async () => undefined,
    });
    if (failing === "desktop") value.deps.startDesktop = async () => { throw new Error("desktop unavailable"); };
    if (failing === "browser") value.deps.resolveBrowser = async () => { throw new Error("browser unavailable"); };

    const services = await startIseolRuntimeServices(value);
    assert.equal(services.ideaLabCapability.state, "blocked");
    assert.equal(constructed, 0);
    assert.equal(recovered, 0);
    assert.ok(value.events.includes("web:blocked"));
    await services.dispose();
  }
});

test("production driver receives the shared Desktop transport and a real sandbox adapter", async () => {
  let productionInput: any;
  const transport = { isAgentConnected: () => true, sendTask() {}, awaitResult: async () => { throw new Error("unused"); } };
  const value = fixture({ ideaLabConfig: liveConfig() });
  value.deps.startDesktop = async () => ({ transport, close: async () => undefined });
  value.deps.resolveDeploy = async () => ({});
  value.deps.createProductionDriver = (input: any) => { productionInput = input; return {}; };
  value.deps.createRuntime = () => ({ recover: async () => undefined, dispose: async () => undefined });

  const services = await startIseolRuntimeServices(value);
  assert.equal(productionInput.desktopTransport, transport);
  assert.equal(typeof productionInput.sandboxAdapter?.allocate, "function");
  assert.equal(typeof productionInput.sandboxAdapter?.inspect, "function");
  await services.dispose();
});

test("recovery finishes before Web sees ready and shutdown follows single-owner order", async () => {
  const order: string[] = [];
  const value = fixture({ ideaLabConfig: liveConfig() });
  value.deps.resolveDeploy = async () => ({});
  value.deps.createProductionDriver = () => ({});
  value.deps.createRuntime = () => ({
    recover: async () => { order.push("recover"); },
    dispose: async () => { order.push("runtime"); },
  });
  value.deps.startDesktop = async () => ({
    transport: { isAgentConnected: () => true, sendTask() {}, awaitResult: async () => { throw new Error("unused"); } },
    close: async () => { order.push("desktop"); },
  });
  value.deps.startWeb = async (options: any) => {
    order.push(`web:${options.ideaLabRuntime.state}`);
    return { close: (done?: (error?: Error) => void) => { order.push("web-close"); done?.(); } };
  };
  value.deps.resolveBrowser = async () => browserDriver(() => { order.push("browser"); });

  const services = await startIseolRuntimeServices(value);
  assert.deepEqual(order.slice(0, 2), ["recover", "web:ready"]);
  await services.dispose();
  assert.deepEqual(order.slice(-4), ["web-close", "runtime", "desktop", "browser"]);
});
test("Discord entrypoint retains the composed Iseol runtime lifecycle handle", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.match(source, /let iseolRuntimeServices/);
  assert.match(source, /iseolRuntimeServices\s*=\s*services/);
  assert.equal(source.includes("detached startup replaced by composition"), false);
});

test("startup failure disposes already-created resources and preserves the original error", async () => {
  const order: string[] = [];
  const value = fixture({ env: { ISEOL_CHATGPT_WEB_ENABLED: "true" }, ideaLabConfig: liveConfig() });
  value.deps.startDesktop = async () => ({
    transport: { isAgentConnected: () => true, sendTask() {}, awaitResult: async () => { throw new Error("unused"); } },
    close: async () => { order.push("desktop"); },
  });
  value.deps.resolveBrowser = async () => browserDriver(() => { order.push("browser"); });
  value.deps.createBridge = async () => ({ enabled: true, dispose: async () => { order.push("bridge"); } });
  value.deps.resolveDeploy = async () => ({});
  value.deps.createProductionDriver = () => ({});
  value.deps.createRuntime = () => ({
    recover: async () => { order.push("recover"); },
    dispose: async () => { order.push("runtime"); },
  });
  value.deps.startWeb = async () => { throw new Error("web startup failed"); };

  await assert.rejects(startIseolRuntimeServices(value), /web startup failed/);
  assert.deepEqual(order, ["recover", "bridge", "runtime", "desktop", "browser"]);
});
test("Discord entrypoint disposes the composed runtime on termination signals", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.match(source, /process\.once\("SIGINT"/);
  assert.match(source, /process\.once\("SIGTERM"/);
  assert.match(source, /let iseolRuntimeStartup/);
  assert.match(source, /await iseolRuntimeStartup/);
  assert.match(source, /await services\?\.dispose\(\)/);
});

test("unavailable configured Desktop agent keeps live Idea Lab blocked before driver construction", async () => {
  let constructed = 0;
  let recovered = 0;
  const value = fixture({ ideaLabConfig: liveConfig() });
  value.deps.startDesktop = async () => ({
    transport: {
      isAgentConnected: (agentId: string) => { assert.equal(agentId, "agent-live"); return false; },
      sendTask() {},
      awaitResult: async () => { throw new Error("unused"); },
    },
    close: async () => undefined,
  });
  value.deps.resolveDeploy = async () => ({});
  value.deps.createProductionDriver = () => { constructed += 1; return {}; };
  value.deps.createRuntime = () => ({
    recover: async () => { recovered += 1; },
    dispose: async () => undefined,
  });

  const services = await startIseolRuntimeServices(value);
  assert.equal(services.ideaLabCapability.state, "blocked");
  assert.equal(constructed, 0);
  assert.equal(recovered, 0);
  assert.ok(value.events.includes("web:blocked"));
  await services.dispose();
});

test("live Idea Lab waits boundedly for the configured Desktop agent to connect", async () => {
  let checks = 0;
  let sleeps = 0;
  let constructed = 0;
  const value = fixture({ ideaLabConfig: liveConfig(), agentReadyTimeoutMs: 100 });
  value.deps.startDesktop = async () => ({
    transport: {
      isAgentConnected: (agentId: string) => {
        assert.equal(agentId, "agent-live");
        checks += 1;
        return checks >= 2;
      },
      sendTask() {},
      awaitResult: async () => { throw new Error("unused"); },
    },
    close: async () => undefined,
  });
  value.deps.sleep = async (ms: number) => { assert.ok(ms > 0); sleeps += 1; };
  value.deps.resolveDeploy = async () => ({});
  value.deps.createProductionDriver = () => { constructed += 1; return {}; };
  value.deps.createRuntime = () => ({ recover: async () => undefined, dispose: async () => undefined });

  const services = await startIseolRuntimeServices(value);
  assert.equal(services.ideaLabCapability.state, "ready");
  assert.equal(constructed, 1);
  assert.equal(sleeps, 1);
  assert.equal(checks, 3);
  await services.dispose();
});


test("default live Idea Lab wait covers the persistent Agent max reconnect backoff", async () => {
  let checks = 0;
  let sleeps = 0;
  let constructed = 0;
  const value = fixture({ ideaLabConfig: liveConfig() });
  delete value.agentReadyTimeoutMs;
  value.deps.startDesktop = async () => ({
    transport: {
      isAgentConnected: () => { checks += 1; return checks >= 602; },
      sendTask() {},
      awaitResult: async () => { throw new Error("unused"); },
    },
    close: async () => undefined,
  });
  value.deps.sleep = async (ms: number) => { assert.ok(ms > 0 && ms <= 50); sleeps += 1; };
  value.deps.resolveDeploy = async () => ({});
  value.deps.createProductionDriver = () => { constructed += 1; return {}; };
  value.deps.createRuntime = () => ({ recover: async () => undefined, dispose: async () => undefined });

  const services = await startIseolRuntimeServices(value);
  assert.equal(services.ideaLabCapability.state, "ready");
  assert.equal(constructed, 1);
  assert.ok(sleeps >= 600);
  await services.dispose();
});

test("configured Desktop Agent reconnect does not duplicate completed startup recovery", async () => {
  let reconnectListener:
    | ((agentId: string) => void)
    | undefined;

  let recoverCalls = 0;

  const transport = {
    isAgentConnected: (agentId: string) => {
      assert.equal(agentId, "agent-live");
      return true;
    },
    onAgentConnected(listener: (agentId: string) => void) {
      reconnectListener = listener;

      return () => {
        if (reconnectListener === listener) {
          reconnectListener = undefined;
        }
      };
    },
    sendTask() {},
    awaitResult: async () => {
      throw new Error("unused");
    },
  };

  const value = fixture({ ideaLabConfig: liveConfig() });

  value.deps.startDesktop = async () => ({
    transport,
    close: async () => undefined,
  });

  value.deps.resolveDeploy = async () => ({});
  value.deps.createProductionDriver = () => ({});
  value.deps.createRuntime = () => ({
    recover: async () => {
      recoverCalls += 1;
    },
    dispose: async () => undefined,
  });

  const services = await startIseolRuntimeServices(value);

  assert.equal(
    recoverCalls,
    1,
    "startup still owns the initial recovery pass",
  );

  assert.equal(
    typeof reconnectListener,
    "function",
    "runtime composition must subscribe to Agent reconnects",
  );

  reconnectListener!("other-agent");
  assert.equal(
    recoverCalls,
    1,
    "an unrelated Agent must not wake this Idea Lab runtime",
  );

  reconnectListener!("agent-live");

  assert.equal(
    recoverCalls,
    1,
    "a reconnect after completed startup recovery must not duplicate recovery",
  );

  await services.dispose();
});

test("late Agent connection changes Idea Lab readiness and recovers once", async () => {
  let connected = false;
  let connectedListener: ((agentId: string) => void) | undefined;
  let disconnectedListener: ((agentId: string) => void) | undefined;
  let constructed = 0;
  let recoverCalls = 0;
  let capability: any;
  const transport = {
    isAgentConnected: (agentId: string) => {
      assert.equal(agentId, "agent-live");
      return connected;
    },
    onAgentConnected(listener: (agentId: string) => void) {
      connectedListener = listener;
      return () => { if (connectedListener === listener) connectedListener = undefined; };
    },
    onAgentDisconnected(listener: (agentId: string) => void) {
      disconnectedListener = listener;
      return () => { if (disconnectedListener === listener) disconnectedListener = undefined; };
    },
    sendTask() {},
    awaitResult: async () => { throw new Error("unused"); },
  };
  const value = fixture({ ideaLabConfig: liveConfig(), agentReadyTimeoutMs: 0 });
  value.deps.startDesktop = async () => ({ transport, close: async () => undefined });
  value.deps.resolveDeploy = async () => ({});
  value.deps.createProductionDriver = () => { constructed += 1; return {}; };
  value.deps.createRuntime = () => ({
    recover: async () => { recoverCalls += 1; },
    dispose: async () => undefined,
  });
  value.deps.startWeb = async (options: any) => {
    capability = options.ideaLabRuntime;
    return { close: (done?: (error?: Error) => void) => done?.() };
  };

  const services = await startIseolRuntimeServices(value);
  assert.equal(capability.state, "blocked");
  assert.equal(services.ideaLabCapability.agent, "unavailable");
  assert.equal(constructed, 0);
  assert.equal(recoverCalls, 0);

  connected = true;
  connectedListener!("agent-live");
  connectedListener!("agent-live");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(capability.state, "ready");
  assert.equal(services.ideaLabCapability.state, "ready");
  assert.equal(services.ideaLabCapability.agent, "ready");
  assert.equal(constructed, 1);
  assert.equal(recoverCalls, 1);

  connected = false;
  disconnectedListener!("agent-live");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(capability.state, "blocked");
  assert.equal(services.ideaLabCapability.agent, "unavailable");

  connected = true;
  connectedListener!("agent-live");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(capability.state, "ready");
  assert.equal(services.ideaLabCapability.agent, "ready");
  assert.equal(constructed, 1);
  assert.equal(recoverCalls, 1);

  await services.dispose();
});

test("late Agent recovery retries after a failed pass without marking readiness complete", async () => {
  let connected = false;
  let connectedListener: ((agentId: string) => void) | undefined;
  let recoverCalls = 0;
  let capability: any;
  const transport = {
    isAgentConnected: (agentId: string) => {
      assert.equal(agentId, "agent-live");
      return connected;
    },
    onAgentConnected(listener: (agentId: string) => void) {
      connectedListener = listener;
      return () => { if (connectedListener === listener) connectedListener = undefined; };
    },
    onAgentDisconnected() {
      return () => undefined;
    },
    sendTask() {},
    awaitResult: async () => { throw new Error("unused"); },
  };
  const value = fixture({ ideaLabConfig: liveConfig(), agentReadyTimeoutMs: 0 });
  value.deps.startDesktop = async () => ({ transport, close: async () => undefined });
  value.deps.resolveDeploy = async () => ({});
  value.deps.createProductionDriver = () => ({});
  value.deps.createRuntime = () => ({
    recover: async () => {
      recoverCalls += 1;
      if (recoverCalls === 1) throw new Error("recovery failed");
    },
    dispose: async () => undefined,
  });
  value.deps.startWeb = async (options: any) => {
    capability = options.ideaLabRuntime;
    return { close: (done?: (error?: Error) => void) => done?.() };
  };

  const services = await startIseolRuntimeServices(value);
  connected = true;
  connectedListener!("agent-live");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(capability.state, "blocked");
  assert.equal(recoverCalls, 1);

  connectedListener!("agent-live");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(capability.state, "ready");
  assert.equal(recoverCalls, 2);
  await services.dispose();
});

test("Agent disconnect during recovery leaves readiness blocked until reconnect", async () => {
  let connected = false;
  let connectedListener: ((agentId: string) => void) | undefined;
  let disconnectedListener: ((agentId: string) => void) | undefined;
  let releaseRecovery: (() => void) | undefined;
  let recoverCalls = 0;
  let capability: any;
  const transport = {
    isAgentConnected: (agentId: string) => {
      assert.equal(agentId, "agent-live");
      return connected;
    },
    onAgentConnected(listener: (agentId: string) => void) {
      connectedListener = listener;
      return () => { if (connectedListener === listener) connectedListener = undefined; };
    },
    onAgentDisconnected(listener: (agentId: string) => void) {
      disconnectedListener = listener;
      return () => { if (disconnectedListener === listener) disconnectedListener = undefined; };
    },
    sendTask() {},
    awaitResult: async () => { throw new Error("unused"); },
  };
  const value = fixture({ ideaLabConfig: liveConfig(), agentReadyTimeoutMs: 0 });
  value.deps.startDesktop = async () => ({ transport, close: async () => undefined });
  value.deps.resolveDeploy = async () => ({});
  value.deps.createProductionDriver = () => ({});
  value.deps.createRuntime = () => ({
    recover: async () => {
      recoverCalls += 1;
      await new Promise<void>((resolve) => { releaseRecovery = resolve; });
    },
    dispose: async () => undefined,
  });
  value.deps.startWeb = async (options: any) => {
    capability = options.ideaLabRuntime;
    return { close: (done?: (error?: Error) => void) => done?.() };
  };

  const services = await startIseolRuntimeServices(value);
  connected = true;
  connectedListener!("agent-live");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(recoverCalls, 1);

  connected = false;
  disconnectedListener!("agent-live");
  releaseRecovery!();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(capability.state, "blocked");

  connected = true;
  connectedListener!("agent-live");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(capability.state, "ready");
  assert.equal(recoverCalls, 1);
  await services.dispose();
});

test("disposing runtime services unsubscribes Desktop Agent reconnect listener", async () => {
  let reconnectListener:
    | ((agentId: string) => void)
    | undefined;

  let unsubscribeCalls = 0;

  const transport = {
    isAgentConnected: () => true,
    onAgentConnected(listener: (agentId: string) => void) {
      reconnectListener = listener;

      return () => {
        unsubscribeCalls += 1;

        if (reconnectListener === listener) {
          reconnectListener = undefined;
        }
      };
    },
    sendTask() {},
    awaitResult: async () => {
      throw new Error("unused");
    },
  };

  const value = fixture({ ideaLabConfig: liveConfig() });

  value.deps.startDesktop = async () => ({
    transport,
    close: async () => undefined,
  });

  value.deps.resolveDeploy = async () => ({});
  value.deps.createProductionDriver = () => ({});
  value.deps.createRuntime = () => ({
    recover: async () => undefined,
    dispose: async () => undefined,
  });

  const services = await startIseolRuntimeServices(value);

  assert.equal(typeof reconnectListener, "function");

  await services.dispose();

  assert.equal(
    unsubscribeCalls,
    1,
    "dispose must unsubscribe the Desktop Agent reconnect listener",
  );

  assert.equal(
    reconnectListener,
    undefined,
    "disposed runtime must not retain its reconnect listener",
  );
});

test("startup failure unsubscribes Desktop Agent reconnect listener", async () => {
  let unsubscribeCalls = 0;

  const transport = {
    isAgentConnected: () => true,
    onAgentConnected() {
      return () => {
        unsubscribeCalls += 1;
      };
    },
    sendTask() {},
    awaitResult: async () => {
      throw new Error("unused");
    },
  };

  const value = fixture({ ideaLabConfig: liveConfig() });

  value.deps.startDesktop = async () => ({
    transport,
    close: async () => undefined,
  });

  value.deps.resolveDeploy = async () => ({});
  value.deps.createProductionDriver = () => ({});
  value.deps.createRuntime = () => ({
    recover: async () => undefined,
    dispose: async () => undefined,
  });

  value.deps.startWeb = async () => {
    throw new Error("web startup failed");
  };

  await assert.rejects(
    () => startIseolRuntimeServices(value),
    /web startup failed/,
  );

  assert.equal(
    unsubscribeCalls,
    1,
    "startup failure must unsubscribe the Desktop Agent reconnect listener",
  );
});

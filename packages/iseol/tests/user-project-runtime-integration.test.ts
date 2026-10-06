import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ChatGptBrowserDriver } from "../src/chatgpt-web/production-browser-adapter.js";
import type { HarnessEvidenceKind, HarnessStageExecutionResult } from "../src/harness/contracts.js";
import { prepareDevelopmentRun } from "../src/harness/preflight.js";
import type { HarnessStageExecutor } from "../src/harness/run-supervisor.js";
import { createDesktopStageExecutor } from "../src/desktop-agent/desktop-executor.js";
import { startDesktopAgentCoreService } from "../src/desktop-agent/core-service.js";
import { connectFakeDesktopAgent } from "../src/desktop-agent/test-support/fake-agent.js";
import type { ProjectWorkspaceExecutorInput } from "../src/runtime/project-workspace-executor.js";
import { createProjectWorkspaceDesktopTaskCompiler } from "../src/runtime/project-workspace-desktop-compiler.js";
import { startIseolRuntimeServices } from "../src/runtime/iseol-runtime-services.js";

function browserDriver(): ChatGptBrowserDriver {
  return {
    openOrResumeConversation: async () => ({ conversationRef: "isolated-project-runtime" }),
    submitPrompt: async () => ({ conversationRef: "isolated-project-runtime" }),
    readStructuredResult: async () => [],
    closeConversation: async () => undefined,
    dispose: async () => undefined,
  };
}

function isolatedHarnessExecutor(calls: string[]): HarnessStageExecutor {
  return {
    async execute(run): Promise<HarnessStageExecutionResult> {
      calls.push(run.state.stage);
      const kindByStage: Partial<Record<string, HarnessEvidenceKind>> = {
        TEST: "test",
        SELF_REVIEW: "review",
        COMMIT: "commit",
        PR: "pull-request",
        CI: "ci",
        DEPLOY: "deployment",
        PRODUCTION_VERIFY: "production-verification",
      };
      const evidence = [{
        version: 1 as const,
        id: `isolated-runtime-${run.state.stage.toLowerCase()}`,
        kind: kindByStage[run.state.stage] ?? "command",
        stage: run.state.stage,
        recordedAt: new Date().toISOString(),
        summary: `isolated runtime ${run.state.stage}`,
        projectId: run.request.projectId,
        runId: run.request.runId,
      }];
      if (run.state.stage === "TEST") evidence.push({
        version: 1 as const,
        id: "isolated-runtime-build",
        kind: "build" as const,
        stage: run.state.stage,
        recordedAt: new Date().toISOString(),
        summary: "isolated runtime BUILD evidence",
        projectId: run.request.projectId,
        runId: run.request.runId,
      });
      return { type: "completed", evidence };
    },
  };
}

function realDesktopProjectExecutor(input: ProjectWorkspaceExecutorInput, localCalls: string[]): HarnessStageExecutor {
  const desktop = createDesktopStageExecutor({
    registryRoot: input.registryRoot ?? input.desktopStateRoot,
    jobRoot: input.desktopStateRoot,
    transport: input.desktopTransport,
    compileTaskPack: input.desktopTaskCompiler,
    agentId: input.agentId,
  });
  const localStageExecutor = isolatedHarnessExecutor(localCalls);
  return {
    async execute(run): Promise<HarnessStageExecutionResult> {
      if (["CONTEXT", "TEST"].includes(run.state.stage)) {
        const result = await desktop.execute(run);
        if (run.state.stage === "TEST" && result.type === "completed") {
          result.evidence.push({
            version: 1,
            id: "isolated-real-agent-build",
            kind: "build",
            stage: "TEST",
            recordedAt: new Date().toISOString(),
            summary: "isolated local Agent smoke workspace build gate",
            projectId: run.request.projectId,
            runId: run.request.runId,
          });
        }
        return result;
      }
      return localStageExecutor.execute(run);
    },
  };
}

test("project Desktop compiler emits bounded test and build operations for a build-gated Run", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-desktop-compiler-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "HARNESS_ENGINEERING.md"), "# Isolated compiler policy\n", "utf8");
  const request = {
    version: 1 as const,
    runId: "run-project-compiler-1",
    projectId: "project-compiler-1",
    mode: "project-workspace" as const,
    objective: "compile a real local test and build pack",
    targetRoot: root,
    purposeProfile: {
      version: 1 as const,
      purpose: "rapid-prototype" as const,
      executableRoles: ["orchestrator" as const],
      plannedRoles: [],
      verificationStages: ["TEST", "BUILD"],
      documentationRequired: false,
    },
  };
  const preflight = await prepareDevelopmentRun(request, { iseolRoot: root, loadedAt: "2026-09-27T02:00:00.000Z" });
  assert.equal(preflight.status, "ready");
  const compile = createProjectWorkspaceDesktopTaskCompiler({
    testExecutable: "node",
    testArgs: ["--test"],
    testTimeoutMs: 10_000,
    buildExecutable: "npm.cmd",
    buildArgs: ["run", "build"],
    buildTimeoutMs: 10_000,
  });
  const pack = await compile({
    version: 1,
    request,
    preflight,
    state: { version: 1, stage: "TEST", status: "RUNNING", completedStages: ["PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN", "IMPLEMENT"], skippedStages: [], updatedAt: "2026-09-27T02:00:00.000Z" },
    evidence: [],
    updatedAt: "2026-09-27T02:00:00.000Z",
  }, "project-compiler-agent");
  assert.deepEqual(pack?.operations.map((operation) => operation.type === "RUN_PROCESS" ? [operation.purpose, operation.executable, operation.args] : operation.type), [
    ["test", "node", ["--test"]],
    ["build", "npm.cmd", ["run", "build"]],
  ]);
});

test("composed Runtime accepts an approved project run through HTTP and persists completion", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-composed-project-runtime-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "HARNESS_ENGINEERING.md"), "# Isolated Runtime Policy\n", "utf8");
  const roots = {
    iseolRoot: root,
    modelRoot: join(root, "model"),
    runRoot: join(root, "runs"),
    webRoot: join(root, "web"),
    browserProfileRoot: join(root, "browser-profile"),
    projectModelRoot: join(root, "project-model"),
    projectRunRoot: join(root, "project-runs"),
    projectWebWorkerRoot: join(root, "project-workers"),
    projectDesktopStateRoot: join(root, "project-desktop-state"),
  };
  const calls: string[] = [];
  const services = await startIseolRuntimeServices({
    env: {
      ISEOL_PROJECT_RUNTIME_ENABLED: "true",
      ISEOL_PROJECT_AGENT_ID: "isolated-project-agent",
    },
    roots,
    webConfig: {
      host: "127.0.0.1",
      port: 0,
      token: "",
      modelRoot: roots.modelRoot,
      harnessRoot: roots.runRoot,
      webRoot: roots.webRoot,
      platformRoot: join(root, "platform"),
    },
    desktopConfig: {
      enabled: true,
      host: "127.0.0.1",
      port: 0,
      stateRoot: join(root, "desktop-state"),
      token: "isolated-desktop-token",
    },
    ideaLabConfig: { enabled: false },
    agentReadyTimeoutMs: 0,
    deps: {
      resolveBrowser: async () => browserDriver(),
      startDesktop: async () => ({
        transport: {
          isAgentConnected: (agentId: string) => agentId === "isolated-project-agent",
          sendTask() {},
          awaitResult: async () => { throw new Error("isolated Harness executor does not use Desktop awaitResult"); },
        },
        close: async () => undefined,
      }),
      createProjectExecutor: (() => isolatedHarnessExecutor(calls)) as any,
    },
  });
  const address = services.webServer.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  const user = await services.platformUserService.createUser({
    id: "composed-runtime-user",
    email: "composed-runtime@example.com",
    displayName: "Composed Runtime",
    timezone: "Asia/Seoul",
  });
  const session = await services.platformUserService.createSession({
    userId: user.id,
    roles: ["user"],
    expiresAt: "2099-09-26T12:00:00.000Z",
  });
  const headers = { authorization: `Bearer ${session.token}`, "content-type": "application/json" };
  try {
    const projectResponse = await fetch(`${url}/api/user/projects`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Composed runtime", objective: "verify runtime wiring", purpose: "rapid-prototype", teamMode: "solo" }),
    });
    assert.equal(projectResponse.status, 201);
    const project = (await projectResponse.json() as any).project;

    const workResponse = await fetch(`${url}/api/user/projects/${project.id}/work-requests`, {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "Run through HTTP", objective: "persist a completed Run", idempotencyKey: "composed-runtime-work-1" }),
    });
    assert.equal(workResponse.status, 201);
    const work = (await workResponse.json() as any).request;

    const runResponse = await fetch(`${url}/api/user/projects/${project.id}/runs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ workRequestId: work.id, runId: "composed-runtime-run-1", approved: true }),
    });
    assert.equal(runResponse.status, 202);
    assert.equal((await runResponse.json() as any).status, "started");

    let lastView: any;
    const completed = await (async () => {
      // The real local Core/Agent boundary can be delayed by the surrounding
      // Windows test process load. Keep the observation bounded, but do not
      // classify a slow isolated Agent as a product failure after 60 seconds.
      for (let attempt = 0; attempt < 600; attempt += 1) {
        const view = await services.userProjectService.getProject({ userId: user.id, sessionId: session.id, roles: ["user"] }, project.id);
        assert.ok(view);
        lastView = view;
        if (view.runtime.status === "completed" && view.workRequests[0]?.status === "completed") return view;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return null;
    })();
    assert.ok(completed, `composed Runtime did not persist a completed project Run: stages=${JSON.stringify(calls)} view=${JSON.stringify(lastView)}`);
    const finalResponse = await fetch(`${url}/api/user/projects/${project.id}`, { headers });
    assert.equal(finalResponse.status, 200);
    const finalView = await finalResponse.json() as any;
    assert.equal(completed.runtime.runId, "composed-runtime-run-1");
    assert.ok(completed.evidence.some((item: any) => item.kind === "build" && item.projectId === project.id));
    assert.ok(completed.evidence.some((item: any) => item.kind === "test" && item.runId === "composed-runtime-run-1"));
    assert.equal(finalView.runtime.status, "completed");
    assert.equal(finalView.workRequests[0]?.status, "completed");
    const activityEvents = await services.activityService.listActivityEvents({ userId: user.id, sessionId: session.id, roles: ["user"] });
    const completedActivity = activityEvents.find((event) => event.eventType === "project.run.completed" && event.sourceId === "composed-runtime-run-1" && event.verificationStatus === "verified");
    assert.ok(completedActivity);
    const growth = await services.growthService.getGrowthSnapshot({ userId: user.id, sessionId: session.id, roles: ["user"] });
    assert.equal(growth.stats.development, 150);
    assert.equal(growth.achievements.some((achievement) => achievement.id === "project-run" && achievement.evidenceEventIds.includes(completedActivity.id)), true);
    const portfolioBeforeEntry = await services.portfolioService.listPortfolio({ userId: user.id, sessionId: session.id, roles: ["user"] });
    const activityEvidence = portfolioBeforeEntry.evidence.find((item) => item.id === `activity:${completedActivity.id}`);
    const projectEvidence = portfolioBeforeEntry.evidence.find((item) => item.id.startsWith(`project-evidence:${project.id}:`) && item.verificationStatus === "verified");
    assert.equal(activityEvidence?.actorType, "system");
    assert.equal(activityEvidence?.verificationStatus, "verified");
    assert.ok(projectEvidence);
    const portfolioEntry = await services.portfolioService.createEntry({ userId: user.id, sessionId: session.id, roles: ["user"] }, {
      title: "Composed Runtime portfolio",
      summary: "A completed local Runtime Run is linked to verified activity and project evidence.",
      visibility: "private",
      evidenceIds: [activityEvidence!.id, projectEvidence.id],
    });
    const portfolioAfterEntry = await services.portfolioService.listPortfolio({ userId: user.id, sessionId: session.id, roles: ["user"] });
    assert.equal(portfolioAfterEntry.entries.some((entry) => entry.id === portfolioEntry.id && entry.evidenceIds.length === 2), true);
    assert.equal(services.ideaLabCapability.state, "disabled");
    assert.equal(typeof services.ideaLabCapability.enqueueProjectRun, "function");
  } finally {
    await services.dispose();
  }
});

test("composed Runtime executes project Desktop stages through the real local Core and Agent boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-real-agent-project-runtime-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "HARNESS_ENGINEERING.md"), "# Isolated Runtime Policy\n", "utf8");
  const roots = {
    iseolRoot: root,
    modelRoot: join(root, "model"),
    runRoot: join(root, "runs"),
    webRoot: join(root, "web"),
    browserProfileRoot: join(root, "browser-profile"),
    projectModelRoot: join(root, "project-model"),
    projectRunRoot: join(root, "project-runs"),
    projectWebWorkerRoot: join(root, "project-workers"),
    projectDesktopStateRoot: join(root, "project-desktop-state"),
  };
  const localCalls: string[] = [];
  let agent: Awaited<ReturnType<typeof connectFakeDesktopAgent>> | undefined;
  const services = await startIseolRuntimeServices({
    env: {
      ISEOL_PROJECT_RUNTIME_ENABLED: "true",
      ISEOL_PROJECT_AGENT_ID: "isolated-real-project-agent",
      ISEOL_PROJECT_TEST_EXECUTABLE: "node",
      ISEOL_PROJECT_TEST_ARGS_JSON: JSON.stringify(["--test", "smoke.test.cjs"]),
    },
    roots,
    webConfig: {
      host: "127.0.0.1",
      port: 0,
      token: "",
      modelRoot: roots.modelRoot,
      harnessRoot: roots.runRoot,
      webRoot: roots.webRoot,
      platformRoot: join(root, "platform"),
    },
    desktopConfig: {
      enabled: true,
      host: "127.0.0.1",
      port: 0,
      stateRoot: join(root, "desktop-state"),
      token: "isolated-real-desktop-token",
    },
    ideaLabConfig: { enabled: false },
    agentReadyTimeoutMs: 1_000,
    deps: {
      resolveBrowser: async () => browserDriver(),
      startDesktop: async (config) => {
        const core = await startDesktopAgentCoreService(config);
        agent = await connectFakeDesktopAgent({
          url: core.url,
          hello: {
            version: 1,
            agentId: "isolated-real-project-agent",
            agentVersion: "isolated-test-agent",
            os: process.platform,
            capabilities: ["operation:GIT_INIT", "operation:GIT_INSPECT", "operation:RUN_PROCESS", "operation:GIT_COMMIT"],
            workspaceRoots: [root],
            token: config.token!,
          },
          allowedRoots: [root],
        });
        return core;
      },
      createProjectExecutor: ((input: ProjectWorkspaceExecutorInput) => realDesktopProjectExecutor(input, localCalls)) as any,
    },
  });
  const address = services.webServer.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  const user = await services.platformUserService.createUser({
    id: "real-agent-runtime-user",
    email: "real-agent-runtime@example.com",
    displayName: "Real Agent Runtime",
    timezone: "Asia/Seoul",
  });
  const session = await services.platformUserService.createSession({
    userId: user.id,
    roles: ["user"],
    expiresAt: "2099-09-26T12:00:00.000Z",
  });
  const headers = { authorization: `Bearer ${session.token}`, "content-type": "application/json" };
  try {
    const projectResponse = await fetch(`${url}/api/user/projects`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Real Agent runtime", objective: "verify the local Core and Agent boundary", purpose: "rapid-prototype", teamMode: "solo" }),
    });
    assert.equal(projectResponse.status, 201);
    const project = (await projectResponse.json() as any).project;
    await writeFile(join(project.workspaceRoot, "smoke.test.cjs"), "const { test } = require('node:test'); test('isolated runtime smoke', () => {});\n", "utf8");
    await writeFile(join(project.workspaceRoot, "package.json"), JSON.stringify({ name: "iseol-real-agent-runtime", private: true, scripts: { build: "node --check smoke.test.cjs" } }) + "\n", "utf8");

    const workResponse = await fetch(`${url}/api/user/projects/${project.id}/work-requests`, {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "Run through the local Agent", objective: "execute real Desktop stages", idempotencyKey: "real-agent-runtime-work-1" }),
    });
    assert.equal(workResponse.status, 201);
    const work = (await workResponse.json() as any).request;

    const runResponse = await fetch(`${url}/api/user/projects/${project.id}/runs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ workRequestId: work.id, runId: "real-agent-runtime-run-1", approved: true }),
    });
    assert.equal(runResponse.status, 202);
    assert.equal((await runResponse.json() as any).status, "started");

    let lastView: any;
    const completed = await (async () => {
      for (let attempt = 0; attempt < 600; attempt += 1) {
        const view = await services.userProjectService.getProject({ userId: user.id, sessionId: session.id, roles: ["user"] }, project.id);
        assert.ok(view);
        lastView = view;
        if (view.runtime.status === "completed" && view.workRequests[0]?.status === "completed") return view;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return null;
    })();
    const localResult = agent?.getResult("real-agent-runtime-run-1-test");
    assert.ok(completed, `real local Agent Runtime did not complete: localStages=${JSON.stringify(localCalls)} view=${JSON.stringify(lastView)} agentResult=${JSON.stringify(localResult)}`);
    assert.equal(services.desktopCore?.transport.isAgentConnected("isolated-real-project-agent"), true);
    assert.equal(agent?.getResult("real-agent-runtime-run-1-context")?.status, "completed");
    assert.equal(agent?.getResult("real-agent-runtime-run-1-test")?.status, "completed");
    assert.ok(completed.evidence.some((item: any) => item.kind === "test" && item.runId === "real-agent-runtime-run-1"));
  } finally {
    await agent?.close();
    await services.dispose();
  }
});

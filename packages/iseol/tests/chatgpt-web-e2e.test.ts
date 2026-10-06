import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { DesktopTaskPack } from "../src/desktop-agent/contracts.js";
import type { HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";
import { createDesktopAgentTransport } from "../src/desktop-agent/transport.js";
import { createDesktopStageExecutor } from "../src/desktop-agent/desktop-executor.js";
import { loadDesktopJob } from "../src/desktop-agent/job-store.js";
import { startDesktopAgentWebSocketServer } from "../src/desktop-agent/ws-server.js";
import { connectFakeDesktopAgent } from "../src/desktop-agent/test-support/fake-agent.js";
import { prepareDevelopmentRun } from "../src/harness/preflight.js";
import { saveHarnessRun } from "../src/harness/run-store.js";
import { superviseHarnessRun } from "../src/harness/run-supervisor.js";
import { createFakeChatGptWebBrowserAdapter, ChatGptWebSessionLostError } from "../src/chatgpt-web/test-support/fake-browser-adapter.js";
import { createWebReasoningExecutor } from "../src/chatgpt-web/web-reasoning-executor.js";
import { compileDesktopIntentToTaskPack } from "../src/chatgpt-web/intent-compiler.js";
import { createHybridStageExecutor } from "../src/chatgpt-web/hybrid-executor.js";
import { createProjectWorkspaceExecutor } from "../src/runtime/project-workspace-executor.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}
async function fixture() {
  const base = await mkdtemp(join(tmpdir(), "iseol-chatgpt-web-e2e-"));
  const repo = join(base, "repo");
  const runRoot = join(base, "runs");
  const workerRoot = join(base, "workers");
  const registryRoot = join(base, "registry");
  const jobRoot = join(base, "jobs");
  await mkdir(join(repo, "docs"), { recursive: true });
  await writeFile(join(repo, "docs", "HARNESS_ENGINEERING.md"), "# Project Harness\n", "utf8");
  await writeFile(join(repo, "feature.txt"), "old\n", "utf8");
  await writeFile(join(repo, "verify.test.cjs"), "const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');test('feature updated',()=>assert.equal(fs.readFileSync('feature.txt','utf8').trim(),'new'));\n", "utf8");
  execFileSync("git", ["init"], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "iseol@example.com"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "Iseol Web E2E"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["commit", "-m", "chore: initial"], { cwd: repo, stdio: "ignore" });
  const initialHead = git(repo, ["rev-parse", "HEAD"]);
  const request = { version: 1 as const, runId: "run-web-e2e", mode: "project-workspace" as const, objective: "ChatGPT Web bridge E2E", targetRoot: repo };
  const preflight = await prepareDevelopmentRun(request, { iseolRoot: process.cwd(), loadedAt: "2026-09-08T05:00:00.000Z" });
  if (!preflight.policy) throw new Error("preflight policy missing");
  const run: HarnessRuntimeRunEnvelope = {
    version: 1, request, preflight,
    state: { version: 1, stage: "IMPLEMENT", status: "READY", completedStages: ["PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN"], skippedStages: [], updatedAt: "2026-09-08T05:00:00.000Z" },
    evidence: [], updatedAt: "2026-09-08T05:00:00.000Z",
  };
  await saveHarnessRun(runRoot, run);
  return { base, repo, runRoot, workerRoot, registryRoot, jobRoot, initialHead, request, preflight, run };
}
async function coreAndAgent(f: Awaited<ReturnType<typeof fixture>>) {
  const transport = createDesktopAgentTransport({ registryRoot: f.registryRoot, expectedToken: "secret-token", now: () => "2026-09-08T05:00:00.000Z" });
  const server = await startDesktopAgentWebSocketServer({ host: "127.0.0.1", port: 0, transport });
  const agent = await connectFakeDesktopAgent({
    url: server.url,
    hello: { version: 1, agentId: "agent-web-e2e", agentVersion: "0.1.0", os: process.platform, capabilities: ["process", "git", "files"], workspaceRoots: [f.base, process.cwd()], token: "secret-token" },
    allowedRoots: [f.base, process.cwd()], heartbeatIntervalMs: 50, now: () => "2026-09-08T05:00:00.000Z",
  });
  return { transport, server, agent };
}

async function closeAll(resources: Awaited<ReturnType<typeof coreAndAgent>>) {
  await resources.agent.close();
  await resources.server.close();
}

function deterministicPack(f: Awaited<ReturnType<typeof fixture>>, run: HarnessRuntimeRunEnvelope, agentId: string): DesktopTaskPack | null {
  const policy = f.preflight.policy!;
  const common = {
    version: 1 as const, runId: f.request.runId, stage: run.state.stage, attempt: 0, agentId, workspaceRoot: f.repo,
    policyDigest: policy.effectiveSha256,
    policySources: policy.sources.map((source) => ({ kind: source.kind, path: source.path, sha256: source.sha256, required: true })),
    leaseUntil: "2026-09-08T05:10:00.000Z",
  };
  if (run.state.stage === "TEST") return { ...common, jobId: "job-web-e2e-test", idempotencyKey: "test:run-web-e2e", operations: [{ id: "verify", type: "RUN_PROCESS", purpose: "test", cwd: ".", executable: "node", args: ["--test", "verify.test.cjs"], timeoutMs: 5_000 }] };
  if (run.state.stage === "COMMIT") return { ...common, jobId: "job-web-e2e-commit", idempotencyKey: "commit:run-web-e2e", operations: [{ id: "commit", type: "GIT_COMMIT", cwd: ".", message: "feat: web bridge e2e", expectedHead: f.initialHead }] };
  return null;
}
function webExecutorWithRealDesktop(
  f: Awaited<ReturnType<typeof fixture>>,
  resources: Awaited<ReturnType<typeof coreAndAgent>>,
  adapter: Parameters<typeof createWebReasoningExecutor>[0]["adapter"],
) {
  return createWebReasoningExecutor({
    workerRoot: f.workerRoot,
    adapter,
    now: () => "2026-09-08T05:00:00.000Z",
    runDesktopIntent: async ({ run, session, intent }) => {
      const oneIntentExecutor = createDesktopStageExecutor({
        registryRoot: f.registryRoot,
        jobRoot: f.jobRoot,
        transport: resources.transport,
        compileTaskPack: async (_active, agentId) => compileDesktopIntentToTaskPack({ run, session, resultGeneration: session.generation }, intent, agentId, "2026-09-08T05:00:00.000Z"),
        now: () => "2026-09-08T05:00:00.000Z",
      });
      return oneIntentExecutor.execute(run);
    },
  });
}

function deterministicDesktopExecutor(f: Awaited<ReturnType<typeof fixture>>, resources: Awaited<ReturnType<typeof coreAndAgent>>) {
  return createDesktopStageExecutor({
    registryRoot: f.registryRoot,
    jobRoot: f.jobRoot,
    transport: resources.transport,
    compileTaskPack: async (run, agentId) => deterministicPack(f, run, agentId),
    now: () => "2026-09-08T05:00:00.000Z",
  });
}
test("Supervisor runs Web reasoning through the real Desktop bridge before deterministic delivery stages", async (t) => {
  const f = await fixture();
  const resources = await coreAndAgent(f);
  t.after(() => closeAll(resources));
  const policySha256 = f.preflight.policy!.effectiveSha256;
  const patch = ["--- a/feature.txt", "+++ b/feature.txt", "@@ -1 +1 @@", "-old", "+new", ""].join("\n");
  const fake = createFakeChatGptWebBrowserAdapter([
    { version: 1, runId: "run-web-e2e", stage: "IMPLEMENT", generation: 1, summary: "Apply and verify patch", decisions: ["Use guarded Desktop intents"], intents: [
      { version: 1, intentId: "intent-read", runId: "run-web-e2e", stage: "IMPLEMENT", workspaceRoot: f.repo, policySha256, kind: "READ_CONTEXT", path: "feature.txt" },
      { version: 1, intentId: "intent-patch", runId: "run-web-e2e", stage: "IMPLEMENT", workspaceRoot: f.repo, policySha256, kind: "PROPOSE_PATCH", path: "feature.txt", patch },
      { version: 1, intentId: "intent-verify", runId: "run-web-e2e", stage: "IMPLEMENT", workspaceRoot: f.repo, policySha256, kind: "RUN_TEST", cwd: ".", executable: "node", args: ["--test", "verify.test.cjs"], timeoutMs: 5_000 },
    ], outcome: "continue" },
    { version: 1, runId: "run-web-e2e", stage: "IMPLEMENT", generation: 1, summary: "Implementation complete", decisions: ["Desktop verification passed"], intents: [], outcome: "stage-complete" },
    { version: 1, runId: "run-web-e2e", stage: "SELF_REVIEW", generation: 1, summary: "Self review complete", decisions: ["No material issue found"], intents: [], outcome: "stage-complete" },
  ]);
  const hybrid = createHybridStageExecutor({
    webExecutor: webExecutorWithRealDesktop(f, resources, fake.adapter),
    desktopExecutor: deterministicDesktopExecutor(f, resources),
  });
  const final = await superviseHarnessRun({ storeRoot: f.runRoot, runId: f.request.runId, executor: hybrid, maxSteps: 12, now: () => "2026-09-08T05:00:00.000Z" });

  assert.equal(final.state.stage, "PR");
  assert.equal(final.state.status, "WAITING_EXTERNAL");
  assert.equal((await readFile(join(f.repo, "feature.txt"), "utf8")).trim(), "new");
  assert.equal(git(f.repo, ["rev-list", "--count", "HEAD"]), "2");
  assert.equal(final.evidence.some((item) => item.stage === "TEST" && item.kind === "test"), true);
  assert.equal(final.evidence.some((item) => item.stage === "SELF_REVIEW" && item.kind === "review"), true);
  assert.equal(final.evidence.some((item) => item.stage === "COMMIT" && item.kind === "commit"), true);
  assert.equal(fake.submittedPrompts.some((prompt) => prompt.stage === "IMPLEMENT" && /Desktop Job/.test(prompt.body)), false);
  assert.match(fake.submittedPrompts[1]!.body, /old/);
});

test("Project Workspace executor composes Web reasoning, Desktop feedback, and recovery using the shared path", async (t) => {
  const f = await fixture();
  const resources = await coreAndAgent(f);
  t.after(() => closeAll(resources));
  const policySha256 = f.preflight.policy!.effectiveSha256;
  const patch = ["--- a/feature.txt", "+++ b/feature.txt", "@@ -1 +1 @@", "-old", "+new", ""].join("\n");
  const fake = createFakeChatGptWebBrowserAdapter([
    { version: 1, runId: f.request.runId, stage: "IMPLEMENT", generation: 1, summary: "Apply patch", decisions: [], intents: [{ version: 1, intentId: "workspace-patch", runId: f.request.runId, stage: "IMPLEMENT", workspaceRoot: f.repo, policySha256, kind: "PROPOSE_PATCH", path: "feature.txt", patch }, { version: 1, intentId: "workspace-verify", runId: f.request.runId, stage: "IMPLEMENT", workspaceRoot: f.repo, policySha256, kind: "RUN_TEST", cwd: ".", executable: "node", args: ["--test", "verify.test.cjs"], timeoutMs: 5_000 }], outcome: "continue" },
    { version: 1, runId: f.request.runId, stage: "IMPLEMENT", generation: 1, summary: "Done", decisions: [], intents: [], outcome: "stage-complete" },
    { version: 1, runId: f.request.runId, stage: "SELF_REVIEW", generation: 1, summary: "Reviewed", decisions: [], intents: [], outcome: "stage-complete" },
  ]);
  const executor = createProjectWorkspaceExecutor({
    runRoot: f.runRoot,
    workerRoot: f.workerRoot,
    registryRoot: f.registryRoot,
    desktopStateRoot: f.jobRoot,
    desktopTransport: resources.transport,
    browserAdapter: fake.adapter,
    agentId: "agent-web-e2e",
    now: () => "2026-09-08T05:00:00.000Z",
    desktopTaskCompiler: async (run, agentId) => deterministicPack(f, run, agentId),
  });
  const final = await superviseHarnessRun({ storeRoot: f.runRoot, runId: f.request.runId, executor, maxSteps: 12, now: () => "2026-09-08T05:00:00.000Z" });
  assert.equal(final.state.status, "WAITING_EXTERNAL", final.state.reason ?? "");
  assert.equal(final.state.stage, "PR");
  assert.equal((await readFile(join(f.repo, "feature.txt"), "utf8")).trim(), "new");
  assert.equal(final.evidence.some((item) => item.stage === "IMPLEMENT"), true);
  assert.equal(fake.submittedPrompts.filter((prompt) => prompt.stage === "IMPLEMENT").length, 2);
});

test("Project Workspace executor accepts an explicit local provider for Web-owned stages", async (t) => {
  const f = await fixture();
  const resources = await coreAndAgent(f);
  t.after(() => closeAll(resources));
  const executor = createProjectWorkspaceExecutor({
    runRoot: f.runRoot,
    workerRoot: f.workerRoot,
    registryRoot: f.registryRoot,
    desktopStateRoot: f.jobRoot,
    desktopTransport: resources.transport,
    browserAdapter: createFakeChatGptWebBrowserAdapter([]).adapter,
    agentId: "agent-web-e2e",
    desktopTaskCompiler: async () => null,
    webExecutor: {
      async execute(run) {
        return {
          type: "completed" as const,
          evidence: [{
            version: 1 as const,
            id: `local-provider-${run.state.stage.toLowerCase()}`,
            kind: "file-change" as const,
            stage: run.state.stage,
            recordedAt: "2026-09-08T05:00:00.000Z",
            summary: "local provider stage",
            provider: "isolated-local-provider",
            runId: run.request.runId,
          }],
        };
      },
    },
  });
  const result = await executor.execute({ ...f.run, state: { ...f.run.state, status: "RUNNING" } });
  assert.equal(result.type, "completed");
  assert.equal((result.type === "completed" ? result.evidence[0]?.provider : undefined), "isolated-local-provider");
});

test("Project Workspace executor forwards bounded parser diagnostics from its adapter wrapper", async (t) => {
  const f = await fixture();
  const resources = await coreAndAgent(f);
  t.after(() => closeAll(resources));
  const fake = createFakeChatGptWebBrowserAdapter([
    { invalid: true },
    { version: 1, runId: f.request.runId, stage: "IMPLEMENT", generation: 1, summary: "Complete", decisions: [], intents: [], outcome: "stage-complete" },
  ]);
  const diagnostics: Array<{ correctionAttempt?: number; correctionBudgetUsed?: number; correctionBudgetLimit?: number }> = [];
  fake.adapter.recordResultDiagnostic = async (input) => {
    diagnostics.push({ correctionAttempt: input.correctionAttempt, correctionBudgetUsed: input.correctionBudgetUsed, correctionBudgetLimit: input.correctionBudgetLimit });
  };
  const executor = createProjectWorkspaceExecutor({
    runRoot: f.runRoot,
    workerRoot: f.workerRoot,
    registryRoot: f.registryRoot,
    desktopStateRoot: f.jobRoot,
    desktopTransport: resources.transport,
    browserAdapter: fake.adapter,
    agentId: "agent-web-e2e",
    now: () => "2026-09-08T05:00:00.000Z",
    desktopTaskCompiler: async () => null,
  });
  const result = await executor.execute({ ...f.run, state: { ...f.run.state, status: "RUNNING" } });
  assert.equal(result.type, "completed");
  assert.deepEqual(diagnostics, [{ correctionAttempt: 1, correctionBudgetUsed: 1, correctionBudgetLimit: 3 }]);
});
test("browser recovery reuses the same Desktop intent job without applying a mutation twice", async (t) => {
  const f = await fixture();
  const resources = await coreAndAgent(f);
  t.after(() => closeAll(resources));
  const policySha256 = f.preflight.policy!.effectiveSha256;
  const patch = ["--- a/feature.txt", "+++ b/feature.txt", "@@ -1 +1 @@", "-old", "+new", ""].join("\n");
  const sameIntent = { version: 1 as const, intentId: "intent-recover-patch", runId: "run-web-e2e", stage: "IMPLEMENT" as const, workspaceRoot: f.repo, policySha256, kind: "PROPOSE_PATCH" as const, path: "feature.txt", patch };
  const fake = createFakeChatGptWebBrowserAdapter([
    { version: 1, runId: "run-web-e2e", stage: "IMPLEMENT", generation: 1, summary: "Patch once", decisions: [], intents: [sameIntent], outcome: "continue" },
    new ChatGptWebSessionLostError("browser tab disappeared"),
    { version: 1, runId: "run-web-e2e", stage: "IMPLEMENT", generation: 2, summary: "Resume same intent", decisions: [], intents: [sameIntent], outcome: "continue" },
    { version: 1, runId: "run-web-e2e", stage: "IMPLEMENT", generation: 2, summary: "Recovered implementation complete", decisions: [], intents: [], outcome: "stage-complete" },
  ]);
  const executor = webExecutorWithRealDesktop(f, resources, fake.adapter);
  const running = { ...f.run, state: { ...f.run.state, status: "RUNNING" as const } };
  const result = await executor.execute(running);
  assert.equal(result.type, "completed");
  assert.equal((await readFile(join(f.repo, "feature.txt"), "utf8")).trim(), "new");
  assert.equal(git(f.repo, ["rev-list", "--count", "HEAD"]), "1");
  assert.equal(fake.submittedPrompts.filter((prompt) => prompt.kind === "recovery").length, 1);
});

test("policy drift after prompt compilation rejects Web output before Desktop dispatch", async () => {
  const f = await fixture();
  const policySha256 = f.preflight.policy!.effectiveSha256;
  let desktopCalls = 0;
  const adapter = {
    async openOrResumeSession() { return {}; },
    async submitTurn() {},
    async awaitStructuredResult() {
      await writeFile(join(f.repo, "docs", "HARNESS_ENGINEERING.md"), "# Drifted Project Harness\n", "utf8");
      return { version: 1, runId: "run-web-e2e", stage: "IMPLEMENT", generation: 1, summary: "Try stale patch", decisions: [], intents: [{ version: 1, intentId: "intent-stale", runId: "run-web-e2e", stage: "IMPLEMENT", workspaceRoot: f.repo, policySha256, kind: "PROPOSE_PATCH", path: "feature.txt", patch: ["--- a/feature.txt", "+++ b/feature.txt", "@@ -1 +1 @@", "-old", "+new", ""].join("\n") }], outcome: "continue" };
    },
    async probeSession() { return "ready" as const; },
    async closeSession() {},
  };
  const executor = createWebReasoningExecutor({ workerRoot: f.workerRoot, adapter, now: () => "2026-09-08T05:00:00.000Z", runDesktopIntent: async () => { desktopCalls += 1; return { type: "completed", evidence: [] }; } });
  const result = await executor.execute({ ...f.run, state: { ...f.run.state, status: "RUNNING" } });
  assert.equal(result.type, "retryable-failure");
  assert.match(result.reason, /policy source hash mismatch/i);
  assert.equal(desktopCalls, 0);
  assert.equal((await readFile(join(f.repo, "feature.txt"), "utf8")).trim(), "old");
});

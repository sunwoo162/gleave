import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { DesktopTaskPack } from "../src/desktop-agent/contracts.js";
import { createDesktopAgentTransport } from "../src/desktop-agent/transport.js";
import { createDesktopStageExecutor } from "../src/desktop-agent/desktop-executor.js";
import { createDesktopRealityInspector } from "../src/desktop-agent/reality-inspector.js";
import { loadDesktopJob } from "../src/desktop-agent/job-store.js";
import { startDesktopAgentWebSocketServer } from "../src/desktop-agent/ws-server.js";
import { connectFakeDesktopAgent } from "../src/desktop-agent/test-support/fake-agent.js";
import { createHybridStageExecutor } from "../src/chatgpt-web/hybrid-executor.js";
import { compileDesktopIntentToTaskPack } from "../src/chatgpt-web/intent-compiler.js";
import { createWebReasoningExecutor } from "../src/chatgpt-web/web-reasoning-executor.js";
import { getActiveWebWorkerSession } from "../src/chatgpt-web/session-store.js";
import { createFakeChatGptWebBrowserAdapter, ChatGptWebSessionLostError } from "../src/chatgpt-web/test-support/fake-browser-adapter.js";
import { createDevelopmentRun, refreshDevelopmentRunPreflight } from "../src/harness/run-service.js";
import { loadHarnessRun, saveHarnessRun } from "../src/harness/run-store.js";
import { recoverHarnessRun } from "../src/harness/recovery.js";
import { superviseHarnessRun } from "../src/harness/run-supervisor.js";
import type { HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";
import type { IdeaProposal, PrototypeProduction } from "../src/idea-lab/contracts.js";
import { saveIdeaLabCampaign, loadIdeaLabCampaign } from "../src/idea-lab/campaign-store.js";
import { loadIdeaProposal } from "../src/idea-lab/proposal-store.js";
import { listPrototypeProductions } from "../src/idea-lab/production-store.js";
import {
  superviseIdeaLabCampaign,
  type ProductionAdvanceResult,
} from "../src/idea-lab/campaign-supervisor.js";
import { createDesktopPrototypeSandboxAdapter } from "../src/idea-lab/sandbox-adapter.js";
import { createFakePrototypeDeployAdapter } from "../src/idea-lab/test-support/fake-deploy-adapter.js";
import { FakeIdeaProposalProvider } from "../src/idea-lab/test-support/fake-proposal-provider.js";
import { deployPrototypeProduction, materializePrototypeCandidate, verifyPrototypeProductionDeployment } from "../src/idea-lab/production-service.js";
import { listPrototypeCandidates } from "../src/project-model/prototype-store.js";
import { promotePrototype } from "../src/project-model/promotion.js";
import { loadProjectWorkspace } from "../src/project-model/workspace-store.js";

const NOW = "2026-09-08T08:00:00.000Z";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function draft(n: number) {
  return {
    title: `Product ${n}`,
    concept: `Distinct product concept ${n}`,
    problemDomain: `domain-${n}`,
    targetUser: `user-${n}`,
    jobToBeDone: `job-${n}`,
    coreInteractionLoop: `loop-${n}`,
    dataModel: `model-${n}`,
    primaryDifferentiator: `diff-${n}`,
    whyMateriallyDifferent: `reason-${n}`,
  };
}
async function createSystem() {
  const base = await mkdtemp(join(tmpdir(), "iseol-idea-e2e-"));
  const sandboxRoot = join(base, "sandbox");
  const repositoryRoot = join(sandboxRoot, "repo");
  const worktreesRoot = join(sandboxRoot, "worktrees");
  const runRoot = join(base, "runs");
  const workerRoot = join(base, "workers");
  const registryRoot = join(base, "registry");
  const jobRoot = join(base, "jobs");
  const modelRoot = join(base, "model");
  await mkdir(join(repositoryRoot, "docs"), { recursive: true });
  await mkdir(worktreesRoot, { recursive: true });
  await writeFile(join(repositoryRoot, "docs", "HARNESS_ENGINEERING.md"), "# Idea Lab Sandbox Harness\n", "utf8");
  await writeFile(join(repositoryRoot, "product.txt"), "seed\n", "utf8");
  await writeFile(join(repositoryRoot, "verify.test.cjs"), "const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');test('candidate value',()=>assert.match(fs.readFileSync('product.txt','utf8').trim(),/^candidate-prod-\\d+$/));\n", "utf8");
  await writeFile(join(repositoryRoot, "fail.test.cjs"), "const test=require('node:test');test('forced failure',()=>{throw new Error('forced failure')});\n", "utf8");
  execFileSync("git", ["init", "-b", "main"], { cwd: repositoryRoot, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "iseol@example.com"], { cwd: repositoryRoot });
  execFileSync("git", ["config", "user.name", "Iseol Idea Lab E2E"], { cwd: repositoryRoot });
  execFileSync("git", ["add", "-A"], { cwd: repositoryRoot });
  execFileSync("git", ["commit", "-m", "chore: seed idea sandbox"], { cwd: repositoryRoot, stdio: "ignore" });
  return { base, sandboxRoot, repositoryRoot, worktreesRoot, runRoot, workerRoot, registryRoot, jobRoot, modelRoot };
}
async function startCoreAgent(system: Awaited<ReturnType<typeof createSystem>>, dropResult?: (pack: DesktopTaskPack) => boolean) {
  const transport = createDesktopAgentTransport({ registryRoot: system.registryRoot, expectedToken: "secret-token", now: () => NOW });
  const server = await startDesktopAgentWebSocketServer({ host: "127.0.0.1", port: 0, transport });
  const agent = await connectFakeDesktopAgent({
    url: server.url,
    hello: {
      version: 1, agentId: "agent-idea-e2e", agentVersion: "0.1.0", os: process.platform,
      capabilities: ["process", "git", "files", "operation:GIT_INIT", "operation:GIT_INSPECT"], workspaceRoots: [system.sandboxRoot, process.cwd()], token: "secret-token",
    },
    allowedRoots: [system.sandboxRoot, process.cwd()], heartbeatIntervalMs: 50, now: () => NOW,
    dropResult: dropResult ? (pack, result) => dropResult(pack) && result.status === "completed" : undefined,
  });
  return { transport, server, agent };
}

async function closeCoreAgent(resources: Awaited<ReturnType<typeof startCoreAgent>>) {
  await resources.agent.close();
  await resources.server.close();
}

function policyPackFields(run: HarnessRuntimeRunEnvelope) {
  const policy = run.preflight.policy!;
  return {
    policyDigest: policy.effectiveSha256,
    policySources: policy.sources.map((source) => ({ kind: source.kind, path: source.path, sha256: source.sha256, required: true })),
  };
}
function deterministicPack(
  run: HarnessRuntimeRunEnvelope,
  agentId: string,
  expectedValue: string,
  initialHead: string,
  failTest: boolean,
): DesktopTaskPack | null {
  const common = {
    version: 1 as const, runId: run.request.runId, stage: run.state.stage, attempt: 0,
    agentId, workspaceRoot: run.request.targetRoot, ...policyPackFields(run), leaseUntil: "2026-09-08T08:10:00.000Z",
  };
  if (run.state.stage === "CONTEXT") return {
    ...common, jobId: `${run.request.runId}-context`, idempotencyKey: `context:${run.request.runId}`,
    operations: [{ id: "inspect", type: "GIT_INSPECT", cwd: "." }],
  };
  if (run.state.stage === "TEST") return {
    ...common, jobId: `${run.request.runId}-test`, idempotencyKey: `test:${run.request.runId}`,
    operations: [{ id: "test", type: "RUN_PROCESS", purpose: "test", cwd: ".", executable: "node", args: ["--test", failTest ? "fail.test.cjs" : "verify.test.cjs"], timeoutMs: 5_000 }],
  };
  if (run.state.stage === "COMMIT") return {
    ...common, jobId: `${run.request.runId}-commit`, idempotencyKey: `commit:${run.request.runId}`,
    operations: [{ id: "commit", type: "GIT_COMMIT", cwd: ".", message: `feat: build ${expectedValue}`, expectedHead: initialHead }],
  };
  return null;
}
function browserFor(runId: string, workspaceRoot: string, policySha256: string, expectedValue: string, recover = false) {
  const patch = ["--- a/product.txt", "+++ b/product.txt", "@@ -1 +1 @@", "-seed", `+${expectedValue}`, ""].join("\n");
  return createFakeChatGptWebBrowserAdapter([
    { version: 1, runId, stage: "ANALYZE", generation: 1, summary: "Analysis complete", decisions: ["Build one bounded prototype"], intents: [], outcome: "stage-complete" },
    { version: 1, runId, stage: "PLAN", generation: 1, summary: "Plan complete", decisions: ["Use guarded patch and verification"], intents: [], outcome: "stage-complete" },
    { version: 1, runId, stage: "IMPLEMENT", generation: 1, summary: "Apply prototype patch", decisions: [], intents: [{
      version: 1, intentId: `patch-${runId}`, runId, stage: "IMPLEMENT", workspaceRoot, policySha256,
      kind: "PROPOSE_PATCH", path: "product.txt", patch,
    }], outcome: "continue" },
    ...(recover ? [
      new ChatGptWebSessionLostError("browser generation lost"),
      { version: 1, runId, stage: "IMPLEMENT", generation: 2, summary: "Resume same patch", decisions: [], intents: [{
        version: 1, intentId: `patch-${runId}`, runId, stage: "IMPLEMENT", workspaceRoot, policySha256,
        kind: "PROPOSE_PATCH", path: "product.txt", patch,
      }], outcome: "continue" },
      { version: 1, runId, stage: "IMPLEMENT", generation: 2, summary: "Recovered implementation complete", decisions: [], intents: [], outcome: "stage-complete" },
    ] : [{ version: 1, runId, stage: "IMPLEMENT", generation: 1, summary: "Implementation complete", decisions: [], intents: [], outcome: "stage-complete" }]),
    { version: 1, runId, stage: "SELF_REVIEW", generation: 1, summary: "Review complete", decisions: ["Prototype is bounded"], intents: [], outcome: "stage-complete" },
  ]);
}

function desktopExecutorFor(
  system: Awaited<ReturnType<typeof createSystem>>,
  resources: Awaited<ReturnType<typeof startCoreAgent>>,
  expectedValue: string,
  initialHead: string,
  failTest: boolean,
) {
  return createDesktopStageExecutor({
    registryRoot: system.registryRoot, jobRoot: system.jobRoot, transport: resources.transport,
    compileTaskPack: async (run, agentId) => deterministicPack(run, agentId, expectedValue, initialHead, failTest),
    now: () => NOW, resultTimeoutMs: 5_000,
  });
}
function webExecutorFor(
  system: Awaited<ReturnType<typeof createSystem>>,
  resources: Awaited<ReturnType<typeof startCoreAgent>>,
  browser: ReturnType<typeof browserFor>,
) {
  return createWebReasoningExecutor({
    workerRoot: system.workerRoot,
    adapter: browser.adapter,
    now: () => NOW,
    runDesktopIntent: async ({ run, session, intent }) => {
      const oneIntent = createDesktopStageExecutor({
        registryRoot: system.registryRoot, jobRoot: system.jobRoot, transport: resources.transport,
        compileTaskPack: async (_active, agentId) => compileDesktopIntentToTaskPack(
          { run, session, resultGeneration: session.generation }, intent, agentId, NOW,
        ),
        now: () => NOW, resultTimeoutMs: 5_000,
      });
      return oneIntent.execute(run);
    },
  });
}

async function runProduction(
  system: Awaited<ReturnType<typeof createSystem>>,
  resources: Awaited<ReturnType<typeof startCoreAgent>>,
  production: PrototypeProduction,
  proposal: IdeaProposal,
  deployAdapter: ReturnType<typeof createFakePrototypeDeployAdapter>,
  failTest = false,
  recoverBrowser = false,
): Promise<ProductionAdvanceResult> {
  const run = await loadHarnessRun(system.runRoot, production.runId);
  if (!run?.preflight.policy) throw new Error(`Run missing for production ${production.id}`);
  const expectedValue = `candidate-${production.id}`;
  const initialHead = git(production.worktreeRoot, ["rev-parse", "HEAD"]);
  const browser = browserFor(production.runId, production.worktreeRoot, run.preflight.policy.effectiveSha256, expectedValue, recoverBrowser);
  let deployed: Awaited<ReturnType<typeof deployPrototypeProduction>> | null = null;
  let verified: Awaited<ReturnType<typeof verifyPrototypeProductionDeployment>> | null = null;
  const providerExecutor = {
    async execute(active: HarnessRuntimeRunEnvelope) {
      const commitSha = git(production.worktreeRoot, ["rev-parse", "HEAD"]);
      const deployable = { ...production, commitSha };
      if (active.state.stage === "DEPLOY") {
        try {
          deployed = await deployPrototypeProduction(deployable, deployAdapter);
          return { type: "completed" as const, evidence: [{
            version: 1 as const, id: `deploy-${production.id}`, kind: "deployment" as const,
            stage: "DEPLOY" as const, recordedAt: NOW, summary: "Preview deployed",
            provider: deployed.provider, reference: deployed.url,
          }] };
        } catch (error) {
          return { type: "retryable-failure" as const, reason: error instanceof Error ? error.message : String(error) };
        }
      }
      if (active.state.stage === "PRODUCTION_VERIFY") {
        if (!deployed) return { type: "retryable-failure" as const, reason: "Preview deployment receipt is missing" };
        verified = await verifyPrototypeProductionDeployment(deployable, deployed, deployAdapter);
        return { type: "completed" as const, evidence: [{
          version: 1 as const, id: `verify-${production.id}`, kind: "production-verification" as const,
          stage: "PRODUCTION_VERIFY" as const, recordedAt: NOW, summary: "Preview verified",
          provider: verified.provider, reference: verified.url,
        }] };
      }
      return { type: "waiting-external" as const, reason: `Provider stage not supported: ${active.state.stage}` };
    },
  };

  const hybrid = createHybridStageExecutor({
    webExecutor: webExecutorFor(system, resources, browser),
    desktopExecutor: desktopExecutorFor(system, resources, expectedValue, initialHead, failTest),
    providerExecutor,
  });
  const final = await superviseHarnessRun({
    storeRoot: system.runRoot,
    runId: production.runId,
    executor: hybrid,
    maxSteps: 40,
    now: () => NOW,
  });
  if (final.state.status === "FAILED_RETRYABLE" && !failTest) {
    return {
      production: {
        ...production,
        status: "running",
        updatedAt: NOW,
      },
      directive: "yield",
    };
  }

  if (final.state.status !== "DONE") {
    return {
      ...production,
      status: "failed",
      failureSummary: final.state.reason ?? `Run ended at ${final.state.stage} with ${final.state.status}`,
      updatedAt: NOW,
    };
  }
  if (!verified) throw new Error(`Verified deployment missing for ${production.id}`);
  const commitSha = git(production.worktreeRoot, ["rev-parse", "HEAD"]);
  const ready: PrototypeProduction = {
    ...production,
    commitSha,
    deployment: {
      provider: verified.provider,
      deploymentId: verified.deploymentId,
      url: verified.url,
      commitSha: verified.commitSha,
      deployedAt: verified.deployedAt,
      verifiedAt: verified.verifiedAt,
    },
    status: "ready",
    updatedAt: NOW,
  };
  await materializePrototypeCandidate({
    modelRoot: system.modelRoot,
    production: ready,
    proposal,
    run: final,
    deployment: verified,
    at: NOW,
  });
  return ready;
}
async function seedCampaign(system: Awaited<ReturnType<typeof createSystem>>, id: string, targetReadyCount = 3) {
  await saveIdeaLabCampaign(system.modelRoot, {
    version: 1,
    id,
    seed: "explore distinct study products",
    constraints: ["web product", "distinct interaction loop"],
    targetReadyCount,
    productionConcurrency: 1,
    proposalIds: [],
    productionIds: [],
    status: "generating",
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function campaignDriver(
  system: Awaited<ReturnType<typeof createSystem>>,
  resources: Awaited<ReturnType<typeof startCoreAgent>>,
  options: { failedOrdinals?: number[]; recoverBrowserOrdinals?: number[]; deployAdapter?: ReturnType<typeof createFakePrototypeDeployAdapter> } = {},
) {
  const failed = new Set(options.failedOrdinals ?? []);
  const recoverBrowser = new Set(options.recoverBrowserOrdinals ?? []);
  const deployAdapter = options.deployAdapter ?? createFakePrototypeDeployAdapter({ now: () => NOW });
  const sandbox = createDesktopPrototypeSandboxAdapter({
    dispatch: async (pack) => {
      resources.transport.sendTask(pack.agentId, pack);
      return resources.transport.awaitResult(pack.jobId, 5_000);
    },
    refreshPreflight: refreshDevelopmentRunPreflight,
    now: () => NOW,
  });
  return {
    deployAdapter,
    async createProduction(proposal: IdeaProposal, ordinal: number): Promise<PrototypeProduction> {
      const productionId = `prod-${ordinal}`;
      const runId = `run-${proposal.campaignId}-${productionId}`;
      const targetRoot = join(system.worktreesRoot, proposal.campaignId, productionId);
      const run = await createDevelopmentRun({
        version: 1,
        runId,
        mode: "idea-lab",
        objective: `Build ${proposal.title}`,
        targetRoot,
      }, {
        iseolRoot: process.cwd(),
        storeRoot: system.runRoot,
        loadedAt: NOW,
        policyRoot: system.repositoryRoot,
      });
      const allocation = await sandbox.allocate({
        campaignId: proposal.campaignId,
        productionId,
        run,
        sandboxRoot: system.sandboxRoot,
        repositoryRoot: system.repositoryRoot,
        repositoryUrl: "https://example.invalid/idea-sandbox.git",
        baseRef: "main",
        agentId: "agent-idea-e2e",
        iseolRoot: process.cwd(),
        runStoreRoot: system.runRoot,
      });
      return {
        version: 1, id: productionId, campaignId: proposal.campaignId, proposalId: proposal.id, runId,
        repositoryUrl: allocation.repositoryUrl, sandboxRoot: system.sandboxRoot, worktreeRoot: allocation.worktreeRoot,
        branch: allocation.branch, baseRef: allocation.baseRef, status: "queued", createdAt: NOW, updatedAt: NOW,
      };
    },
    async advanceProduction(production: PrototypeProduction): Promise<ProductionAdvanceResult> {
      const proposal = await loadIdeaProposal(system.modelRoot, production.proposalId);
      if (!proposal) throw new Error(`Proposal missing for ${production.id}`);
      const ordinal = Number(production.id.replace("prod-", ""));
      return runProduction(system, resources, production, proposal, deployAdapter, failed.has(ordinal), recoverBrowser.has(ordinal));
    },
  };
}

function proposalProvider(count: number) {
  return new FakeIdeaProposalProvider(
    Array.from({ length: count }, (_, index) => [draft(index + 1)]),
  );
}
test("Idea Lab produces three READY candidates through real Harness Web and Desktop paths and promotes one", async (t) => {
  const system = await createSystem();
  const resources = await startCoreAgent(system);
  t.after(() => closeCoreAgent(resources));
  await seedCampaign(system, "camp-e2e", 3);
  const driver = campaignDriver(system, resources);
  const campaign = await superviseIdeaLabCampaign({
    root: system.modelRoot,
    campaignId: "camp-e2e",
    proposalProvider: proposalProvider(3),
    createProduction: driver.createProduction,
    advanceProduction: driver.advanceProduction,
    maxSteps: 20,
    now: () => NOW,
  });
  assert.equal(campaign.status, "complete");
  const productions = (await listPrototypeProductions(system.modelRoot)).filter((item) => item.campaignId === campaign.id);
  assert.equal(productions.filter((item) => item.status === "ready").length, 3);
  assert.equal((await listPrototypeCandidates(system.modelRoot)).filter((item) => item.status === "candidate").length, 3);

  const selected = productions[1]!;
  const project = await promotePrototype({ modelRoot: system.modelRoot, harnessRoot: system.runRoot, prototypeId: selected.id, promotedAt: NOW });
  assert.deepEqual(project.genesis.ideaLabOrigin, { campaignId: campaign.id, proposalId: selected.proposalId, productionId: selected.id });
  assert.equal(project.genesis.repository.commitSha, selected.commitSha);
  assert.equal(project.genesis.deployment.url, selected.deployment?.url);
  assert.deepEqual(project.genesis.runs.map((run) => run.runId), [selected.runId]);
  assert.deepEqual(await loadProjectWorkspace(system.modelRoot, project.id), project);
});
test("failed second candidate is replenished without changing successful canonical Run ids", async (t) => {
  const system = await createSystem();
  const resources = await startCoreAgent(system);
  t.after(() => closeCoreAgent(resources));
  await seedCampaign(system, "camp-replenish", 3);
  const driver = campaignDriver(system, resources, { failedOrdinals: [2] });
  const campaign = await superviseIdeaLabCampaign({
    root: system.modelRoot,
    campaignId: "camp-replenish",
    proposalProvider: proposalProvider(4),
    createProduction: driver.createProduction,
    advanceProduction: driver.advanceProduction,
    maxSteps: 28,
    now: () => NOW,
  });
  assert.equal(campaign.status, "complete");
  const productions = (await listPrototypeProductions(system.modelRoot)).filter((item) => item.campaignId === campaign.id);
  assert.deepEqual(productions.filter((item) => item.status === "ready").map((item) => item.id), ["prod-1", "prod-3", "prod-4"]);
  assert.equal(productions.find((item) => item.id === "prod-2")?.status, "failed");
  assert.equal((await loadHarnessRun(system.runRoot, "run-camp-replenish-prod-2"))?.state.status, "FAILED_RETRYABLE");
  assert.equal(productions.find((item) => item.id === "prod-1")?.runId, "run-camp-replenish-prod-1");
  assert.equal(productions.find((item) => item.id === "prod-3")?.runId, "run-camp-replenish-prod-3");
  assert.equal(new Set(productions.map((item) => item.runId)).size, productions.length);
});
test("restart recovers browser generation and lost preview response without duplicate production or deploy", async (t) => {
  const system = await createSystem();
  const resources = await startCoreAgent(system);
  t.after(() => closeCoreAgent(resources));
  await seedCampaign(system, "camp-restart", 1);
  const deployAdapter = createFakePrototypeDeployAdapter({ loseFirstResponse: true, now: () => NOW });
  const firstDriver = campaignDriver(system, resources, { recoverBrowserOrdinals: [1], deployAdapter });
  const first = await superviseIdeaLabCampaign({
    root: system.modelRoot,
    campaignId: "camp-restart",
    proposalProvider: proposalProvider(1),
    createProduction: firstDriver.createProduction,
    advanceProduction: firstDriver.advanceProduction,
    maxSteps: 2,
    now: () => NOW,
  });
  assert.equal(first.status, "producing");
  assert.deepEqual(first.productionIds, ["prod-1"]);

  const restartedDriver = campaignDriver(system, resources, { recoverBrowserOrdinals: [1], deployAdapter });
  const interrupted = await superviseIdeaLabCampaign({
    root: system.modelRoot,
    campaignId: "camp-restart",
    proposalProvider: proposalProvider(1),
    createProduction: restartedDriver.createProduction,
    advanceProduction: restartedDriver.advanceProduction,
    maxSteps: 12,
    now: () => NOW,
  });

  assert.equal(interrupted.status, "producing");
  assert.deepEqual(interrupted.productionIds, ["prod-1"]);

  const interruptedRun = await loadHarnessRun(
    system.runRoot,
    "run-camp-restart-prod-1",
  );

  assert.equal(interruptedRun?.state.stage, "DEPLOY");
  assert.equal(interruptedRun?.state.status, "FAILED_RETRYABLE");
  assert.equal(
    deployAdapter.deployCalls.length,
    1,
    "lost deploy response must not create a second deployment before recovery",
  );

  const final = await superviseIdeaLabCampaign({
    root: system.modelRoot,
    campaignId: "camp-restart",
    proposalProvider: proposalProvider(1),
    createProduction: restartedDriver.createProduction,
    advanceProduction: restartedDriver.advanceProduction,
    maxSteps: 12,
    now: () => NOW,
  });

  assert.equal(final.status, "complete");
  assert.deepEqual(final.productionIds, ["prod-1"]);
  assert.equal(deployAdapter.deployCalls.length, 1);
  assert.equal((await getActiveWebWorkerSession(system.workerRoot, "run-camp-restart-prod-1", "IMPLEMENT"))?.generation, 2);
  assert.equal((await listPrototypeCandidates(system.modelRoot)).length, 1);
  assert.equal(git(join(system.worktreesRoot, "camp-restart", "prod-1"), ["rev-list", "--count", "HEAD"]), "2");
});
test("Desktop disconnect after patch and commit reconciles the same Idea Lab Run without duplicate mutation", async (t) => {
  const system = await createSystem();
  const resources = await startCoreAgent(system, (pack) => pack.jobId === "job-idea-interrupt-commit");
  t.after(async () => { await resources.server.close(); });
  const initialHead = git(system.repositoryRoot, ["rev-parse", "HEAD"]);
  const created = await createDevelopmentRun({
    version: 1, runId: "run-idea-interrupt", mode: "idea-lab", objective: "Recover interrupted commit", targetRoot: system.repositoryRoot,
  }, { iseolRoot: process.cwd(), storeRoot: system.runRoot, loadedAt: NOW });
  const commitReady: HarnessRuntimeRunEnvelope = {
    ...created,
    state: {
      version: 1, stage: "COMMIT", status: "READY",
      completedStages: ["PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN", "IMPLEMENT", "TEST", "SELF_REVIEW"],
      skippedStages: [], updatedAt: NOW,
    },
    updatedAt: NOW,
  };
  await saveHarnessRun(system.runRoot, commitReady);
  const patch = ["--- a/product.txt", "+++ b/product.txt", "@@ -1 +1 @@", "-seed", "+recovered", ""].join("\n");
  const executor = createDesktopStageExecutor({
    registryRoot: system.registryRoot, jobRoot: system.jobRoot, transport: resources.transport,
    compileTaskPack: async (run, agentId) => ({
      version: 1, jobId: "job-idea-interrupt-commit", runId: run.request.runId, stage: "COMMIT", attempt: 0,
      agentId, workspaceRoot: system.repositoryRoot, ...policyPackFields(run), idempotencyKey: "commit:run-idea-interrupt",
      leaseUntil: "2026-09-08T08:00:01.000Z",
      operations: [
        { id: "patch", type: "APPLY_PATCH", path: "product.txt", patch },
        { id: "commit", type: "GIT_COMMIT", cwd: ".", message: "feat: recover idea interruption", expectedHead: initialHead },
      ],
    }),
    now: () => NOW, leaseDurationMs: 1_000, resultTimeoutMs: 500,
  });
  const lost = await superviseHarnessRun({
    storeRoot: system.runRoot,
    runId: "run-idea-interrupt",
    executor,
    maxSteps: 2,
    now: () => NOW,
  });
  assert.equal(lost.state.stage, "COMMIT");
  assert.equal(lost.state.status, "WAITING_AGENT");
  const localResultDeadline = Date.now() + 5_000;
  while (!resources.agent.getResult("job-idea-interrupt-commit") && Date.now() < localResultDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(resources.agent.getResult("job-idea-interrupt-commit")?.status, "completed");
  assert.equal(git(system.repositoryRoot, ["rev-list", "--count", "HEAD"]), "2");
  assert.equal((await loadDesktopJob(system.jobRoot, "job-idea-interrupt-commit"))?.status, "indeterminate");

  await resources.agent.close();
  const second = await connectFakeDesktopAgent({
    url: resources.server.url,
    hello: {
      version: 1, agentId: "agent-idea-e2e", agentVersion: "0.1.0", os: process.platform,
      capabilities: ["process", "git", "files", "operation:GIT_INIT", "operation:GIT_INSPECT"], workspaceRoots: [system.sandboxRoot, process.cwd()], token: "secret-token",
    },
    allowedRoots: [system.sandboxRoot, process.cwd()], heartbeatIntervalMs: 50, now: () => "2026-09-08T08:00:03.000Z",
  });
  t.after(() => second.close());
  const inspector = createDesktopRealityInspector({
    registryRoot: system.registryRoot,
    jobRoot: system.jobRoot,
    transport: resources.transport,
    now: () => "2026-09-08T08:00:03.000Z",
    heartbeatTimeoutMs: 5_000,
  });
  const recovered = await recoverHarnessRun({
    storeRoot: system.runRoot,
    runId: "run-idea-interrupt",
    at: "2026-09-08T08:00:03.000Z",
    inspector,
  });
  assert.equal(recovered.state.stage, "PR");
  assert.equal(recovered.evidence.some((item) => item.kind === "commit"), true);
  assert.equal((await loadDesktopJob(system.jobRoot, "job-idea-interrupt-commit"))?.status, "completed");
  assert.equal(git(system.repositoryRoot, ["rev-list", "--count", "HEAD"]), "2");
});

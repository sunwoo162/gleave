import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createIdeaLabProductionRuntimeDriver } from "../src/idea-lab/production-runtime-driver.js";
import type { IdeaProposal } from "../src/idea-lab/contracts.js";
import { saveIdeaProposal } from "../src/idea-lab/proposal-store.js";
import { loadHarnessRun, saveHarnessRun } from "../src/harness/run-store.js";
import { loadPrototypeProduction, savePrototypeProduction } from "../src/idea-lab/production-store.js";
import { loadIdeaLabCampaign, saveIdeaLabCampaign } from "../src/idea-lab/campaign-store.js";
import { superviseIdeaLabCampaign } from "../src/idea-lab/campaign-supervisor.js";
import { createIdeaLabRuntimeService } from "../src/idea-lab/runtime-service.js";
import { registerDesktopAgent } from "../src/desktop-agent/agent-registry.js";
import { findDesktopJobByIdempotencyKey } from "../src/desktop-agent/job-store.js";
import { createFakeChatGptWebBrowserAdapter } from "../src/chatgpt-web/test-support/fake-browser-adapter.js";
import { ChatGptWebSessionLostError, ChatGptWebStructuredResultError } from "../src/chatgpt-web/browser-adapter.js";
import { loadDesktopIntent } from "../src/chatgpt-web/intent-store.js";

function proposal(): IdeaProposal {
  return {
    version: 1,
    id: "proposal-budget-retry",
    campaignId: "camp-budget-retry",
    title: "Budget retry",
    concept: "Recover from transient structured output failures",
    problemDomain: "development",
    targetUser: "developer",
    jobToBeDone: "retry reasoning",
    coreInteractionLoop: "reason-retry",
    dataModel: "turns",
    primaryDifferentiator: "retry",
    whyMateriallyDifferent: "does not permanently fail on transient protocol noise",
    status: "accepted",
    createdAt: "2026-09-16T00:00:00.000Z",
  };
}

function makeDriver(root: string, browserAdapter: any, desktopTransport: any = {} as never) {
  return createIdeaLabProductionRuntimeDriver({
    roots: { iseolRoot: root, modelRoot: root, runRoot: root, webRoot: root, browserProfileRoot: root },
    repositoryRoot: root,
    repositoryUrl: "https://github.com/acme/proto",
    baseRef: "main",
    sandboxRoot: root,
    agentId: "agent-1",
    sandboxAdapter: {
      inspect: async () => null,
      allocate: async (input: any) => ({
        repositoryUrl: input.repositoryUrl,
        branch: `idea/${input.campaignId}/${input.productionId}`,
        worktreeRoot: input.run.request.targetRoot,
        baseRef: input.baseRef,
      }),
    },
    desktopTransport,
    browserAdapter,
    desktopStateRoot: root,
    desktopTaskCompiler: async () => null,
    deployAdapter: {} as never,
  });
}

test("Idea Lab retries after structured-result rejection budget instead of permanently failing", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-structured-retry-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(
    join(root, "docs", "HARNESS_ENGINEERING.md"),
    "# Test Harness\n\nOnly operate inside this fixture.\n",
    "utf8",
  );
  const proposalValue = proposal();
  const bootstrap = makeDriver(root, {} as never);
  const production = await bootstrap.createProduction(proposalValue, 1);
  await saveIdeaProposal(root, proposalValue);

  const run = await loadHarnessRun(root, production.runId);
  assert.ok(run);
  await saveHarnessRun(root, {
    ...run,
    state: {
      ...run.state,
      stage: "IMPLEMENT",
      status: "READY",
      completedStages: ["PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN"],
    },
  });

  const error = () => new ChatGptWebStructuredResultError("ChatGPT structured result is not exactly one JSON value");
  const fake = createFakeChatGptWebBrowserAdapter([
    error(),
    error(),
    error(),
    {
      version: 1,
      runId: production.runId,
      stage: "IMPLEMENT",
      generation: 1,
      summary: "Controlled stop after protocol recovery",
      decisions: [],
      intents: [],
      outcome: "blocked-user",
      blockerReason: "verified structured-result retry",
    },
  ]);

  const driver = makeDriver(root, fake.adapter);
  const result = await driver.advanceProduction(production);
  const finalRun = await loadHarnessRun(root, production.runId);

  assert.equal(result.status, "running");
  assert.equal(finalRun?.state.status, "BLOCKED_USER");
  assert.equal(finalRun?.state.reason, "verified structured-result retry");
  assert.equal(fake.submittedPrompts.length, 4);
  assert.equal((await loadPrototypeProduction(root, production.id))?.status, "running");
});

test("retryable Harness exhaustion yields campaign supervision instead of resetting its budget", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-session-loss-yield-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "HARNESS_ENGINEERING.md"), "# Test Harness\n", "utf8");
  const proposalValue = proposal();
  const bootstrap = makeDriver(root, {} as never);
  const production = await bootstrap.createProduction(proposalValue, 1);
  await saveIdeaProposal(root, proposalValue);
  const run = await loadHarnessRun(root, production.runId);
  assert.ok(run);
  await saveHarnessRun(root, {
    ...run,
    state: { ...run.state, stage: "IMPLEMENT", status: "READY", completedStages: ["PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN"] },
  });

  const intentId = "implement-read-app-js-001";
  const fake = createFakeChatGptWebBrowserAdapter([
    {
      version: 1, runId: production.runId, stage: "IMPLEMENT", generation: 1,
      summary: "Read current app.js", decisions: [], outcome: "continue",
      intents: [{
        version: 1, intentId, runId: production.runId, stage: "IMPLEMENT",
        workspaceRoot: production.worktreeRoot, policySha256: run.preflight.policy!.effectiveSha256,
        kind: "READ_CONTEXT", path: "app.js",
      }],
    },
    ...Array.from({ length: 200 }, () => new ChatGptWebSessionLostError("session disappeared")),
  ]);
  const desktopTransport = {
    isAgentConnected: () => true,
    getAgentSessionId: () => "agent-session",
    sendTask: () => undefined,
    awaitResult: async (jobId: string) => ({
      version: 1 as const, jobId, runId: production.runId, agentId: "agent-1", status: "completed" as const,
      completedAt: "2026-09-16T00:00:01.000Z",
      operations: [{ operationId: intentId, ok: true, summary: "Read app.js", stdout: "export default {};" }],
    }),
  };
  const driver = makeDriver(root, fake.adapter, desktopTransport);
  await registerDesktopAgent(root, {
    version: 1, agentId: "agent-1", agentVersion: "test", os: "win32", capabilities: ["process"],
    workspaceRoots: [production.worktreeRoot], token: "test-token-not-persisted",
  }, new Date().toISOString());
  await savePrototypeProduction(root, production);
  await saveIdeaLabCampaign(root, {
    version: 1, id: proposalValue.campaignId, seed: "seed", constraints: [], targetReadyCount: 1,
    productionConcurrency: 1, proposalIds: [proposalValue.id], productionIds: [production.id],
    status: "producing", createdAt: proposalValue.createdAt, updatedAt: proposalValue.createdAt,
  });
  let supervisionPasses = 0;
  const runtime = createIdeaLabRuntimeService({
    modelRoot: root,
    superviseCampaign: async (campaignId) => {
      supervisionPasses += 1;
      await superviseIdeaLabCampaign({
        root, campaignId, createProduction: driver.createProduction, advanceProduction: driver.advanceProduction,
        maxSteps: 3,
      });
    },
  });
  runtime.enqueue(proposalValue.campaignId);
  await runtime.idle();
  await runtime.dispose();

  const finalRun = await loadHarnessRun(root, production.runId);
  assert.equal(finalRun?.state.status, "FAILED_RETRYABLE");
  assert.match(finalRun?.state.reason ?? "", /recovery budget exhausted: session lost/);
  assert.equal((await loadDesktopIntent(root, production.runId, intentId))?.status, "accepted");
  assert.equal((await findDesktopJobByIdempotencyKey(root, `web-intent:${production.runId}:${intentId}`))?.status, "completed");
  assert.ok(fake.openedSessions.length <= 144, `expected one bounded Harness budget, got ${fake.openedSessions.length} sessions`);
  assert.equal(supervisionPasses, 2, "runtime owns exactly one bounded supervision retry");
  assert.equal((await loadPrototypeProduction(root, production.id))?.status, "running");
  assert.equal((await loadIdeaLabCampaign(root, proposalValue.campaignId))?.status, "producing");
});

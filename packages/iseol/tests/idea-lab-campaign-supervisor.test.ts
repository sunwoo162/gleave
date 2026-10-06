import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IdeaProposal, PrototypeProduction } from "../src/idea-lab/contracts.js";
import { saveIdeaLabCampaign, loadIdeaLabCampaign } from "../src/idea-lab/campaign-store.js";
import { listPrototypeProductions } from "../src/idea-lab/production-store.js";
import { savePrototypeProduction } from "../src/idea-lab/production-store.js";
import { saveIdeaProposal } from "../src/idea-lab/proposal-store.js";
import { saveHarnessRun } from "../src/harness/run-store.js";
import { FakeIdeaProposalProvider } from "../src/idea-lab/test-support/fake-proposal-provider.js";
import {
  IdeaLabCampaignBlockedError,
  superviseIdeaLabCampaign,
} from "../src/idea-lab/campaign-supervisor.js";
import { ExternalRequestOutcomeUnknownError } from "../src/chatgpt-web/request-budget.js";
import { withDurableIdeaLabCampaignLock } from "../src/idea-lab/campaign-lock.js";

const NOW = "2026-09-08T05:00:00.000Z";
const draft = (title: string, n: number) => ({
  title, concept: `${title} concept`, problemDomain: `domain-${n}`, targetUser: `user-${n}`,
  jobToBeDone: `job-${n}`, coreInteractionLoop: `loop-${n}`, dataModel: `model-${n}`,
  primaryDifferentiator: `diff-${n}`, whyMateriallyDifferent: `reason-${n}`,
});

async function fixture(targetReadyCount = 3) {
  const root = await mkdtemp(join(tmpdir(), "iseol-campaign-supervisor-"));
  await saveIdeaLabCampaign(root, {
    version: 1, id: "camp-1", seed: "student tools", constraints: [], targetReadyCount,
    productionConcurrency: 1, proposalIds: [], productionIds: [], status: "generating",
    createdAt: NOW, updatedAt: NOW,
  });
  return root;
}

test("campaign supervision waits for the durable cross-service campaign lock", async () => {
  const root = await fixture();
  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurableIdeaLabCampaignLock(root, "camp-1", async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    });
  });
  await holderStarted;
  let settled = false;
  const supervision = superviseIdeaLabCampaign({
    root,
    campaignId: "camp-1",
    proposalProvider: new FakeIdeaProposalProvider([[draft("Focus", 1)]]),
    createProduction: async () => { throw new Error("not reached"); },
    advanceProduction: async (production) => production,
    maxSteps: 1,
    now: () => NOW,
  }).then((result) => { settled = true; return result; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  releaseHolder();
  assert.equal((await supervision).id, "camp-1");
});

function productionFor(proposal: IdeaProposal, ordinal: number): PrototypeProduction {
  const id = `camp-1-prod-${ordinal}`;
  return {
    version: 1, id, campaignId: proposal.campaignId, proposalId: proposal.id, runId: `run-${id}`,
    repositoryUrl: "https://example.invalid/sandbox.git", sandboxRoot: "C:/sandbox",
    worktreeRoot: `C:/sandbox/worktrees/${id}`, branch: `idea/camp-1/${id}`, baseRef: "main",
    status: "queued", createdAt: NOW, updatedAt: NOW,
  };
}

test("campaign reaches target READY count with concurrency one and canonical productions", async () => {
  const root = await fixture();
  const provider = new FakeIdeaProposalProvider([[draft("A", 1)], [draft("B", 2)], [draft("C", 3)]]);
  const result = await superviseIdeaLabCampaign({
    root, campaignId: "camp-1", proposalProvider: provider,
    createProduction: async (proposal, ordinal) => productionFor(proposal, ordinal),
    advanceProduction: async (production) => ({ ...production, status: "ready", commitSha: `${production.id}-sha`, updatedAt: NOW }),
    now: () => NOW, maxSteps: 32,
  });
  assert.equal(result.status, "complete");
  const productions = (await listPrototypeProductions(root)).filter((item) => item.campaignId === "camp-1");
  assert.equal(productions.length, 3);
  assert.equal(productions.every((item) => item.status === "ready"), true);
  assert.equal(new Set(productions.map((item) => item.proposalId)).size, 3);
});

test("failed production is replenished without recreating successful canonical Runs", async () => {
  const root = await fixture();
  const provider = new FakeIdeaProposalProvider([[draft("A", 1)], [draft("B", 2)], [draft("C", 3)], [draft("D", 4)]]);
  const attempts = new Map<string, number>();
  const result = await superviseIdeaLabCampaign({
    root, campaignId: "camp-1", proposalProvider: provider,
    createProduction: async (proposal, ordinal) => productionFor(proposal, ordinal),
    advanceProduction: async (production) => {
      attempts.set(production.id, (attempts.get(production.id) ?? 0) + 1);
      if (production.proposalId.endsWith("2")) return { ...production, status: "failed", failureSummary: "build failed", updatedAt: NOW };
      return { ...production, status: "ready", commitSha: `${production.id}-sha`, updatedAt: NOW };
    },
    now: () => NOW, maxSteps: 48,
  });
  assert.equal(result.status, "complete");
  const productions = (await listPrototypeProductions(root)).filter((item) => item.campaignId === "camp-1");
  assert.equal(productions.length, 4);
  assert.equal(productions.filter((item) => item.status === "ready").length, 3);
  assert.equal(attempts.get("camp-1-prod-1"), 1);
  assert.equal(attempts.get("camp-1-prod-3"), 1);
});

test("restart resumes stored productions and does not duplicate proposal or production identity", async () => {
  const root = await fixture(1);
  const provider = new FakeIdeaProposalProvider([[draft("A", 1)]]);
  const input = {
    root, campaignId: "camp-1", proposalProvider: provider,
    createProduction: async (proposal: IdeaProposal, ordinal: number) => productionFor(proposal, ordinal),
    advanceProduction: async (production: PrototypeProduction) => ({ ...production, status: "ready" as const, commitSha: `${production.id}-sha`, updatedAt: NOW }),
    now: () => NOW, maxSteps: 1,
  };
  await superviseIdeaLabCampaign(input);
  const before = await loadIdeaLabCampaign(root, "camp-1");
  const result = await superviseIdeaLabCampaign({ ...input, maxSteps: 16 });
  assert.equal(result.status, "complete");
  assert.equal(result.proposalIds.length, 1);
  assert.equal(result.productionIds.length, 1);
  assert.equal(before?.proposalIds[0], result.proposalIds[0]);
});

test("missing provider or protected production blocker moves Campaign to blocked with safe summary", async () => {
  const root = await fixture(1);
  const missing = await superviseIdeaLabCampaign({
    root, campaignId: "camp-1",
    createProduction: async (proposal, ordinal) => productionFor(proposal, ordinal),
    advanceProduction: async (production) => production,
    now: () => NOW,
  });
  assert.equal(missing.status, "blocked");
  assert.match(missing.blockerSummary ?? "", /proposal provider/i);

  await saveIdeaLabCampaign(root, { ...missing, status: "generating", blockerSummary: undefined, updatedAt: NOW });
  const provider = new FakeIdeaProposalProvider([[draft("A", 1)]]);
  const blocked = await superviseIdeaLabCampaign({
    root, campaignId: "camp-1", proposalProvider: provider,
    createProduction: async () => { throw new IdeaLabCampaignBlockedError("Desktop Agent unavailable access_token=secret"); },
    advanceProduction: async (production) => production,
    now: () => NOW, maxSteps: 8,
  });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.blockerSummary, "Desktop Agent unavailable access_token=[redacted]");
});

test("proposal UNKNOWN blocks the campaign without allowing another proposal request", async () => {
  const root = await fixture(1);
  let calls = 0;
  const result = await superviseIdeaLabCampaign({
    root,
    campaignId: "camp-1",
    proposalProvider: {
      generate: async () => {
        calls += 1;
        throw new ExternalRequestOutcomeUnknownError();
      },
    },
    createProduction: async (proposal, ordinal) => productionFor(proposal as IdeaProposal, ordinal),
    advanceProduction: async (production) => production,
    now: () => NOW,
  });
  assert.equal(result.status, "blocked");
  assert.match(result.blockerSummary ?? "", /UNKNOWN/i);
  assert.equal(calls, 1);
});

test("explicit retry makes a failed production with an active READY Run discoverable", async () => {
  const root = await fixture(1);
  const runRoot = join(root, "runs");
  const proposal = { version: 1, id: "camp-1-proposal-1", campaignId: "camp-1", ...draft("A", 1), status: "accepted" as const, createdAt: NOW };
  const production = { ...productionFor(proposal, 1), status: "failed" as const, failureSummary: "patch validation invalid" };
  await saveIdeaProposal(root, proposal);
  await savePrototypeProduction(root, production);
  await saveIdeaLabCampaign(root, { ...(await loadIdeaLabCampaign(root, "camp-1"))!, proposalIds: [proposal.id], productionIds: [production.id], status: "producing" });
  await saveHarnessRun(runRoot, {
    version: 1,
    request: { version: 1, runId: production.runId, mode: "idea-lab", objective: "x", targetRoot: production.worktreeRoot },
    preflight: { version: 1, runId: production.runId, status: "ready" },
    state: { version: 1, stage: "IMPLEMENT", status: "READY", completedStages: ["PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN"], skippedStages: [], updatedAt: NOW },
    evidence: [],
    retry: { version: 1, cycle: 1, requestedFromState: "FAILED_FINAL", requestedStage: "IMPLEMENT", retryReason: "operator-request", requestedAt: NOW, actor: "operator", status: "active" },
    updatedAt: NOW,
  });
  let advanced = 0;
  const result = await superviseIdeaLabCampaign({
    root, harnessRoot: runRoot, campaignId: "camp-1",
    createProduction: async () => { throw new Error("must not create a replacement production"); },
    advanceProduction: async (current) => { advanced += 1; return { ...current, status: "ready" as const, commitSha: "a".repeat(40), updatedAt: NOW }; },
    now: () => NOW, maxSteps: 2,
  });
  assert.equal(advanced, 1);
  assert.equal(result.status, "complete");
});

test("interrupted active retry remains discoverable after restart", async () => {
  const root = await fixture(1);
  const runRoot = join(root, "runs");
  const proposal = { version: 1, id: "camp-1-proposal-1", campaignId: "camp-1", ...draft("A", 1), status: "accepted" as const, createdAt: NOW };
  const production = { ...productionFor(proposal, 1), status: "failed" as const, failureSummary: "interrupted" };
  await saveIdeaProposal(root, proposal);
  await savePrototypeProduction(root, production);
  await saveIdeaLabCampaign(root, { ...(await loadIdeaLabCampaign(root, "camp-1"))!, proposalIds: [proposal.id], productionIds: [production.id], status: "producing" });
  await saveHarnessRun(runRoot, {
    version: 1,
    request: { version: 1, runId: production.runId, mode: "idea-lab", objective: "x", targetRoot: production.worktreeRoot },
    preflight: { version: 1, runId: production.runId, status: "ready" },
    state: { version: 1, stage: "IMPLEMENT", status: "RUNNING", completedStages: ["PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN"], skippedStages: [], updatedAt: NOW },
    evidence: [],
    retry: { version: 1, cycle: 1, requestedFromState: "FAILED_FINAL", requestedStage: "IMPLEMENT", retryReason: "operator-request", requestedAt: NOW, actor: "operator", status: "active" },
    updatedAt: NOW,
  });
  let advanced = 0;
  const result = await superviseIdeaLabCampaign({
    root, harnessRoot: runRoot, campaignId: "camp-1",
    createProduction: async () => { throw new Error("must not create a replacement production"); },
    advanceProduction: async (current) => { advanced += 1; return { ...current, status: "ready" as const, commitSha: "b".repeat(40), updatedAt: NOW }; },
    now: () => NOW, maxSteps: 2,
  });
  assert.equal(advanced, 1);
  assert.equal(result.status, "complete");
});


test("explicit yield directive stops campaign supervision after one advance", async () => {
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { default: localAssert } = await import("node:assert/strict");

  const { saveIdeaLabCampaign } =
    await import("../src/idea-lab/campaign-store.js");
  const { saveIdeaProposal } =
    await import("../src/idea-lab/proposal-store.js");
  const { savePrototypeProduction } =
    await import("../src/idea-lab/production-store.js");
  const { superviseIdeaLabCampaign } =
    await import("../src/idea-lab/campaign-supervisor.js");

  const root = await mkdtemp(
    join(tmpdir(), "idea-lab-explicit-yield-"),
  );

  const now = "2026-09-17T12:30:00.000Z";

  await saveIdeaLabCampaign(root, {
    version: 1,
    id: "campaign-yield",
    seed: "yield",
    constraints: [],
    targetReadyCount: 1,
    productionConcurrency: 1,
    proposalIds: ["proposal-yield"],
    productionIds: ["production-yield"],
    status: "producing",
    createdAt: now,
    updatedAt: now,
  });

  await saveIdeaProposal(root, {
    version: 1,
    id: "proposal-yield",
    campaignId: "campaign-yield",
    title: "Yield proposal",
    concept: "Yield externally waiting production",
    problemDomain: "Runtime scheduling",
    targetUser: "Idea Lab runtime",
    jobToBeDone: "Avoid retry amplification",
    coreInteractionLoop: "advance then explicitly yield",
    dataModel: "campaign production run",
    primaryDifferentiator: "explicit scheduler directive",
    whyMateriallyDifferent: "does not infer waiting from production metadata",
    status: "accepted",
    createdAt: now,
  });

  await savePrototypeProduction(root, {
    version: 1,
    id: "production-yield",
    campaignId: "campaign-yield",
    proposalId: "proposal-yield",
    runId: "run-yield",
    repositoryUrl: "https://example.com/repo.git",
    sandboxRoot: "C:\\sandbox",
    worktreeRoot: "C:\\sandbox\\worktree",
    branch: "idea/yield",
    baseRef: "main",
    status: "running",
    createdAt: now,
    updatedAt: now,
  });

  let advanceCalls = 0;

  const result = await superviseIdeaLabCampaign({
    root,
    campaignId: "campaign-yield",
    maxSteps: 64,
    now: () => now,

    createProduction: async () => {
      throw new Error("production must not be recreated");
    },

    advanceProduction: async (current) => {
      advanceCalls += 1;

      return {
        production: {
          ...current,
          status: "running",
          updatedAt: "2026-09-17T12:30:01.000Z",
        },
        directive: "yield",
      };
    },
  });

  localAssert.equal(
    advanceCalls,
    1,
    "an explicit yield must stop the current campaign supervision pass",
  );

  localAssert.equal(result.status, "producing");
});

test("timestamp-only production result may still hide durable Run progress", async () => {
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { default: localAssert } = await import("node:assert/strict");

  const { saveIdeaLabCampaign } =
    await import("../src/idea-lab/campaign-store.js");
  const { saveIdeaProposal } =
    await import("../src/idea-lab/proposal-store.js");
  const { savePrototypeProduction } =
    await import("../src/idea-lab/production-store.js");
  const { superviseIdeaLabCampaign } =
    await import("../src/idea-lab/campaign-supervisor.js");

  const root = await mkdtemp(
    join(tmpdir(), "idea-lab-hidden-run-progress-"),
  );

  const now = "2026-09-17T13:10:00.000Z";

  await saveIdeaLabCampaign(root, {
    version: 1,
    id: "campaign-hidden-progress",
    seed: "hidden progress",
    constraints: [],
    targetReadyCount: 1,
    productionConcurrency: 1,
    proposalIds: ["proposal-hidden-progress"],
    productionIds: ["production-hidden-progress"],
    status: "producing",
    createdAt: now,
    updatedAt: now,
  });

  await saveIdeaProposal(root, {
    version: 1,
    id: "proposal-hidden-progress",
    campaignId: "campaign-hidden-progress",
    title: "Hidden progress",
    concept: "Production metadata can stay stable while its durable Run advances",
    problemDomain: "Runtime scheduling",
    targetUser: "Idea Lab runtime",
    jobToBeDone: "Do not confuse stable production metadata with a stalled Run",
    coreInteractionLoop: "advance durable Run then continue campaign supervision",
    dataModel: "campaign production run",
    primaryDifferentiator: "distinguishes scheduler yield from hidden Run progress",
    whyMateriallyDifferent: "tests progress outside PrototypeProduction metadata",
    status: "accepted",
    createdAt: now,
  });

  await savePrototypeProduction(root, {
    version: 1,
    id: "production-hidden-progress",
    campaignId: "campaign-hidden-progress",
    proposalId: "proposal-hidden-progress",
    runId: "run-hidden-progress",
    repositoryUrl: "https://example.com/repo.git",
    sandboxRoot: "C:\\sandbox",
    worktreeRoot: "C:\\sandbox\\worktree",
    branch: "idea/hidden-progress",
    baseRef: "main",
    status: "running",
    createdAt: now,
    updatedAt: now,
  });

  let advanceCalls = 0;

  const result = await superviseIdeaLabCampaign({
    root,
    campaignId: "campaign-hidden-progress",
    maxSteps: 4,
    now: () => now,

    createProduction: async () => {
      throw new Error("production must not be recreated");
    },

    advanceProduction: async (current) => {
      advanceCalls += 1;

      if (advanceCalls === 1) {
        // The PrototypeProduction metadata is effectively unchanged,
        // but its canonical Harness Run may have advanced underneath it.
        return {
          ...current,
          updatedAt: "2026-09-17T13:10:01.000Z",
        };
      }

      return {
        ...current,
        status: "ready",
        commitSha: "a".repeat(40),
        updatedAt: "2026-09-17T13:10:02.000Z",
      };
    },
  });

  localAssert.equal(
    advanceCalls,
    2,
    "stable production metadata must not itself mean the durable Run stalled",
  );

  localAssert.equal(result.status, "complete");
});
